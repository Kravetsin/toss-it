import { and, desc, eq, gte, or, sql } from 'drizzle-orm';
import { GIFT, type GiftTarget, foldForSearch } from '@tmw/shared';
import { db } from './db/index';
import { channelActivity, dustGifts, linkedIdentities, pendingDust, users } from './db/schema';

/**
 * Giving stardust away, shared by the `!gift` chat command and the site.
 *
 * Two rules carry the whole thing:
 *
 *  - A gift is a TRANSFER, not contribution: it moves `stardust` and never `dustEarned`. Otherwise
 *    the wealth cosmetics stop measuring what someone did for a channel and start measuring who
 *    they know. Same reasoning as the welcome bonus and a roulette payout, and the reason this
 *    cannot simply call `awardDust` — that one credits both.
 *  - The recipient does not need an account. An unknown twitch id accumulates in `pending_dust`
 *    exactly as chat earnings do, so gifting a stranger is also an invitation: the bot can tell
 *    them something is waiting.
 *
 * Consequence worth naming: dust becomes transferable, so the old ceiling — "the most anyone can
 * hold is the catalog, once" — no longer holds. That is fine while every sink is a permanent,
 * non-transferable unlock. Add a CONSUMABLE sink later and holds and caps come back with it.
 */

export interface GiftInput {
  fromUserId: string;
  /**
   * Who gets it, named by whichever the door can offer. Chat has a typed Twitch login and must
   * resolve it; the site has an account the giver PICKED from search, which is why the site needs
   * no resolution at all and cannot miss by a character.
   */
  to: { login: string } | { userId: string };
  amount: number;
  /** Where the command was typed. A name is resolved against this channel's chatters first — the
   *  person meant is nearly always the person in the room, and display names are not unique. */
  channelId?: string | null;
}

export type GiftOutcome =
  /** The GIVER has no Tossit account, so there is no balance to give from. Chat only: on the site
   *  a session is required before anything is rendered. */
  | { kind: 'noAccount' }
  | { kind: 'tooSmall'; min: number }
  | { kind: 'noFunds'; balance: number }
  | { kind: 'unknown' }
  /** Giving to yourself is not a transaction, and letting it through only invites confusion. */
  | { kind: 'self' }
  /**
   * `toName` is what to ADDRESS the recipient by, and it is deliberately not the account's display
   * name: that one can be a name bought on Tossit, which means nothing on Twitch and would not
   * highlight for anyone. Only names Twitch itself gave us are safe to ping — the display name it
   * sent with a chat message, else the login.
   */
  | { kind: 'done'; amount: number; toName: string; balance: number };

/** Someone on Twitch, with the name their own chat would show for them. */
interface TwitchTarget {
  id: string;
  login: string;
  name: string;
}

/**
 * A twitch id for a name someone typed, or null.
 *
 * The name may be a LOGIN or a DISPLAY NAME, and it usually is the latter: Twitch's own chat
 * autocomplete inserts the display name, so `!gift 100 @长尺丹丷乇丁丂` is what actually gets sent.
 * Those two are unrelated strings for anyone with an international name — the login stays ASCII —
 * and Helix's `users?login=` only accepts the login, so a login-only chain misses every one of
 * them. We keep display names in channel_activity, which is exactly what that autocomplete inserted.
 *
 * Order matters. A login is unique and a display name is not, so logins win; and within either, a
 * sighting in THIS channel wins over one anywhere else, because the person meant is nearly always
 * the person in the room. Ties break on the newest sighting: one name can belong to several twitch
 * ids over time — someone renames, and Twitch hands a freed login to somebody else.
 *
 * `typed` keeps its capitals on purpose. SQLite's lower() is ASCII-only, so a Cyrillic display name
 * never folds and "Звёздный" would match nothing — while an exact match on what was typed always
 * finds it, autocomplete having inserted the name verbatim. The folded form stays for ASCII.
 */
async function localTwitchId(
  typed: string,
  preferChannelId?: string | null,
): Promise<TwitchTarget | null> {
  const name = typed.toLowerCase();
  // Twitch logins are lowercase ASCII, so only the display name needs both spellings.
  const byLogin = eq(channelActivity.login, name);
  const byDisplay = or(
    eq(channelActivity.displayName, typed),
    eq(sql`lower(${channelActivity.displayName})`, name),
  );

  for (const match of [byLogin, byDisplay]) {
    for (const scope of preferChannelId ? [preferChannelId, null] : [null]) {
      const row = await db
        .select({
          id: channelActivity.platformUserId,
          login: channelActivity.login,
          name: channelActivity.displayName,
        })
        .from(channelActivity)
        .where(
          and(
            eq(channelActivity.platform, 'twitch'),
            match,
            scope ? eq(channelActivity.channelId, scope) : undefined,
          ),
        )
        .orderBy(desc(channelActivity.updatedAt))
        .get();
      if (row) return { id: row.id, login: row.login, name: row.name || row.login };
    }
  }

  // Last local resort: a Tossit account with a Twitch identity, for a display name we have simply
  // never seen in a chat (Helix, next in line, cannot look one up).
  //
  // Only rows whose PRIMARY provider is Twitch, and only their Twitch-given names — the login and
  // platform_name. The other two names would each let a string that exists only on Tossit collect
  // dust meant for the Twitch user of that name: display_name can be one bought here for dust, and
  // a Google-primary login is an email local part with no relation to Twitch at all.
  const acct = await db
    .select({ id: linkedIdentities.providerId, login: users.login, name: users.platformName })
    .from(users)
    .innerJoin(
      linkedIdentities,
      and(eq(linkedIdentities.userId, users.id), eq(linkedIdentities.provider, 'twitch')),
    )
    .where(
      and(
        // The row's own identity IS this twitch account, which is what makes its login and
        // platform_name Twitch's names rather than some other provider's.
        eq(users.id, sql`'twitch:' || ${linkedIdentities.providerId}`),
        or(
          eq(users.login, name),
          eq(users.platformName, typed),
          eq(sql`lower(${users.platformName})`, name),
        ),
      ),
    )
    .get();
  return acct ? { id: acct.id, login: acct.login, name: acct.name || acct.login } : null;
}

/** Enough to pick someone out, few enough that the list stays a list. */
const SEARCH_LIMIT = 6;
/** Below this a query matches half the site and means nothing. */
const SEARCH_MIN = 2;

/**
 * Accounts whose name STARTS WITH what the giver typed, for the site's picker.
 *
 * Matched on the login and the PROVIDER's name — never on a bought one, which is the same pair
 * isImpersonation compares and for the same reason: those two are who an account is, and a custom
 * name is nobody's identity. It is not even unique (two people may both be Дракон), and an
 * unstable, unowned string is the wrong thing to route money by. It stays the label of every row
 * because it is what the rest of the site shows; the provider's name is rendered beside it, where
 * it doubles as the reason the row matched at all.
 *
 * A scan and a fold in JS rather than a LIKE, because SQLite's lower() folds ASCII only: every
 * Cyrillic name was findable by nothing but its exact capitals, which for this audience is most of
 * the interesting ones. The table is a few hundred rows and this is debounced; when that stops
 * being true the fold becomes a stored column, exactly as isImpersonation's scan already says.
 */
export async function findGiftTargets(query: string, excludeUserId: string): Promise<GiftTarget[]> {
  const q = foldForSearch(query.trim());
  if (q.length < SEARCH_MIN) return [];
  const rows = await db
    .select({
      userId: users.id,
      login: users.login,
      displayName: users.displayName,
      platformName: users.platformName,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .all();

  const hits: { rank: number; row: (typeof rows)[number] }[] = [];
  for (const row of rows) {
    // Never offer the giver themselves: the refusal would come after they had picked.
    if (row.userId === excludeUserId) continue;
    // Rank by WHICH name matched: the handle is unique, so an exact-ish one goes first.
    const rank = [row.login, row.platformName].findIndex(
      (f) => f && foldForSearch(f).startsWith(q),
    );
    if (rank >= 0) hits.push({ rank, row });
  }
  hits.sort((a, b) => a.rank - b.rank || a.row.displayName.length - b.row.displayName.length);

  return hits.slice(0, SEARCH_LIMIT).map(({ row }) => ({
    userId: row.userId,
    login: row.login,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    // Only when it reveals something — the same rule LeaderboardEntry.platformName follows.
    platformName: row.platformName !== row.displayName ? row.platformName : null,
  }));
}

export async function giftDust(
  input: GiftInput,
  /** Last resort for a login nobody here has seen — the chat module passes a Helix lookup. */
  resolveRemote?: (login: string) => Promise<TwitchTarget | null>,
): Promise<GiftOutcome> {
  if (!Number.isInteger(input.amount) || input.amount < GIFT.min) {
    return { kind: 'tooSmall', min: GIFT.min };
  }

  // An account chosen from search needs no lookup and has no platform id to record; a typed login
  // has to be turned into one, and may belong to somebody with no account at all.
  let target: TwitchTarget | null = null;
  let toUserId: string | null;
  let toName: string;
  if ('userId' in input.to) {
    const acct = await db
      .select({ id: users.id, login: users.login })
      .from(users)
      .where(eq(users.id, input.to.userId))
      .get();
    if (!acct) return { kind: 'unknown' };
    toUserId = acct.id;
    toName = acct.login;
  } else {
    const typed = input.to.login.trim().replace(/^@/, '');
    if (!typed) return { kind: 'unknown' };
    // Helix is asked with the folded name: its users?login= takes a login, which is always ASCII.
    target =
      (await localTwitchId(typed, input.channelId)) ??
      (await resolveRemote?.(typed.toLowerCase())) ??
      null;
    if (!target) return { kind: 'unknown' };
    toUserId = await accountFor(target.id);
    toName = target.name;
  }
  if (toUserId === input.fromUserId) return { kind: 'self' };

  // Charge FIRST with an atomic balance guard, the way every other spend here does — there are no
  // transactions in this repo, so a gift that fails to land must fail before the money moves.
  const charged = await db
    .update(users)
    .set({ stardust: sql`${users.stardust} - ${input.amount}` })
    .where(and(eq(users.id, input.fromUserId), gte(users.stardust, input.amount)));
  if (charged.rowsAffected === 0) {
    const row = await db
      .select({ dust: users.stardust })
      .from(users)
      .where(eq(users.id, input.fromUserId))
      .get();
    return { kind: 'noFunds', balance: row?.dust ?? 0 };
  }

  if (toUserId) {
    await db
      .update(users)
      .set({ stardust: sql`${users.stardust} + ${input.amount}` })
      .where(eq(users.id, toUserId));
  } else if (target) {
    await db
      .insert(pendingDust)
      .values({
        platform: 'twitch',
        platformUserId: target.id,
        amount: input.amount,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [pendingDust.platform, pendingDust.platformUserId],
        set: { amount: sql`${pendingDust.amount} + ${input.amount}`, updatedAt: new Date() },
      });
  }

  await db.insert(dustGifts).values({
    fromUserId: input.fromUserId,
    toPlatform: target ? 'twitch' : null,
    toPlatformUserId: target?.id ?? null,
    toUserId,
    amount: input.amount,
    createdAt: new Date(),
  });

  const after = await db
    .select({ dust: users.stardust })
    .from(users)
    .where(eq(users.id, input.fromUserId))
    .get();
  return { kind: 'done', amount: input.amount, toName, balance: after?.dust ?? 0 };
}

async function accountFor(twitchId: string): Promise<string | null> {
  const row = await db
    .select({ userId: linkedIdentities.userId })
    .from(linkedIdentities)
    .where(and(eq(linkedIdentities.provider, 'twitch'), eq(linkedIdentities.providerId, twitchId)))
    .get();
  return row?.userId ?? null;
}
