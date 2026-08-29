import { eq } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import { db } from '../../db/index';
import { users } from '../../db/schema';
import { setPlatformName } from '../../displayName';

/**
 * Keep `users.display_name` / `users.login` in step with a Twitch rename, from the names Twitch
 * already puts in every chat message.
 *
 * Why this exists: the profile is otherwise written ONLY by the OAuth callback (see upsertUser),
 * and a logged-in viewer never repeats that round trip — a session outlives a rename by months.
 * So the chat overlay, which renders the live event, showed the new nick while every DB-backed
 * surface (channel page, directory, whitelist, dashboards, /api/me) kept the old one. Chat hands
 * us the fresh pair for free, on a connection we are already holding.
 *
 * Scope is deliberately the TWITCH-NATIVE account (`users.id === 'twitch:<id>'`). Someone who
 * signed up with Google and merely linked Twitch keeps their Google profile — the same rule the
 * OAuth callback holds, that a linked login must not repaint the primary identity. Anyone who
 * wants a name their provider will not give them buys one (see ../../displayName).
 *
 * What lands where is setPlatformName's decision, not this file's: the fresh name always updates
 * `platform_name`, and only reaches `display_name` when no bought name is in the way.
 *
 * Submissions are NOT rewritten: `submissions.sender_name` is a snapshot of who sent a thing at
 * the time they sent it, and history should read the way it happened.
 */

/** One look-up per chatter per hour: a rename is not an event worth watching for. */
const CHECK_TTL_MS = 60 * 60 * 1000;
/** Cap on remembered chatters, so a big channel's tail cannot grow the map without bound. */
const MAX_TRACKED = 5000;
const checkedAt = new Map<string, number>();

/** Test seam: the throttle is process-wide state, and a suite must be able to start clean. */
export function resetNameChecks(): void {
  checkedAt.clear();
}

export async function refreshChatterName(
  twitchId: string,
  login: string,
  displayName: string,
  log: FastifyBaseLogger,
): Promise<void> {
  const now = Date.now();
  const last = checkedAt.get(twitchId);
  if (last !== undefined && now - last < CHECK_TTL_MS) return;
  if (checkedAt.size >= MAX_TRACKED) {
    for (const [id, at] of checkedAt) if (now - at >= CHECK_TTL_MS) checkedAt.delete(id);
  }
  // Stamped BEFORE the await: a chatty user must not queue a second look-up while this one runs.
  checkedAt.set(twitchId, now);

  const id = `twitch:${twitchId}`;
  const row = await db
    .select({ login: users.login, platformName: users.platformName })
    .from(users)
    .where(eq(users.id, id))
    .get();
  // No row: an unregistered chatter, or one whose Twitch is only a linked identity. Both are left
  // alone — there is nothing of theirs here that this may touch.
  if (!row) return;
  if (row.login === login && row.platformName === displayName) return;

  try {
    // Writes platform_name always, and display_name only when no bought name is in the way.
    await setPlatformName(id, displayName, login);
    log.info({ twitchId, from: row.login, to: login }, 'twitch-chat: refreshed name from chat');
  } catch (err) {
    // `users.login` is UNIQUE, and a freed login gets taken: if someone else's row already holds
    // it, the write fails as a whole. The name is what people actually read, so keep it rather
    // than leaving the whole profile stale over a slug.
    try {
      await setPlatformName(id, displayName);
      log.warn({ err, twitchId, login }, 'twitch-chat: login taken, refreshed name only');
    } catch (err2) {
      log.warn({ err: err2, twitchId }, 'twitch-chat: name refresh failed');
    }
  }
}
