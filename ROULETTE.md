# Roulette — design

A dust wheel a viewer spins from chat (`!bet`) or the site.

## Phases

1. **Site wheel + chat command.** The animation lives on the site only, where it is cheap to throw
   away and redo. `!bet` works from chat and answers in text.
2. **Overlay block.** Not the site's wheel — see below. Done.
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

| colour | sectors | payout | odds  | return |
| ------ | ------- | ------ | ----- | ------ |
| red    | 18      | ×2     | 48.6% | 0.973  |
| black  | 18      | ×2     | 48.6% | 0.973  |
| green  | 1       | ×35    | 2.7%  | 0.946  |

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

**No cooldown at all**, on either door. One lived here to protect the bot's Twitch send budget and
produced exactly the traffic it was meant to prevent: a refusal costs a message just as an answer
does, so throttling only turned bets into "too fast, wait 40s" — and a player who cannot see their
own timer types again to find out. The send budget is defended where it actually lives, in
`SEND_PER_CHANNEL` and `SEND_GLOBAL`, which drop the chat copy and still answer on the overlay.

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

## Why there is no "provably fair"

There was, briefly: a seed chain, a published hash, an HMAC per spin and a `!fair` command. It is
gone, and should stay gone.

It is a crypto-casino convention, and it answers a question we do not have. Those schemes exist
because real money is at stake and the operator is not trusted. Here the currency is earned by
watching streams and spends only on cosmetics — nothing converts to money, so nothing regulates it
and there is no loss to be made whole.

It also bought no actual trust. Verifying one spin meant saving a hash, saving your nonce, waiting
for a rotation and computing an HMAC yourself. Nobody was ever going to do that, so what shipped was
the appearance of proof plus a line of noise in chat: `seed hash 13f614edb0fc7bc7…` says nothing to
the person reading it.

What remains is `roulette_spins`, as a plain support record — enough to answer "where did my dust
go", which is the question people actually ask. The slot comes from `crypto.randomInt`.

## Data

One table and one channel column. Naming and comment style follow `db/schema.ts`.

```
roulette_spins
  id            integer  PK autoincrement
  channel_id    text     null = placed on the site, which belongs to no channel
  platform      text     'twitch'
  platform_user_id text  the key that works before an account exists
  user_id       text     null when unregistered
  stake         integer
  bet_color     text     'red' | 'black' | 'green'
  slot          integer  0..36
  payout        integer  0 on a loss, stake × multiplier on a win
  created_at    integer
  index (channel_id, created_at)
```

`roulette_spins` is the support record and the source for any future stats. Volume is real — a busy
channel can write thousands per stream — so the existing `cleanup.ts` sweep prunes rows older than
30 days, which outlives any question anyone is still asking.

Migration 0071 shipped the seed chain and reached production; **0072 drops it**. 0071 is not edited:
it is applied, and rewriting an applied migration is how you get `table already exists` on the next
boot.

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

| case                     | line                                                       |
| ------------------------ | ---------------------------------------------------------- |
| win                      | `@nick · зелёное ×35 · +17 325 ✦`                          |
| loss                     | `@nick · чёрное · −500 ✦`                                  |
| over the cap             | `@nick · твой максимум сейчас 8 165 ✦`                     |
| no balance, unregistered | `@nick · у тебя 340 ✦ — на toss-it.org тебя ждёт ещё 1000` |

That last line is deliberate. "Bet more — register for 1000" is how a casino asks for a deposit;
the same fact stated as a balance is a gift, and it is equally true.

## The site wheel

The only animation in phase 1, and the reason phase 2 waits: this is where the design gets to be
wrong cheaply — one page, redeployed without touching a single stream.

The rim of a very large disc, under glass, drawn on canvas. Canvas because wedges want to be wedges:
as rotated DOM rectangles they leave gaps at the rim, and a conic-gradient cannot carry the numbers.
The pockets are an INFINITE strip rather than a closed ring — pocket `k` sits at `k · STEP` with face
`WHEEL_ORDER[k mod 37]`. Closing the ring would need 37 readable pockets to total exactly 360°, which
they don't, and forcing it leaves a seam that eventually rotates into view.

### Motion

**One curve, start to stop.** An earlier version braked to a halt and then crept to the next pocket.
That was worse than no suspense at all: a wheel that stops on red and then moves has announced that
the answer is its neighbour, and the restart read as a glitch. A single decelerating curve never
stops, so nothing is announced.

`remaining(p) = (1 − p)^EXP`. At 2.6 over 4 s the last pocket and a half take the final fifth of the
spin, which is a real crawl — a quartic instead spends its last second not moving at all, which
reads as a hang. The overlay gets exponent 2 over 2 s: the same curve, no tail, because airtime
there is somebody else's to spend.

**The flapper.** The pointer is kicked by every pocket edge that passes under it and springs back —
and it leans **left**, the way the pockets travel, because a flapper is dragged by what passes under
it. This is what makes a wheel feel mechanical rather than animated, and it needs per-frame knowledge
of where the wheel is, which is why the whole thing is an rAF loop and not a CSS transition.

**Landing.** Light goes DOWN, particles go UP, and both end:

- the winning pocket takes a rim light, 700 ms;
- a **pulse** of the outcome's colour runs off the rim and travels towards the hub, 900 ms to zero.
  It is a RADIAL GRADIENT rising to the colour and falling away again, not a stroked ring: a ring
  filled with a flat colour has two hard edges however wide it is drawn, and reads as a solid band
  sliding down rather than as light. It replaces a wash that tinted the whole platform and merely
  faded, which read as the interface breaking rather than as an answer;
- particles are thrown from the rim, upward and away — **one per call at a uniformly random angle**
  along the arc. Sampling a handful of fixed points and asking each for six particles reads as that
  many little fountains; the edge has to come apart along its whole length, which means continuous
  spawn positions, not a grid. `disintegrate` derives its count from area and caps at 60 per call,
  so it now takes an explicit count — a two-pixel spawn point has no area to speak of.

The landing fade runs on its OWN rAF handle. Settling flips `spinning`, which re-runs the spin
effect, whose cleanup cancels the spin's handle — sharing one killed the fade on its first frame and
froze the verdict light on screen indefinitely.

The verdict number under the tray is the fourth cue and the quietest: by the time anyone reads it,
the colour has already said it.

### Glass

Everything outside a wedge over the pointer is darkened: one fill, two subpaths, even-odd, so the
hole follows the arc instead of being a rectangle pretending the rim is straight. The hole is 3.2
pockets wide — one pocket wide would answer the question before the wheel had stopped asking it. Its
frame is one lit hairline and one dim outer line, and it takes the colour of a chip held over it.

Depth toward the hub is a RADIAL gradient. A straight `fillRect` was tried and drew a bar across the
middle of the box, which is the one thing an arc does not have.

### Controls

**A drawer, not a page.** It rises from the bottom and the ARC ITSELF is its boundary — no panel
behind it, so outside the disc the page keeps showing through. Everything the player needs sits
inside the arc: three tiles and a stake. Opened from the sidebar and the profile menu, the same way
the shop is.

**Every wallet on the page follows a spin.** They read the session, not the drawer, so the settle
calls the same `refresh()` the shop runs after a purchase — without it the number by the avatar sat
at the pre-bet balance until a reload.

**No Spin button, and no tap either.** The three colours are bare tiles thrown at the wheel: the
tile IS the verb, so choosing a colour and committing to it are one motion. Drag only — a tap would
put someone's stake one misclick away, and the point of throwing a chip is that committing takes
intent rather than a twitch. A thrown tile leaves its socket and stays gone until the wheel stops,
because it is on the wheel and cannot also be in the tray.

The drop target is geometry, not DOM: the band is drawn, so `overBand` tests the client point
against the circle. Move and release are watched on the WINDOW rather than through pointer capture —
lose the capture and the release never arrives, which strands the tile held forever.

**The multiplier is printed ON the tile** — `×2`, `×2`, `×35`. A sentence under the tray was read as
noise, and phrasing it as "green pays 35" made a multiplier sound like a flat prize. The hint and the
verdict stay under the tray, never over the wheel: that is the one thing being watched, and a caption
across it covers the pockets being read.

**The pocket colours are LOCKED** (`FILL` in Wheel.tsx, used by tile and canvas alike), never
`--color-accent`. The channel theme moves the accent hue, so a themed page rendered the green tile
lavender next to a mint pocket claiming to be the same bet. Same reasoning the theme already applies
to ok/warn/danger: these are status colours, not brand ones. The verdict number takes its colour from
the same map, and no longer names the colour at all — the window still shows the pocket it stopped on
and the pulse has already answered win or lose.

**The tile empties its socket only once something else is representing it** — the ghost under the
cursor, or the wheel itself. Emptying on the press alone left the first few pixels of every drag
with nothing in hand.

**The ghost is PORTALLED to the body.** The drawer animates with a transform, and a transformed
ancestor becomes the containing block for `position: fixed` — rendered inside it, client coordinates
land a drawer-height below the pointer and off the bottom of the screen, which looks exactly like the
tile vanishing on pickup.

**The drum erases its edges rather than painting them.** A dark gradient laid on top is opaque, and
over the wheel it drew a black slab across the arc; `destination-out` takes the numbers away and
leaves nothing behind. Its redraw on a changing cap is unconditional, too — skipping it while a frame
loop happened to be running left the drum painted against a cap of zero, one number and no strip,
with nothing scheduled to correct it.

**The stake is a drum, not a field.** Flick it; harder flicks coast further, steps of ten, snapping
to the nearest step. Velocity is measured over a 90 ms WINDOW of samples, not from the last pair:
a single 1px jitter across a 1ms frame reads as 1 px/ms, which under this friction throws the drum
five steps — which is exactly why placing it on a number by hand always landed on the next one. Over
a window, holding still for a moment IS zero velocity.

**No numbers on the pockets.** The bet is on colour, adjacent pockets already alternate, and the
flapper is what shows they are discrete units — so the numbers were decoration competing with the
one thing that matters.

## Phase 2 — the overlay strip

**Not a port of the wheel.** At the size of a chat card the arc's whole vocabulary — curvature, the
glass window, the flapper, the pocket numbers, the light pulse — is invisible. What ships is a BIG
block, the scale Twitch gives a lone emote (5.5em tall, its own row under the name), with colours
travelling right to left through it.

TWO BEATS, because one could not do both jobs. While it runs, a cell is a third of the block, so
several colours are in flight and the motion is legible; on landing the winner GROWS out of its cell
to fill the whole block, and the signed amount is written on it. Full-width cells would have been a
wipe with nothing moving through them; cells that stayed narrow would have left the answer a stripe.
An earlier inline 1.5em square was tried and read as a speck — colour is the whole message here, so
it gets the room.

`min-width`, not just `width: 100%`: the card shrinks to its content, so a short nick left the block
as narrow as the name and the colours had nowhere to travel.

This is the right form for the surface, not the cheap one: the wheel would have needed extracting
from React (the overlay is plain TS, zero React) into a shared DOM module, for a picture nobody
could see.

**The block stays** — it is the verdict, not a loader. It carries the colour, the direction and the
amount, so the overlay drops all three from the line itself. The chat copy keeps them: it has no
block to read them off.

**No second message either.** The verdict already travels in the same payload, so the overlay only
delays SHOWING it. `ChatSystemLine` gains `spin?: { color, won }` — no slot number, since one block has no pockets for
one to mean anything against, and `won` cannot be derived from the colour: landing on red is a win
or a loss depending on what was staked. Chat gets text and dust
immediately; a second and a half is not a spoiler, and Twitch's own delivery lag is longer.

**The settle is owned by a `setTimeout`, never by the animation.** An OBS source on an inactive
scene has `rAF` paused: the block would sit mid-shuffle forever and never resolve. A timeout
fires either way, and the result was decided server-side long before any of this. Same invariant as
everywhere else — the picture agrees with the answer, it never produces it.

The hidden fields use `visibility`, not `display`: the card must already be its final size or it
jumps under the reader when the numbers land.

Auto-hide was a worry and is not one: in production 29 channels never fade at all and the lowest
non-zero setting is 10 seconds, against a 1.5 second spin.

## Dashboard

One toggle next to the other command switches, with the odds and the bet cap stated plainly.

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
