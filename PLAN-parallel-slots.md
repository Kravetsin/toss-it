# Parallel playback slots

Today a channel shows one post at a time. With ~95% of sends being YouTube music, a three-minute
track blocks the screen for minutes: a gif that needs two seconds of airtime waits behind a song
nobody is looking at.

Goal: music plays in its own corner while images/gifs/text appear alongside it, and anything with
sound ducks the music instead of queueing behind it.

## Model

**One queue, two slots.** The queue stays a single ordered list (a viewer keeps a meaningful "you
are Nth"); the change is that two shows can be on screen at once, one per slot.

```
type Slot = 'media' | 'music'
```

`slotOf(sub, channel)`:

- `parallelSlots` off → always `'media'` (today's behaviour, bit for bit)
- `kind === 'audio'` → `'music'`
- `kind === 'youtube'` → `channel.youtubeAsMusic ? 'music' : 'media'`
- else → `'media'`

Note the slot is NOT the anchor. Which anchor a post uses (compact vs full-size) is already decided
by `youtubeAsMusic` and stays exactly as it is; the slot only decides whether a post can play
_alongside_ another. With `parallelSlots` off, a music post still renders in the compact anchor —
just in the single slot, as now.

**Sound rule** — by audio, not by type:

| On screen in `media`          | Effect on `music` slot                              |
| ----------------------------- | --------------------------------------------------- |
| image / gif / text, no TTS    | nothing, music keeps playing                        |
| video / audio file            | music slot ducks: fade → pause, resume after        |
| any post while its TTS speaks | music slot ducks for the speech only, then restores |

Background music (the playlist player) yields whenever _either_ slot is occupied — two tracks at
once is the one combination that is always wrong.

## Server

`ChannelState` splits: the queue stays shared, everything per-show moves into a per-slot record.

```
interface SlotState {
  current, watchdog, paused, progress, deliveryProbe, undelivered   // today's ChannelState fields
}
interface ChannelState { queue: SubmissionRow[]; slots: Record<Slot, SlotState> }
```

Touch points, all mechanical once the state is split:

- `tryNext(channelId, slot)` — first queue item whose `slotOf` matches, instead of `queue.shift()`.
  Called for both slots after enqueue / done / overlay connect.
- `onDone`, `noteProgress`, `confirmDelivery`, `onDeliveryUnconfirmed` — find the slot by
  `submissionId` (both carry it), then operate on that slot.
- `pause` / `resume` / `seek` / `skip` — take a slot.
- `recoverFromDb` — mid-show rows are grouped by slot; a second row for the same slot goes back to
  the queue rather than resurrecting two shows in one slot.
- `onOverlayConnected` — replays each occupied slot.
- `queueState` — position counted within the post's own slot, so "3rd" means 3rd of its kind.
- `overlayLayoutsOf` / `resolveLayout` — unchanged, but `slotOf` and `resolveLayout` must share the
  music/media decision so they can never disagree.

## Protocol

- `MediaPlayPayload` gains `slot`. The overlay renders into that slot's container.
- `media:control` / `media:volume` / `media:seek` gain a slot argument (they carry no submission id).
- `media:skip`, `playback:done`, `playback:progress`, `playback:duration` already carry a submission
  id — no change.
- Dashboard events `playback:started` / `playback:ended` / `playback:progress` gain a slot, or the
  dashboard cannot tell which of the two panels to update.
- Older overlay bundles ignore the extra field and keep behaving as one slot — acceptable
  degradation, the same as with `media:layout`.

## Overlay

The biggest edit. Today the whole show lives in module-level variables (`currentId`, `hideTimer`,
`finishing`, `ytPlayer`, `mediaEl`, `timed*`, `progressTimer`, `paused`, `currentKind`,
`ytReportedSid`). These become one record per slot, keyed by `Slot`, and every function that reads
them (`show`, `finish`, `clearStage`, `emitProgress`, `pausePlayback`, `resumePlayback`,
`destroyYoutube`, the `media:*` handlers) takes a slot.

- Second container `#stage-music`, same `position: fixed; inset: 0` flex as `#stage`, lower z-index.
- `applyStageLayout` targets a slot's container.
- Ducking generalised: the music slot ducks while a sounded post is up; the background player ducks
  while either slot is busy.

## Dashboard

- `useChannelData`: `now` becomes `{ media, music }`, same for progress.
- Two now-playing panels (music one is compact — title, sender, skip).
- Skip/pause/seek/volume calls pass a slot.

## Settings

- `parallelSlots` (channel column, default on) — the escape hatch back to single-slot behaviour.
  Belongs under the YouTube switch: it does nothing while that switch is off (see review).
- Guard: with parallel slots on, the two anchors must differ, otherwise the cards overlap. See
  review below.

## Order of work

1. Server: slot model, `slotOf`, per-slot state, `tryNext`, protocol fields.
2. Overlay: per-slot state, second container, ducking.
3. Dashboard: second now-playing, slot-aware controls; settings toggle + anchor guard.
4. Scripted checks (see below), then a manual pass in OBS.

## Review of the above, against the code

### Findings that change the plan

**Two YouTube players in slots can never happen — the cost estimate drops.** I was going to flag
three concurrent iframes (music slot + media slot + background) as an OBS risk. It cannot occur:
with `youtubeAsMusic` on, _every_ YouTube post goes to the music slot, so the media slot only ever
holds files/images/text; with it off, every YouTube post goes to the media slot and the music slot
only holds uploaded audio, which is an `<audio>` element. Ceiling stays two iframes, exactly as
today.

**The feature is only useful with `youtubeAsMusic` on.** Same reasoning: with it off, the music slot
receives nothing but uploaded audio files (≤60s, rare). So the parallel toggle should be presented
under the YouTube switch, and hidden or disabled when that switch is off — otherwise we ship a
setting that does nothing for the streamer who turns it on.

**TTS must duck for its own duration, not the post's.** The plan said a post with TTS ducks the
music. Taken literally that mutes a song for the eight seconds an image is up because two of them
had speech. Duck on TTS start, restore on TTS end (`playTts` already has an `onEnd` callback).

**Background music must yield to a busy music slot, not just to sound.** Two tracks at once is the
one combination that is always wrong, so the background player ducks while _either_ slot is
occupied — even by a silent image, whose card would otherwise sit next to a background player that
is still visible and playing.

**`getCurrent` has two callers that both need updating**, and they want different things:
`playback.ts` (viewer status: is _this_ submission playing) must check both slots;
`routes/dashboard.ts` `/now` must return both. Plan: keep `getCurrent(channelId, slot)` and add
`currentsOf(channelId)`.

**`!queue` chat command** (`modules/twitch-chat/commands/queue.ts`) counts `queueState` results and
says "playing now" if any is `playing`. With two slots that can be two posts at once; the wording
stays true but should be checked when positions become per-slot.

**Demo mode** (`?demo=1`, `demoPayload`) feeds the real render path and needs `slot` on its payloads
or the demo panel breaks.

**z-index order needs stating**: donation FX canvas sits at 50, background player at 5. New
`#stage-music` goes below `#stage` and above the background player.

### Decided (2026-07-26)

1. **One queue.** Accepted with its consequence: a later gif can air before an earlier song.
2. **One volume slider for both slots.** So `media:volume` needs no slot — it applies to whatever is
   playing. Simpler, and the only thing lost is per-slot balance.
3. **Overlapping anchors are allowed.** No forcing of `musicSeparate`: the music container simply
   sits below the media one. Since a 20%-wide music card under an 80%-wide media card is invisible
   rather than merely overlapped, settings show a non-blocking hint when both anchors resolve to the
   same corner.
4. **Keep the `parallelSlots` toggle.**

### Deliberate calls worth a second opinion

1. **One queue, not two.** Consequence: a gif sent later can air before a song sent earlier, because
   each slot pulls the first item it can use. Position stays honest _within_ a slot. The alternative
   (two visible queues) doubles the dashboard and the viewer-facing model for the same airtime.
2. **Volume.** The now-playing slider drives `channel.volume` for the current show. With two slots
   it needs a target: reuse one channel volume for both, or give the music slot its own knob the way
   background music has `bgMusicVolume`. Leaning toward its own knob — a song under a video wants a
   different level than a song alone.
3. **Overlapping anchors.** With `musicSeparate` off, both slots resolve to the same corner and the
   cards land on top of each other. Options: force `musicSeparate` on while parallel slots are on
   (and say so in the UI), or refuse to save that combination. Leaning toward forcing it.
4. **Keep the `parallelSlots` toggle at all?** It is an escape hatch and a second code path to keep
   working. Worth it for the first release; worth removing later if nobody turns it off.

## Checks to write

- Music plays; a gif arrives → both on screen, music never paused.
- Music plays; a video arrives → music paused, resumes when the video ends.
- Skipping one slot leaves the other running.
- Restart mid-show restores both slots; a duplicate row for one slot returns to the queue.
- Delivery probe and payout settle per slot (a dead overlay must not burn either slot's post).
- `parallelSlots` off behaves exactly like today.
