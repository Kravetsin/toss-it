import type { FastifyBaseLogger } from 'fastify';

const EVENTSUB_WS_URL = 'wss://eventsub.wss.twitch.tv/ws';
const KEEPALIVE_GRACE_MS = 10_000;
const WELCOME_TIMEOUT_MS = 15_000;
const RECONNECT_MAX_MS = 60_000;
const WATCHDOG_MS = 30_000;

/** A redemption of our app-owned reward (channel.channel_points_custom_reward_redemption.add). */
export interface RedemptionEvent {
  broadcasterId: string;
  redemptionId: string;
  rewardId: string;
  /** Raw numeric Twitch id of the viewer who redeemed. */
  redeemerId: string;
  redeemerName: string;
  /** Point cost of the reward at redemption time — dust is derived from this live. */
  cost: number;
  /** Free text the viewer typed (the YouTube link, for a song/video request); '' if none. */
  userInput: string;
}

export interface CpEventSubDeps {
  log: FastifyBaseLogger;
  /** Channel ids that currently want a redemption subscription. */
  wantedChannels(): string[];
  /** Create the redemption sub for a channel on its session; returns the Twitch sub id (or null). */
  subscribeChannel(channelId: string, sessionId: string): Promise<string | null>;
  onRedemption(ev: RedemptionEvent): void;
}

interface EventSubMessage {
  metadata?: { message_type?: string };
  payload?: {
    session?: { id?: string; keepalive_timeout_seconds?: number; reconnect_url?: string };
    subscription?: { type?: string };
    event?: Record<string, unknown>;
  };
}

/**
 * One WebSocket connection dedicated to a SINGLE channel's redemption subscription. Twitch requires
 * every subscription on a WebSocket session to be authorized by the same user, so each streamer's
 * token needs its own connection — a shared socket 400s with "cannot have subscriptions created by
 * different users". This owns one channel's socket lifecycle: connect, welcome, subscribe, keepalive,
 * reconnect.
 */
class ChannelConn {
  private ws: WebSocket | null = null;
  private pending: WebSocket | null = null;
  private sessionId: string | null = null;
  private subId: string | null = null;
  private keepaliveMs = 60_000;
  private keepaliveTimer: NodeJS.Timeout | null = null;
  private welcomeTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectDelayMs = 1_000;
  private stopped = false;

  constructor(
    private channelId: string,
    private deps: CpEventSubDeps,
  ) {}

  get welcomed(): boolean {
    return !!this.sessionId;
  }
  get subscribed(): boolean {
    return !!this.subId;
  }

  start(): void {
    this.stopped = false;
    this.connect(EVENTSUB_WS_URL);
  }

  stop(): void {
    this.stopped = true;
    for (const t of [this.keepaliveTimer, this.welcomeTimer, this.reconnectTimer])
      if (t) clearTimeout(t);
    this.keepaliveTimer = this.welcomeTimer = this.reconnectTimer = null;
    this.pending?.close();
    this.ws?.close();
    this.pending = this.ws = null;
    this.sessionId = null;
    this.subId = null;
  }

  private connect(url: string): void {
    if (this.stopped) return;
    this.pending?.close();
    const ws = new WebSocket(url);
    this.pending = ws;
    if (this.welcomeTimer) clearTimeout(this.welcomeTimer);
    this.welcomeTimer = setTimeout(() => {
      if (this.pending === ws) ws.close();
    }, WELCOME_TIMEOUT_MS);
    ws.onmessage = (e) => {
      try {
        this.handleMessage(JSON.parse(String(e.data)) as EventSubMessage, ws);
      } catch (err) {
        this.deps.log.warn(
          { err, channelId: this.channelId },
          'channel-points: bad eventsub message',
        );
      }
    };
    ws.onclose = () => {
      const wasPending = this.pending === ws;
      if (wasPending) this.pending = null;
      if ((this.ws === ws || wasPending) && !this.stopped) this.scheduleReconnect();
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  private handleMessage(msg: EventSubMessage, ws: WebSocket): void {
    const type = msg.metadata?.message_type;
    if (type === 'session_welcome') {
      if (this.pending === ws) this.pending = null;
      if (this.welcomeTimer) clearTimeout(this.welcomeTimer);
      this.welcomeTimer = null;
      this.ws = ws;
      this.sessionId = msg.payload?.session?.id ?? null;
      this.subId = null;
      const sec = msg.payload?.session?.keepalive_timeout_seconds;
      if (sec) this.keepaliveMs = sec * 1000;
      this.reconnectDelayMs = 1_000;
      this.bumpKeepalive();
      if (this.sessionId) void this.subscribe(this.sessionId);
      return;
    }
    if (ws !== this.ws) return; // stale socket
    this.bumpKeepalive();
    if (type === 'session_keepalive') return;
    if (type === 'session_reconnect') {
      const url = msg.payload?.session?.reconnect_url;
      if (url) this.connect(url);
      return;
    }
    if (type === 'notification') {
      if (
        msg.payload?.subscription?.type !== 'channel.channel_points_custom_reward_redemption.add'
      ) {
        return;
      }
      const ev = msg.payload?.event;
      const reward = ev?.reward as { id?: string; cost?: number } | undefined;
      const broadcasterId = ev?.broadcaster_user_id as string | undefined;
      const redeemerId = ev?.user_id as string | undefined;
      if (!ev || !broadcasterId || !redeemerId || !reward?.id) return;
      this.deps.onRedemption({
        broadcasterId,
        redemptionId: (ev.id as string) ?? '',
        rewardId: reward.id,
        redeemerId,
        redeemerName: (ev.user_name as string) ?? (ev.user_login as string) ?? redeemerId,
        cost: typeof reward.cost === 'number' ? reward.cost : 0,
        userInput: typeof ev.user_input === 'string' ? ev.user_input : '',
      });
    }
  }

  private async subscribe(session: string): Promise<void> {
    const subId = await this.deps.subscribeChannel(this.channelId, session);
    if (this.sessionId === session) this.subId = subId; // ignore if we reconnected meanwhile
  }

  private bumpKeepalive(): void {
    if (this.keepaliveTimer) clearTimeout(this.keepaliveTimer);
    this.keepaliveTimer = setTimeout(() => {
      this.deps.log.warn(
        { channelId: this.channelId },
        'channel-points: keepalive timeout, reconnecting',
      );
      this.ws?.close();
    }, this.keepaliveMs + KEEPALIVE_GRACE_MS);
  }

  private scheduleReconnect(): void {
    const old = this.ws;
    this.ws = null;
    this.sessionId = null;
    this.subId = null;
    old?.close();
    if (this.keepaliveTimer) clearTimeout(this.keepaliveTimer);
    if (this.reconnectTimer || this.stopped) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(EVENTSUB_WS_URL);
    }, this.reconnectDelayMs);
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, RECONNECT_MAX_MS);
  }
}

/**
 * Manages one {@link ChannelConn} per opted-in channel. `sync()` spins up connections for newly
 * enabled channels and tears down disabled ones; a watchdog re-syncs periodically so a channel can
 * never be left without a connection.
 */
export class ChannelPointsEventSub {
  private conns = new Map<string, ChannelConn>();
  private watchdog: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(private deps: CpEventSubDeps) {}

  start(): void {
    this.stopped = false;
    this.sync();
    this.watchdog = setInterval(() => this.sync(), WATCHDOG_MS);
  }

  stop(): void {
    this.stopped = true;
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
    for (const c of this.conns.values()) c.stop();
    this.conns.clear();
  }

  /** Reconcile the live connections to the wanted channel set. Safe to call anytime. */
  sync(): void {
    if (this.stopped) return;
    const wanted = new Set(this.deps.wantedChannels());
    for (const channelId of wanted) {
      if (this.conns.has(channelId)) continue;
      const conn = new ChannelConn(channelId, this.deps);
      this.conns.set(channelId, conn);
      conn.start();
    }
    for (const [channelId, conn] of [...this.conns]) {
      if (wanted.has(channelId)) continue;
      conn.stop();
      this.conns.delete(channelId);
    }
  }

  /** Live state for the diagnostic endpoint. */
  debug(): { hasSession: boolean; subChannels: string[] } {
    return {
      hasSession: [...this.conns.values()].some((c) => c.welcomed),
      subChannels: [...this.conns].filter(([, c]) => c.subscribed).map(([id]) => id),
    };
  }
}
