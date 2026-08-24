# YouTube requests by title (with a daily search budget)

Order a track by typing its name instead of pasting a link. Ships for the two doors that have no
UI — the channel-points reward and `!play` — and falls back to "paste a link" once the day's search
budget is spent.

## Why a budget

`search.list` costs 100 quota units; the project's default is 10 000/day, so ~100 searches a day for
the whole service. The other Data API calls we make are 1 unit each (`playlistItems` for background
music, `videos` for durations), so an 80-search cap leaves ~2 000 units of headroom. The cap is an
env var, not a constant: it exists until (and if) Google grants a quota extension.

## The choke point

`resolvePlayableYoutube(text)` in `media/submit.ts` is already the single resolver behind both the
redemption handler (`modules/channel-points/index.ts`) and `!play`
(`modules/twitch-chat/index.ts`). Everything downstream — music-vs-video by category, the
auto-approve gates, dust owed on air, the points refund — stays untouched. The whole feature is a
second branch inside that one function.

Its `ResolvedYoutube | null` return has to grow, though: callers must tell "dead link" from "found
nothing" from "search is closed for today", because those are three different messages.

```ts
type ResolveOutcome =
  | { kind: 'ok'; resolved: ResolvedYoutube }
  | { kind: 'unplayable' }        // a link was there, it is private/deleted/not embeddable
  | { kind: 'notFound' }          // searched, nothing playable came back
  | { kind: 'searchClosed' };     // budget spent / no API key -> ask for a link
```

## Resolution order

1. `parseYoutube(text)` hits -> today's behaviour, no search, no budget spent.
2. No link -> sanity-gate the query (2..100 chars, has letters, no leftover `http`). Rejected
   queries cost nothing.
3. Cache lookup by normalized query (lowercase, collapsed whitespace). A hit costs nothing.
4. Budget check (global + per-channel). Spent -> `searchClosed`.
5. `search.list` with `type=video`, `videoEmbeddable=true`, `videoSyndicated=true`,
   `safeSearch=moderate`, `maxResults=5`. `videoEmbeddable` is why we can trust the first hit
   without an extra oEmbed round-trip.
6. First result -> synthesize a `ParsedYoutube` (`videoId`, `startSeconds: 0`, no caption) and reuse
   `validateYoutube` for the title. Cache the mapping.

## Budget accounting

One row in the existing `app_meta` key/value table (no migration), key `yt_search_usage`:

```json
{ "day": "2026-08-22", "global": 12, "byChannel": { "<channelId>": 3 }, "blockedDay": null }
```

- **Day boundary is midnight Pacific**, because that is when Google resets. Derive the key with
  `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' })` so DST is not our problem.
  Convenient side effect: the reset lands ~10:00 Kyiv, so an evening stream never straddles it.
- **Persisted, not in-memory** — a deploy must not hand us a fresh 70.
- **Circuit breaker**: a real `403 quotaExceeded` from Google sets `blockedDay` to the current PT
  day and closes search until rollover. Our own counter can drift; their answer cannot.
- **Per-channel sub-cap** so one busy channel cannot eat the global budget by 19:00 and leave every
  other channel with "paste a link" all evening.
- **Paid reserve**: the last 25 of the 80 are for channel-points redemptions only. With a
  per-channel cap of 40 the sub-cap alone is thin cover — two busy channels reach the global ceiling
  on their own — so a free `!play` flood must not close the door on viewers who spent points.

## Cache

In-memory `Map`, same shape as `playlistCache` in `media/youtube.ts`:

- key: normalized query; value: `{ videoId, title, at }`; TTL 24h. No size cap: an entry only exists
  because a search was paid for, so the daily budget already bounds the map at ~80 entries. Add one
  if an unbudgeted provider (InnerTube) ever lands.
- **Negative results cached too** (1h). Without this, one viewer retrying the same nonsense query
  burns 100 units per attempt.
- Cache hits never touch the budget. In practice this is what makes 80 searches feel like 200+
  requests: the same track gets asked for repeatedly in one evening.

## Work items

**New — `apps/server/src/media/youtubeSearch.ts`**
Raw `search.list` call, normalization, cache, budget read/write, circuit breaker. Exports
`searchPlayable(query, channelId, opts): Promise<{ videoId, title } | 'closed' | 'none'>`.

**`media/submit.ts`**
`resolvePlayableYoutube` returns `ResolveOutcome`; takes `channelId` (budget is per-channel) and a
flag for whether this door may search. Update the two call sites and `submit.test.ts`.

**`modules/channel-points/index.ts`**
Map `notFound` / `searchClosed` / `unplayable` to the existing refund path, with distinct log lines.
Update `YOUTUBE_TEXT` prompts (ru/uk/en): the reward now accepts a name, and must warn that a link
is the fallback — a redemption has no way to talk back to the viewer beyond the refund.

**`modules/channel-points/helix.ts` + reward sync**
There is no `updateReward` today, only create/delete. Existing connected channels would keep the old
"paste a link" prompt forever. Add `PATCH /channel_points/custom_rewards?id=` and a one-time prompt
sync for already-created rewards on startup.

**`modules/twitch-chat/`**
`playFromChat` passes the new outcome through; `PlayResult` gains `notFound` and `searchClosed`.
Strings in all three locales: reword `playUsage` ("link or name"), add `playNoResult` and
`playSearchClosed`. Keep them short — they land in someone else's chat.

**Tests (`apps/server/test/`)**
PT day rollover; budget decrement and exhaustion; per-channel cap; cache hit spends nothing;
negative cache; garbage query never reaches the API; `403 quotaExceeded` closes search for the day;
a link still resolves exactly as before. `fetch` stubbed throughout.

## Deliberately out of scope

- **Web.** `ComposeForm` turns plain text into a `text` submission, so title search there needs an
  explicit search UI with a result picker — the viewer can see the screen, so "first hit, hope it's
  right" is the wrong trade. Separate pass, and it will want its own budget slice.
- **InnerTube fallback.** Only worth wiring after a probe from the production VPS shows what a
  datacenter IP actually gets back. Keep `searchPlayable` provider-shaped so it can slot in later.
- **A per-channel opt-in toggle.** The streamer already opted into YouTube requests; the new input
  format does not change what the auto-approve gates or the duration cap allow.

## Settings

`YOUTUBE_API_KEY` is set in production, so the feature is live on deploy. Every limit is an env var,
tunable without a deploy, and meant to be raised the moment Google grants a quota extension:

- `YOUTUBE_SEARCH_DAILY_MAX` — 80
- `YOUTUBE_SEARCH_CHANNEL_DAILY_MAX` — 40
- `YOUTUBE_SEARCH_PAID_RESERVE` — 25 (of the 80, channel-points redemptions only)
