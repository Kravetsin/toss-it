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
    if (!creds) return null;
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

  async function onRedemption(ev: RedemptionEvent): Promise<void> {
    const row = await getRewardByBroadcaster(ev.broadcasterId);
    if (!row || row.rewardId !== ev.rewardId) return; // not our reward
    // Fulfill-first: FULFILLED is terminal (unrefundable), so a successful fulfill is what makes the
    // spent points irreversible. Only then do we mint dust — this closes the refund-loop exploit.
    const fres = await authorized(row.channelId, (token) =>
      fulfillRedemption(token, ev.broadcasterId, ev.rewardId, ev.redemptionId),
    );
    if (!fres || !fres.ok) {
      log.warn(
        { channelId: row.channelId, status: fres?.status },
        'channel-points: fulfill failed, not crediting',
      );
      return;
    }
    // Anti-self-farm: the broadcaster redeems their OWN rewards for free (Twitch never charges the
    // channel owner points), so crediting them would be an unlimited faucet. Fulfill to clear the
    // queue, but never mint dust for the owner. Mirrors the self-send guard elsewhere.
    if (ev.redeemerId === row.broadcasterId) return;
    const dust = CHANNEL_POINTS.dustFor(ev.cost);
    await awardDust(ev.redeemerId, dust);
    io.to(roomOf(row.channelId)).emit('donation:fx', {
      provider: 'channel-points',
      donorName: ev.redeemerName,
      amount: dust,
      currency: '⭐',
      message: null,
    });
  }

  const eventsub = new ChannelPointsEventSub({
    log,
    wantedChannels: () => [...enabled],
    subscribeChannel: async (channelId, sessionId) => {
      const res = await authorized(channelId, (token, row) =>
        createRedemptionSub(token, row.broadcasterId, row.rewardId, sessionId),
      );
      if (!res || !res.ok) {
        log.warn({ channelId, status: res?.status }, 'channel-points: subscribe failed');
        return null;
      }
      const data = (await res.json()) as { data?: { id: string }[] };
      return data.data?.[0]?.id ?? null;
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
      const res = await createReward(
        input.creds.accessToken,
        input.broadcasterId,
        REWARD_TITLE,
        cost,
        rewardPrompt(cost),
      );
      if (!res.ok) {
        const body = await res.text();
        log.warn(
          { channelId: input.channelId, status: res.status, body },
          'channel-points: create reward failed',
        );
        // 400 usually = a reward with this title already exists on the channel.
        return { ok: false, error: res.status === 400 ? 'reward_exists' : 'create_failed' };
      }
      const data = (await res.json()) as { data?: { id: string }[] };
      const rewardId = data.data?.[0]?.id;
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
  };
}
