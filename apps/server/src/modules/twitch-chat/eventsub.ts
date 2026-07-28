import type { FastifyBaseLogger } from 'fastify';
import type { ChatFragment, ChatNotice, ChatNoticeType } from '@tmw/shared';
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

// All chat-read scoped (user:read:chat), same condition; v1.
/** The stream everything rides on: dust, stats, commands and the chat mirror. */
const PRIMARY_SUB_TYPE = 'channel.chat.message';
/** Read only by the chat overlay — events to render and moderation to mirror. A channel without it
 *  costs one subscription instead of five, and a session only has 300. */
const OVERLAY_SUB_TYPES = [
  'channel.chat.notification',
  'channel.chat.message_delete',
  'channel.chat.clear_user_messages',
  'channel.chat.clear',
] as const;

/** How deep we read a channel: messages only, or the chat overlay's extras on top. */
export type ChatSubTier = 'core' | 'full';

/** Ordered: primary first, so a failed subscribe gives up before spending quota on the extras. */
function typesFor(tier: ChatSubTier): string[] {
  return tier === 'full' ? [PRIMARY_SUB_TYPE, ...OVERLAY_SUB_TYPES] : [PRIMARY_SUB_TYPE];
}

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
  /** Message split into text/emote/mention fragments (native Twitch emotes only). */
  fragments: ChatFragment[];
  /** Set when the message is a reply; carries the parent author's display name. */
  reply?: { name: string };
  /** Set when the message is the input to a channel-points reward (its custom reward id). */
  rewardId?: string;
  /** Twitch's own emphasis on the message: a paid highlight or a newcomer's first line. Power-ups
   *  (message effect, gigantified emote) are deliberately not mapped — nobody buys them. */
  emphasis?: 'highlighted' | 'intro';
  /** Bits in the message, when it is a cheer (Twitch's own total for the line). */
  bits?: number;
}

/** A chat notice (sub/raid/watch streak…). Same shape as a message — it occupies a chat row and is
 *  deletable by id — plus the event itself. `anonymous` = Twitch hid the actor (anonymous gift),
 *  so there is no id to look a Tossit account up by. */
export interface ChatNoticeEvent extends ChatMessageEvent {
  notice: ChatNotice;
  anonymous: boolean;
}

export interface EventSubDeps {
  /** Raw numeric Twitch id of the bot (the user_id condition of chat subscriptions). */
  botUserId: string;
  /** Valid bot access token; refresh=true forces a token refresh first. null = bot disconnected. */
  getAccessToken(refresh?: boolean): Promise<string | null>;
  onChatMessage(ev: ChatMessageEvent): void;
  /** A chat notice arrived (sub/gift/raid/watch streak/announcement…). */
  onChatNotice(ev: ChatNoticeEvent): void;
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
  mention?: { user_login?: string; user_name?: string };
  cheermote?: { prefix?: string; bits?: number; tier?: number };
}

/** Reply metadata Twitch attaches to a threaded message. */
interface EventReply {
  parent_user_login?: string;
  parent_user_name?: string;
}

/** The `channel.chat.notification` half of an event: the kind, Twitch's own rendered line, and one
 *  populated sub-object per kind (the others are null). Only the fields we actually surface. */
interface EventNoticeFields {
  notice_type?: string;
  system_message?: string;
  chatter_is_anonymous?: boolean;
  // No `sub` object: a plain sub's only field is its multi-month duration, which the caption is
  // better off without ("new sub · 1").
  resub?: { cumulative_months?: number } | null;
  sub_gift?: { recipient_user_name?: string; community_gift_id?: string | null } | null;
  community_sub_gift?: { total?: number } | null;
  gift_paid_upgrade?: { gifter_user_name?: string } | null;
  pay_it_forward?: { gifter_user_name?: string } | null;
  raid?: { user_name?: string; viewer_count?: number } | null;
  bits_badge_tier?: { tier?: number } | null;
  watch_streak?: { streak_count?: number } | null;
  modiversary?: { months?: number } | null;
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
      /** 'text' | 'channel_points_highlighted' | 'user_intro' | power-up kinds. */
      message_type?: string;
      cheer?: { bits?: number } | null;
      reply?: EventReply | null;
      /** Set when the message is the text input of a channel-points reward redemption. */
      channel_points_custom_reward_id?: string | null;
    } & EventNoticeFields;
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

/** Map Twitch fragments to our text/emote/mention/cheermote shape. Twitch already classifies an
 *  @mention as its own fragment type; we preserve that so the overlay can keep an emote-only reply
 *  big. Exported for its tests — like toNotice, it is pure and everything around it needs a socket. */
export function toFragments(
  raw: EventFragment[] | undefined,
  fallbackText: string,
): ChatFragment[] {
  if (!raw || raw.length === 0) return fallbackText ? [{ type: 'text', text: fallbackText }] : [];
  return raw.map((f) => {
    if (f.type === 'emote' && f.emote?.id)
      return { type: 'emote', id: f.emote.id, text: f.text ?? '' };
    if (f.type === 'mention') return { type: 'mention', text: f.text ?? '' };
    // A cheer without a prefix cannot be resolved to art, so it stays text — which still reads
    // as "Cheer100", exactly what it did before cheermotes were understood at all.
    if (f.type === 'cheermote' && f.cheermote?.prefix)
      return {
        type: 'cheermote',
        text: f.text ?? '',
        bits: f.cheermote.bits ?? 0,
        prefix: f.cheermote.prefix,
        tier: f.cheermote.tier ?? 0,
      };
    return { type: 'text', text: f.text ?? '' };
  });
}

/** On a reply, Twitch prepends the parent's `@name` as a mention fragment. We surface that as the
 *  reply indicator instead, so drop the leading mention (and the blank text that follows it) from
 *  the body — otherwise it shows twice and, being non-blank text, would block big-emote mode. */
function stripReplyPrefix(fragments: ChatFragment[]): ChatFragment[] {
  if (fragments[0]?.type !== 'mention') return fragments;
  let i = 1;
  while (fragments[i]?.type === 'text' && fragments[i]!.text.trim() === '') i += 1;
  return fragments.slice(i);
}

/** Twitch `message_type` -> the emphasis the overlay draws. Anything absent is an ordinary line:
 *  'text' itself, and the power-up kinds we chose not to render. */
const EMPHASIS: Record<string, 'highlighted' | 'intro' | undefined> = {
  channel_points_highlighted: 'highlighted',
  user_intro: 'intro',
};

/** Twitch `notice_type` -> our kind. Anything absent (including Twitch's own 'unknown', and any
 *  kind added after this table was written) is dropped rather than rendered as a blank row. */
const NOTICE_TYPES: Record<string, ChatNoticeType> = {
  sub: 'sub',
  resub: 'resub',
  sub_gift: 'subGift',
  community_sub_gift: 'communitySubGift',
  gift_paid_upgrade: 'giftPaidUpgrade',
  prime_paid_upgrade: 'primePaidUpgrade',
  pay_it_forward: 'payItForward',
  raid: 'raid',
  unraid: 'unraid',
  announcement: 'announcement',
  bits_badge_tier: 'bitsBadgeTier',
  charity_donation: 'charityDonation',
  watch_streak: 'watchStreak',
  modiversary: 'modiversary',
};

/** Read the notice out of an event, or null if it is a kind we don't render. Exactly one sub-object
 *  is populated per notice, so the ?? chains below pick that one — they are not a priority order.
 *  Exported for its tests: everything else here needs a socket, this is the one pure decision. */
export function toNotice(ev: EventNoticeFields): ChatNotice | null {
  // Shared Chat mirrors the same events with a prefix; the kind underneath is what matters.
  const type = NOTICE_TYPES[(ev.notice_type ?? '').replace(/^shared_chat_/, '')];
  if (!type) return null;
  // A gift bomb arrives as one community_sub_gift PLUS one sub_gift per recipient. Rendering all of
  // them would flush the whole column (MAX_MESSAGES is 40) on a 100-gift drop, so the batch row is
  // the event and its members are dropped — the same way Twitch's own chat collapses them. Members
  // are exactly the ones carrying the batch id; a standalone gift has none.
  if (type === 'subGift' && ev.sub_gift?.community_gift_id) return null;
  const count =
    ev.watch_streak?.streak_count ??
    ev.resub?.cumulative_months ??
    ev.community_sub_gift?.total ??
    ev.raid?.viewer_count ??
    ev.modiversary?.months ??
    ev.bits_badge_tier?.tier;
  const otherName =
    ev.raid?.user_name ??
    ev.sub_gift?.recipient_user_name ??
    ev.gift_paid_upgrade?.gifter_user_name ??
    ev.pay_it_forward?.gifter_user_name;
  // Twitch's own English line stands in until the module swaps in our copy for the channel's
  // locale — so an unlocalized deploy still says something rather than nothing.
  return { type, text: ev.system_message ?? '', count, otherName };
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
  private wanted = new Map<string, ChatSubTier>();
  /** broadcasterId -> its live subscriptions (type -> Twitch id), for DELETE on removal. */
  private subs = new Map<string, { tier: ChatSubTier; ids: Map<string, string> }>();
  /** Broadcasters with a subscribe in flight, so overlapping reconciles POST once. */
  private inflight = new Set<string>();
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
    // Deliberately no connect here: Twitch closes a session that creates no subscription within 10s
    // (close 4003), and nothing is wanted until the first reconcile. setBroadcasters opens it.
    this.watchdogTimer = setInterval(() => {
      if (this.wanted.size > 0 && !this.ws && !this.pending && !this.reconnectTimer) {
        this.deps.log.warn('twitch-chat: watchdog found dead client, reconnecting');
        this.connect(EVENTSUB_WS_URL);
      }
    }, WATCHDOG_MS);
  }

  stop(): void {
    this.stopped = true;
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.watchdogTimer = null;
    this.disconnect('stop');
  }

  /** Drop the socket without scheduling a reconnect. Subscriptions die with the session, so there
   *  is nothing to DELETE — which is also why this is cheaper than unsubscribing channel by channel. */
  private disconnect(reason: 'idle' | 'stop'): void {
    for (const t of [this.keepaliveTimer, this.welcomeTimer, this.reconnectTimer]) {
      if (t) clearTimeout(t);
    }
    this.keepaliveTimer = null;
    this.welcomeTimer = null;
    this.reconnectTimer = null;
    // Null both before closing: onclose must not read them as live and schedule a reconnect.
    const [ws, pending] = [this.ws, this.pending];
    this.ws = null;
    this.pending = null;
    this.sessionId = null;
    this.subs.clear();
    this.inflight.clear();
    // Start the next revival at the short delay, however long we sat idle.
    this.reconnectDelayMs = 1_000;
    // Only when there was something to close: an idle client reconciles to "nothing wanted" every
    // five minutes, and that must not print a line each time.
    if (ws || pending) this.deps.log.info({ reason }, 'twitch-chat: socket closed');
    ws?.close();
    pending?.close();
  }

  /** Reconcile the desired broadcasters and their tiers: subscribe what is missing, drop the rest. */
  setBroadcasters(wanted: Map<string, ChatSubTier>): void {
    // Diff against actual subscriptions (not the previous wanted set) so a past failed subscribe is
    // retried on the next reconcile. Overlapping reconciles can ask twice; subscribe() dedupes.
    const stale = [...wanted].filter(([id, tier]) => {
      const cur = this.subs.get(id);
      // A short id map means an earlier subscribe only half-landed — finish it now.
      return !cur || cur.tier !== tier || cur.ids.size !== typesFor(tier).length;
    });
    const removed = [...new Set([...this.wanted.keys(), ...this.subs.keys()])].filter(
      (id) => !wanted.has(id),
    );
    this.wanted = new Map(wanted);
    // Nobody live: hold no socket at all. Twitch closes a subscription-less session after 10s
    // (close 4003), so keeping it open would just reconnect in a loop all night.
    if (this.wanted.size === 0) {
      this.disconnect('idle');
      return;
    }
    if (!this.ws && !this.pending && !this.reconnectTimer) this.connect(EVENTSUB_WS_URL);
    if (!this.sessionId) return; // welcome handler will subscribe everything wanted
    for (const [id, tier] of stale) void this.subscribe(id, tier);
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
    const confirmed = new Map<string, Map<string, string>>();
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
        const types = confirmed.get(bid) ?? new Map<string, string>();
        types.set(s.type, s.id);
        confirmed.set(bid, types);
      }
      cursor = body.pagination?.cursor;
    } while (cursor);
    if (this.sessionId !== session) return; // session changed mid-verify
    // Take Twitch's answer as the view: ghosts disappear, and a subscription we created but lost
    // track of (a session handoff landing mid-subscribe) is adopted instead of being re-POSTed
    // forever as a duplicate. An incomplete set needs no special case — the next diff sees it fall
    // short of its tier and fills the gap.
    const next = new Map<string, { tier: ChatSubTier; ids: Map<string, string> }>();
    for (const [bid, ids] of confirmed) {
      if (ids.has(PRIMARY_SUB_TYPE)) next.set(bid, { tier: ids.size > 1 ? 'full' : 'core', ids });
    }
    for (const [bid, entry] of this.subs) {
      // A subscribe in flight is not on Twitch yet — keep our view of it rather than racing it.
      if (this.inflight.has(bid)) next.set(bid, entry);
      else if (!next.has(bid)) {
        this.deps.log.warn({ broadcasterId: bid }, 'twitch-chat: ghost subscription healed');
      }
    }
    this.subs = next;
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
      // Subscribes still in flight belong to the previous session id, so they neither store their
      // result nor clear their slot — release the slots here or those channels stay blocked.
      this.inflight.clear();
      const keepaliveSec = msg.payload?.session?.keepalive_timeout_seconds;
      if (keepaliveSec) this.keepaliveMs = keepaliveSec * 1000;
      this.reconnectDelayMs = 1_000;
      this.bumpKeepalive();
      // The pair to "socket closed": one line per session, so the night can be read off the log.
      this.deps.log.info(
        { channels: this.wanted.size, handoff: !!handoffFrom },
        'twitch-chat: session open',
      );
      if (handoffFrom) {
        // session_reconnect handoff: subscriptions carry over to the new session.
        handoffFrom.close();
      } else {
        // Fresh session: old subscriptions are gone, recreate all wanted ones.
        this.subs.clear();
        for (const [id, tier] of this.wanted) void this.subscribe(id, tier);
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
        const parentName = ev.reply?.parent_user_name ?? ev.reply?.parent_user_login;
        const fragments = toFragments(ev.message?.fragments, ev.message?.text ?? '');
        this.deps.onChatMessage({
          broadcasterId: bid,
          chatterId: ev.chatter_user_id,
          chatterLogin: ev.chatter_user_login ?? ev.chatter_user_id,
          chatterName: ev.chatter_user_name ?? ev.chatter_user_login ?? ev.chatter_user_id,
          messageId: ev.message_id ?? '',
          color: ev.color || null,
          badges: toBadges(ev.badges),
          fragments: parentName ? stripReplyPrefix(fragments) : fragments,
          reply: parentName ? { name: parentName } : undefined,
          rewardId: ev.channel_points_custom_reward_id ?? undefined,
          emphasis: EMPHASIS[ev.message_type ?? ''],
          bits: ev.cheer?.bits ?? undefined,
        });
      } else if (subType === 'channel.chat.notification') {
        const notice = toNotice(ev);
        // Anything the viewer typed alongside the event (resub/watch-streak message) rides in the
        // notification itself — Twitch never sends it a second time as a chat message.
        if (notice) {
          this.deps.onChatNotice({
            broadcasterId: bid,
            chatterId: ev.chatter_user_id ?? '',
            // Twitch's own reference disagrees with its bindings on whether a notification carries
            // chatter_user_login at all, so don't depend on it: the display name lowercased is the
            // login for every Latin-named account, which is what the exclusion list holds.
            chatterLogin: ev.chatter_user_login ?? ev.chatter_user_name?.toLowerCase() ?? '',
            chatterName: ev.chatter_user_name ?? ev.chatter_user_login ?? '',
            messageId: ev.message_id ?? '',
            color: ev.color || null,
            badges: toBadges(ev.badges),
            fragments: toFragments(ev.message?.fragments, ev.message?.text ?? ''),
            notice,
            anonymous: ev.chatter_is_anonymous === true || !ev.chatter_user_id,
          });
        }
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
          const tier = this.wanted.get(broadcasterId);
          if (tier) void this.subscribe(broadcasterId, tier);
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
    // Unplanned: a deliberate teardown goes through disconnect() and never lands here.
    this.deps.log.info(
      { delayMs: this.reconnectDelayMs },
      'twitch-chat: socket lost, reconnecting',
    );
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

  /** Bring a broadcaster to `tier`: create what it lacks, delete what the tier no longer wants. */
  private async subscribe(broadcasterId: string, tier: ChatSubTier): Promise<void> {
    // Two reconciles can overlap (the 5-minute one firing into an overlay's quick reconcile). Without
    // this guard the second pass sees an empty id map, POSTs duplicates, gets 409s back, and then
    // concludes the channel failed — dropping the entry the first pass had just filled in.
    if (!this.sessionId || this.inflight.has(broadcasterId)) return;
    this.inflight.add(broadcasterId);
    const session = this.sessionId;
    const entry = this.subs.get(broadcasterId) ?? { tier, ids: new Map<string, string>() };
    const want = typesFor(tier);
    try {
      // Shed first, so a downgrade frees quota before the next channel spends it.
      for (const [subType, id] of [...entry.ids]) {
        if (want.includes(subType)) continue;
        entry.ids.delete(subType);
        void this.deleteSub(id);
      }
      for (const subType of want) {
        if (entry.ids.has(subType)) continue;
        const id = await this.subscribeOne(broadcasterId, subType);
        if (id) entry.ids.set(subType, id);
      }
      entry.tier = tier;
      if (this.sessionId !== session) return; // reconnected mid-subscribe; the welcome redoes it
      // Only count as subscribed if the message stream itself is up — else next reconcile
      // retries (the overlay extras alone are useless).
      if (entry.ids.has(PRIMARY_SUB_TYPE)) this.subs.set(broadcasterId, entry);
      else {
        this.subs.delete(broadcasterId);
        for (const id of entry.ids.values()) void this.deleteSub(id);
      }
    } catch (err) {
      this.deps.log.warn({ err, broadcasterId }, 'twitch-chat: subscribe error');
    } finally {
      // Only our own session's slot: a newer welcome already cleared the set, and freeing it here
      // would let a second subscribe start while this one's replacement is still running.
      if (this.sessionId === session) this.inflight.delete(broadcasterId);
    }
  }

  private async deleteSub(subId: string): Promise<void> {
    // 404 just means the subscription already died with an old session — fine.
    await this.helix('DELETE', `${HELIX_SUBS_URL}?id=${encodeURIComponent(subId)}`).catch(() => {});
  }

  private async unsubscribe(broadcasterId: string): Promise<void> {
    const entry = this.subs.get(broadcasterId);
    this.subs.delete(broadcasterId);
    for (const id of entry?.ids.values() ?? []) await this.deleteSub(id);
  }
}
