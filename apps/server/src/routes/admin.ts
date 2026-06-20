import crypto from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { AdminPromoCode } from '@tmw/shared';
import { db } from '../db/index';
import { promoCodes, users } from '../db/schema';
import { requireAdmin } from '../auth';
import { isKnownGrant } from './promo';

// No ambiguous chars (0/O/1/I) so codes are easy to dictate.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomChunk(len: number): string {
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
}

function genCode(): string {
  return `FND-${randomChunk(4)}-${randomChunk(4)}`;
}

export function registerAdminRoutes(app: FastifyInstance): void {
  app.post<{ Body: { count?: number; note?: string; grant?: string } }>(
    '/api/admin/promo',
    async (req, reply): Promise<{ codes: string[] } | undefined> => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      const count = Math.min(20, Math.max(1, Math.floor(Number(req.body?.count) || 1)));
      const note = typeof req.body?.note === 'string' ? req.body.note.trim() || null : null;
      const grant = (req.body?.grant ?? 'founder').trim();
      if (!isKnownGrant(grant)) {
        return reply.code(400).send({ error: `Неизвестный тип гранта: ${grant}` });
      }
      const now = new Date();
      const codes = Array.from({ length: count }, genCode);
      await db
        .insert(promoCodes)
        .values(codes.map((code) => ({ code, grant, note, createdAt: now })));
      return { codes };
    },
  );

  app.get('/api/admin/promo', async (req, reply): Promise<AdminPromoCode[] | undefined> => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const rows = await db
      .select({
        code: promoCodes.code,
        grant: promoCodes.grant,
        note: promoCodes.note,
        createdAt: promoCodes.createdAt,
        redeemedAt: promoCodes.redeemedAt,
        redeemedByLogin: users.login,
      })
      .from(promoCodes)
      .leftJoin(users, eq(users.id, promoCodes.redeemedByUserId))
      .orderBy(desc(promoCodes.createdAt))
      .all();
    return rows.map((r) => ({
      code: r.code,
      grant: r.grant,
      note: r.note,
      createdAt: r.createdAt.getTime(),
      redeemedByLogin: r.redeemedByLogin,
      redeemedAt: r.redeemedAt ? r.redeemedAt.getTime() : null,
    }));
  });
}
