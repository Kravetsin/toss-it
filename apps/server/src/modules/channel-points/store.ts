import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index';
import {
  channelPointConnections,
  channelPointRewards,
  type ChannelPointConnectionRow,
  type ChannelPointRewardRow,
} from '../../db/schema';
import { decryptSecret, encryptSecret } from '../../crypto';
import type { StreamerCreds } from './token';

export type ConnectionRecord = ChannelPointConnectionRow;
export type RewardRecord = ChannelPointRewardRow;
/** What a reward routes to. */
export type RewardKind = 'stardust' | 'youtube';

/** Decode the encrypted {access,refresh} blob; null if it can't be read (key rotated / corrupt). */
export function decodeCreds(conn: ConnectionRecord): StreamerCreds | null {
  try {
    const parsed = JSON.parse(decryptSecret(conn.encTokens)) as StreamerCreds;
    if (parsed.accessToken && parsed.refreshToken) return parsed;
  } catch {
    /* fall through */
  }
  return null;
}

export function encodeCreds(creds: StreamerCreds): string {
  return encryptSecret(JSON.stringify(creds));
}

// ---- connections (one per channel: the streamer's token) ----

export async function getConnection(channelId: string): Promise<ConnectionRecord | undefined> {
  return db
    .select()
    .from(channelPointConnections)
    .where(eq(channelPointConnections.channelId, channelId))
    .get();
}

export async function getAllConnections(): Promise<ConnectionRecord[]> {
  return db.select().from(channelPointConnections).all();
}

export async function upsertConnection(rec: {
  channelId: string;
  broadcasterId: string;
  creds: StreamerCreds;
  externalName: string | null;
}): Promise<void> {
  const now = new Date();
  const encTokens = encodeCreds(rec.creds);
  await db
    .insert(channelPointConnections)
    .values({
      channelId: rec.channelId,
      broadcasterId: rec.broadcasterId,
      encTokens,
      externalName: rec.externalName,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: channelPointConnections.channelId,
      set: {
        broadcasterId: rec.broadcasterId,
        encTokens,
        externalName: rec.externalName,
        updatedAt: now,
      },
    });
}

/** Persist a rotated token pair without touching the rest of the connection. */
export async function saveConnectionCreds(channelId: string, creds: StreamerCreds): Promise<void> {
  await db
    .update(channelPointConnections)
    .set({ encTokens: encodeCreds(creds), updatedAt: new Date() })
    .where(eq(channelPointConnections.channelId, channelId));
}

export async function deleteConnection(channelId: string): Promise<void> {
  await db.delete(channelPointConnections).where(eq(channelPointConnections.channelId, channelId));
}

// ---- rewards (many per channel; kind routes the redemption) ----

export async function getRewardById(rewardId: string): Promise<RewardRecord | undefined> {
  return db
    .select()
    .from(channelPointRewards)
    .where(eq(channelPointRewards.rewardId, rewardId))
    .get();
}

export async function getRewardsByChannel(channelId: string): Promise<RewardRecord[]> {
  return db
    .select()
    .from(channelPointRewards)
    .where(eq(channelPointRewards.channelId, channelId))
    .all();
}

export async function getAllRewards(): Promise<RewardRecord[]> {
  return db.select().from(channelPointRewards).all();
}

export async function getRewardByChannelKind(
  channelId: string,
  kind: RewardKind,
): Promise<RewardRecord | undefined> {
  return getRewardsByChannel(channelId).then((rows) => rows.find((r) => r.kind === kind));
}

export async function insertReward(rec: {
  rewardId: string;
  channelId: string;
  kind: RewardKind;
}): Promise<void> {
  const now = new Date();
  await db
    .insert(channelPointRewards)
    .values({
      rewardId: rec.rewardId,
      channelId: rec.channelId,
      kind: rec.kind,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
}

export async function deleteRewardById(rewardId: string): Promise<void> {
  await db.delete(channelPointRewards).where(eq(channelPointRewards.rewardId, rewardId));
}

export async function deleteRewardsByChannel(channelId: string): Promise<void> {
  await db.delete(channelPointRewards).where(eq(channelPointRewards.channelId, channelId));
}

/** Drop any existing rewards of a kind for a channel — used to keep one reward per (channel, kind). */
export async function deleteRewardsByChannelKind(
  channelId: string,
  kind: RewardKind,
): Promise<void> {
  await db
    .delete(channelPointRewards)
    .where(and(eq(channelPointRewards.channelId, channelId), eq(channelPointRewards.kind, kind)));
}
