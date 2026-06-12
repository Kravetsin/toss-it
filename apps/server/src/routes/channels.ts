import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ChannelSelf, PublicChannelInfo } from '@tmw/shared';
import { db } from '../db/index';
import { channels, users } from '../db/schema';
import { requireUser } from '../auth';

function newOverlayToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

export function registerChannelRoutes(app: FastifyInstance): void {
  /** Завести свой канал (один на пользователя). */
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

  /** Перевыпустить токен оверлея (старый OBS-URL перестаёт работать). */
  app.post('/api/channels/rotate-token', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;

    const channel = await db
      .select()
      .from(channels)
      .where(eq(channels.ownerUserId, user.id))
      .get();
    if (!channel) return reply.code(404).send({ error: 'Канал не создан' });

    const overlayToken = newOverlayToken();
    await db.update(channels).set({ overlayToken }).where(eq(channels.id, channel.id));
    const response: ChannelSelf = { id: channel.id, overlayToken };
    return response;
  });

  /** Публичная информация о канале для страницы зрителя. */
  app.get<{ Params: { login: string } }>('/api/c/:login', async (req, reply) => {
    const row = await db
      .select({ login: users.login, displayName: users.displayName })
      .from(channels)
      .innerJoin(users, eq(users.id, channels.ownerUserId))
      .where(eq(users.login, req.params.login.toLowerCase()))
      .get();
    if (!row) return reply.code(404).send({ error: 'Канал не найден' });
    const response: PublicChannelInfo = row;
    return response;
  });
}
