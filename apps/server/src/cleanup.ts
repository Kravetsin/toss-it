import { and, inArray, isNotNull, isNull, lt, eq, notInArray } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import { db } from './db/index';
import { submissions } from './db/schema';
import { config } from './config';
import type { Storage } from './storage';

/**
 * Ephemeral storage: file lives from upload until shown. Sweep deletes files in
 * terminal statuses (with slack for overlay reconnect) and never-played expired ones.
 *
 * `liveChannelIds` returns the channels currently in the air (an overlay is connected). Their queues
 * are exempt from the TTL sweep — see sweep().
 */
export function startCleanup(
  storage: Storage,
  log: FastifyBaseLogger,
  liveChannelIds: () => string[],
): NodeJS.Timeout {
  const timer = setInterval(() => {
    sweep(storage, log, liveChannelIds()).catch((err) => log.error(err, 'cleanup sweep failed'));
  }, config.cleanup.intervalMs);
  timer.unref();
  return timer;
}

async function sweep(
  storage: Storage,
  log: FastifyBaseLogger,
  liveChannelIds: string[],
): Promise<void> {
  const now = Date.now();

  // Not shown within queuedTtl -> expire. The TTL means "the stream ended without showing this", so
  // a channel that is ON AIR right now is exempt: its queue is still being worked through, and the
  // clock runs from created_at, which would otherwise kill a viewer's submission mid-broadcast just
  // because they sent it hours before the stream started.
  //
  // This is the one sweep that can empty a queue — the queue is nothing but the set of `approved`
  // rows — and until the process restarts the in-memory copy keeps showing the items, so the loss
  // only surfaces on the next deploy. Log which rows went, or the next investigation starts from
  // "the queue vanished for no reason".
  const expiryWhere = and(
    eq(submissions.status, 'approved'),
    lt(submissions.createdAt, new Date(now - config.cleanup.queuedTtlMs)),
    ...(liveChannelIds.length ? [notInArray(submissions.channelId, liveChannelIds)] : []),
  );
  const doomed = await db
    .select({ id: submissions.id, channelId: submissions.channelId })
    .from(submissions)
    .where(expiryWhere)
    .all();
  if (doomed.length > 0) {
    await db
      .update(submissions)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(expiryWhere);
    log.warn(
      {
        n: doomed.length,
        ttlHours: config.cleanup.queuedTtlMs / 3_600_000,
        ids: doomed.map((d) => d.id),
        channels: [...new Set(doomed.map((d) => d.channelId))],
      },
      'cleanup: queued submissions expired past TTL — these left their channel queue',
    );
  }

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
