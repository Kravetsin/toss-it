import type { FastifyBaseLogger } from 'fastify';
import { CHANNEL_POINTS } from '@tmw/shared';
import { roomOf, type RealtimeServer } from '../../playback';
import { awardDust } from '../twitch-chat/accrual';
import { ChannelPointsEventSub, type RedemptionEvent } from './eventsub';
import {
  createRedemptionSub,
  createReward,
  deleteReward,
  deleteSub,
  fulfillRedemption,
  getManageableRewards,
  getRedemptions,
} from './helix';
import { refreshStreamerCreds, type StreamerCreds } from './token';
import {
  decodeCreds,
  deleteReward as deleteRewardRow,
  getAllRewards,
  getReward,
  getRewardByBroadcaster,
  saveCreds,
  upsertReward,
  type RewardRecord,
} from './store';

/** Title of the reward we create on the streamer's channel (must be unique per channel). */
const REWARD_TITLE = 'Купить звёздную пыль (Tossit)';
/** Viewer-facing description; spells out the exact conversion so viewers know what they get. The
 *  streamer can edit it in Twitch afterwards. */
function rewardPrompt(cost: number): string {
  return `Обменять баллы канала на звёздную пыль Tossit: ${cost} баллов = ${CHANNEL_POINTS.dustFor(
    cost,
  )} ⭐. Косметика в чате и на странице канала.`;
}

export interface ChannelPointsModule {
  start(): void;
  stop(): void;
  /** Finish opt-in: create the app-owned reward, store creds, start listening. */
  connectChannel(input: {
    channelId: string;
    broadcasterId: string;
    creds: StreamerCreds;
    externalName: string | null;
    /** Point cost the streamer picked; clamped to CHANNEL_POINTS bounds (default if omitted). */
    cost?: number;
  }): Promise<{ ok: boolean; error?: string }>;
  disconnect(channelId: string): Promise<void>;
  status(channelId: string): Promise<{ connected: boolean; externalName: string | null }>;
  /** Live runtime state for the admin diagnostic endpoint. */
  debugState(): {
    running: boolean;
    enabled: string[];
    eventsub: { hasSession: boolean; subChannels: string[] };
  };
}

export function createChannelPointsModule(deps: {
  io: RealtimeServer;
  log: FastifyBaseLogger;
}): ChannelPointsModule {
  const { io, log } = deps;
  /** channelId set of currently-enabled rewards; eventsub reads this synchronously. */
  const enabled = new Set<string>();
  /** Whether the EventSub socket is up. Twitch force-closes a socket with no subscriptions after
   *  ~10s, so we only hold it open while at least one channel is enabled. */
  let running = false;

  function ensureRunning(): void {
    if (running || enabled.size === 0) return;
    running = true;
    eventsub.start();
  }

  function stopIfIdle(): void {
    if (running && enabled.size === 0) {
      running = false;
      eventsub.stop();
    }
  }

  /**
   * Run a Helix call with a channel's streamer token, refreshing once on 401 and persisting the
   * rotated token. null = no row / creds unreadable / refresh token revoked (feature auto-removed).
   */
  async function authorized(
    channelId: string,
    run: (token: string, row: RewardRecord) => Promise<Response>,
  ): Promise<Response | null> {
    const row = await getReward(channelId);
    if (!row) return null;
    const creds = decodeCreds(row);
    if (!creds) {
      log.warn(
        { channelId },
        'channel-points: could not decode stored token (encryption key changed?)',
      );
      return null;
    }
    let res = await run(creds.accessToken, row);
    if (res.status === 401) {
      const next = await refreshStreamerCreds(creds);
      if (!next) {
        log.warn({ channelId }, 'channel-points: streamer token revoked, removing reward');
        enabled.delete(channelId);
        await deleteRewardRow(channelId);
        eventsub.sync();
        stopIfIdle();
        return null;
      }
      await saveCreds(channelId, next);
      res = await run(next.accessToken, row);
    }
    return res;
  }

  /**
   * Fulfill-first, then credit. FULFILLED is terminal (unrefundable), so a successful fulfill is
   * what makes the spent points irreversible — only then do we mint dust (closes the refund loop).
   * Shared by live events and the backlog sweep; both are safe to run on the same redemption because
   * only one PATCH from UNFULFILLED→FULFILLED wins, so dust is credited at most once.
   */
  async function processRedemption(row: RewardRecord, ev: RedemptionEvent): Promise<void> {
    const fres = await authorized(row.channelId, (token) =>
      fulfillRedemption(token, row.broadcasterId, row.rewardId, ev.redemptionId),
    );
    if (!fres || !fres.ok) {
      log.warn(
        { channelId: row.channelId, status: fres?.status },
        'channel-points: fulfill failed, not crediting',
      );
      return;
    }
    const dust = CHANNEL_POINTS.dustFor(ev.cost);
    // Anti-self-farm: the broadcaster redeems their OWN rewards for free (Twitch never charges the
    // channel owner points), so crediting them would be an unlimited faucet — skip the DUST for the
    // owner. The overlay burst still fires for everyone: it's harmless, and it's how the streamer
    // verifies the reward works when testing on their own account.
    if (ev.redeemerId === row.broadcasterId) {
      log.info(
        { channelId: row.channelId },
        'channel-points: owner self-redeem — FX only, no dust',
      );
    } else {
      await awardDust(ev.redeemerId, dust);
      log.info(
        { channelId: row.channelId, redeemerId: ev.redeemerId, cost: ev.cost, dust },
        'channel-points: credited dust',
      );
    }
    io.to(roomOf(row.channelId)).emit('donation:fx', {
      provider: 'channel-points',
      donorName: ev.redeemerName,
      amount: dust,
      currency: '⭐',
      message: null,
    });
  }

  async function onRedemption(ev: RedemptionEvent): Promise<void> {
    const row = await getRewardByBroadcaster(ev.broadcasterId);
    // Log every event so it's clear whether they arrive at all, and flag a reward-id mismatch (e.g.
    // the streamer deleted our reward and recreated one manually — that one isn't app-owned).
    if (!row || row.rewardId !== ev.rewardId) {
      log.warn(
        { broadcasterId: ev.broadcasterId, eventRewardId: ev.rewardId, ourRewardId: row?.rewardId },
        'channel-points: redemption ignored — no matching app-owned reward',
      );
      return;
    }
    log.info(
      { channelId: row.channelId, redeemerId: ev.redeemerId, cost: ev.cost },
      'channel-points: redemption received',
    );
    await processRedemption(row, ev);
  }

  /**
   * Drain the UNFULFILLED backlog for a channel — redemptions that came in while we were offline
   * (EventSub never replays them). Runs after each (re)subscribe, so a restart self-heals.
   */
  async function sweepUnfulfilled(channelId: string): Promise<void> {
    const row = await getReward(channelId);
    if (!row) return;
    let after: string | undefined;
    let total = 0;
    do {
      const res = await authorized(channelId, (token, r) =>
        getRedemptions(token, r.broadcasterId, r.rewardId, 'UNFULFILLED', after),
      );
      if (!res || !res.ok) return;
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
        await processRedemption(row, {
          broadcasterId: row.broadcasterId,
          redemptionId: r.id,
          rewardId: row.rewardId,
          redeemerId: r.user_id,
          redeemerName: r.user_name ?? r.user_login ?? r.user_id,
          cost: typeof r.reward?.cost === 'number' ? r.reward.cost : 0,
        });
        total += 1;
      }
      after = body.pagination?.cursor;
    } while (after);
    if (total > 0) log.info({ channelId, total }, 'channel-points: swept unfulfilled backlog');
  }

  const eventsub = new ChannelPointsEventSub({
    log,
    wantedChannels: () => [...enabled],
    subscribeChannel: async (channelId, sessionId) => {
      const res = await authorized(channelId, (token, row) =>
        createRedemptionSub(token, row.broadcasterId, row.rewardId, sessionId),
      );
      if (!res || !res.ok) {
        log.warn(
          { channelId, status: res?.status, body: res ? await res.text() : null },
          'channel-points: subscribe failed',
        );
        return null;
      }
      const data = (await res.json()) as { data?: { id: string }[] };
      const subId = data.data?.[0]?.id ?? null;
      log.info({ channelId, subId }, 'channel-points: subscribed to redemptions');
      // Catch up on anything redeemed while we were offline (fire-and-forget so the 10s
      // subscribe window isn't blocked by the sweep's paging).
      if (subId)
        void sweepUnfulfilled(channelId).catch((err) =>
          log.warn({ err }, 'channel-points: sweep failed'),
        );
      return subId;
    },
    unsubscribeChannel: async (channelId, subId) => {
      await authorized(channelId, (token) => deleteSub(token, subId));
    },
    onRedemption: (ev) =>
      void onRedemption(ev).catch((err) =>
        log.warn({ err }, 'channel-points: redemption handler failed'),
      ),
  });

  return {
    start(): void {
      void getAllRewards()
        .then((rows) => {
          for (const r of rows) enabled.add(r.channelId);
          log.info({ count: rows.length }, 'channel-points: loaded rewards on start');
          ensureRunning();
        })
        .catch((err) => log.warn({ err }, 'channel-points: load rewards failed'));
    },
    stop(): void {
      running = false;
      eventsub.stop();
    },
    async connectChannel(input): Promise<{ ok: boolean; error?: string }> {
      const cost =
        input.cost === undefined
          ? CHANNEL_POINTS.defaultCost
          : CHANNEL_POINTS.clampCost(input.cost);
      const token = input.creds.accessToken;
      let rewardId: string | undefined;
      const res = await createReward(
        token,
        input.broadcasterId,
        REWARD_TITLE,
        cost,
        rewardPrompt(cost),
      );
      if (res.ok) {
        rewardId = ((await res.json()) as { data?: { id: string }[] }).data?.[0]?.id;
      } else if (res.status === 400) {
        // Our reward already exists (a prior disconnect didn't delete it, or it was recreated).
        // Recover its id and reuse it instead of failing — makes reconnect idempotent.
        log.warn({ channelId: input.channelId }, 'channel-points: reward exists, reusing it');
        const listRes = await getManageableRewards(token, input.broadcasterId);
        if (listRes.ok) {
          const list = (await listRes.json()) as { data?: { id: string; title: string }[] };
          rewardId = list.data?.find((r) => r.title === REWARD_TITLE)?.id;
        }
      } else {
        const body = await res.text();
        log.warn(
          { channelId: input.channelId, status: res.status, body },
          'channel-points: create reward failed',
        );
        return { ok: false, error: 'create_failed' };
      }
      if (!rewardId) return { ok: false, error: 'create_failed' };
      await upsertReward({
        channelId: input.channelId,
        broadcasterId: input.broadcasterId,
        rewardId,
        creds: input.creds,
        externalName: input.externalName,
      });
      enabled.add(input.channelId);
      ensureRunning();
      eventsub.sync();
      return { ok: true };
    },
    async disconnect(channelId): Promise<void> {
      enabled.delete(channelId);
      // Delete the reward on Twitch while we still hold the token, then drop the row.
      await authorized(channelId, (token, row) =>
        deleteReward(token, row.broadcasterId, row.rewardId),
      ).catch(() => {});
      await deleteRewardRow(channelId);
      eventsub.sync();
      stopIfIdle();
    },
    async status(channelId): Promise<{ connected: boolean; externalName: string | null }> {
      const row = await getReward(channelId);
      return { connected: !!row, externalName: row?.externalName ?? null };
    },
    debugState() {
      return { running, enabled: [...enabled], eventsub: eventsub.debug() };
    },
  };
}
