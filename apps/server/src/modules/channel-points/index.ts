import type { FastifyBaseLogger } from 'fastify';
import {
  CHANNEL_POINTS,
  CHAT_TEXT_MAX_LEN,
  DUST_POINTS,
  type ChannelPointsStatus,
} from '@tmw/shared';
import { roomOf, type PlaybackManager, type RealtimeServer } from '../../playback';
import {
  acceptsSends,
  resolvePlayableYoutube,
  submitChatText,
  submitResolvedYoutube,
} from '../../media/submit';
import { isRedemptionKnown } from '../../media/payout';
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
import { sweepVerdict } from './sweep';
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

/**
 * YouTube-request reward text. The reward requires viewer input (they paste the link). The prompt
 * promises the dust only on air, because that is now literally when it is paid — and says the
 * points come back otherwise, which is the part a viewer needs to trust the reward.
 */
const YOUTUBE_TEXT = {
  ru: {
    title: 'Заказать видео с YouTube (Tossit)',
    prompt: `Вставь ссылку на YouTube — видео сыграет на стриме. Пыль Tossit начислим, когда сыграет: каждые ${N} балла = 1 ⭐, минимум ${DUST_POINTS.send} ⭐. Не сыграло (регион, возраст, отказ модератора) — баллы вернутся.`,
  },
  uk: {
    title: 'Замовити відео з YouTube (Tossit)',
    prompt: `Встав посилання на YouTube — відео зіграє на стрімі. Пил Tossit нарахуємо, коли зіграє: кожні ${N} бали = 1 ⭐, мінімум ${DUST_POINTS.send} ⭐. Не зіграло (регіон, вік, відмова модератора) — бали повернуться.`,
  },
  en: {
    title: 'Request a YouTube video (Tossit)',
    prompt: `Paste a YouTube link — it plays on stream. Tossit stardust is credited once it does: every ${N} points = 1 ⭐, at least ${DUST_POINTS.send} ⭐. If it never plays (region, age gate, moderator), your points come back.`,
  },
} as const;

function youtubeText(lang: string | undefined): { title: string; prompt: string } {
  return YOUTUBE_TEXT[lang as keyof typeof YOUTUBE_TEXT] ?? YOUTUBE_TEXT.ru;
}

/**
 * Line-on-stream reward text. Also viewer input (they type the line), and the same "paid only on
 * air" promise as the YouTube request — the length cap is named because Twitch will happily accept
 * a longer input that we would then have to refund.
 */
const TTS_TEXT = {
  ru: {
    title: 'Отправить текст на экран (Tossit)',
    prompt: `Строка на стриме, с озвучкой если она включена. До ${CHAT_TEXT_MAX_LEN} символов. Пыль начислим, когда покажем: ${N} балла = 1 ⭐, минимум ${DUST_POINTS.send} ⭐. Не показали — баллы вернутся.`,
  },
  uk: {
    title: 'Надіслати текст на екран (Tossit)',
    prompt: `Рядок на стрімі, з озвученням якщо воно ввімкнене. До ${CHAT_TEXT_MAX_LEN} символів. Пил нарахуємо, коли покажемо: ${N} бали = 1 ⭐, мінімум ${DUST_POINTS.send} ⭐. Не показали — бали повернуться.`,
  },
  en: {
    title: 'Put a line on stream (Tossit)',
    prompt: `A line on stream, read aloud if the streamer has that on. Up to ${CHAT_TEXT_MAX_LEN} characters. Stardust once it shows: ${N} points = 1 ⭐, at least ${DUST_POINTS.send} ⭐. Never shows — points come back.`,
  },
} as const;

function ttsText(lang: string | undefined): { title: string; prompt: string } {
  return TTS_TEXT[lang as keyof typeof TTS_TEXT] ?? TTS_TEXT.ru;
}

/** The independent rewards Tossit can own on a channel; each is created/removed on its own. */
export type RewardKind = 'stardust' | 'youtube' | 'tts';

/**
 * What Twitch will store for a reward: title ≤45 chars, prompt ≤200. Longer is rejected with a
 * plain 400, which our create path reads as "already exists" — so an overlong prompt looks like a
 * reward that mysteriously refuses to be created. See the test that measures every locale.
 */
export const REWARD_TITLE_MAX = 45;
export const REWARD_PROMPT_MAX = 200;

/** Reward title/prompt for a kind, in the streamer's language. */
export function rewardTextFor(
  kind: RewardKind,
  lang: string | undefined,
): { title: string; prompt: string } {
  if (kind === 'youtube') return youtubeText(lang);
  if (kind === 'tts') return ttsText(lang);
  return rewardText(lang);
}

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
  /** Add (or re-create) one reward on an already-connected channel. */
  addReward(
    channelId: string,
    kind: RewardKind,
    opts: { cost?: number; lang?: string },
  ): Promise<{ ok: boolean; error?: string }>;
  /** Remove a single reward (deletes it on Twitch), keeping the connection + the other rewards. */
  removeReward(channelId: string, kind: RewardKind): Promise<void>;
  status(channelId: string): Promise<ChannelPointsStatus>;
  /**
   * Report what became of a YouTube request bought with points: aired → FULFILLED (points taken),
   * anything else → CANCELED (points refunded). Called by the payout layer, which owns the verdict.
   */
  settleRedemption(
    channelId: string,
    rewardId: string,
    redemptionId: string,
    outcome: 'aired' | 'failed',
  ): Promise<void>;
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
      // The streamer's cut, at their own stingier rate — the same rule as a request's mirrored half,
      // so every reward we own pays them the same way. Skipped for a self-redeem (points were free).
      const ownerDust = CHANNEL_POINTS.ownerDustFor(ev.cost);
      if (ownerDust > 0) await awardDust(conn.broadcasterId, ownerDust);
      log.info(
        { channelId: reward.channelId, redeemerId: ev.redeemerId, cost: ev.cost, dust, ownerDust },
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
   * (moderation + overlay playback).
   *
   * Deliberately NOT fulfill-first, unlike stardust. Buying dust is done the moment it is bought,
   * but a video request is a promise about the stream: the link may be region-locked for the
   * streamer, the moderator may drop it, it may sit in the queue until it expires. FULFILLED is
   * terminal on Twitch, so claiming it here would make those points unrefundable. The redemption
   * stays pending and is settled by whatever actually happens to the submission (see payout.ts).
   */
  async function processYoutube(
    reward: RewardRecord,
    conn: ConnectionRecord,
    ev: RedemptionEvent,
  ): Promise<void> {
    // Checked before the link is even resolved: a paused channel owes the viewer their points back,
    // not a round-trip to YouTube. Same switch the site and the chat commands honour.
    if (!(await acceptsSends(reward.channelId, conn.broadcasterId, ev.redeemerId))) {
      await authorized(reward.channelId, (token) =>
        cancelRedemption(token, conn.broadcasterId, reward.rewardId, ev.redemptionId),
      );
      log.info(
        { channelId: reward.channelId },
        'channel-points: channel is not accepting sends, refunded',
      );
      return;
    }
    const resolved = await resolvePlayableYoutube(ev.userInput);
    if (!resolved) {
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
    // Music/video, auto-approve and submission routing are shared with the !play chat command (see
    // media/submit.ts) so a link is treated identically however it arrived. The dust is owed from
    // here and paid on air, scaled by what the viewer actually spent.
    const { autoApproved } = await submitResolvedYoutube(
      { playback, io },
      {
        channelId: reward.channelId,
        broadcasterId: conn.broadcasterId,
        resolved,
        senderTwitchId: ev.redeemerId,
        senderName: ev.redeemerName,
        redemption: {
          rewardId: reward.rewardId,
          redemptionId: ev.redemptionId,
          cost: ev.cost,
        },
      },
    );
    log.info(
      { channelId: reward.channelId, videoId: resolved.parsed.videoId, autoApproved },
      'channel-points: youtube submitted, redemption pending until it airs',
    );
  }

  /**
   * A line bought with points. Same shape as the YouTube request — refund on anything we cannot
   * put on screen, otherwise submit and leave the redemption pending until it airs. The only new
   * refusal is length: Twitch accepts a longer input than we will show.
   */
  async function processTts(
    reward: RewardRecord,
    conn: ConnectionRecord,
    ev: RedemptionEvent,
  ): Promise<void> {
    const text = ev.userInput.trim();
    const refund = async (why: string): Promise<void> => {
      await authorized(reward.channelId, (token) =>
        cancelRedemption(token, conn.broadcasterId, reward.rewardId, ev.redemptionId),
      );
      log.info({ channelId: reward.channelId, why }, 'channel-points: tts refunded');
    };
    if (!(await acceptsSends(reward.channelId, conn.broadcasterId, ev.redeemerId))) {
      return refund('not accepting');
    }
    if (!text) return refund('empty');
    if (text.length > CHAT_TEXT_MAX_LEN) return refund('too long');

    // Shared with the `!tts` chat command (media/submit.ts), so a line is treated identically
    // however it arrived; the dust is owed from here and paid on air, scaled by what was spent.
    const { autoApproved } = await submitChatText(
      { playback, io },
      {
        channelId: reward.channelId,
        broadcasterId: conn.broadcasterId,
        text,
        senderTwitchId: ev.redeemerId,
        senderName: ev.redeemerName,
        redemption: {
          rewardId: reward.rewardId,
          redemptionId: ev.redemptionId,
          cost: ev.cost,
        },
      },
    );
    log.info(
      { channelId: reward.channelId, autoApproved },
      'channel-points: tts submitted, redemption pending until it airs',
    );
  }

  /**
   * The submission's fate, told to Twitch: aired → take the points, anything else → give them back.
   * Never throws — a settle that fails leaves the redemption pending, which the streamer can still
   * resolve by hand in their own queue, and that is a better failure than losing the points.
   */
  async function settleRedemption(
    channelId: string,
    rewardId: string,
    redemptionId: string,
    outcome: 'aired' | 'failed',
  ): Promise<void> {
    const conn = await getConnection(channelId);
    if (!conn) return;
    const res = await authorized(channelId, (token) =>
      outcome === 'aired'
        ? fulfillRedemption(token, conn.broadcasterId, rewardId, redemptionId)
        : cancelRedemption(token, conn.broadcasterId, rewardId, redemptionId),
    );
    // 404/400 here usually means the streamer already resolved it by hand in the Twitch queue.
    if (!res || !res.ok) {
      log.warn(
        { channelId, redemptionId, outcome, status: res?.status },
        'channel-points: could not settle redemption',
      );
      return;
    }
    log.info({ channelId, redemptionId, outcome }, 'channel-points: redemption settled');
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
    } else if (reward.kind === 'tts') {
      await processTts(reward, conn, ev);
    } else {
      log.warn({ kind: reward.kind }, 'channel-points: reward kind has no handler');
    }
  }

  /**
   * Drain the UNFULFILLED backlog of every reward on a channel. EventSub does not replay what it
   * missed, so anything redeemed while we were down would sit in the streamer's queue forever.
   *
   * YouTube requests are now deliberately left UNFULFILLED while they wait their turn, so the
   * backlog contains two different things: requests we already took (skipped — a payout row exists
   * for them) and requests we never saw (submitted now, as if they had just arrived).
   */
  async function sweepUnfulfilled(channelId: string): Promise<void> {
    const conn = await getConnection(channelId);
    if (!conn) return;
    for (const reward of await getRewardsByChannel(channelId)) {
      let after: string | undefined;
      let total = 0;
      let stale = 0;
      let capped = 0;
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
            user_input?: string;
            redeemed_at?: string;
            reward?: { cost?: number };
          }[];
          pagination?: { cursor?: string };
        };
        for (const r of body.data ?? []) {
          // Both request kinds stay UNFULFILLED while queued, so the backlog holds ones we already
          // took (a payout row exists — skip) next to ones we never saw.
          if (reward.kind !== 'stardust' && (await isRedemptionKnown(r.id))) continue;
          const verdict = sweepVerdict({
            queues: reward.kind !== 'stardust',
            redeemedAt: r.redeemed_at,
            takenSoFar: total,
            now: Date.now(),
          });
          if (verdict === 'stale') {
            stale += 1;
            continue;
          }
          if (verdict === 'capped') {
            capped += 1;
            continue;
          }
          const ev = {
            broadcasterId: conn.broadcasterId,
            redemptionId: r.id,
            rewardId: reward.rewardId,
            redeemerId: r.user_id,
            redeemerName: r.user_name ?? r.user_login ?? r.user_id,
            cost: typeof r.reward?.cost === 'number' ? r.reward.cost : 0,
            userInput: r.user_input ?? '',
          };
          if (reward.kind === 'stardust') await processStardust(reward, conn, ev);
          else if (reward.kind === 'youtube') await processYoutube(reward, conn, ev);
          else if (reward.kind === 'tts') await processTts(reward, conn, ev);
          total += 1;
        }
        after = body.pagination?.cursor;
      } while (after);
      if (total > 0)
        log.info({ channelId, rewardId: reward.rewardId, total }, 'channel-points: swept backlog');
      // Never silent: what the bounds refused stays pending on Twitch, and the streamer can only
      // resolve by hand what they know about.
      if (stale > 0 || capped > 0) {
        log.warn(
          { channelId, rewardId: reward.rewardId, stale, capped },
          'channel-points: backlog left for the streamer to resolve',
        );
      }
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
    // Both request rewards take viewer input (the link / the line); stardust is a plain click.
    const res = await run((token) =>
      createReward(token, broadcasterId, text.title, cost, text.prompt, kind !== 'stardust'),
    );
    if (res?.ok) {
      return ((await res.json()) as { data?: { id: string }[] }).data?.[0]?.id ?? null;
    }
    if (res?.status === 400) {
      // Usually "already exists" — recover its id by exact title (every title carries "(Tossit)").
      const listRes = await run((token) => getManageableRewards(token, broadcasterId));
      if (listRes?.ok) {
        const list = (await listRes.json()) as { data?: { id: string; title: string }[] };
        const found = list.data?.find((r) => r.title === text.title)?.id;
        if (found) return found;
      }
      // No reward by that title, so the 400 meant something else — copy over Twitch's length caps
      // being the usual culprit. Say so, or this looks like a reward that refuses to be created.
      log.warn(
        { channelId, kind, title: text.title.length, prompt: text.prompt.length },
        'channel-points: create rejected and no existing reward matches — check the copy limits',
      );
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
    addReward,
    removeReward,
    async status(channelId): Promise<ChannelPointsStatus> {
      const conn = await getConnection(channelId);
      // "connected" = the Twitch authorization (token) exists; the rewards are independent add-ons.
      const rewards = conn ? await getRewardsByChannel(channelId) : [];
      return {
        connected: !!conn,
        externalName: conn?.externalName ?? null,
        hasStardust: rewards.some((r) => r.kind === 'stardust'),
        hasYoutube: rewards.some((r) => r.kind === 'youtube'),
        hasTts: rewards.some((r) => r.kind === 'tts'),
      };
    },
    settleRedemption,
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
