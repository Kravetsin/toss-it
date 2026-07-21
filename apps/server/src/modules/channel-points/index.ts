import { and, eq } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import { CHANNEL_POINTS, DUST_POINTS } from '@tmw/shared';
import { db } from '../../db/index';
import { channels, linkedIdentities } from '../../db/schema';
import { roomOf, type PlaybackManager, type RealtimeServer } from '../../playback';
import {
  fetchVideoInfo,
  parseYoutube,
  validateYoutube,
  YT_MUSIC_CATEGORY_ID,
} from '../../media/youtube';
import { createYoutubeSubmission } from '../../media/submit';
import { awardDust } from '../twitch-chat/accrual';
import { ChannelPointsEventSub, type RedemptionEvent } from './eventsub';
import {
  cancelRedemption,
  createRedemptionSub,
  createReward,
  deleteReward,
  fulfillRedemption,
  getManageableRewards,
  getRedemptions,
} from './helix';
import { refreshStreamerCreds, type StreamerCreds } from './token';
import {
  type ConnectionRecord,
  decodeCreds,
  deleteConnection,
  deleteRewardsByChannel,
  deleteRewardsByChannelKind,
  getAllConnections,
  getAllRewards,
  getConnection,
  getRewardById,
  getRewardByChannelKind,
  getRewardsByChannel,
  insertReward,
  type RewardRecord,
  saveConnectionCreds,
  upsertConnection,
} from './store';

/**
 * Reward title + viewer-facing description, in the streamer's language (falls back to ru). The
 * description states the RATIO (points per dust), not an absolute amount, because the streamer can
 * change the point cost in Twitch. Every title contains "(Tossit)" so we can find our reward.
 */
const N = CHANNEL_POINTS.pointsPerDust;
const REWARD_TEXT = {
  ru: {
    title: 'Купить звёздную пыль (Tossit)',
    prompt: `Обменять баллы канала на звёздную пыль Tossit — каждые ${N} балла = 1 ⭐. Косметика в чате и на странице канала.`,
  },
  uk: {
    title: 'Купити зоряний пил (Tossit)',
    prompt: `Обміняти бали каналу на зоряний пил Tossit — кожні ${N} бали = 1 ⭐. Косметика в чаті та на сторінці каналу.`,
  },
  en: {
    title: 'Buy stardust (Tossit)',
    prompt: `Trade channel points for Tossit stardust — every ${N} points = 1 ⭐. Cosmetics in chat and on the channel page.`,
  },
} as const;

function rewardText(lang: string | undefined): { title: string; prompt: string } {
  return REWARD_TEXT[lang as keyof typeof REWARD_TEXT] ?? REWARD_TEXT.ru;
}

/** YouTube-request reward text. The reward requires viewer input (they paste the link). */
const YOUTUBE_TEXT = {
  ru: {
    title: 'Заказать видео с YouTube (Tossit)',
    prompt: `Вставь ссылку на YouTube — видео сыграет на стриме. +${DUST_POINTS.send} ⭐ звёздной пыли Tossit (залогинься на toss-it.org, чтобы забрать).`,
  },
  uk: {
    title: 'Замовити відео з YouTube (Tossit)',
    prompt: `Встав посилання на YouTube — відео зіграє на стрімі. +${DUST_POINTS.send} ⭐ зоряного пилу Tossit (залогінься на toss-it.org, щоб забрати).`,
  },
  en: {
    title: 'Request a YouTube video (Tossit)',
    prompt: `Paste a YouTube link — it plays on stream. +${DUST_POINTS.send} ⭐ Tossit stardust (log in at toss-it.org to claim).`,
  },
} as const;

function youtubeText(lang: string | undefined): { title: string; prompt: string } {
  return YOUTUBE_TEXT[lang as keyof typeof YOUTUBE_TEXT] ?? YOUTUBE_TEXT.ru;
}

/** The two independent rewards Tossit can own on a channel; each is created/removed on its own. */
export type RewardKind = 'stardust' | 'youtube';

export interface ChannelPointsModule {
  start(): void;
  stop(): void;
  /**
   * Finish the OAuth opt-in by creating ONE requested reward and storing the token. The Twitch
   * authorization is shared: the first reward a streamer creates goes through this (OAuth), the
   * rest reuse the stored token via add*Reward — so the two rewards are fully independent.
   */
  connectChannel(input: {
    channelId: string;
    broadcasterId: string;
    creds: StreamerCreds;
    externalName: string | null;
    reward?: RewardKind;
    cost?: number;
    lang?: string;
  }): Promise<{ ok: boolean; error?: string }>;
  /** Fully disconnect: delete every reward on Twitch and drop the stored token. */
  disconnect(channelId: string): Promise<void>;
  /** Add (or re-create) a reward on an already-connected channel — one call per kind. */
  addStardustReward(
    channelId: string,
    opts: { cost?: number; lang?: string },
  ): Promise<{ ok: boolean; error?: string }>;
  addYoutubeReward(
    channelId: string,
    opts: { cost?: number; lang?: string },
  ): Promise<{ ok: boolean; error?: string }>;
  /** Remove a single reward (deletes it on Twitch), keeping the connection + the other reward. */
  removeStardustReward(channelId: string): Promise<void>;
  removeYoutubeReward(channelId: string): Promise<void>;
  status(channelId: string): Promise<{
    connected: boolean;
    externalName: string | null;
    hasStardust: boolean;
    hasYoutube: boolean;
  }>;
  debugState(): Promise<{
    running: boolean;
    channels: string[];
    rewards: { rewardId: string; channelId: string; kind: string }[];
    eventsub: { hasSession: boolean; subChannels: string[] };
    lastSubscribe: Record<string, { ok: boolean; status?: number; body?: string; at: number }>;
    redemptionsSeen: number;
    lastRedemption: { rewardId: string; channelId?: string; kind?: string; at: number } | null;
  }>;
}

export function createChannelPointsModule(deps: {
  io: RealtimeServer;
  playback: PlaybackManager;
  log: FastifyBaseLogger;
}): ChannelPointsModule {
  const { io, playback, log } = deps;
  /** channelIds with a connection; eventsub reads this synchronously to (re)subscribe their rewards. */
  const enabled = new Set<string>();
  let started = false;
  // Diagnostics surfaced via debugState() so we don't depend on log level in prod.
  const lastSubscribe = new Map<
    string,
    { ok: boolean; status?: number; body?: string; at: number }
  >();
  let redemptionsSeen = 0;
  let lastRedemption: { rewardId: string; channelId?: string; kind?: string; at: number } | null =
    null;

  /**
   * Run a Helix call with a channel's streamer token, refreshing once on 401 and persisting the
   * rotated token. null = no connection / creds unreadable / refresh token revoked (auto-removed).
   */
  async function authorized(
    channelId: string,
    run: (token: string, conn: ConnectionRecord) => Promise<Response>,
  ): Promise<Response | null> {
    const conn = await getConnection(channelId);
    if (!conn) return null;
    const creds = decodeCreds(conn);
    if (!creds) {
      log.warn(
        { channelId },
        'channel-points: could not decode stored token (encryption key changed?)',
      );
      return null;
    }
    let res = await run(creds.accessToken, conn);
    if (res.status === 401) {
      const next = await refreshStreamerCreds(creds);
      if (!next) {
        log.warn({ channelId }, 'channel-points: streamer token revoked, removing channel');
        enabled.delete(channelId);
        await deleteRewardsByChannel(channelId);
        await deleteConnection(channelId);
        eventsub.sync();
        return null;
      }
      await saveConnectionCreds(channelId, next);
      res = await run(next.accessToken, conn);
    }
    return res;
  }

  /**
   * Stardust reward: fulfill-first (FULFILLED is terminal → unrefundable, closes the refund loop),
   * then credit dust. Owner self-redeems are free on Twitch, so they get the FX but no dust.
   */
  async function processStardust(
    reward: RewardRecord,
    conn: ConnectionRecord,
    ev: RedemptionEvent,
  ): Promise<void> {
    const fres = await authorized(reward.channelId, (token) =>
      fulfillRedemption(token, conn.broadcasterId, reward.rewardId, ev.redemptionId),
    );
    if (!fres || !fres.ok) {
      log.warn(
        { channelId: reward.channelId, status: fres?.status },
        'channel-points: fulfill failed, not crediting',
      );
      return;
    }
    const dust = CHANNEL_POINTS.dustFor(ev.cost);
    if (ev.redeemerId === conn.broadcasterId) {
      log.info(
        { channelId: reward.channelId },
        'channel-points: owner self-redeem — FX only, no dust',
      );
    } else {
      await awardDust(ev.redeemerId, dust);
      log.info(
        { channelId: reward.channelId, redeemerId: ev.redeemerId, cost: ev.cost, dust },
        'channel-points: credited dust',
      );
      io.to(roomOf(reward.channelId)).emit('chat:redemption', { name: ev.redeemerName, dust });
    }
    io.to(roomOf(reward.channelId)).emit('donation:fx', {
      provider: 'channel-points',
      donorName: ev.redeemerName,
      amount: dust,
      currency: '⭐',
      message: null,
    });
  }

  /**
   * YouTube-request reward: the viewer's user_input is a link → into the submission pipeline
   * (moderation + overlay playback), with the normal send-dust reward. Unplayable links are refunded.
   */
  async function processYoutube(
    reward: RewardRecord,
    conn: ConnectionRecord,
    ev: RedemptionEvent,
  ): Promise<void> {
    const parsed = parseYoutube(ev.userInput);
    const meta = parsed ? await validateYoutube(parsed.videoId) : null;
    if (!parsed || !meta) {
      // Nothing playable — refund the points rather than take them for a bad/private link.
      await authorized(reward.channelId, (token) =>
        cancelRedemption(token, conn.broadcasterId, reward.rewardId, ev.redemptionId),
      );
      log.info(
        { channelId: reward.channelId },
        'channel-points: youtube link unplayable, refunded',
      );
      return;
    }
    // Fulfill-first (terminal) before submitting/crediting — same refund-loop safety as stardust.
    const fres = await authorized(reward.channelId, (token) =>
      fulfillRedemption(token, conn.broadcasterId, reward.rewardId, ev.redemptionId),
    );
    if (!fres || !fres.ok) {
      log.warn(
        { channelId: reward.channelId, status: fres?.status },
        'channel-points: youtube fulfill failed',
      );
      return;
    }
    const channel = await db.select().from(channels).where(eq(channels.id, reward.channelId)).get();
    const info = (await fetchVideoInfo([parsed.videoId])).get(parsed.videoId);
    const durationSec = info?.durationSec ?? 0;
    // Music if the link is from music.youtube.com OR the video's YouTube category is Music (10) — so a
    // plain youtube.com music track still renders as the compact player, not full-screen video.
    const isMusic = parsed.isMusic || info?.categoryId === YT_MUSIC_CATEGORY_ID;
    // Auto-approve is split by type: video can take over the whole screen, so it's gated separately
    // from music. Only within the duration cap; longer / unknown-length → moderation.
    const capSec = (channel?.youtubeAutoMaxMinutes ?? 10) * 60;
    const autoAllowed = isMusic
      ? !!channel?.autoApproveYoutubeMusic
      : !!channel?.autoApproveYoutubeVideo;
    const autoApproved = autoAllowed && durationSec > 0 && durationSec <= capSec;
    // Sender = the viewer's linked Tossit account, or null (anonymous — dust still accrues to twitch id).
    const link = await db
      .select({ userId: linkedIdentities.userId })
      .from(linkedIdentities)
      .where(
        and(
          eq(linkedIdentities.provider, 'twitch'),
          eq(linkedIdentities.providerId, ev.redeemerId),
        ),
      )
      .get();
    await createYoutubeSubmission(
      { playback, io },
      {
        channelId: reward.channelId,
        senderUserId: link?.userId ?? null,
        senderName: ev.redeemerName,
        // Kept even when the account resolved: this is the only handle we have on a redeemer
        // who never logged in, and it is what a chat command can match them by.
        senderPlatform: 'twitch',
        senderPlatformUserId: ev.redeemerId,
        parsed,
        title: (parsed.caption ?? meta.title ?? undefined)?.slice(0, 280),
        durationMs: durationSec > 0 ? durationSec * 1000 : 0,
        isMusic,
        autoApproved,
        isSelfSend: ev.redeemerId === conn.broadcasterId,
      },
    );
    log.info(
      { channelId: reward.channelId, videoId: parsed.videoId, autoApproved, durationSec },
      'channel-points: youtube submitted',
    );
    // Send-dust (mirrored to the owner) unless the broadcaster requested their own video.
    if (ev.redeemerId !== conn.broadcasterId) {
      await awardDust(ev.redeemerId, DUST_POINTS.send);
      await awardDust(conn.broadcasterId, DUST_POINTS.send);
      io.to(roomOf(reward.channelId)).emit('chat:redemption', {
        name: ev.redeemerName,
        dust: DUST_POINTS.send,
      });
    }
  }

  async function onRedemption(ev: RedemptionEvent): Promise<void> {
    redemptionsSeen += 1;
    const reward = await getRewardById(ev.rewardId);
    lastRedemption = {
      rewardId: ev.rewardId,
      channelId: reward?.channelId,
      kind: reward?.kind,
      at: Date.now(),
    };
    if (!reward) {
      log.warn(
        { rewardId: ev.rewardId },
        'channel-points: redemption for an unknown reward, ignored',
      );
      return;
    }
    const conn = await getConnection(reward.channelId);
    if (!conn) return;
    if (reward.kind === 'stardust') {
      await processStardust(reward, conn, ev);
    } else if (reward.kind === 'youtube') {
      await processYoutube(reward, conn, ev);
    } else {
      log.warn({ kind: reward.kind }, 'channel-points: reward kind has no handler');
    }
  }

  /** Drain the UNFULFILLED backlog for every stardust reward on a channel (missed while offline). */
  async function sweepUnfulfilled(channelId: string): Promise<void> {
    const conn = await getConnection(channelId);
    if (!conn) return;
    for (const reward of await getRewardsByChannel(channelId)) {
      if (reward.kind !== 'stardust') continue; // youtube backlog handled by its own flow in Phase 2
      let after: string | undefined;
      let total = 0;
      do {
        const res = await authorized(channelId, (token) =>
          getRedemptions(token, conn.broadcasterId, reward.rewardId, 'UNFULFILLED', after),
        );
        if (!res || !res.ok) break;
        const body = (await res.json()) as {
          data?: {
            id: string;
            user_id: string;
            user_name?: string;
            user_login?: string;
            reward?: { cost?: number };
          }[];
          pagination?: { cursor?: string };
        };
        for (const r of body.data ?? []) {
          await processStardust(reward, conn, {
            broadcasterId: conn.broadcasterId,
            redemptionId: r.id,
            rewardId: reward.rewardId,
            redeemerId: r.user_id,
            redeemerName: r.user_name ?? r.user_login ?? r.user_id,
            cost: typeof r.reward?.cost === 'number' ? r.reward.cost : 0,
            userInput: '',
          });
          total += 1;
        }
        after = body.pagination?.cursor;
      } while (after);
      if (total > 0)
        log.info({ channelId, rewardId: reward.rewardId, total }, 'channel-points: swept backlog');
    }
  }

  const eventsub = new ChannelPointsEventSub({
    log,
    wantedChannels: () => [...enabled],
    subscribeChannel: async (channelId, sessionId) => {
      const rewards = await getRewardsByChannel(channelId);
      if (rewards.length === 0) return null;
      const subIds: string[] = [];
      for (const reward of rewards) {
        // conn comes from authorized() (which also refreshes the token) — no separate read.
        const res = await authorized(channelId, (token, conn) =>
          createRedemptionSub(token, conn.broadcasterId, reward.rewardId, sessionId),
        );
        if (!res || !res.ok) {
          const body = res ? await res.text() : 'no response (token decrypt/refresh failed)';
          lastSubscribe.set(reward.rewardId, {
            ok: false,
            status: res?.status,
            body: body.slice(0, 400),
            at: Date.now(),
          });
          log.warn(
            { channelId, rewardId: reward.rewardId, status: res?.status, body },
            'channel-points: subscribe failed',
          );
          continue;
        }
        const data = (await res.json()) as { data?: { id: string }[] };
        if (data.data?.[0]?.id) subIds.push(data.data[0].id);
        lastSubscribe.set(reward.rewardId, { ok: true, at: Date.now() });
      }
      if (subIds.length === 0) return null;
      log.info({ channelId, subs: subIds.length }, 'channel-points: subscribed channel rewards');
      void sweepUnfulfilled(channelId).catch((err) =>
        log.warn({ err }, 'channel-points: sweep failed'),
      );
      return subIds.join(',');
    },
    onRedemption: (ev) =>
      void onRedemption(ev).catch((err) =>
        log.warn({ err }, 'channel-points: redemption handler failed'),
      ),
  });

  /** Reward title/prompt for a kind, in the streamer's language. */
  function rewardTextFor(
    kind: RewardKind,
    lang: string | undefined,
  ): { title: string; prompt: string } {
    return kind === 'youtube' ? youtubeText(lang) : rewardText(lang);
  }

  /**
   * Create a reward of `kind` on Twitch, or recover its id if it already exists (idempotent). `run`
   * executes a Helix call with a valid token — a fresh OAuth token during connect, or authorized()
   * for an already-stored connection. Returns the reward id, or null on failure.
   */
  async function createOrRecoverReward(
    channelId: string,
    broadcasterId: string,
    kind: RewardKind,
    cost: number,
    lang: string | undefined,
    run: (fn: (token: string) => Promise<Response>) => Promise<Response | null>,
  ): Promise<string | null> {
    const text = rewardTextFor(kind, lang);
    // Only the YouTube reward takes viewer input (the link); stardust is a plain click.
    const res = await run((token) =>
      createReward(token, broadcasterId, text.title, cost, text.prompt, kind === 'youtube'),
    );
    if (res?.ok) {
      return ((await res.json()) as { data?: { id: string }[] }).data?.[0]?.id ?? null;
    }
    if (res?.status === 400) {
      // Already exists — recover its id by exact title (both kinds carry "(Tossit)").
      const listRes = await run((token) => getManageableRewards(token, broadcasterId));
      if (listRes?.ok) {
        const list = (await listRes.json()) as { data?: { id: string; title: string }[] };
        return list.data?.find((r) => r.title === text.title)?.id ?? null;
      }
      return null;
    }
    const body = res ? await res.text() : 'no response (token decrypt/refresh failed)';
    log.warn(
      { channelId, kind, status: res?.status, body },
      'channel-points: create reward failed',
    );
    return null;
  }

  /** Add (or re-create) a single reward on an ALREADY-connected channel (uses the stored token). */
  async function addReward(
    channelId: string,
    kind: RewardKind,
    opts: { cost?: number; lang?: string },
  ): Promise<{ ok: boolean; error?: string }> {
    const conn = await getConnection(channelId);
    if (!conn) return { ok: false, error: 'not_connected' };
    const cost =
      opts.cost === undefined ? CHANNEL_POINTS.defaultCost : CHANNEL_POINTS.clampCost(opts.cost);
    const rewardId = await createOrRecoverReward(
      channelId,
      conn.broadcasterId,
      kind,
      cost,
      opts.lang,
      (fn) => authorized(channelId, fn),
    );
    if (!rewardId) return { ok: false, error: 'create_failed' };
    await deleteRewardsByChannelKind(channelId, kind);
    await insertReward({ rewardId, channelId, kind });
    // restart (not sync): the channel is already connected, so the socket must re-subscribe to pick
    // up this new reward — sync() alone would leave it unsubscribed.
    eventsub.restartChannel(channelId);
    return { ok: true };
  }

  /** Remove a single reward (deletes it on Twitch), keeping the connection + the other reward. */
  async function removeReward(channelId: string, kind: RewardKind): Promise<void> {
    const conn = await getConnection(channelId);
    const reward = await getRewardByChannelKind(channelId, kind);
    if (conn && reward) {
      await authorized(channelId, (token) =>
        deleteReward(token, conn.broadcasterId, reward.rewardId),
      ).catch(() => {});
    }
    await deleteRewardsByChannelKind(channelId, kind);
    eventsub.restartChannel(channelId);
  }

  return {
    start(): void {
      void getAllConnections()
        .then((conns) => {
          for (const c of conns) enabled.add(c.channelId);
          log.info({ count: conns.length }, 'channel-points: loaded connections on start');
          started = true;
          eventsub.start();
        })
        .catch((err) => log.warn({ err }, 'channel-points: load connections failed'));
    },
    stop(): void {
      started = false;
      eventsub.stop();
    },
    async connectChannel(input): Promise<{ ok: boolean; error?: string }> {
      const kind = input.reward ?? 'stardust';
      const cost =
        input.cost === undefined
          ? CHANNEL_POINTS.defaultCost
          : CHANNEL_POINTS.clampCost(input.cost);
      // Fresh OAuth token — the connection isn't stored yet, so run the Helix call with it directly.
      const rewardId = await createOrRecoverReward(
        input.channelId,
        input.broadcasterId,
        kind,
        cost,
        input.lang,
        (fn) => fn(input.creds.accessToken),
      );
      if (!rewardId) return { ok: false, error: 'create_failed' };
      await upsertConnection({
        channelId: input.channelId,
        broadcasterId: input.broadcasterId,
        creds: input.creds,
        externalName: input.externalName,
      });
      // One reward per kind: drop any prior row (e.g. an orphan pointing at a reward the streamer
      // deleted in Twitch) before recording the current one.
      await deleteRewardsByChannelKind(input.channelId, kind);
      await insertReward({ rewardId, channelId: input.channelId, kind });
      enabled.add(input.channelId);
      // restart so a reconnect (channel already had a socket) re-subscribes to the current reward set.
      eventsub.restartChannel(input.channelId);
      return { ok: true };
    },
    async disconnect(channelId): Promise<void> {
      enabled.delete(channelId);
      // Delete every reward on Twitch while we still hold the token, then drop rows + connection.
      const conn = await getConnection(channelId);
      if (conn) {
        for (const reward of await getRewardsByChannel(channelId)) {
          await authorized(channelId, (token) =>
            deleteReward(token, conn.broadcasterId, reward.rewardId),
          ).catch(() => {});
        }
      }
      await deleteRewardsByChannel(channelId);
      await deleteConnection(channelId);
      eventsub.sync();
    },
    addStardustReward(channelId, opts): Promise<{ ok: boolean; error?: string }> {
      return addReward(channelId, 'stardust', opts);
    },
    addYoutubeReward(channelId, opts): Promise<{ ok: boolean; error?: string }> {
      return addReward(channelId, 'youtube', opts);
    },
    removeStardustReward(channelId): Promise<void> {
      return removeReward(channelId, 'stardust');
    },
    removeYoutubeReward(channelId): Promise<void> {
      return removeReward(channelId, 'youtube');
    },
    async status(channelId): Promise<{
      connected: boolean;
      externalName: string | null;
      hasStardust: boolean;
      hasYoutube: boolean;
    }> {
      const conn = await getConnection(channelId);
      // "connected" = the Twitch authorization (token) exists; the two rewards are independent add-ons.
      const rewards = conn ? await getRewardsByChannel(channelId) : [];
      return {
        connected: !!conn,
        externalName: conn?.externalName ?? null,
        hasStardust: rewards.some((r) => r.kind === 'stardust'),
        hasYoutube: rewards.some((r) => r.kind === 'youtube'),
      };
    },
    async debugState() {
      const rewards = (await getAllRewards()).map((r) => ({
        rewardId: r.rewardId,
        channelId: r.channelId,
        kind: r.kind,
      }));
      return {
        running: started,
        channels: [...enabled],
        rewards,
        eventsub: eventsub.debug(),
        lastSubscribe: Object.fromEntries(lastSubscribe),
        redemptionsSeen,
        lastRedemption,
      };
    },
  };
}
