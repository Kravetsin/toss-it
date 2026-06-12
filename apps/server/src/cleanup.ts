import { and, inArray, isNotNull, lt, eq } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import { db } from './db/index';
import { submissions } from './db/schema';
import { config } from './config';
import type { Storage } from './storage';

/**
 * Эфемерное хранение: файл живёт от загрузки до показа.
 * Зачистка удаляет файлы терминальных статусов (с запасом на реконнект
 * оверлея) и протухшие отправки, которые так и не проиграли.
 */
export function startCleanup(storage: Storage, log: FastifyBaseLogger): NodeJS.Timeout {
  const timer = setInterval(() => {
    sweep(storage, log).catch((err) => log.error(err, 'cleanup sweep failed'));
  }, config.cleanup.intervalMs);
  timer.unref();
  return timer;
}

async function sweep(storage: Storage, log: FastifyBaseLogger): Promise<void> {
  const now = Date.now();

  // 1. Не показанное за queuedTtl — протухает (стрим закончился и т.п.).
  await db
    .update(submissions)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(
      and(
        eq(submissions.status, 'approved'),
        lt(submissions.createdAt, new Date(now - config.cleanup.queuedTtlMs)),
      ),
    );

  // 2. Терминальные статусы старше retention — удаляем файл, запись остаётся как история.
  const stale = await db
    .select()
    .from(submissions)
    .where(
      and(
        inArray(submissions.status, ['played', 'rejected', 'expired']),
        isNotNull(submissions.filePath),
        lt(submissions.updatedAt, new Date(now - config.cleanup.terminalRetentionMs)),
      ),
    )
    .all();

  for (const row of stale) {
    try {
      await storage.delete(row.filePath!);
      await db
        .update(submissions)
        .set({ filePath: null, updatedAt: new Date() })
        .where(eq(submissions.id, row.id));
      log.info({ submissionId: row.id }, 'ephemeral media deleted');
    } catch (err) {
      log.error({ err, submissionId: row.id }, 'failed to delete media file');
    }
  }
}
