import crypto from 'node:crypto';
import { and, count, desc, eq, isNotNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ChannelSelf, LeaderboardEntry, PublicChannelInfo } from '@tmw/shared';
import { db } from '../db/index';
import { channels, submissions, users } from '../db/schema';
import { requireUser } from '../auth';

function newOverlayToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

export function registerChannelRoutes(app: FastifyInstance): void {
  app.post('/api/channels', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;

    const existing = await db
      .select()
      .from(channels)
      .where(eq(channels.ownerUserId, user.id))
      .get();
    if (existing) {
      return reply.code(409).send({ error: 'Канал уже создан' });
    }

    const channel = {
      id: crypto.randomUUID(),
      ownerUserId: user.id,
      overlayToken: newOverlayToken(),
      createdAt: new Date(),
    };
    await db.insert(channels).values(channel);
    const response: ChannelSelf = { id: channel.id, overlayToken: channel.overlayToken };
    return reply.code(201).send(response);
  });

  /** Rotates overlay token; invalidates the old OBS URL. */
  app.post('/api/channels/rotate-token', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;

    const channel = await db.select().from(channels).where(eq(channels.ownerUserId, user.id)).get();
    if (!channel) return reply.code(404).send({ error: 'Канал не создан' });

    const overlayToken = newOverlayToken();
    await db.update(channels).set({ overlayToken }).where(eq(channels.id, channel.id));
    const response: ChannelSelf = { id: channel.id, overlayToken };
    return response;
  });

  app.get<{ Params: { login: string } }>('/api/c/:login', async (req, reply) => {
    const row = await db
      .select({
        login: users.login,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        accepting: channels.accepting,
        maxDurationMs: channels.maxDurationMs,
        maxAudioDurationMs: channels.maxAudioDurationMs,
        maxFileSizeBytes: channels.maxFileSizeBytes,
        autoApproveGifs: channels.autoApproveGifs,
        description: channels.description,
        links: channels.links,
        founderSince: users.founderSince,
        equipped: users.equipped,
      })
      .from(channels)
      .innerJoin(users, eq(users.id, channels.ownerUserId))
      .where(eq(users.login, req.params.login.toLowerCase()))
      .get();
    if (!row) return reply.code(404).send({ error: 'Канал не найден' });
    const { founderSince, equipped, ...rest } = row;
    const response: PublicChannelInfo = {
      ...rest,
      isFounder: founderSince != null,
      nickColor: equipped?.nickColor ?? null,
      nickEffect: equipped?.nickEffect ?? null,
      cardEffect: equipped?.cardEffect ?? null,
    };
    return response;
  });

  app.get<{ Params: { login: string } }>('/api/c/:login/leaderboard', async (req, reply) => {
    const channel = await db
      .select({ id: channels.id })
      .from(channels)
      .innerJoin(users, eq(users.id, channels.ownerUserId))
      .where(eq(users.login, req.params.login.toLowerCase()))
      .get();
    if (!channel) return reply.code(404).send({ error: 'Канал не найден' });

    const rows = await db
      .select({
        userId: submissions.senderUserId,
        login: users.login,
        displayName: users.displayName,
        founderSince: users.founderSince,
        equipped: users.equipped,
        count: count(),
      })
      .from(submissions)
      .innerJoin(users, eq(users.id, submissions.senderUserId))
      .where(
        and(
          eq(submissions.channelId, channel.id),
          eq(submissions.status, 'played'),
          isNotNull(submissions.senderUserId),
        ),
      )
      .groupBy(submissions.senderUserId)
      .orderBy(desc(count()))
      .limit(10)
      .all();

    const response: LeaderboardEntry[] = rows.map((r) => ({
      userId: r.userId!,
      login: r.login,
      displayName: r.displayName,
      count: r.count,
      isFounder: r.founderSince != null,
      nickColor: r.equipped?.nickColor ?? null,
      nickEffect: r.equipped?.nickEffect ?? null,
      cardEffect: r.equipped?.cardEffect ?? null,
    }));
    return response;
  });
}
