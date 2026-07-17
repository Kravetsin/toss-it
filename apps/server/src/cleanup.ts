import { and, inArray, isNotNull, isNull, lt, eq } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import { db } from './db/index';
import { submissions } from './db/schema';
import { config } from './config';
import type { Storage } from './storage';

/**
 * Ephemeral storage: file lives from upload until shown. Sweep deletes files in
 * terminal statuses (with slack for overlay reconnect) and never-played expired ones.
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

  // Not shown within queuedTtl -> expire (e.g. stream ended).
  await db
    .update(submissions)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(
      and(
        eq(submissions.status, 'approved'),
        lt(submissions.createdAt, new Date(now - config.cleanup.queuedTtlMs)),
      ),
    );

  // Terminal statuses past retention: delete file, keep row as history.
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

  // The owner's own sends are not history, so once they can no longer play the row goes too.
  // isNull(filePath) is the guard, not an optimization: if the delete above failed, dropping the
  // row here would strand its file with nothing left pointing at it.
  const { rowsAffected } = await db
    .delete(submissions)
    .where(
      and(
        eq(submissions.isSelfSend, true),
        isNull(submissions.filePath),
        inArray(submissions.status, ['played', 'rejected', 'expired']),
        lt(submissions.updatedAt, new Date(now - config.cleanup.terminalRetentionMs)),
      ),
    );
  if (rowsAffected) log.info({ n: rowsAffected }, 'self-send submissions purged');
}
