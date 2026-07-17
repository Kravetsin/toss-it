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
}

export interface CpEventSubDeps {
  log: FastifyBaseLogger;
  /** Channel ids that currently want a redemption subscription. */
  wantedChannels(): string[];
  /** Create the redemption sub for a channel on this session; returns the Twitch sub id (or null). */
  subscribeChannel(channelId: string, sessionId: string): Promise<string | null>;
  /** Best-effort delete of a live subscription (channel disabled mid-session). */
  unsubscribeChannel(channelId: string, subId: string): Promise<void>;
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
 * Minimal EventSub WebSocket client for channel-point redemptions. Separate from the chat client
 * because these subs are authorized by each streamer's own token (broadcaster scope), not the bot's,
 * and their lifecycle is independent of chat. One socket, one sub per opted-in channel.
 */
export class ChannelPointsEventSub {
  private ws: WebSocket | null = null;
  private pending: WebSocket | null = null;
  private sessionId: string | null = null;
  /** channelId -> Twitch subscription id. */
  private subs = new Map<string, string>();
  private keepaliveMs = 60_000;
  private keepaliveTimer: NodeJS.Timeout | null = null;
  private welcomeTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private watchdogTimer: NodeJS.Timeout | null = null;
  private reconnectDelayMs = 1_000;
  private stopped = false;

  constructor(private deps: CpEventSubDeps) {}

  start(): void {
    this.stopped = false;
    this.connect(EVENTSUB_WS_URL);
    this.watchdogTimer = setInterval(() => {
      if (!this.ws && !this.pending && !this.reconnectTimer) {
        this.deps.log.warn('channel-points: watchdog found dead client, reconnecting');
        this.connect(EVENTSUB_WS_URL);
      }
    }, WATCHDOG_MS);
  }

  stop(): void {
    this.stopped = true;
    for (const t of [this.keepaliveTimer, this.welcomeTimer, this.reconnectTimer])
      if (t) clearTimeout(t);
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.keepaliveTimer = this.welcomeTimer = this.reconnectTimer = this.watchdogTimer = null;
    this.pending?.close();
    this.ws?.close();
    this.pending = this.ws = null;
    this.sessionId = null;
    this.subs.clear();
  }

  /** Reconcile live: subscribe newly-enabled channels, drop disabled ones. Safe to call anytime. */
  sync(): void {
    if (!this.sessionId) return; // welcome handler subscribes everything wanted
    void this.reconcile();
  }

  private async reconcile(): Promise<void> {
    const session = this.sessionId;
    if (!session) return;
    const wanted = new Set(this.deps.wantedChannels());
    for (const channelId of wanted) {
      if (this.subs.has(channelId)) continue;
      const subId = await this.deps.subscribeChannel(channelId, session);
      if (this.sessionId !== session) return; // reconnected mid-reconcile
      if (subId) this.subs.set(channelId, subId);
    }
    for (const [channelId, subId] of [...this.subs]) {
      if (wanted.has(channelId)) continue;
      this.subs.delete(channelId);
      await this.deps.unsubscribeChannel(channelId, subId).catch(() => {});
    }
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
        this.deps.log.warn({ err }, 'channel-points: bad eventsub message');
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
      const sec = msg.payload?.session?.keepalive_timeout_seconds;
      if (sec) this.keepaliveMs = sec * 1000;
      this.reconnectDelayMs = 1_000;
      this.subs.clear(); // new session — old subs are gone
      this.bumpKeepalive();
      void this.reconcile();
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
      });
    }
  }

  private bumpKeepalive(): void {
    if (this.keepaliveTimer) clearTimeout(this.keepaliveTimer);
    this.keepaliveTimer = setTimeout(() => {
      this.deps.log.warn('channel-points: keepalive timeout, reconnecting');
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
}
