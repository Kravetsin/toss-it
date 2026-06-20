import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index';
import { channelIntegrations } from '../db/schema';
import { decryptSecret } from '../crypto';
import { roomOf, type RealtimeServer } from '../playback';

/** Постоянное по времени сравнение строк (защита от тайминг-атак на ключ). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * Входящие колбеки донат-сервисов (Donatello «Колбеки»): провайдер сам POST-ит каждый донат
 * на наш URL. Деньги через нас не идут — превращаем событие во всплеск на оверлее. Публичный
 * (server-to-server), поэтому подлинность проверяем по секрету в заголовке X-Key.
 */
export function registerDonationRoutes(app: FastifyInstance, io: RealtimeServer): void {
  app.post<{ Params: { channelId: string }; Body: Record<string, unknown> | null }>(
    '/api/donations/donatello/:channelId',
    async (req, reply) => {
      const { channelId } = req.params;
      const row = await db
        .select()
        .from(channelIntegrations)
        .where(
          and(
            eq(channelIntegrations.channelId, channelId),
            eq(channelIntegrations.provider, 'donatello'),
          ),
        )
        .get();
      if (!row) return reply.code(404).send({ error: 'integration not found' });

      let expectedKey: string;
      try {
        expectedKey = decryptSecret(row.encToken);
      } catch {
        return reply.code(500).send({ error: 'integration misconfigured' });
      }
      const key = req.headers['x-key'];
      if (typeof key !== 'string' || !safeEqual(key, expectedKey)) {
        return reply.code(401).send({ error: 'bad key' });
      }

      const b = req.body ?? {};
      // Donatello шлёт amount строкой ("100"); приводим к числу для масштаба эффекта.
      const amount = Number(b.amount);
      io.to(roomOf(channelId)).emit('donation:fx', {
        provider: 'donatello',
        donorName: typeof b.clientName === 'string' ? b.clientName : null,
        amount: Number.isFinite(amount) ? amount : 0,
        currency: typeof b.currency === 'string' ? b.currency : '',
        message: typeof b.message === 'string' ? b.message : null,
      });
      return { ok: true };
    },
  );
}
