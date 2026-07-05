import type { FastifyBaseLogger } from 'fastify';
import type { ChatFragment } from '@tmw/shared';
import { config } from '../../config';

const EVENTSUB_WS_URL = 'wss://eventsub.wss.twitch.tv/ws';
const HELIX_SUBS_URL = 'https://api.twitch.tv/helix/eventsub/subscriptions';
/** Slack on top of Twitch's announced keepalive interval before we declare the socket dead. */
const KEEPALIVE_GRACE_MS = 10_000;
const RECONNECT_MAX_MS = 60_000;

// All chat-read scoped (user:read:chat), same condition; v1. Ordered: primary first.
const CHAT_SUB_TYPES = [
  'channel.chat.message',
  'channel.chat.message_delete',
  'channel.chat.clear_user_messages',
  'channel.chat.clear',
] as const;

export interface ChatMessageEvent {
  broadcasterId: string;
  chatterId: string;
  chatterLogin: string;
  chatterName: string;
  /** Twitch message id, for targeted deletion mirroring. */
  messageId: string;
  /** Twitch name color (#rrggbb) or null. */
  color: string | null;
  /** Message split into text/emote fragments (native Twitch emotes only). */
  fragments: ChatFragment[];
}

export interface EventSubDeps {
  /** Raw numeric Twitch id of the bot (the user_id condition of chat subscriptions). */
  botUserId: string;
  /** Valid bot access token; refresh=true forces a token refresh first. null = bot disconnected. */
  getAccessToken(refresh?: boolean): Promise<string | null>;
  onChatMessage(ev: ChatMessageEvent): void;
  /** A message was deleted on Twitch. */
  onChatDelete(broadcasterId: string, messageId: string): void;
  /** A user's messages were cleared (timeout/ban). */
  onChatClearUser(broadcasterId: string, targetUserId: string): void;
  /** The whole chat was cleared. */
  onChatClear(broadcasterId: string): void;
  log: FastifyBaseLogger;
}

interface EventFragment {
  type?: string;
  text?: string;
  emote?: { id?: string };
}

interface EventSubMessage {
  metadata?: { message_type?: string };
  payload?: {
    session?: { id: string; keepalive_timeout_seconds: number | null; reconnect_url?: string };
    subscription?: { id: string; type: string; condition?: { broadcaster_user_id?: string } };
    event?: {
      broadcaster_user_id?: string;
      chatter_user_id?: string;
      chatter_user_login?: string;
      chatter_user_name?: string;
      target_user_id?: string;
      message_id?: string;
      color?: string;
      message?: { text?: string; fragments?: EventFragment[] };
    };
  };
}

/** Map Twitch fragments to our text/emote shape; non-emote parts render as plain text. */
function toFragments(raw: EventFragment[] | undefined, fallbackText: string): ChatFragment[] {
  if (!raw || raw.length === 0) return fallbackText ? [{ type: 'text', text: fallbackText }] : [];
  return raw.map((f) =>
    f.type === 'emote' && f.emote?.id
      ? { type: 'emote', id: f.emote.id, text: f.text ?? '' }
      : { type: 'text', text: f.text ?? '' },
  );
}

/**
 * Minimal EventSub WebSocket client for channel.chat.message — one socket, one
 * subscription per enabled channel. No SDK: the protocol is 5 message types.
 */
export class EventSubClient {
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private wanted = new Set<string>();
  /** broadcasterId -> all its subscription ids (chat + moderation), for DELETE on removal. */
  private subs = new Map<string, string[]>();
  private keepaliveMs = 60_000;
  private keepaliveTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectDelayMs = 1_000;
  private stopped = false;

  constructor(private deps: EventSubDeps) {}

  start(): void {
    this.stopped = false;
    this.connect(EVENTSUB_WS_URL);
  }

  stop(): void {
    this.stopped = true;
    if (this.keepaliveTimer) clearTimeout(this.keepaliveTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.keepaliveTimer = null;
    this.reconnectTimer = null;
    this.ws?.close();
    this.ws = null;
    this.sessionId = null;
    this.subs.clear();
  }

  /** Reconcile the desired broadcaster set: subscribe added, unsubscribe removed. */
  setBroadcasters(ids: Set<string>): void {
    // Diff against actual subscriptions (not the previous wanted set) so a past
    // failed subscribe is retried on the next reconcile. Duplicate POSTs are
    // impossible outside a reconcile overlap, and Twitch answers those with 409.
    const added = [...ids].filter((id) => !this.subs.has(id));
    const removed = [...this.wanted].filter((id) => !ids.has(id));
    this.wanted = new Set(ids);
    if (!this.sessionId) return; // welcome handler will subscribe everything wanted
    for (const id of added) void this.subscribe(id);
    for (const id of removed) void this.unsubscribe(id);
  }

  isSubscribed(broadcasterId: string): boolean {
    return this.subs.has(broadcasterId);
  }

  private connect(url: string, handoffFrom?: WebSocket): void {
    if (this.stopped) return;
    const ws = new WebSocket(url);
    ws.onmessage = (e) => {
      try {
        this.handleMessage(JSON.parse(String(e.data)) as EventSubMessage, ws, handoffFrom);
      } catch (err) {
        this.deps.log.warn({ err }, 'twitch-chat: bad eventsub message');
      }
    };
    ws.onclose = () => {
      // A handoff socket replaced by a new welcome closes on purpose — ignore that one.
      if (this.ws === ws && !this.stopped) this.scheduleReconnect();
    };
    ws.onerror = () => {
      /* onclose follows; logging happens there */
    };
  }

  private handleMessage(msg: EventSubMessage, ws: WebSocket, handoffFrom?: WebSocket): void {
    const type = msg.metadata?.message_type;
    if (type === 'session_welcome') {
      this.ws = ws;
      this.sessionId = msg.payload?.session?.id ?? null;
      const keepaliveSec = msg.payload?.session?.keepalive_timeout_seconds;
      if (keepaliveSec) this.keepaliveMs = keepaliveSec * 1000;
      this.reconnectDelayMs = 1_000;
      this.bumpKeepalive();
      if (handoffFrom) {
        // session_reconnect handoff: subscriptions carry over to the new session.
        handoffFrom.close();
      } else {
        // Fresh session: old subscriptions are gone, recreate all wanted ones.
        this.subs.clear();
        for (const id of this.wanted) void this.subscribe(id);
      }
      return;
    }
    if (ws !== this.ws) return; // stale socket
    this.bumpKeepalive();

    if (type === 'session_keepalive') return;
    if (type === 'session_reconnect') {
      const url = msg.payload?.session?.reconnect_url;
      if (url) this.connect(url, ws);
      return;
    }
    if (type === 'notification') {
      const subType = msg.payload?.subscription?.type;
      const ev = msg.payload?.event;
      const bid = ev?.broadcaster_user_id;
      if (!ev || !bid) return;
      if (subType === 'channel.chat.message' && ev.chatter_user_id) {
        this.deps.onChatMessage({
          broadcasterId: bid,
          chatterId: ev.chatter_user_id,
          chatterLogin: ev.chatter_user_login ?? ev.chatter_user_id,
          chatterName: ev.chatter_user_name ?? ev.chatter_user_login ?? ev.chatter_user_id,
          messageId: ev.message_id ?? '',
          color: ev.color || null,
          fragments: toFragments(ev.message?.fragments, ev.message?.text ?? ''),
        });
      } else if (subType === 'channel.chat.message_delete' && ev.message_id) {
        this.deps.onChatDelete(bid, ev.message_id);
      } else if (subType === 'channel.chat.clear_user_messages' && ev.target_user_id) {
        this.deps.onChatClearUser(bid, ev.target_user_id);
      } else if (subType === 'channel.chat.clear') {
        this.deps.onChatClear(bid);
      }
      return;
    }
    if (type === 'revocation') {
      const broadcasterId = msg.payload?.subscription?.condition?.broadcaster_user_id;
      if (broadcasterId) this.subs.delete(broadcasterId);
      this.deps.log.warn({ broadcasterId }, 'twitch-chat: subscription revoked');
    }
  }

  private bumpKeepalive(): void {
    if (this.keepaliveTimer) clearTimeout(this.keepaliveTimer);
    this.keepaliveTimer = setTimeout(() => {
      this.deps.log.warn('twitch-chat: keepalive timeout, reconnecting');
      this.ws?.close();
    }, this.keepaliveMs + KEEPALIVE_GRACE_MS);
  }

  private scheduleReconnect(): void {
    this.ws = null;
    this.sessionId = null;
    if (this.keepaliveTimer) clearTimeout(this.keepaliveTimer);
    if (this.reconnectTimer || this.stopped) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(EVENTSUB_WS_URL);
    }, this.reconnectDelayMs);
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, RECONNECT_MAX_MS);
  }

  private async helix(
    method: 'POST' | 'DELETE',
    url: string,
    body?: unknown,
  ): Promise<Response | null> {
    for (const refresh of [false, true]) {
      const token = await this.deps.getAccessToken(refresh);
      if (!token) return null;
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Client-Id': config.twitch.clientId,
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status !== 401) return res;
    }
    return null;
  }

  private async subscribeOne(broadcasterId: string, subType: string): Promise<string | null> {
    const res = await this.helix('POST', HELIX_SUBS_URL, {
      type: subType,
      version: '1',
      condition: { broadcaster_user_id: broadcasterId, user_id: this.deps.botUserId },
      transport: { method: 'websocket', session_id: this.sessionId },
    });
    if (!res) return null;
    if (!res.ok) {
      this.deps.log.warn(
        { broadcasterId, subType, status: res.status, body: await res.text() },
        'twitch-chat: subscribe failed',
      );
      return null;
    }
    const data = (await res.json()) as { data?: { id: string }[] };
    return data.data?.[0]?.id ?? null;
  }

  private async subscribe(broadcasterId: string): Promise<void> {
    if (!this.sessionId || this.subs.has(broadcasterId)) return;
    try {
      const ids: string[] = [];
      let primaryOk = false;
      for (const subType of CHAT_SUB_TYPES) {
        const id = await this.subscribeOne(broadcasterId, subType);
        if (id) ids.push(id);
        if (subType === 'channel.chat.message') primaryOk = id != null;
      }
      // Only mark subscribed if the message stream itself succeeded — else next
      // reconcile retries (moderation subs alone are useless).
      if (primaryOk) this.subs.set(broadcasterId, ids);
      else for (const id of ids) void this.deleteSub(id);
    } catch (err) {
      this.deps.log.warn({ err, broadcasterId }, 'twitch-chat: subscribe error');
    }
  }

  private async deleteSub(subId: string): Promise<void> {
    // 404 just means the subscription already died with an old session — fine.
    await this.helix('DELETE', `${HELIX_SUBS_URL}?id=${encodeURIComponent(subId)}`).catch(() => {});
  }

  private async unsubscribe(broadcasterId: string): Promise<void> {
    const ids = this.subs.get(broadcasterId);
    this.subs.delete(broadcasterId);
    for (const id of ids ?? []) await this.deleteSub(id);
  }
}
