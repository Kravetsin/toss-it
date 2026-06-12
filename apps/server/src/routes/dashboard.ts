import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ChannelSettings, HistoryEntry, ListedUser, SubmissionSummary } from '@tmw/shared';
import { db } from '../db/index';
import { bans, channels, submissions, users, whitelist, type ChannelRow } from '../db/schema';
import { config } from '../config';
import { requireUser } from '../auth';
import {
  dashboardRoomOf,
  toSummary,
  type PlaybackManager,
  type RealtimeServer,
} from '../playback';

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

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function toSettings(ch: ChannelRow): ChannelSettings {
  return {
    maxDurationMs: ch.maxDurationMs,
    maxFileSizeBytes: ch.maxFileSizeBytes,
    volume: ch.volume,
    accepting: ch.accepting,
    showSenderName: ch.showSenderName,
  };
}

export function registerDashboardRoutes(app: FastifyInstance, deps: DashboardRoutesDeps): void {
  const { playback, io } = deps;

  /** Что сейчас на экране (для панели «сейчас играет» при загрузке дашборда). */
  app.get('/api/dashboard/now', async (req, reply) => {
    const channel = await requireOwnChannel(req, reply);
    if (!channel) return;
    const current = playback.getCurrent(channel.id);
    return { now: current ? toSummary(current) : null };
  });

  /** Скип текущего показа: мгновенно гасит оверлей и двигает очередь. */
  app.post('/api/dashboard/skip', async (req, reply) => {
    const channel = await requireOwnChannel(req, reply);
    if (!channel) return;
    const skipped = await playback.skip(channel.id);
    return { skipped };
  });

  app.get('/api/dashboard/settings', async (req, reply): Promise<ChannelSettings | undefined> => {
    const channel = await requireOwnChannel(req, reply);
    if (!channel) return;
    return toSettings(channel);
  });

  app.put<{ Body: Partial<ChannelSettings> | null }>(
    '/api/dashboard/settings',
    async (req, reply): Promise<ChannelSettings | undefined> => {
      const channel = await requireOwnChannel(req, reply);
      if (!channel) return;
      const b = req.body ?? {};

      const patch = {
        maxDurationMs:
          typeof b.maxDurationMs === 'number'
            ? clamp(Math.round(b.maxDurationMs), 1_000, 60_000)
            : channel.maxDurationMs,
        maxFileSizeBytes:
          typeof b.maxFileSizeBytes === 'number'
            ? clamp(Math.round(b.maxFileSizeBytes), 1024 * 1024, config.maxFileSizeBytes)
            : channel.maxFileSizeBytes,
        volume: typeof b.volume === 'number' ? clamp(Math.round(b.volume), 0, 100) : channel.volume,
        accepting: typeof b.accepting === 'boolean' ? b.accepting : channel.accepting,
        showSenderName:
          typeof b.showSenderName === 'boolean' ? b.showSenderName : channel.showSenderName,
      };
      await db.update(channels).set(patch).where(eq(channels.id, channel.id));
      return toSettings({ ...channel, ...patch });
    },
  );

  /** История: всё, что покинуло pending (метаданные; файлы эфемерны и уже удалены). */
  app.get('/api/dashboard/history', async (req, reply): Promise<HistoryEntry[] | undefined> => {
    const channel = await requireOwnChannel(req, reply);
    if (!channel) return;
    const rows = await db
      .select()
      .from(submissions)
      .where(
        and(
          eq(submissions.channelId, channel.id),
          inArray(submissions.status, ['played', 'rejected', 'expired']),
        ),
      )
      .orderBy(desc(submissions.updatedAt))
      .limit(50)
      .all();
    return rows.map((r) => ({ ...toSummary(r), status: r.status }));
  });

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
