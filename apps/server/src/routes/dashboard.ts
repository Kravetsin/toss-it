import { and, asc, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ListedUser, SubmissionSummary } from '@tmw/shared';
import { db } from '../db/index';
import { bans, channels, submissions, users, whitelist, type ChannelRow } from '../db/schema';
import { requireUser } from '../auth';
import { dashboardRoomOf, type PlaybackManager, type RealtimeServer } from '../playback';
import { toSummary } from './media';

export interface DashboardRoutesDeps {
  playback: PlaybackManager;
  io: RealtimeServer;
}

/** Все роуты дашборда работают только с собственным каналом залогиненного стримера. */
async function requireOwnChannel(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<ChannelRow | null> {
  const user = await requireUser(req, reply);
  if (!user) return null;
  const channel = await db
    .select()
    .from(channels)
    .where(eq(channels.ownerUserId, user.id))
    .get();
  if (!channel) {
    void reply.code(404).send({ error: 'Канал не создан' });
    return null;
  }
  return channel;
}

export function registerDashboardRoutes(app: FastifyInstance, deps: DashboardRoutesDeps): void {
  const { playback, io } = deps;

  app.get(
    '/api/dashboard/pending',
    async (req, reply): Promise<SubmissionSummary[] | undefined> => {
      const channel = await requireOwnChannel(req, reply);
      if (!channel) return;
      const rows = await db
        .select()
        .from(submissions)
        .where(and(eq(submissions.channelId, channel.id), eq(submissions.status, 'pending')))
        .orderBy(asc(submissions.createdAt))
        .all();
      return rows.map(toSummary);
    },
  );

  app.post<{ Params: { id: string }; Body: { whitelist?: boolean } | null }>(
    '/api/dashboard/submissions/:id/approve',
    async (req, reply) => {
      const channel = await requireOwnChannel(req, reply);
      if (!channel) return;

      const sub = await db
        .select()
        .from(submissions)
        .where(and(eq(submissions.id, req.params.id), eq(submissions.channelId, channel.id)))
        .get();
      if (!sub || sub.status !== 'pending') {
        return reply.code(404).send({ error: 'Отправка не найдена или уже обработана' });
      }

      const updated = { ...sub, status: 'approved' as const, updatedAt: new Date() };
      await db
        .update(submissions)
        .set({ status: updated.status, updatedAt: updated.updatedAt })
        .where(eq(submissions.id, sub.id));

      if (req.body?.whitelist && sub.senderUserId) {
        await db
          .insert(whitelist)
          .values({ channelId: channel.id, userId: sub.senderUserId, createdAt: new Date() })
          .onConflictDoNothing();
      }

      const queuePosition = playback.enqueue(updated);
      io.to(dashboardRoomOf(channel.id)).emit('moderation:resolved', sub.id);
      return { ok: true, queuePosition };
    },
  );

  app.post<{ Params: { id: string }; Body: { ban?: boolean } | null }>(
    '/api/dashboard/submissions/:id/reject',
    async (req, reply) => {
      const channel = await requireOwnChannel(req, reply);
      if (!channel) return;

      const sub = await db
        .select()
        .from(submissions)
        .where(and(eq(submissions.id, req.params.id), eq(submissions.channelId, channel.id)))
        .get();
      if (!sub || sub.status !== 'pending') {
        return reply.code(404).send({ error: 'Отправка не найдена или уже обработана' });
      }

      await db
        .update(submissions)
        .set({ status: 'rejected', updatedAt: new Date() })
        .where(eq(submissions.id, sub.id));
      io.to(dashboardRoomOf(channel.id)).emit('moderation:resolved', sub.id);

      if (req.body?.ban && sub.senderUserId) {
        await db
          .insert(bans)
          .values({ channelId: channel.id, userId: sub.senderUserId, createdAt: new Date() })
          .onConflictDoNothing();
        // Бан снимает из очереди и все остальные pending этого зрителя.
        const others = await db
          .select()
          .from(submissions)
          .where(
            and(
              eq(submissions.channelId, channel.id),
              eq(submissions.senderUserId, sub.senderUserId),
              eq(submissions.status, 'pending'),
            ),
          )
          .all();
        for (const o of others) {
          await db
            .update(submissions)
            .set({ status: 'rejected', updatedAt: new Date() })
            .where(eq(submissions.id, o.id));
          io.to(dashboardRoomOf(channel.id)).emit('moderation:resolved', o.id);
        }
      }

      return { ok: true };
    },
  );

  app.get('/api/dashboard/whitelist', async (req, reply): Promise<ListedUser[] | undefined> => {
    const channel = await requireOwnChannel(req, reply);
    if (!channel) return;
    return listUsers(whitelist, channel.id);
  });

  app.delete<{ Params: { userId: string } }>(
    '/api/dashboard/whitelist/:userId',
    async (req, reply) => {
      const channel = await requireOwnChannel(req, reply);
      if (!channel) return;
      await db
        .delete(whitelist)
        .where(and(eq(whitelist.channelId, channel.id), eq(whitelist.userId, req.params.userId)));
      return { ok: true };
    },
  );

  app.get('/api/dashboard/bans', async (req, reply): Promise<ListedUser[] | undefined> => {
    const channel = await requireOwnChannel(req, reply);
    if (!channel) return;
    return listUsers(bans, channel.id);
  });

  app.delete<{ Params: { userId: string } }>('/api/dashboard/bans/:userId', async (req, reply) => {
    const channel = await requireOwnChannel(req, reply);
    if (!channel) return;
    await db
      .delete(bans)
      .where(and(eq(bans.channelId, channel.id), eq(bans.userId, req.params.userId)));
    return { ok: true };
  });
}

async function listUsers(
  table: typeof whitelist | typeof bans,
  channelId: string,
): Promise<ListedUser[]> {
  const rows = await db
    .select({
      userId: table.userId,
      login: users.login,
      displayName: users.displayName,
      addedAt: table.createdAt,
    })
    .from(table)
    .innerJoin(users, eq(users.id, table.userId))
    .where(eq(table.channelId, channelId))
    .all();
  return rows.map((r) => ({ ...r, addedAt: r.addedAt.getTime() }));
}
