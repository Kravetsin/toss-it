# Roulette — design

A dust wheel a viewer spins from chat (`!bet`) or the site.

## Phases

1. **Site wheel + chat command.** The animation lives on the site only, where it is cheap to throw
   away and redo. `!bet` works from chat and answers in text.
2. **Overlay wheel.** Only once the site animation has proven itself — a mediocre wheel shipped to
   every stream at once is expensive to walk back.
3. **The pot.** A shared round. Its data shape is settled below so we don't migrate twice.

Everything outside those three headings is phase 1.

**"No overlay" does not mean invisible on stream.** A bot answer already renders in the chat overlay
as the mint system card (`ChatSystemEvent`, the same path `!balance` uses), so a chat bet shows up on
the stream from day one — as a line, not a wheel. No new overlay work to get that.

This also removes phase 1's only piece of awkward machinery: with no wheel to spoil, the bot answers
once, immediately. No delayed second message, no spoiler sequencing, no split between spin and
verdict. That whole apparatus arrives with the animation, in phase 2.

## What it is, and what it is not

It is an **engagement loop and a reason to talk to the bot**, which is free advertising for the app
in someone else's chat. It is **not** the dust sink: at a 2.7% house edge, draining the 676k of idle
dust we hold today needs ~25M of turnover. The sink lives in the pot's rake (phase 3) and in
whatever permanent purchases the winnings go on to buy.

Keep this straight when tuning: raising the payout multipliers changes how it feels, not how much
dust the economy loses.

## The wheel

37 sectors, the single-zero layout:

| colour | sectors | payout | odds | return |
| ------ | ------- | ------ | ------ | ------ |
| red    | 18      | ×2     | 48.6% | 0.973 |
| black  | 18      | ×2     | 48.6% | 0.973 |
| green  | 1       | ×35    | 2.7%  | 0.946 |

House edge 2.7% on colours, 5.4% on green. The two bets balance because `(1 − p) = 35p` at
`p = 1/36`; changing one multiplier without the other breaks that and can make the wheel print dust.
`payout` is the total returned, stake included — a won 500 on red returns 1000, a net of +500.

## Stakes and limits

```
maxBet = min(balance, clamp(balance × 0.10, MIN_BET, 10_000))
MIN_BET = 10
```

A flat cap is wrong in both directions: 1000 is 1.2% of our largest balance (that player never feels
a bet) and nearly everything for a median one (that player loses a month in one command). A share of
balance protects the small and engages the large, and it reads well in chat — the ceiling visibly
grows with the player, which is its own reason to keep earning.

`min(balance, …)` matters because the floor can exceed a tiny balance: 94% of unclaimed piles hold
under 200 dust.

**Per-viewer cooldown 60s**, not per channel. A channel-wide floor silences the second person to
type, who then has no idea why the bot ignored them — the same reasoning already written into
`USER_COOLDOWN_MS` in `commands/index.ts`. Start at 60s; five minutes kills the loss-chase, and the
chase is the whole loop.

## Where the stake comes from

Two balances, one code path:

- **Registered** — `users.stardust`.
- **Unregistered** — `pending_dust.amount`, keyed by twitch id. `awardDust` already credits there;
  this adds the debit.

**An unregistered player must be able to lose.** Risk-free spins make "never register" the dominant
strategy and the upsell dies on day one.

There are no transactions in this repo, so a stake is taken with an atomic guarded UPDATE and the
`rowsAffected` check, the way `routes/cosmetics.ts` charges for a purchase:

```
UPDATE users SET stardust = stardust - :stake WHERE id = :id AND stardust >= :stake
```

Order of operations: **debit, then spin, then credit the payout.** A crash between them costs the
player their stake, never the house its bankroll — and there is no bankroll anyway, since we mint
and burn dust ourselves.

Winnings are a payout, not earnings: they move `stardust` only, never `dustEarned`, the same rule
the welcome bonus follows (see `creditDust`). Otherwise the wealth cosmetics start measuring luck.

## Fairness

Players will accuse the wheel of being rigged, loudly, and a screenshot travels further than any
explanation. Committing to the result in advance is cheap now and **impossible to retrofit** — past
spins can never be proven fair — so it goes in with v1.

- A channel holds a secret `seed`; we publish `sha256(seed)` before it is ever used.
- `slot = HMAC_SHA256(seed, "<channelId>:<nonce>") mod 37`, `nonce` incrementing per spin.
- On rotation (per stream, or every N spins) the old seed is revealed, and anyone can recompute
  every spin it produced.

`!fair` answers with the current hash and the last revealed seed.

## Data

Two new tables and one channel column. Naming and comment style follow `db/schema.ts`.

```
roulette_seeds
  channel_id    text     PK part
  seed_hash     text     published before use
  seed          text     null until revealed
  nonce         integer  spins produced so far
  created_at    integer
  revealed_at   integer  null while live
  PK (channel_id, seed_hash)

roulette_spins
  id            integer  PK autoincrement
  channel_id    text
  platform      text     'twitch'
  platform_user_id text  the key that works before an account exists
  user_id       text     null when unregistered
  stake         integer
  bet_color     text     'red' | 'black' | 'green'
  slot          integer  0..36
  payout        integer  0 on a loss, stake × multiplier on a win
  seed_hash     text     which seed produced it
  nonce         integer
  created_at    integer
  index (channel_id, created_at)
```

`roulette_spins` is the audit trail for disputes, the verification record, and the source for any
future stats. Volume is real — a busy channel can write thousands per stream — so the existing
`cleanup.ts` sweep prunes rows older than 30 days, which outlives both the dispute window and a seed
rotation.

```
channels.chat_roulette_command  boolean not null default false
```

Off by default, like `chat_play_command` and `chat_tts_command`. It puts a betting game in someone
else's chat: that is a separate yes from /mod'ding the bot. Formally we are outside Twitch's
gambling rules — nothing converts to money — but the streamer still decides.

## The command

`!bet <amount> <colour>`, aliases `!ставка`, `!roll`.

Colour accepts `red|black|green`, `r|b|g`, and the localized words in ru/uk. Amount accepts `all`
(clamped to `maxBet`, not to the balance — the cap is a protection, not a suggestion).

Bare `!bet` answers with balance, current max and the odds. That is also the upsell surface: for an
unregistered caller it names what registering adds.

Answers ride `ChatSystemLine`, rendered by `toChatText` as `@name · text · dust ✦ — hint`. In phase 1
there is one answer per bet, sent as soon as the spin resolves:

| case | line |
| ---- | ---- |
| win | `@nick · зелёное ×35 · +17 325 ✦` |
| loss | `@nick · чёрное · −500 ✦` |
| over the cap | `@nick · твой максимум сейчас 8 165 ✦` |
| no balance, unregistered | `@nick · у тебя 340 ✦ — на toss-it.org тебя ждёт ещё 1000` |

That last line is deliberate. "Bet more — register for 1000" is how a casino asks for a deposit;
the same fact stated as a balance is a gift, and it is equally true.

## The site wheel

The only animation in phase 1, and the reason phase 2 waits: this is where the design gets to be
wrong cheaply. It is seen by the person who bet, on a page we can redeploy without touching a single
stream.

- The result is already decided server-side when the page starts spinning; the animation reads the
  slot out of the response and lands on it. Same rule as everywhere else — the picture never decides
  anything.
- It must survive being watched a hundred times in a row: no long wind-up, no unskippable
  celebration. Somewhere near 3 seconds, and a repeat spin cancels the previous one rather than
  queueing behind it.
- Cheap to render. The catalog's effects budget applies here too — a wheel is a rotating element,
  which is about as cheap as motion gets, so there is no excuse for anything heavier.

Ship it, watch people use it, and only then decide what the overlay version should look like.

## Phase 2 — the overlay wheel

Two events, because the wheel can scroll away before it lands:

1. **`spin`** — a wheel the size of an emote card, on the existing `chat:system` path
   (`ChatSystemEvent`, the mint card that already says "bot answer"). `ChatSystemLine` gains an
   optional `spin?: { betColor, slot, payout }`.
2. **`verdict`** — a normal system line, emitted after the animation, so the result survives being
   pushed up the chat.

Rules:

- **The result is decided server-side before the animation starts.** `rAF` is paused on a hidden
  page — an OBS source on an inactive scene will not spin at all — so the animation can never be the
  source of truth. This is the same class of bug as the overlay's init-timing gotcha.
- The chat copy of the verdict is posted **after** the animation delay (~4s), or the bot spoils its
  own wheel. The overlay is only visible to the streamer, so the result travelling inside the `spin`
  payload leaks nothing.
- The verdict must read standalone — name, stake, colour, result — because the delivery layer drops
  the chat copy under Twitch's send limit and answers on the overlay alone.
- Big media-overlay wheel: later still, and for the shared pot round, not for one viewer's 200.

## Dashboard

One toggle next to the other command switches, with the odds and the bet cap stated plainly, plus
the current fairness hash.

## Phase 3 — the pot

`!join <amount>` inside a 60s window; chance proportional to share; winner takes the pot minus rake.

- **Bet cap 1000 per player.** This is what makes the whale scenario impossible: with the cap the
  spread inside a pot is at most 10:1, which reads as "went in big" rather than "bought the round".
  A proportional pot is already fair — everyone's expected value is identical regardless of stake —
  so the cap is about the small players' experience, not about fairness.
- **The rake is the real sink**, and the only honest dial for it: deterministic (a 10k pot at 5%
  burns 500 every round, no variance) and free to set, because a pot has no real-world reference
  telling players what it "should" pay.
- Two chat messages per round regardless of participant count, which is why the pot scales in chat
  where per-bet answers would not.
- Needs a crowd. In a quiet channel it starves, which is why the solo wheel ships first.

## Open

- Rake percentage for the pot.
- Seed rotation trigger: per stream, or every N spins.
- Whether the site gets the same wheel or a richer animation.
