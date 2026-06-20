import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index';
import { channelIntegrations } from '../db/schema';
import { decryptSecret } from '../crypto';
import { roomOf, type RealtimeServer } from '../playback';

/** Constant-time string compare; guards key against timing attacks. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * Donatello callback endpoint: provider POSTs each donation here. No money flows through us;
 * we turn the event into an overlay FX. Public server-to-server, so auth via X-Key secret.
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
      // Donatello sends amount as a string ("100"); coerce to number for FX scaling.
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
