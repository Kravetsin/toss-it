import crypto from 'node:crypto';
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  OVERLAY_POSITIONS,
  type AccessibleChannel,
  type ChannelSettings,
  type HistoryEntry,
  type ListedUser,
  type ModInviteInfo,
  type ReputationStats,
  type SubmissionSummary,
} from '@tmw/shared';
import { db } from '../db/index';
import {
  bans,
  channelModerators,
  channels,
  modInvites,
  submissions,
  users,
  whitelist,
  type ChannelRow,
} from '../db/schema';
import { config } from '../config';
import { requireUser } from '../auth';
import {
  dashboardRoomOf,
  emitSubmissionStatus,
  toSummary,
  type PlaybackManager,
  type RealtimeServer,
} from '../playback';

export interface DashboardRoutesDeps {
  playback: PlaybackManager;
  io: RealtimeServer;
}

/** Доступ к каналу для модерации: владелец ИЛИ модератор. */
async function requireChannelAccess(
  req: FastifyRequest,
  reply: FastifyReply,
  channelId: string,
): Promise<ChannelRow | null> {
  const user = await requireUser(req, reply);
  if (!user) return null;
  const channel = await db.select().from(channels).where(eq(channels.id, channelId)).get();
  if (!channel) {
    void reply.code(404).send({ error: 'Канал не найден' });
    return null;
  }
  if (channel.ownerUserId === user.id) return channel;
  const mod = await db
    .select({ userId: channelModerators.userId })
    .from(channelModerators)
    .where(and(eq(channelModerators.channelId, channelId), eq(channelModerators.userId, user.id)))
    .get();
  if (!mod) {
    void reply.code(403).send({ error: 'Нет доступа к каналу' });
    return null;
  }
  return channel;
}

/** Только владелец канала (настройки, токен, управление модераторами). */
async function requireOwnerOf(
  req: FastifyRequest,
  reply: FastifyReply,
  channelId: string,
): Promise<ChannelRow | null> {
  const user = await requireUser(req, reply);
  if (!user) return null;
  const channel = await db.select().from(channels).where(eq(channels.id, channelId)).get();
  if (!channel) {
    void reply.code(404).send({ error: 'Канал не найден' });
    return null;
  }
  if (channel.ownerUserId !== user.id) {
    void reply.code(403).send({ error: 'Только владелец канала' });
    return null;
  }
  return channel;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function toSettings(ch: ChannelRow): ChannelSettings {
  return {
    maxDurationMs: ch.maxDurationMs,
    maxAudioDurationMs: ch.maxAudioDurationMs,
    maxFileSizeBytes: ch.maxFileSizeBytes,
    volume: ch.volume,
    accepting: ch.accepting,
    showSenderName: ch.showSenderName,
    soundAlert: ch.soundAlert,
    ttsName: ch.ttsName,
    ttsMessage: ch.ttsMessage,
    overlayPosition: ch.overlayPosition,
    overlaySize: ch.overlaySize,
    overlayMargin: ch.overlayMargin,
    musicSeparate: ch.musicSeparate,
    musicPosition: ch.musicPosition,
    musicSize: ch.musicSize,
    musicMargin: ch.musicMargin,
  };
}

export function registerDashboardRoutes(app: FastifyInstance, deps: DashboardRoutesDeps): void {
  const { playback, io } = deps;

  /** Список каналов, к которым у пользователя есть доступ (свои + где он модератор). */
  app.get('/api/me/channels', async (req, reply): Promise<AccessibleChannel[] | undefined> => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const result: AccessibleChannel[] = [];
    const own = await db
      .select({ id: channels.id, login: users.login, displayName: users.displayName })
      .from(channels)
      .innerJoin(users, eq(users.id, channels.ownerUserId))
      .where(eq(channels.ownerUserId, user.id))
      .get();
    if (own) {
      result.push({ channelId: own.id, login: own.login, displayName: own.displayName, role: 'owner' });
    }
    const mod = await db
      .select({ id: channels.id, login: users.login, displayName: users.displayName })
      .from(channelModerators)
      .innerJoin(channels, eq(channels.id, channelModerators.channelId))
      .innerJoin(users, eq(users.id, channels.ownerUserId))
      .where(eq(channelModerators.userId, user.id))
      .all();
    for (const r of mod) {
      result.push({ channelId: r.id, login: r.login, displayName: r.displayName, role: 'moderator' });
    }
    return result;
  });

  /** Что сейчас на экране (для панели «сейчас играет» при загрузке дашборда). */
  app.get<{ Params: { channelId: string } }>(
    '/api/dashboard/:channelId/now',
    async (req, reply) => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
      if (!channel) return;
      const current = playback.getCurrent(channel.id);
      return { now: current ? toSummary(current) : null };
    },
  );

  /** Скип текущего показа: мгновенно гасит оверлей и двигает очередь. */
  app.post<{ Params: { channelId: string } }>(
    '/api/dashboard/:channelId/skip',
    async (req, reply) => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
      if (!channel) return;
      const skipped = await playback.skip(channel.id);
      return { skipped };
    },
  );

  app.get<{ Params: { channelId: string } }>(
    '/api/dashboard/:channelId/settings',
    async (req, reply): Promise<ChannelSettings | undefined> => {
      const channel = await requireOwnerOf(req, reply, req.params.channelId);
      if (!channel) return;
      return toSettings(channel);
    },
  );

  app.put<{ Params: { channelId: string }; Body: Partial<ChannelSettings> | null }>(
    '/api/dashboard/:channelId/settings',
    async (req, reply): Promise<ChannelSettings | undefined> => {
      const channel = await requireOwnerOf(req, reply, req.params.channelId);
      if (!channel) return;
      const b = req.body ?? {};

      const patch = {
        maxDurationMs:
          typeof b.maxDurationMs === 'number'
            ? clamp(Math.round(b.maxDurationMs), 1_000, 60_000)
            : channel.maxDurationMs,
        maxAudioDurationMs:
          typeof b.maxAudioDurationMs === 'number'
            ? clamp(Math.round(b.maxAudioDurationMs), 1_000, 600_000)
            : channel.maxAudioDurationMs,
        maxFileSizeBytes:
          typeof b.maxFileSizeBytes === 'number'
            ? clamp(Math.round(b.maxFileSizeBytes), 1024 * 1024, config.maxFileSizeBytes)
            : channel.maxFileSizeBytes,
        volume: typeof b.volume === 'number' ? clamp(Math.round(b.volume), 0, 100) : channel.volume,
        accepting: typeof b.accepting === 'boolean' ? b.accepting : channel.accepting,
        showSenderName:
          typeof b.showSenderName === 'boolean' ? b.showSenderName : channel.showSenderName,
        soundAlert: typeof b.soundAlert === 'boolean' ? b.soundAlert : channel.soundAlert,
        ttsName: typeof b.ttsName === 'boolean' ? b.ttsName : channel.ttsName,
        ttsMessage: typeof b.ttsMessage === 'boolean' ? b.ttsMessage : channel.ttsMessage,
        overlayPosition: OVERLAY_POSITIONS.includes(b.overlayPosition as never)
          ? (b.overlayPosition as (typeof OVERLAY_POSITIONS)[number])
          : channel.overlayPosition,
        overlaySize:
          typeof b.overlaySize === 'number'
            ? clamp(Math.round(b.overlaySize), 10, 100)
            : channel.overlaySize,
        overlayMargin:
          typeof b.overlayMargin === 'number'
            ? clamp(Math.round(b.overlayMargin), 0, 25)
            : channel.overlayMargin,
        musicSeparate:
          typeof b.musicSeparate === 'boolean' ? b.musicSeparate : channel.musicSeparate,
        musicPosition: OVERLAY_POSITIONS.includes(b.musicPosition as never)
          ? (b.musicPosition as (typeof OVERLAY_POSITIONS)[number])
          : channel.musicPosition,
        musicSize:
          typeof b.musicSize === 'number'
            ? clamp(Math.round(b.musicSize), 10, 100)
            : channel.musicSize,
        musicMargin:
          typeof b.musicMargin === 'number'
            ? clamp(Math.round(b.musicMargin), 0, 25)
            : channel.musicMargin,
      };
      await db.update(channels).set(patch).where(eq(channels.id, channel.id));
      return toSettings({ ...channel, ...patch });
    },
  );

  /** История: всё, что покинуло pending (метаданные; файлы эфемерны и уже удалены). */
  app.get<{ Params: { channelId: string } }>(
    '/api/dashboard/:channelId/history',
    async (req, reply): Promise<HistoryEntry[] | undefined> => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
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
    },
  );

  app.get<{ Params: { channelId: string } }>(
    '/api/dashboard/:channelId/pending',
    async (req, reply): Promise<SubmissionSummary[] | undefined> => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
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

  /** Кросс-канальная репутация набора пользователей (агрегаты по всем каналам). */
  app.post<{ Params: { channelId: string }; Body: { userIds?: unknown } | null }>(
    '/api/dashboard/:channelId/reputation',
    async (req, reply): Promise<Record<string, ReputationStats> | undefined> => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
      if (!channel) return;
      const raw = Array.isArray(req.body?.userIds) ? req.body.userIds : [];
      const ids = [
        ...new Set(raw.filter((x): x is string => typeof x === 'string' && x.length > 0)),
      ].slice(0, 200);
      if (ids.length === 0) return {};

      const result: Record<string, ReputationStats> = {};
      for (const id of ids) {
        result[id] = { accepted: 0, rejected: 0, whitelistedChannels: 0, bannedChannels: 0 };
      }

      // Принято (показано) / отклонено — по всем каналам.
      const subs = await db
        .select({ userId: submissions.senderUserId, status: submissions.status, n: count() })
        .from(submissions)
        .where(
          and(
            inArray(submissions.senderUserId, ids),
            inArray(submissions.status, ['played', 'rejected']),
          ),
        )
        .groupBy(submissions.senderUserId, submissions.status)
        .all();
      for (const r of subs) {
        const rep = r.userId ? result[r.userId] : undefined;
        if (!rep) continue;
        if (r.status === 'played') rep.accepted = r.n;
        else if (r.status === 'rejected') rep.rejected = r.n;
      }

      // На скольких каналах в белом списке.
      const wl = await db
        .select({ userId: whitelist.userId, n: count() })
        .from(whitelist)
        .where(inArray(whitelist.userId, ids))
        .groupBy(whitelist.userId)
        .all();
      for (const r of wl) {
        const rep = result[r.userId];
        if (rep) rep.whitelistedChannels = r.n;
      }

      // На скольких каналах забанен.
      const bn = await db
        .select({ userId: bans.userId, n: count() })
        .from(bans)
        .where(inArray(bans.userId, ids))
        .groupBy(bans.userId)
        .all();
      for (const r of bn) {
        const rep = result[r.userId];
        if (rep) rep.bannedChannels = r.n;
      }

      return result;
    },
  );

  app.post<{ Params: { channelId: string; id: string }; Body: { whitelist?: boolean } | null }>(
    '/api/dashboard/:channelId/submissions/:id/approve',
    async (req, reply) => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
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
      emitSubmissionStatus(io, sub.id, 'approved');
      return { ok: true, queuePosition };
    },
  );

  app.post<{ Params: { channelId: string; id: string }; Body: { ban?: boolean } | null }>(
    '/api/dashboard/:channelId/submissions/:id/reject',
    async (req, reply) => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
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
      emitSubmissionStatus(io, sub.id, 'rejected');

      if (req.body?.ban && sub.senderUserId) {
        await banUserInChannel(io, channel.id, sub.senderUserId);
      }

      return { ok: true };
    },
  );

  /** Прямой бан по userId (например, из истории — для зрителей из белого списка,
   *  чьи отправки не проходят через очередь модерации). */
  app.post<{ Params: { channelId: string; userId: string } }>(
    '/api/dashboard/:channelId/bans/:userId',
    async (req, reply) => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
      if (!channel) return;
      await banUserInChannel(io, channel.id, req.params.userId);
      return { ok: true };
    },
  );

  app.get<{ Params: { channelId: string } }>(
    '/api/dashboard/:channelId/whitelist',
    async (req, reply): Promise<ListedUser[] | undefined> => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
      if (!channel) return;
      return listUsers(whitelist, channel.id);
    },
  );

  app.delete<{ Params: { channelId: string; userId: string } }>(
    '/api/dashboard/:channelId/whitelist/:userId',
    async (req, reply) => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
      if (!channel) return;
      await db
        .delete(whitelist)
        .where(and(eq(whitelist.channelId, channel.id), eq(whitelist.userId, req.params.userId)));
      return { ok: true };
    },
  );

  app.get<{ Params: { channelId: string } }>(
    '/api/dashboard/:channelId/bans',
    async (req, reply): Promise<ListedUser[] | undefined> => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
      if (!channel) return;
      return listUsers(bans, channel.id);
    },
  );

  app.delete<{ Params: { channelId: string; userId: string } }>(
    '/api/dashboard/:channelId/bans/:userId',
    async (req, reply) => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
      if (!channel) return;
      await db
        .delete(bans)
        .where(and(eq(bans.channelId, channel.id), eq(bans.userId, req.params.userId)));
      return { ok: true };
    },
  );

  // --- Управление командой модераторов (owner-only) ---

  /** Создать одноразовый инвайт-токен (TTL 1ч). Стример сам шлёт ссылку человеку. */
  app.post<{ Params: { channelId: string } }>(
    '/api/dashboard/:channelId/moderators/invite',
    async (req, reply): Promise<{ token: string } | undefined> => {
      const channel = await requireOwnerOf(req, reply, req.params.channelId);
      if (!channel) return;
      const token = crypto.randomBytes(24).toString('hex');
      const now = new Date();
      await db.insert(modInvites).values({
        token,
        channelId: channel.id,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      });
      return { token };
    },
  );

  app.get<{ Params: { channelId: string } }>(
    '/api/dashboard/:channelId/moderators',
    async (req, reply): Promise<ListedUser[] | undefined> => {
      const channel = await requireOwnerOf(req, reply, req.params.channelId);
      if (!channel) return;
      return listUsers(channelModerators, channel.id);
    },
  );

  app.delete<{ Params: { channelId: string; userId: string } }>(
    '/api/dashboard/:channelId/moderators/:userId',
    async (req, reply) => {
      const channel = await requireOwnerOf(req, reply, req.params.channelId);
      if (!channel) return;
      await db
        .delete(channelModerators)
        .where(
          and(
            eq(channelModerators.channelId, channel.id),
            eq(channelModerators.userId, req.params.userId),
          ),
        );
      return { ok: true };
    },
  );

  // --- Приём инвайта (любой залогиненный пользователь) ---

  app.get<{ Params: { token: string } }>(
    '/api/mod-invite/:token',
    async (req, reply): Promise<ModInviteInfo | undefined> => {
      const invite = await db
        .select()
        .from(modInvites)
        .where(eq(modInvites.token, req.params.token))
        .get();
      if (!invite || invite.expiresAt.getTime() < Date.now()) {
        return reply.code(404).send({ error: 'Приглашение недействительно или истекло' });
      }
      const ch = await db
        .select({ login: users.login, displayName: users.displayName })
        .from(channels)
        .innerJoin(users, eq(users.id, channels.ownerUserId))
        .where(eq(channels.id, invite.channelId))
        .get();
      if (!ch) return reply.code(404).send({ error: 'Канал не найден' });
      return { channelLogin: ch.login, channelDisplayName: ch.displayName };
    },
  );

  app.post<{ Params: { token: string } }>(
    '/api/mod-invite/:token/accept',
    async (req, reply): Promise<{ channelId: string } | undefined> => {
      const user = await requireUser(req, reply);
      if (!user) return;
      const invite = await db
        .select()
        .from(modInvites)
        .where(eq(modInvites.token, req.params.token))
        .get();
      if (!invite || invite.expiresAt.getTime() < Date.now()) {
        return reply.code(404).send({ error: 'Приглашение недействительно или истекло' });
      }
      // Атомарный «захват»: кто удалил строку, тот и активирует инвайт (защита от гонки/двойного клика).
      const claim = await db.delete(modInvites).where(eq(modInvites.token, invite.token));
      if (claim.rowsAffected === 0) {
        return reply.code(404).send({ error: 'Приглашение уже использовано' });
      }
      const channel = await db
        .select({ ownerUserId: channels.ownerUserId })
        .from(channels)
        .where(eq(channels.id, invite.channelId))
        .get();
      // Владельцу становиться модером своего канала бессмысленно — токен уже погашен выше.
      if (channel && channel.ownerUserId !== user.id) {
        await db
          .insert(channelModerators)
          .values({ channelId: invite.channelId, userId: user.id, createdAt: new Date() })
          .onConflictDoNothing();
      }
      return { channelId: invite.channelId };
    },
  );
}

/** Забанить зрителя в канале: вытеснить из белого списка и снять с модерации его pending. */
async function banUserInChannel(
  io: RealtimeServer,
  channelId: string,
  userId: string,
): Promise<void> {
  await db
    .insert(bans)
    .values({ channelId, userId, createdAt: new Date() })
    .onConflictDoNothing();
  // Бан несовместим с автопоказом — убираем из белого списка.
  await db
    .delete(whitelist)
    .where(and(eq(whitelist.channelId, channelId), eq(whitelist.userId, userId)));
  // Снимаем с модерации все ожидающие отправки этого зрителя.
  const pending = await db
    .select()
    .from(submissions)
    .where(
      and(
        eq(submissions.channelId, channelId),
        eq(submissions.senderUserId, userId),
        eq(submissions.status, 'pending'),
      ),
    )
    .all();
  for (const o of pending) {
    await db
      .update(submissions)
      .set({ status: 'rejected', updatedAt: new Date() })
      .where(eq(submissions.id, o.id));
    io.to(dashboardRoomOf(channelId)).emit('moderation:resolved', o.id);
    emitSubmissionStatus(io, o.id, 'rejected');
  }
}

async function listUsers(
  table: typeof whitelist | typeof bans | typeof channelModerators,
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
