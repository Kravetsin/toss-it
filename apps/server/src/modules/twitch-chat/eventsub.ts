import type { FastifyBaseLogger } from 'fastify';
import type { ChatFragment } from '@tmw/shared';
import { config } from '../../config';
import type { EventBadge } from './badges';

const EVENTSUB_WS_URL = 'wss://eventsub.wss.twitch.tv/ws';
const HELIX_SUBS_URL = 'https://api.twitch.tv/helix/eventsub/subscriptions';
/** Slack on top of Twitch's announced keepalive interval before we declare the socket dead. */
const KEEPALIVE_GRACE_MS = 10_000;
const RECONNECT_MAX_MS = 60_000;
/** A connection attempt that got no session_welcome by then is treated as failed. */
const WELCOME_TIMEOUT_MS = 15_000;
/** Last-resort self-heal: revive the client if it is dead with nothing scheduled. */
const WATCHDOG_MS = 30_000;

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
  /** Native platform badges assigned to the message (unresolved set_id/version). */
  badges: EventBadge[];
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
      badges?: { set_id?: string; id?: string }[];
      message?: { text?: string; fragments?: EventFragment[] };
    };
  };
}

/** Keep only well-formed badge assignments; images are resolved later from the catalog. */
function toBadges(raw: { set_id?: string; id?: string }[] | undefined): EventBadge[] {
  if (!raw) return [];
  const out: EventBadge[] = [];
  for (const b of raw) {
    if (b.set_id && b.id) out.push({ setId: b.set_id, id: b.id });
  }
  return out;
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
  /** In-flight connection attempt: created but no session_welcome yet. */
  private pending: WebSocket | null = null;
  private sessionId: string | null = null;
  private wanted = new Set<string>();
  /** broadcasterId -> all its subscription ids (chat + moderation), for DELETE on removal. */
  private subs = new Map<string, string[]>();
  private keepaliveMs = 60_000;
  private keepaliveTimer: NodeJS.Timeout | null = null;
  private welcomeTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private watchdogTimer: NodeJS.Timeout | null = null;
  private reconnectDelayMs = 1_000;
  private stopped = false;

  constructor(private deps: EventSubDeps) {}

  start(): void {
    this.stopped = false;
    this.connect(EVENTSUB_WS_URL);
    this.watchdogTimer = setInterval(() => {
      if (!this.ws && !this.pending && !this.reconnectTimer) {
        this.deps.log.warn('twitch-chat: watchdog found dead client, reconnecting');
        this.connect(EVENTSUB_WS_URL);
      }
    }, WATCHDOG_MS);
  }

  stop(): void {
    this.stopped = true;
    for (const t of [this.keepaliveTimer, this.welcomeTimer, this.reconnectTimer]) {
      if (t) clearTimeout(t);
    }
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.keepaliveTimer = null;
    this.welcomeTimer = null;
    this.reconnectTimer = null;
    this.watchdogTimer = null;
    this.pending?.close();
    this.pending = null;
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
    const removed = [...new Set([...this.wanted, ...this.subs.keys()])].filter(
      (id) => !ids.has(id),
    );
    this.wanted = new Set(ids);
    if (!this.sessionId) return; // welcome handler will subscribe everything wanted
    for (const id of added) void this.subscribe(id);
    for (const id of removed) void this.unsubscribe(id);
  }

  isSubscribed(broadcasterId: string): boolean {
    return this.subs.has(broadcasterId);
  }

  /**
   * Anti-entropy: reconcile the local `subs` view with what Twitch actually holds
   * for the current session, so ghost entries (session died, sub silently dropped)
   * get resubscribed on the next setBroadcasters diff instead of lingering forever.
   */
  async verify(): Promise<void> {
    const session = this.sessionId;
    if (!session) return;
    const confirmed = new Map<string, { ids: string[]; primary: boolean }>();
    let cursor: string | undefined;
    do {
      const url = new URL(HELIX_SUBS_URL);
      url.searchParams.set('status', 'enabled');
      if (cursor) url.searchParams.set('after', cursor);
      const res = await this.helix('GET', url.toString());
      if (!res?.ok) return; // transient — keep the local view
      const body = (await res.json()) as {
        data?: {
          id: string;
          type: string;
          condition?: { broadcaster_user_id?: string };
          transport?: { session_id?: string };
        }[];
        pagination?: { cursor?: string };
      };
      for (const s of body.data ?? []) {
        if (s.transport?.session_id !== session) continue;
        const bid = s.condition?.broadcaster_user_id;
        if (!bid) continue;
        const entry = confirmed.get(bid) ?? { ids: [], primary: false };
        entry.ids.push(s.id);
        if (s.type === 'channel.chat.message') entry.primary = true;
        confirmed.set(bid, entry);
      }
      cursor = body.pagination?.cursor;
    } while (cursor);
    if (this.sessionId !== session) return; // session changed mid-verify
    for (const bid of [...this.subs.keys()]) {
      if (!confirmed.get(bid)?.primary) {
        this.subs.delete(bid);
        this.deps.log.warn({ broadcasterId: bid }, 'twitch-chat: ghost subscription healed');
      }
    }
  }

  private connect(url: string, handoffFrom?: WebSocket): void {
    if (this.stopped) return;
    this.pending?.close();
    const ws = new WebSocket(url);
    this.pending = ws;
    if (this.welcomeTimer) clearTimeout(this.welcomeTimer);
    this.welcomeTimer = setTimeout(() => {
      // No welcome in time (hung handshake / half-open socket) — fail the attempt.
      if (this.pending === ws) ws.close();
    }, WELCOME_TIMEOUT_MS);
    ws.onmessage = (e) => {
      try {
        this.handleMessage(JSON.parse(String(e.data)) as EventSubMessage, ws, handoffFrom);
      } catch (err) {
        this.deps.log.warn({ err }, 'twitch-chat: bad eventsub message');
      }
    };
    ws.onclose = () => {
      const wasPending = this.pending === ws;
      if (wasPending) this.pending = null;
      // Retry when the active socket dies OR an attempt fails before welcome —
      // otherwise a single failed connect strands the client forever.
      // A handoff socket replaced by a new welcome closes on purpose — ignore that one.
      if ((this.ws === ws || wasPending) && !this.stopped) this.scheduleReconnect();
    };
    ws.onerror = () => {
      /* onclose follows; logging happens there */
    };
  }

  private handleMessage(msg: EventSubMessage, ws: WebSocket, handoffFrom?: WebSocket): void {
    const type = msg.metadata?.message_type;
    if (type === 'session_welcome') {
      if (this.pending === ws) this.pending = null;
      if (this.welcomeTimer) clearTimeout(this.welcomeTimer);
      this.welcomeTimer = null;
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
          badges: toBadges(ev.badges),
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
      this.deps.log.warn(
        { broadcasterId, subType: msg.payload?.subscription?.type },
        'twitch-chat: subscription revoked',
      );
      if (broadcasterId && this.subs.has(broadcasterId)) {
        // Drop remnants and retry now — waiting for the next reconcile would leave
        // the channel dark for up to 5 minutes.
        void this.unsubscribe(broadcasterId).then(() => {
          if (this.wanted.has(broadcasterId)) void this.subscribe(broadcasterId);
        });
      }
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
    const old = this.ws;
    this.ws = null;
    this.sessionId = null;
    old?.close();
    if (this.keepaliveTimer) clearTimeout(this.keepaliveTimer);
    if (this.reconnectTimer || this.stopped) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(EVENTSUB_WS_URL);
    }, this.reconnectDelayMs);
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, RECONNECT_MAX_MS);
  }

  private async helix(
    method: 'GET' | 'POST' | 'DELETE',
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
