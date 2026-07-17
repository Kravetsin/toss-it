import { eq } from 'drizzle-orm';
import { db } from '../../db/index';
import { channelPointRewards, type ChannelPointRewardRow } from '../../db/schema';
import { decryptSecret, encryptSecret } from '../../crypto';
import type { StreamerCreds } from './token';

export type RewardRecord = ChannelPointRewardRow;

/** Decode the encrypted {access,refresh} blob; null if it can't be read (key rotated / corrupt). */
export function decodeCreds(row: RewardRecord): StreamerCreds | null {
  try {
    const parsed = JSON.parse(decryptSecret(row.encTokens)) as StreamerCreds;
    if (parsed.accessToken && parsed.refreshToken) return parsed;
  } catch {
    /* fall through */
  }
  return null;
}

export function encodeCreds(creds: StreamerCreds): string {
  return encryptSecret(JSON.stringify(creds));
}

export async function getReward(channelId: string): Promise<RewardRecord | undefined> {
  return db
    .select()
    .from(channelPointRewards)
    .where(eq(channelPointRewards.channelId, channelId))
    .get();
}

export async function getAllRewards(): Promise<RewardRecord[]> {
  return db.select().from(channelPointRewards).all();
}

/** Reverse lookup for a redemption event, which carries the broadcaster id, not our channel id. */
export async function getRewardByBroadcaster(
  broadcasterId: string,
): Promise<RewardRecord | undefined> {
  return db
    .select()
    .from(channelPointRewards)
    .where(eq(channelPointRewards.broadcasterId, broadcasterId))
    .get();
}

export async function upsertReward(rec: {
  channelId: string;
  broadcasterId: string;
  rewardId: string;
  creds: StreamerCreds;
  externalName: string | null;
}): Promise<void> {
  const now = new Date();
  const encTokens = encodeCreds(rec.creds);
  await db
    .insert(channelPointRewards)
    .values({
      channelId: rec.channelId,
      broadcasterId: rec.broadcasterId,
      rewardId: rec.rewardId,
      encTokens,
      externalName: rec.externalName,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: channelPointRewards.channelId,
      set: {
        broadcasterId: rec.broadcasterId,
        rewardId: rec.rewardId,
        encTokens,
        externalName: rec.externalName,
        updatedAt: now,
      },
    });
}

/** Persist a rotated token pair without touching the rest of the row. */
export async function saveCreds(channelId: string, creds: StreamerCreds): Promise<void> {
  await db
    .update(channelPointRewards)
    .set({ encTokens: encodeCreds(creds), updatedAt: new Date() })
    .where(eq(channelPointRewards.channelId, channelId));
}

export async function deleteReward(channelId: string): Promise<void> {
  await db.delete(channelPointRewards).where(eq(channelPointRewards.channelId, channelId));
}
