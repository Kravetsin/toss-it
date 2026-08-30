// Local bindings for use in the interfaces below; also re-exported for consumers (see `export *`).
import type { BreadthTotals, EquippedCosmetics } from './cosmetics';
import type { RouletteColor } from './roulette';
import type { ChannelTheme } from './theme';

export type MediaKind = 'image' | 'video' | 'audio' | 'text' | 'youtube' | 'gif';

/**
 * Direct Giphy CDN URL for a stored gif id (kind='gif'). Default rendition is the original;
 * pass e.g. '200w.gif' for thumbnails. Uses media.giphy.com (serves proper image/gif) — the
 * shorter i.giphy.com/{id}.gif form returns application/octet-stream and won't render in <img>.
 */
export function giphyGifUrl(id: string, rendition = 'giphy.gif'): string {
  return `https://media.giphy.com/media/${id}/${rendition}`;
}

/**
 * Renditions to try for a Giphy clip, best first — which ones exist varies per clip (360p always
 * does, 480p/720p often 404), so a player walks the list on error. `giphy.mp4` is NOT here on
 * purpose: for a clip it is the silent gif-style mp4, and a clip is meant to play with its sound.
 */
export const GIPHY_CLIP_RENDITIONS = ['giphy720p.mp4', 'giphy480p.mp4', 'giphy360p.mp4'] as const;

/** Clip URLs, best rendition first — see GIPHY_CLIP_RENDITIONS. For a player that can retry. */
export function giphyClipUrls(id: string): string[] {
  return GIPHY_CLIP_RENDITIONS.map((r) => giphyGifUrl(id, r));
}

/** The one clip rendition every clip has — for previews, which get no second try. */
export function giphyClipUrl(id: string): string {
  return giphyGifUrl(id, 'giphy360p.mp4');
}

/** Max message/caption length; validated on both client and server. */
export const TEXT_MAX_LEN = 280;

/**
 * Shorter cap for `!tts` from chat. The website's 280 is read out in roughly half a minute, which
 * is a lot of airtime to hand out for free — a chat line pays nothing, so it has to be brief.
 */
export const CHAT_TEXT_MAX_LEN = 180;

/**
 * How many viewer votes `!skip` needs. The streamer picks inside these bounds: below two it is not
 * a vote at all, and above ten no chat that is not huge would ever reach it.
 */
export const SKIP_VOTES = { min: 2, max: 10, default: 3 } as const;

/** Clamp a streamer-supplied vote threshold into the allowed range. */
export function clampSkipVotes(n: number): number {
  if (!Number.isFinite(n)) return SKIP_VOTES.default;
  return Math.min(SKIP_VOTES.max, Math.max(SKIP_VOTES.min, Math.round(n)));
}

/** One of 9 preset anchors for media placement in overlay (3x3 grid order). */
export type OverlayPosition =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

/**
 * How far the overlay will scale media UP past its own pixels. The size setting used to be a
 * ceiling only, so a 600px screenshot stayed 600px on a 1920 stage however big the streamer went.
 * Two is where an upscale still reads as "bigger" rather than as mush.
 * Enforced in CSS (see .player.has-media img[data-nat]); mirrored here for the send-time preview.
 */
export const MEDIA_UPSCALE_MAX = 2;

/** Canvas the preview assumes the overlay runs at — OBS's default, and what the vw/vh units in
 *  the overlay resolve against for nearly everyone. */
export const OVERLAY_STAGE = { width: 1920, height: 1080 };

/** The card's horizontal padding + border, which the media has to fit inside (see .player). */
const CARD_INSET_PX = 34;

/**
 * How much of the stage a piece of media will actually cover, as a % of each axis — the answer the
 * size slider alone cannot give, because media smaller than the chosen size only grows to the
 * upscale cap. Keep in step with the CSS rule named above.
 */
export function renderedMediaPct(
  natural: { width: number; height: number },
  size: number,
): { width: number; height: number } {
  const capW = (size / 100) * OVERLAY_STAGE.width - CARD_INSET_PX;
  const capH = (size / 100) * OVERLAY_STAGE.height;
  const scale = Math.min(capW / natural.width, capH / natural.height, MEDIA_UPSCALE_MAX);
  return {
    width: ((natural.width * scale) / OVERLAY_STAGE.width) * 100,
    height: ((natural.height * scale) / OVERLAY_STAGE.height) * 100,
  };
}

/** UI grid order (left-to-right, top-to-bottom). */
export const OVERLAY_POSITIONS: OverlayPosition[] = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
];

/**
 * Anchor to flexbox alignment (justify-content / align-items).
 * Single source of truth so overlay and dashboard preview match.
 */
export function positionToFlex(pos: OverlayPosition): { justify: string; align: string } {
  const justify = pos.includes('left')
    ? 'flex-start'
    : pos.includes('right')
      ? 'flex-end'
      : 'center';
  const align = pos.includes('top') ? 'flex-start' : pos.includes('bottom') ? 'flex-end' : 'center';
  return { justify, align };
}

/**
 * Social link platforms in public channel profile. Order = UI select order.
 * 'link' — arbitrary URL (generic icon) for anything not listed.
 */
export type SocialPlatform =
  | 'twitch'
  | 'youtube'
  | 'x'
  | 'instagram'
  | 'tiktok'
  | 'discord'
  | 'telegram'
  | 'link';

export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  'twitch',
  'youtube',
  'x',
  'instagram',
  'tiktok',
  'discord',
  'telegram',
  'link',
];

export interface ChannelLink {
  platform: SocialPlatform;
  /** Absolute http(s) URL; validated on server. */
  url: string;
}

/** Editable channel profile limits; validated on both client and server. */
export const CHANNEL_DESCRIPTION_MAX_LEN = 200;
export const CHANNEL_LINKS_MAX = 8;
export const CHANNEL_LINK_URL_MAX_LEN = 300;

export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'played' | 'expired';

export interface MediaPlayPayload {
  submissionId: string;
  /** Server-relative path, e.g. /api/media/<id>. Overlay prepends origin. */
  url: string;
  kind: MediaKind;
  /** Hard display cap: overlay removes media when this timer elapses. */
  durationMs: number;
  /** Playback volume, 0-100 (channel setting). */
  volume: number;
  sound: boolean;
  tts: boolean;
  /** Absent if streamer disabled showing sender name. */
  senderName?: string;
  /** Sender's equipped nickname color (#rrggbb), absent if none/anon. */
  senderColor?: string;
  /** Sender's second gradient stop (#rrggbb); absent unless they equipped a gradient. */
  senderColor2?: string;
  /** Sender's gradient drifts (nick-flow); absent unless equipped. */
  senderNickFlow?: boolean;
  /** Sender's equipped nick effect id (e.g. 'nick-glow'); absent if none. */
  senderEffect?: string;
  /** Sender's equipped card effect id (e.g. 'card-levitation', 'card-stardust'); absent if none. */
  senderCardEffect?: string;
  /** Card effect tint (#rrggbb) from the 'card-butterflies-color' upgrade; absent = effect's palette. */
  senderCardEffectColor?: string;
  /** Second tint, for a two-sided effect (the duel's blades, the portal pair); absent = its palette. */
  senderCardEffectColor2?: string;
  /** Sender's equipped frame id (e.g. 'frame-runner'); absent if none. Border decoration on the card. */
  senderFrame?: string;
  /** Frame tint (#rrggbb) from the frame's colour upgrade; absent = the brand mint. */
  senderFrameColor?: string;
  /** Sender's equipped seal id (e.g. 'seal-hourglass'); absent if none. A small object, own slot. */
  senderSeal?: string;
  /** Seal tint (#rrggbb) from the seal's colour upgrade; absent = the seal's palette. */
  senderSealColor?: string;
  /** Sender's equipped entrance id (e.g. 'entrance-glitch'); absent = the stage's own pop-in. */
  senderEntrance?: string;
  /** Portal entrance tint (#rrggbb) from the 'entrance-portal-color' upgrade; absent = default mint. */
  senderEntranceColor?: string;
  /** Sender's per-channel level 0–10 (0/absent = no rank) — rarity rail + Roman numeral. */
  senderLevel?: number;
  /** Sender's badge ids (e.g. 'founder', future cosmetic badges); absent if none. */
  senderBadges?: string[];
  /** Caption for a file, or body of text-only submission (kind='text'). */
  text?: string;
  ttsText: boolean;
  /** Which stage to render on. Absent in bundles older than parallel slots — they only have one. */
  slot?: PlaybackSlot;
  position: OverlayPosition;
  /**
   * Whatever of the layout the sender chose themselves — already folded into position/size/margin
   * above. Sent separately because the overlay has to re-apply it on top of a live layout change:
   * a settings tweak mid-show must not drag the card out of the corner its sender picked, while
   * the knobs they left alone should still follow the streamer. Media anchor only — the music
   * player stays the streamer's.
   */
  viewerLayout?: Partial<OverlayLayout>;
  /** Max media size, % of viewport (channel setting). */
  size: number;
  /** Edge margin, % of viewport — for edge-anchored positions. */
  margin: number;
  /** YouTube video id (kind='youtube'); overlay renders embedded IFrame player. */
  youtubeId?: string;
  /** YouTube start second from link timecode (0 = from start). */
  youtubeStartSeconds?: number;
  /** YouTube Music: render as compact player rather than fullscreen. */
  youtubeMusic?: boolean;
  /** Giphy id (kind='gif'); overlay renders the remote GIF from Giphy's CDN. */
  giphyId?: string;
}

/**
 * Which of the overlay's two stages a post plays on. Two posts can be up at once, one per slot, so
 * a three-minute song no longer blocks a two-second gif. Not the same thing as the anchor: where a
 * post sits is decided by the channel's YouTube switch, this decides what it can play alongside.
 */
export type PlaybackSlot = 'media' | 'music';

/** Where a post sits on screen — the trio the overlay applies to the stage. */
export interface OverlayLayout {
  position: OverlayPosition;
  size: number;
  margin: number;
}

/**
 * Both anchors at once, plus the switch that routes YouTube between them. A live layout change
 * ships all three because only the overlay knows what is on screen — audio always takes the music
 * anchor, YouTube follows the switch, everything else takes the media one.
 */
export interface OverlayLayouts {
  media: OverlayLayout;
  music: OverlayLayout;
  /**
   * The channel's YouTube switch, so a post already on screen can change anchors when it flips —
   * the overlay knows what is playing, the server only knows what the settings now say.
   */
  youtubeAsMusic: boolean;
}

/** Live status for viewer indicator ('playing' is transient, not persisted). */
export type LiveStatus = SubmissionStatus | 'playing';

export interface SubmissionStatusEvent {
  submissionId: string;
  status: LiveStatus;
}

/**
 * Donation received by server from a third party (Donatello etc.) for overlay FX.
 * Money does NOT flow through us; we only listen and turn events into effects.
 */
export interface DonationFx {
  provider: string;
  donorName: string | null;
  /** Amount in provider's currency units (scales effect intensity). */
  amount: number;
  currency: string;
  message: string | null;
}

/** Channel-points → stardust opt-in status (dashboard). */
export interface ChannelPointsStatus {
  /** Whether the Twitch authorization (token) exists — the prerequisite for either reward. */
  connected: boolean;
  /** Broadcaster display name the reward was created on ("Connected as X"). */
  externalName: string | null;
  /** Whether the stardust reward is set up. */
  hasStardust: boolean;
  /** Whether the YouTube-request reward is set up. */
  hasYoutube: boolean;
  /** Whether the "put a line on stream" reward is set up. */
  hasTts: boolean;
  /** Whether the "skip what is on screen" reward is set up. */
  hasSkip: boolean;
}

/** Donation integration status (dashboard). Callback model: provider POSTs to us. */
export interface IntegrationStatus {
  provider: string;
  connected: boolean;
  /** Callback URL the streamer sets in Donatello (our public POST endpoint). */
  callbackUrl: string | null;
  /** Secret for X-Key header — verifies request came from Donatello. */
  key: string | null;
}

/** One piece of a chat message: plain text, a native Twitch emote, or an @mention.
 *  `mention` is Twitch's own classification (`@user`); kept distinct from text so the
 *  overlay can ignore it in the emote-only check (a reply prefix must not block gigantify). */
export type ChatFragment =
  | { type: 'text'; text: string }
  | { type: 'emote'; id: string; text: string }
  | { type: 'mention'; text: string }
  /**
   * A cheer ("Cheer100"): its art and tier color are resolved server-side from the channel's
   * cheermote catalog. `prefix`/`tier` are what Twitch said and travel unresolved, so a failed
   * catalog fetch still renders the cheer as its plain text instead of dropping the bits.
   */
  | {
      type: 'cheermote';
      text: string;
      bits: number;
      prefix: string;
      tier: number;
      url?: string;
      color?: string;
    };

/** A resolved platform chat badge (mod/vip/broadcaster/subscriber…) ready to render:
 *  the server turns Twitch's set_id/version into a CDN image URL so the overlay stays dumb. */
export interface ChatBadge {
  /** Badge image URL (Twitch CDN). */
  url: string;
  /** Human title for alt text, e.g. 'Moderator', 'Subscriber'. */
  title: string;
}

/** Highlighted chat roles — drive the role-tinted message border in the overlay.
 *  Priority high→low: broadcaster > moderator > vip > subscriber. */
export type ChatRole = 'broadcaster' | 'moderator' | 'vip' | 'subscriber';

/**
 * Chat events Twitch delivers next to the messages themselves (EventSub `channel.chat.notification`,
 * the old IRC USERNOTICE): subs, gifts, raids, watch streaks, announcements. Shared-chat variants
 * fold into their base kind — a sub from a co-streamed channel is still a sub. Kinds we do not know
 * are dropped server-side, so this list is the whole vocabulary the overlay has to render.
 */
export type ChatNoticeType =
  | 'sub'
  | 'resub'
  | 'subGift'
  | 'communitySubGift'
  | 'giftPaidUpgrade'
  | 'primePaidUpgrade'
  | 'payItForward'
  | 'raid'
  | 'unraid'
  | 'announcement'
  | 'bitsBadgeTier'
  | 'charityDonation'
  | 'watchStreak'
  | 'modiversary';

/**
 * The notice riding on a chat row. Anything the viewer typed alongside it (a resub message, the
 * text attached to a watch streak) stays in the row's own `fragments` — this only describes the
 * event. The caption is composed server-side; the structured fields ride along for anything the
 * overlay may want to style per kind later.
 */
export interface ChatNotice {
  type: ChatNoticeType;
  /** Ready-to-render caption ("серия просмотров · 12"), composed server-side in the channel's bot
   *  locale. Empty when the event's own text is the message (an announcement). */
  text: string;
  /** The kind's headline number: streak/cumulative months, gifted subs, raiders, bits tier. */
  count?: number;
  /** The other party, when the event has one: raider, gift recipient, gifter. */
  otherName?: string;
}

/**
 * Why a message stands out beyond who wrote it. `highlighted` = the viewer spent channel points on
 * "Highlight My Message"; `cheer` = it carries bits; `intro` = a newcomer's first line (Twitch's
 * "user intro"). All three are things a viewer paid for or a streamer wants to answer, so the
 * overlay owes them a mark. `text` is the caption where one helps, already in the bot's locale.
 */
export interface ChatEmphasis {
  kind: 'highlighted' | 'cheer' | 'intro';
  text?: string;
  /** Bits in the message (cheer only) — the same total Twitch reports for the whole line. */
  bits?: number;
}

/** A chat message forwarded to the chat overlay (twitch-chat module → overlay). */
export interface ChatOverlayMessage {
  /** Twitch message id (for targeted deletion). */
  id: string;
  /** Twitch user id of the author (for clear-user). */
  userId: string;
  name: string;
  /** Twitch name color (#rrggbb), fallback when no Tossit nick color. */
  twitchColor: string | null;
  /** Author's equipped Tossit cosmetics, if their Twitch is linked. */
  cosmetics: EquippedCosmetics | null;
  /** True if the author is a Tossit founder (badge). */
  isFounder: boolean;
  /** Author's per-channel level 0–10 (0 = no badge); drives the rarity badge + left border. */
  level?: number;
  /** Native platform badges (mod/vip/sub…), pre-resolved to images; absent/empty if none. */
  badges?: ChatBadge[];
  /** Highlighted role (broadcaster/mod/vip) for the tinted message border; absent otherwise. */
  role?: ChatRole;
  /** Present when this message is a reply; drives the "↳ @name" indicator above the bubble.
   *  `name` is the parent author's display name (without the leading @). */
  reply?: { name: string };
  /** Present when the row is a Twitch chat notice (sub/raid/watch streak…) rather than plain chat.
   *  The row is otherwise identical — same author look, same deletion by id. */
  notice?: ChatNotice;
  /** Twitch's own emphasis on the message itself — see ChatEmphasis. */
  emphasis?: ChatEmphasis;
  fragments: ChatFragment[];
}

/**
 * One chat-bot command as the dashboard shows it. Comes from the server's command registry rather
 * than a list kept by hand in the UI, so a command that is added, renamed or switched off can never
 * disagree with what the bot really answers. What each one DOES is UI copy and stays in the web
 * app's i18n, keyed by `name`.
 */
export interface BotCommandInfo {
  /** Primary trigger, without the leading '!'. */
  name: string;
  /** Extra triggers that do the same thing. */
  aliases: string[];
  /** False = the streamer has this one switched off; it is listed, but greyed and unusable. */
  enabled: boolean;
}

/** Languages the chat bot can answer in. Mirrors the web app's own Lang set. */
export const BOT_LOCALES = ['en', 'ru', 'uk'] as const;
export type BotLocale = (typeof BOT_LOCALES)[number];

/**
 * The bot's answer to a chat command, rendered as its own line in the chat overlay.
 * Composed server-side and kept language-neutral where possible (asker + number + brand), so an
 * unregistered viewer still reads it. Deliberately generic — one line shape for every command.
 */
export interface ChatSystemLine {
  /** Display name of the viewer who ran the command — the line reads as a reply to them. */
  name: string;
  /** Stardust value, rendered with the brand star. */
  dust?: number;
  /** Short label when a bare number is not self-explanatory. */
  text?: string;
  /** Small line underneath, e.g. the domain for dust waiting to be claimed. */
  hint?: string;
  /**
   * A wheel result to play out before the numbers appear. The winning COLOUR and whether it paid —
   * no slot number, because the overlay shows one block, not pockets, and nothing at that size could
   * mean a number. `won` cannot be derived from the colour: landing on red is a win or a loss
   * depending on what was staked.
   *
   * The verdict is already in `text`/`dust` — the overlay only delays SHOWING it, which is why no
   * second message is needed.
   */
  spin?: { color: RouletteColor; won: boolean };
}

/**
 * A ChatSystemLine on the wire to the overlay, carrying the asker's look. The command produces the
 * bare line (pure logic); the twitch-chat module attaches the cosmetics before emitting. Only the
 * asker's NICK is styled — the mint card is what says "bot answer", so a cosmetic name reads as
 * "the bot is talking about ME" without the card dissolving into the run of viewer messages.
 */
export interface ChatSystemEvent extends ChatSystemLine {
  /** Asker's equipped cosmetics (nick paint/effect), if their Twitch is linked. */
  cosmetics: EquippedCosmetics | null;
  /** Asker is a Tossit founder (sparkle badge before the name). */
  isFounder: boolean;
  /** Twitch name color, the fallback paint when there is no Tossit nick color. */
  twitchColor: string | null;
}

/** Display config for the chat overlay (font size, auto-hide, per-element toggles). */
export interface ChatOverlayConfig {
  /** Message font size in px. */
  fontSize: number;
  /** Opacity of the dark plate behind a message, in percent (0 = text straight on the stream). */
  bgOpacity: number;
  /** Gap under each row, in hundredths of an em (40 = 0.4em) so it tracks the font size. */
  gap: number;
  /** Corner rounding of the message card, in px. */
  radius: number;
  /** Name on the message's own first line instead of a line of its own above it. */
  compact: boolean;
  /** Seconds a message stays before fading out; 0 = keep until pushed off. */
  fadeSeconds: number;
  /** Render native Twitch badges next to the nick. */
  showBadges: boolean;
  /** Render the numeric level (Roman numeral) before the nick — star is unaffected. */
  showLevel: boolean;
  /** Tint the message border by role (broadcaster/mod/vip/sub). */
  roleBorders: boolean;
}

/** How much of the background player OBS shows. One axis: 'compact' drops the video and keeps a
 *  title strip, 'hidden' keeps only the audio. */
export type MusicDisplay = 'full' | 'compact' | 'hidden';

export const MUSIC_DISPLAYS: readonly MusicDisplay[] = ['full', 'compact', 'hidden'];

/** Background-music config for the media overlay (a YouTube playlist played between posts). */
export interface MusicConfig {
  /** Owned, ordered track ids to play (preferred). Empty → fall back to playlistId. */
  trackIds: string[];
  /** YouTube playlist id fallback (back-compat before a list is imported), or null. */
  playlistId: string | null;
  /** Play in random order instead of list order. */
  shuffle: boolean;
  /** Music volume 0-100 (independent of the submission overlay volume). */
  volume: number;
  /** How visible the player is in OBS — it keeps playing in every mode. */
  display: MusicDisplay;
  /** Player anchor/size/margin — the music layout block (same fields song requests can share). */
  position: OverlayPosition;
  size: number;
  margin: number;
}

/** One background-music track (from the YouTube Data API), for the dashboard list. */
export interface MusicTrack {
  videoId: string;
  title: string;
  /** Track length in seconds via the YouTube Data API; absent without an API key. */
  durationSec?: number;
}

/** Background-music dashboard payload: the owned track list plus the DJ knobs (shuffle/volume/display).
 *  Accessible to the owner AND moderators, so a mod can run the music without settings/token access. */
export interface MusicDashboard {
  tracks: MusicTrack[];
  shuffle: boolean;
  volume: number;
  display: MusicDisplay;
}

/** Build the overlay's music config from a channel's stored background-music fields. The background
 *  player always uses the music layout block (music*); the musicSeparate toggle only decides whether
 *  song-request cards share it (that choice is applied server-side when a submission plays). */
export function musicConfigFrom(ch: {
  bgMusicTracks: MusicTrack[];
  bgMusicPlaylist: string | null;
  bgMusicShuffle: boolean;
  bgMusicVolume: number;
  bgMusicDisplay: MusicDisplay;
  musicPosition: OverlayPosition;
  musicSize: number;
  musicMargin: number;
}): MusicConfig {
  return {
    trackIds: ch.bgMusicTracks.map((t) => t.videoId),
    playlistId: ch.bgMusicPlaylist,
    shuffle: ch.bgMusicShuffle,
    volume: ch.bgMusicVolume,
    display: ch.bgMusicDisplay,
    position: ch.musicPosition,
    size: ch.musicSize,
    margin: ch.musicMargin,
  };
}

/** Transport command sent from the dashboard to the overlay's music player. */
export interface MusicCommand {
  action: 'play' | 'pause' | 'next' | 'prev' | 'playAt' | 'seek';
  /** Target track for 'playAt' (matched by id, so it works under shuffle). */
  videoId?: string;
  /** Target position for 'seek', seconds into the current track. */
  seconds?: number;
}

/** Live music player state reported by the overlay to the dashboard. */
export interface MusicState {
  /** Currently loaded track, or null when idle/unstarted. */
  videoId: string | null;
  playing: boolean;
  /** Playback position/length in seconds; absent while idle. */
  positionSec?: number;
  durationSec?: number;
}

/**
 * Which OBS source a socket belongs to. The two overlays are separate browser sources and fail
 * separately — a streamer whose media overlay is dead needs to be told exactly that.
 */
export type OverlayKind = 'media' | 'chat';

/** Overlays connected to a channel right now, by source. */
export interface OverlayPresence {
  media: number;
  chat: number;
}

export interface ServerToOverlayEvents {
  'media:play': (payload: MediaPlayPayload) => void;
  /** Dashboard asked this source to reload — the cure for an overlay that is stuck, not offline. */
  'overlay:reload': () => void;
  /**
   * Layout settings changed while a post may be on screen. Sent on save, so a streamer fixing the
   * size of a ten-minute YouTube video sees it move instead of waiting for the next post.
   */
  'media:layout': (layouts: OverlayLayouts) => void;
  'media:skip': (submissionId: string) => void;
  /** Pause/resume the current show (dashboard → overlay). Skip is media:skip. */
  'media:control': (action: 'pause' | 'resume', slot?: PlaybackSlot) => void;
  /** Live content volume (0-100) applied to the current show — the dashboard's now-playing slider. */
  'media:volume': (volume: number) => void;
  /** Seek the current show to `seconds` (video/audio/YouTube only) — the now-playing scrub bar. */
  'media:seek': (seconds: number, slot?: PlaybackSlot) => void;
  /** Channel donation → fullscreen burst FX over media display. */
  'donation:fx': (fx: DonationFx) => void;
  /** Chat display config, sent on connect and whenever settings change. */
  'chat:config': (cfg: ChatOverlayConfig) => void;
  /** Background-music config, sent on connect and whenever settings change. */
  'music:config': (cfg: MusicConfig) => void;
  /** Transport command for the background-music player (from the dashboard). */
  'music:command': (cmd: MusicCommand) => void;
  /** New chat line for the chat overlay source. */
  'chat:message': (msg: ChatOverlayMessage) => void;
  /** A viewer traded channel points for stardust — a special stardust line in the chat overlay.
   *  Kept language-neutral (name + amount + brand) so unregistered viewers still get it. */
  'chat:redemption': (event: { name: string; dust: number }) => void;
  /** The bot's answer to a chat command (!balance and friends). */
  'chat:system': (line: ChatSystemEvent) => void;
  /** A single message was deleted on Twitch (by id). */
  'chat:delete': (messageId: string) => void;
  /** All of a user's messages were removed (timeout/ban) — by twitch user id. */
  'chat:clearUser': (userId: string) => void;
  /** Whole chat was cleared. */
  'chat:clear': () => void;
}

export interface ServerToViewerEvents {
  'submission:status': (event: SubmissionStatusEvent) => void;
}

/**
 * How a show ended. 'error' = the player refused it (region lock, age gate, embedding disabled) —
 * it was never really on screen, which is what decides whether a paid request gets refunded.
 * Optional on the wire: overlay bundles older than this send nothing and mean 'ended'.
 */
export type PlaybackDoneReason = 'ended' | 'error';

/**
 * The page's own account of an outage it just came back from. Server logs see a drop only as a
 * transport code, which cannot tell "the link died" from "the source was wedged and reloaded itself".
 */
export interface OverlayDiag {
  /** socket.io reason for the drop this connect ends (or `connect_error:<message>`). */
  reason: string;
  /** How long this page had no connection. */
  offlineMs: number;
  /** Connection attempts that failed back-to-back before this one landed. */
  attempts: number;
  /** Times the page re-dialled a nominally-connected socket during its life (stall detector). */
  stalls: number;
  /** Set when this page IS our own hard reload: what triggered it. */
  reloadedBy?: string;
}

export interface OverlayToServerEvents {
  'playback:done': (submissionId: string, reason?: PlaybackDoneReason) => void;
  /** Overlay learned real clip duration (YouTube: only during playback). */
  'playback:duration': (submissionId: string, durationMs: number) => void;
  /** Live position of the current show, throttled; relayed to the dashboard's progress bar. */
  'playback:progress': (p: PlaybackProgress) => void;
  /** Background-music player state, relayed to the dashboard. */
  'music:state': (state: MusicState) => void;
  /** Sent right after a reconnect that followed an outage — see OverlayDiag. */
  'overlay:diag': (d: OverlayDiag) => void;
}

export interface SubmissionSummary {
  id: string;
  senderUserId: string | null;
  senderName: string | null;
  /** The sender's real provider name, sent ONLY when it differs from what is displayed — i.e. when
   *  they bought a name. Null otherwise, so a tooltip appears exactly where there is something to
   *  reveal. This is what a streamer checks before banning. */
  senderPlatformName: string | null;
  /** Sender's equipped nickname color (#rrggbb), null if none/anon. */
  senderColor: string | null;
  /** Sender's second gradient stop (#rrggbb), null unless they equipped a gradient. */
  senderColor2: string | null;
  /** Whether the sender's gradient drifts (nick-flow). */
  senderNickFlow: boolean;
  /** Sender's equipped nick effect id, null if none. */
  senderEffect: string | null;
  /** Sender's equipped card effect id, null if none. */
  senderCardEffect: string | null;
  /** Card effect tint (#rrggbb) from the 'card-butterflies-color' upgrade; null = effect's palette. */
  senderCardEffectColor: string | null;
  /** Second tint, for a two-sided effect (the duel's blades, the portal pair); null = its palette. */
  senderCardEffectColor2: string | null;
  /** Sender's equipped frame id, null if none. Border decoration on the submission card. */
  senderFrame: string | null;
  /** Frame tint (#rrggbb) from the frame's colour upgrade; null = the brand mint. */
  senderFrameColor: string | null;
  /** Sender's equipped seal id, null if none. A small object in the card's free corner. */
  senderSeal: string | null;
  /** Seal tint (#rrggbb) from the seal's colour upgrade; null = the seal's palette. */
  senderSealColor: string | null;
  /** Sender's per-channel level 0–10 (0/absent = no rank) — drives the curation rail + numeral. */
  senderLevel?: number;
  kind: MediaKind;
  mime: string;
  /** Caption for a file, or body of text-only submission. */
  text: string | null;
  durationMs: number;
  /** epoch ms */
  createdAt: number;
  url: string;
  /** YouTube video id for preview (kind='youtube'), else null/absent. */
  youtubeId?: string | null;
  /** Giphy id for preview (kind='gif'), else null/absent. */
  giphyId?: string | null;
  /** What the sender chose of the layout, null where they left the channel's own. Shown in
   *  moderation so the streamer approves the placement together with the content, rather than
   *  finding out about it on stream — which matters most when a post asks for the whole screen. */
  overlayPosition?: OverlayPosition | null;
  overlaySize?: number | null;
  overlayMargin?: number | null;
}

/** Live position of whatever is currently on the overlay — drives the dashboard's progress bar. */
export interface PlaybackProgress {
  submissionId: string;
  positionMs: number;
  /** Total length; 0 = unknown yet (e.g. a YouTube clip still loading). */
  durationMs: number;
  paused: boolean;
  /** Which stage reported it; absent from bundles older than parallel slots (they mean 'media'). */
  slot?: PlaybackSlot;
}

export interface ServerToDashboardEvents {
  'moderation:new': (submission: SubmissionSummary) => void;
  /** Submission left pending (approved/rejected) — remove from list. */
  'moderation:resolved': (submissionId: string) => void;
  /** A show started. `slot` says which of the two now-playing panels it belongs to. */
  'playback:started': (submission: SubmissionSummary, slot?: PlaybackSlot) => void;
  'playback:ended': (submissionId: string, slot?: PlaybackSlot) => void;
  /** The waiting queue changed (item added/played/reordered) — full ordered list, next-first. */
  'playback:queue': (queue: SubmissionSummary[]) => void;
  /** Live progress of the current show (relayed from the overlay), for the now-playing controls. */
  'playback:progress': (p: PlaybackProgress) => void;
  /** Live background-music player state (relayed from the overlay). */
  'music:state': (state: MusicState) => void;
  /** Overlays connected right now — sent on dashboard connect and on every overlay come/go. */
  'overlay:presence': (presence: OverlayPresence) => void;
}

export interface ChannelSettings {
  /** Duration cap for video, ms. Longer videos are truncated. */
  maxDurationMs: number;
  /** How long static images and GIFs stay on screen, ms. */
  imageDurationMs: number;
  /** Separate cap for audio (music runs longer than memes), ms. */
  maxAudioDurationMs: number;
  maxFileSizeBytes: number;
  /** Overlay volume, 0-100. */
  volume: number;
  /** Kill switch: false = submissions paused. */
  accepting: boolean;
  /** Streamer opt-in: YouTube *music* skips moderation (compact corner player — low-risk). */
  autoApproveYoutubeMusic: boolean;
  /** Streamer opt-in: YouTube *video* skips moderation (full-screen — can take over the stream). */
  autoApproveYoutubeVideo: boolean;
  /** With auto-approve on, YouTube longer than this (minutes, 1–10) falls to moderation. */
  youtubeAutoMaxMinutes: number;
  /** Streamer opt-in: anything from Giphy (GIF, sticker, clip) skips moderation — see the schema. */
  autoApproveGifs: boolean;
  /**
   * Streamer opt-in: text the viewer wrote skips moderation. While off, a caption attached to an
   * otherwise auto-approved send is dropped instead of pulling that send into moderation.
   */
  autoApproveText: boolean;
  /** Read-only: every command the bot answers to, disabled ones included (see BotCommandInfo). */
  chatCommands: BotCommandInfo[];
  /** Read-only: chat bot login to /mod, or null when unavailable for this channel. */
  chatBotLogin: string | null;
  /** Read-only: the bot is currently subscribed to this channel's chat. */
  chatBotReading: boolean;
  showSenderName: boolean;
  soundAlert: boolean;
  ttsName: boolean;
  ttsMessage: boolean;
  /** Show the Twitch chat (with Tossit cosmetics) in the chat overlay source. */
  chatOverlayEnabled: boolean;
  /** Let the bot answer chat commands in the Twitch chat itself, not only in the overlay. */
  chatBotReplies: boolean;
  /** Let viewers order YouTube links from chat with `!play <link>` (no channel points needed). */
  chatPlayCommand: boolean;
  /** Let viewers put a line on stream with `!tts <text>` — read aloud when the channel speaks messages. */
  chatTtsCommand: boolean;
  /** Let viewers take what is on screen off it with `!skip` — a vote for viewers, one command
   *  for the streamer and their moderators. */
  chatSkipCommand: boolean;
  /** Let viewers bet stardust on the wheel with `!bet`. */
  chatRouletteCommand: boolean;
  /** Viewer votes a `!skip` needs (SKIP_VOTES bounds). */
  skipVotesNeeded: number;
  /** Language the bot answers in. Separate from the dashboard's own language: the streamer may
   *  read the UI in one language and run a chat in another. */
  botLocale: BotLocale;
  /** Chat overlay message font size, px. */
  chatFontSize: number;
  /** Chat overlay: seconds before a message fades out; 0 = keep until pushed off. */
  chatFadeSeconds: number;
  chatBgOpacity: number;
  chatCompact: boolean;
  chatRadius: number;
  chatGap: number;
  /** Chat overlay: render native Twitch badges (mod/vip/sub…) next to the nick. */
  chatShowBadges: boolean;
  /** Chat overlay: render the numeric level (Roman numeral) before the nick — star is unaffected. */
  chatShowLevel: boolean;
  /** Chat overlay: tint the message border by role (broadcaster/mod/vip/sub). */
  chatRoleBorders: boolean;
  /** Media anchor (shared for images/video; music inherits unless musicSeparate). */
  overlayPosition: OverlayPosition;
  /** Max media size, % of viewport (10-100). */
  overlaySize: number;
  /** Edge margin, % of viewport (0-25) — for edge-anchored positions. */
  overlayMargin: number;
  /**
   * Let a sender pick which of the 9 anchors their own post lands on (media only — the music
   * player stays put). Off by default: it hands part of the screen to the viewer, so the streamer
   * has to say yes. Turning it back off also re-homes posts already waiting in the queue.
   */
  allowViewerPosition: boolean;
  /**
   * true = every YouTube post lands in the compact music player, false = the full-size media
   * anchor. Overrides what we guessed the link was: metadata cannot be trusted to tell a music
   * video from a video, and a streamer saying "YouTube goes small" means all of it.
   */
  youtubeAsMusic: boolean;
  /**
   * true = two posts can be on screen at once, one per slot: a song keeps playing in the compact
   * player while images and gifs come and go on the main stage. Off restores single-slot playback.
   */
  parallelSlots: boolean;
  /** true = music player has its own layout (music* fields), else inherits overlay*. */
  musicSeparate: boolean;
  musicPosition: OverlayPosition;
  musicSize: number;
  musicMargin: number;
  /** Background music: last imported YouTube playlist id (import source), or null. */
  bgMusicPlaylist: string | null;
  /** Owned, ordered track list — the source of truth for playback (editable). */
  bgMusicTracks: MusicTrack[];
  /** Play the list in random order. */
  bgMusicShuffle: boolean;
  bgMusicVolume: number;
  /** How much of the music player OBS shows — also reachable from the dashboard's music manager,
   *  which writes it through the mod-accessible music endpoint instead. */
  bgMusicDisplay: MusicDisplay;
  /** The streamer's chosen page background id ('' = none). Only renders if it's also earned. */
  pageBackground: string;
  /** Derived (read-only): the background ids this channel has unlocked, for the settings picker —
   *  you can only choose a background you've actually earned. */
  earnedBackgrounds: string[];
  /** Channel description on viewer page; null/'' = default subtitle shown. */
  description: string | null;
  /** Social links in viewer page header (order preserved). */
  links: ChannelLink[];
  /** Viewer-page color theme (hues only; see @tmw/shared resolveTheme). */
  theme: ChannelTheme;
}

export interface ListedUser {
  userId: string;
  login: string;
  displayName: string;
  /** epoch ms */
  addedAt: number;
  isFounder: boolean;
}

export interface UploadResponse {
  id: string;
  status: SubmissionStatus;
  durationMs: number;
  /** Position in playback queue (1 = next). */
  queuePosition: number;
  /**
   * Seconds this sender must wait before next submission (viewer cooldown).
   * 0 = no cooldown (e.g. channel owner). Client shows a proactive timer
   * right after sending rather than erroring on retry.
   */
  cooldownSec: number;
  /** Sender's stardust balance after crediting this submission. */
  stardustBalance: number;
  /**
   * The caption was dropped so the media could air instantly (channel doesn't auto-approve text).
   * Reported because the client can't always predict it — a link's music/video verdict is server-side.
   */
  captionDropped: boolean;
}

/**
 * Cosmetics bought with stardust (never with money — see CLAUDE.md / product notes). The catalog
 * and its module system live in ./cosmetics; this re-export keeps `@tmw/shared` the single import
 * for COSMETICS, makeParticles, the effect helpers, and the cosmetic types.
 */
export * from './cosmetics';
export * from './displayName';
export * from './dust';
export * from './level';
export * from './realtime';
export * from './roulette';
export * from './theme';

/** Validate a #rrggbb hex color (exactly 6 hex digits, no alpha). */
export function isHexColor(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}

/**
 * Extract a YouTube playlist id from a full URL or a bare id. Accepts the `list=` query param
 * (playlist or watch URLs) or a raw id. Returns null if no plausible id is found.
 */
export function youtubePlaylistId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const fromUrl = s.match(/[?&]list=([A-Za-z0-9_-]+)/);
  const id = fromUrl?.[1] ?? s;
  // Playlist ids are alphanumeric/_/-; typical prefixes PL/UU/OL/RD/FL. Reject anything else.
  return /^[A-Za-z0-9_-]{12,}$/.test(id) ? id : null;
}

export interface SessionUser {
  id: string;
  login: string;
  /** What every surface shows — the provider's name, or a bought one if there is one. */
  displayName: string;
  /** The provider's own name, kept fresh underneath a bought one. Equals displayName unless a name
   *  was bought; that is what the shop card and the hover compare against. */
  platformName: string;
  /** Set when displayName was bought rather than given by the provider. */
  hasCustomName: boolean;
  avatarUrl: string | null;
  /** Founder — redeemed founder promo. Grants badge and grandfathering. */
  isFounder: boolean;
  /** In ADMIN_USER_IDS — may issue promo codes, and may equip/use any cosmetic without owning or
   *  earning it (the shop and /api/cosmetics/equip both honour this). */
  isAdmin: boolean;
  /** Stardust — user's global cosmetic wallet. */
  stardust: number;
  /** Catalog ids the user owns (from COSMETICS). */
  ownedCosmetics: string[];
  /** Account-wide chat messages (summed across channels) — unlocks earned cosmetics (frames). */
  messagesTotal: number;
  /** Account-wide watch time in minutes (summed across channels) — unlocks watch-time frames. */
  watchMinutesTotal: number;
  /** Account-wide submissions sent (all channels, any status, self-sends excluded). */
  submissionsTotal: number;
  /** Lifetime stardust earned (never lowered by spending) — the "hoarded" cosmetic axis. */
  dustEarnedTotal: number;
  /** Lifetime stardust spent, summed over everything owned — unlocks the black hole seal. Climbs
   *  only, because every dust sink is a permanent grant. */
  dustSpentTotal: number;
  /** Per-channel totals for the breadth axis (see BreadthTotals). */
  breadth: BreadthTotals;
  /** Currently equipped cosmetics (nick color, etc.). */
  equipped: EquippedCosmetics;
  /** A Twitch identity opens this account (native or linked) — chat dust reaches it. */
  hasTwitch: boolean;
}

/** One account's card on the "choose primary" page (/link/confirm). */
export interface LinkAccountCard {
  login: string;
  displayName: string;
  avatarUrl: string | null;
  stardust: number;
  /** Cosmetics bought on this account. Shown because the loser's are lost too — the warning says
   *  so, and this is what makes that concrete enough to choose on without reading it. */
  cosmetics: number;
  ownsChannel: boolean;
}

/** Payload of GET /api/auth/link/pending. */
export interface LinkPendingInfo {
  /** The account of the current session (the one that initiated linking). */
  current: LinkAccountCard;
  /** The account the Twitch identity currently opens. */
  other: LinkAccountCard;
}

/** Logged-in streamer's own channel (overlayToken is secret, never expose). */
export interface ChannelSelf {
  id: string;
  overlayToken: string;
}

export interface MeResponse {
  user: SessionUser | null;
  channel: ChannelSelf | null;
}

/** Channel the user can access in dashboard: own or one they moderate. */
export interface AccessibleChannel {
  channelId: string;
  /** Channel owner's login (for public links and title). */
  login: string;
  displayName: string;
  role: 'owner' | 'moderator';
}

export interface ModInviteInfo {
  channelLogin: string;
  channelDisplayName: string;
}

/** Home-page onboarding checklist state (owner-only). */
export interface OnboardingStatus {
  /** An overlay is connected right now, or something has ever been played. */
  overlayAdded: boolean;
  /** At least one submission from a non-owner. */
  hasViewerSend: boolean;
  /** Bot can actually read THIS channel: bot service up AND owner has a linked Twitch identity. */
  botAvailable: boolean;
  botReading: boolean;
  /** The bot's public login whenever the bot service is up — independent of Twitch linking, so the
   *  /mod command can be shown (and pre-run) before the owner links Twitch. Null if no bot. */
  botLogin: string | null;
}

/** Page backgrounds a channel EARNS (never buys) by airing submissions on stream. Ordered by cost.
 *  Shared so the server gate, the settings picker and the Achievements progress all agree on one set
 *  of thresholds. Labels are localized separately (i18n `bg.*`); the client maps id → renderer. */
export interface PageBackgroundDef {
  id: string; // stored in ChannelSettings.pageBackground and rendered by the client
  minPlayed: number; // aired (played, excl. self-sends) submissions needed to unlock it
}
export const PAGE_BACKGROUNDS: readonly PageBackgroundDef[] = [
  { id: 'nebula', minPlayed: 500 },
  { id: 'blackhole', minPlayed: 1000 },
];
/** The background ids a channel with `played` aired submissions has unlocked. */
export function earnedBackgroundIds(played: number): string[] {
  return PAGE_BACKGROUNDS.filter((b) => played >= b.minPlayed).map((b) => b.id);
}

export interface PublicChannelInfo {
  login: string;
  displayName: string;
  /** The streamer's real provider name, sent ONLY when they bought a different one to show. */
  platformName: string | null;
  avatarUrl: string | null;
  /** false = streamer paused submissions. */
  accepting: boolean;
  /** Channel limits — shown to viewer before sending, not errored after. */
  maxDurationMs: number;
  maxAudioDurationMs: number;
  maxFileSizeBytes: number;
  /** Whether Giphy media skips moderation here — viewer page shows honest "instant vs review" copy. */
  autoApproveGifs: boolean;
  /** Whether viewer-written text skips moderation; false = a caption on an instant send is dropped. */
  autoApproveText: boolean;
  /** Whether YouTube links can air unmoderated (music or video) — same caption warning applies. */
  autoApproveYoutube: boolean;
  /** Whether the streamer reads sends aloud (name or message) — drives the voice picker. */
  ttsEnabled: boolean;
  /** Whether the sender may choose where their post lands and how big it is — drives the picker. */
  allowViewerPosition: boolean;
  /**
   * The channel's own media layout — where the sliders in the picker start, so an untouched one
   * shows what will actually happen rather than a made-up number. The anchor also decides whether
   * the margin slider is shown at all: margin is padding on a centred flex container, so on
   * 'center' it moves the card nowhere.
   */
  overlayLayout: OverlayLayout;
  /** The logged-in viewer's own per-channel level (0 = anon/none) — for their header card. */
  viewerLevel: number;
  /** Their raw per-channel XP (0 = anon/none) — feeds the badge hover's "current/next" progress.
   *  Level is xpToLevel(this); the next threshold is levelThreshold(viewerLevel + 1). */
  viewerXp: number;
  isFounder: boolean;
  /** Streamer description; null = viewer sees default subtitle. */
  description: string | null;
  links: ChannelLink[];
  /** Streamer's own equipped cosmetics, shown on their channel header. */
  nickColor: string | null;
  /** Second gradient stop (#rrggbb), null unless they equipped a gradient. */
  nickColor2: string | null;
  /** Whether their gradient drifts (nick-flow). */
  nickFlow: boolean;
  nickEffect: string | null;
  cardEffect: string | null;
  /** Card effect tint (#rrggbb) from the 'card-butterflies-color' upgrade; absent = effect's palette. */
  cardEffectColor?: string | null;
  /** Second tint, for a two-sided effect; absent = the effect's own palette. */
  cardEffectColor2?: string | null;
  /** The page background to render: the streamer's chosen id, but only if the channel has earned it
   *  (see PAGE_BACKGROUNDS); '' otherwise. A reward for airing submissions, never a purchase. */
  pageBackground: string;
  /** Page theme knobs. On a full load the server already inlined these as tokens (see seo.ts);
   *  the client needs them to re-apply after a client-side nav onto this page. */
  theme: ChannelTheme;
}

export interface PromoRedeemResult {
  ok: true;
  /** Redeemed grant type ('founder' | 'stardust') — frontend messages per type. */
  grant: string;
  /** Grant payload (dust granted for 'stardust'); null for grants that carry no amount. */
  amount: number | null;
}

export interface AdminPromoCode {
  code: string;
  grant: string;
  grantAmount: number | null;
  note: string | null;
  createdAt: number;
  maxUses: number;
  usedCount: number;
  /** Set = code is dead (admin revoked it); we never issue a natural expiry. */
  expiresAt: number | null;
}

/** One activation of a promo code, for the admin per-code log. */
export interface AdminPromoRedemption {
  login: string;
  displayName: string;
  createdAt: number;
}

/** One user in the admin support panel. */
export interface AdminUserRow {
  id: string;
  login: string;
  displayName: string;
  avatarUrl: string | null;
  stardust: number;
  isFounder: boolean;
  /** epoch ms */
  createdAt: number;
  /** Providers that open this account ('twitch' | 'google' | 'fake'). */
  identities: string[];
  hasChannel: boolean;
  /** Chat dust waiting in pending_dust for this user's twitch identity. */
  pendingDust: number;
  /** Owned cosmetics count. */
  ownedCosmetics: number;
  /** Submissions that passed moderation (approved + played). */
  accepted: number;
  /** Submissions rejected by moderators. */
  rejected: number;
  /** Lifetime wheel record. Straight off the user row — the spins table is pruned, this is not. */
  rouletteWins: number;
  rouletteLosses: number;
  /** How many channels whitelisted this user. */
  whitelistedIn: number;
  /** How many channels banned this user. */
  bannedIn: number;
  /** Their channel's overlay is connected right now (≈ streaming). */
  isLive: boolean;
}

export type AdminUsersSort = 'created' | 'stardust';

/** One page of the admin user list. `total` drives both the counter and the page count. */
export interface AdminUsersPage {
  rows: AdminUserRow[];
  /** Users matching the current query, across all pages. */
  total: number;
}

/** Users per page in the admin list; shared so the panel can compute the page count itself. */
export const ADMIN_USERS_PAGE_SIZE = 50;

/** A cosmetic one user owns — the inverse of the per-item owner list, which is a refund tool. */
export interface AdminUserCosmetic {
  itemId: string;
  /** epoch ms when bought. */
  ownedAt: number;
  /** Dust actually paid, frozen at purchase (0 for rows predating the column). */
  paidDust: number;
}

/** One catalog id and how many users own it (for the admin ownership / refund view). itemId may no
 *  longer be in the live catalog if the cosmetic was removed — buyers are still owed a refund. */
export interface AdminCosmeticRow {
  itemId: string;
  owners: number;
}

/** A user who owns a given cosmetic, with their current balance so a refund is one click. */
export interface AdminCosmeticOwner {
  userId: string;
  login: string;
  displayName: string;
  avatarUrl: string | null;
  stardust: number;
  /** epoch ms when bought. */
  ownedAt: number;
}

/** A channel whose OBS overlay is connected right now (admin "who's live" view). */
export interface AdminLiveChannel {
  login: string;
  displayName: string;
  avatarUrl: string | null;
  /** Connected overlay sockets (usually 1). */
  overlays: number;
}

/**
 * One connected OBS source in the admin panel. `build` is what lets an admin see who is still on an
 * old overlay bundle — the reason the reload button exists at all (a reload only reaches a socket
 * that is still connected; a dropped overlay revives itself, see the overlay's recovery ladder).
 */
export interface AdminOverlayRow {
  socketId: string;
  login: string;
  displayName: string;
  kind: OverlayKind;
  /** epoch ms of the handshake */
  connectedAt: number;
  /** 'websocket' or 'polling' — a source stuck on polling is the fragile one. */
  transport: string;
  /** Overlay bundle build stamp; null for bundles built before we started sending it. */
  build: string | null;
  /** Media overlay with a post on screen: reloading it replays that post from the top. */
  playing: boolean;
}

/** A twitch login excluded from every channel's leaderboard (bots). */
export interface AdminExclusion {
  login: string;
  note: string | null;
  /** epoch ms */
  createdAt: number;
}

/** Chat bot connection state (admin panel). */
export interface AdminBotStatus {
  connected: boolean;
  /** Twitch login of the bot account, when connected. */
  login: string | null;
}

export type LeaderboardMetric = 'sends' | 'messages' | 'watch' | 'level';
export type LeaderboardPeriod = 'month' | 'all';
/** The stats page and its leaderboards share one window, so they share one type. */
export type StatsPeriod = LeaderboardPeriod;

export interface LeaderboardEntry {
  /**
   * Tossit account id when known; chatters without an account get the synthetic
   * 'twitch:<id>' (their future native id — platform glyph and "you" highlight work).
   */
  userId: string;
  login: string;
  displayName: string;
  /** The real provider name, sent ONLY when it differs from displayName — i.e. when this person
   *  bought a name. Null otherwise, so a tooltip exists exactly where it reveals something. */
  platformName: string | null;
  /** Metric value: plays / messages / watch minutes / level. */
  value: number;
  isFounder: boolean;
  /** Equipped nickname color (#rrggbb), null if none. */
  nickColor: string | null;
  /** Second gradient stop (#rrggbb), null unless a gradient is equipped. */
  nickColor2: string | null;
  /** Whether the gradient drifts (nick-flow). */
  nickFlow: boolean;
  /** Equipped nick effect id, null if none. */
  nickEffect: string | null;
  /** Equipped card effect id, null if none. */
  cardEffect: string | null;
  /** Card effect tint (#rrggbb) from the 'card-butterflies-color' upgrade; absent = effect's palette. */
  cardEffectColor?: string | null;
  /** Second tint, for a two-sided effect; absent = the effect's own palette. */
  cardEffectColor2?: string | null;
  /** Equipped seal id, null if none — shown next to the badges. */
  seal: string | null;
  /** Seal tint (#rrggbb) from the seal's colour upgrade; null = the seal's palette. */
  sealColor: string | null;
  /** Per-channel level 0–10 (0/absent = no rank) — the rarity rail + Roman numeral. */
  level?: number;
}

/** One bucket of the streamer stats charts — a UTC day, or a whole month in the all-time view. */
export interface DailyStat {
  /** 'YYYY-MM-DD' for a day bucket, 'YYYY-MM' for a month one (see StatsSummary.bucket). */
  day: string;
  /** All submissions received that day (any status). */
  submissions: number;
  /** Submissions that played on stream (status='played'). */
  aired: number;
  rejected: number;
  /** Chat messages counted that day (from the chat module; 0 when no chat source). */
  messages: number;
  watchMinutes: number;
}

/** Submission count by media kind. */
export interface KindStat {
  kind: MediaKind;
  count: number;
}

/** Streamer statistics overview (owner-only). Daily series is the last N UTC days, zero-filled. */
export interface StatsSummary {
  /**
   * Window every number below covers, echoed back so the page can label them. 'month' is the current
   * CALENDAR month (UTC), not a rolling 30 days — the leaderboards on the same page already use that
   * window, and two different "months" under one switch would be a lie.
   */
  period: StatsPeriod;
  /** Granularity of `daily`: a bar per day for the month view, per month for all-time. */
  bucket: 'day' | 'month';
  /** Submissions received in the period (any status). */
  submissions: number;
  /** ...of which played on stream. */
  aired: number;
  rejected: number;
  /** Distinct registered senders in the period. */
  uniqueContributors: number;
  /** Chat totals for the period (from the per-day channel counters). */
  messages: number;
  watchMinutes: number;
  /** Today's submissions — the one number that ignores the period, because it says so on the tile. */
  todaySubmissions: number;
  daily: DailyStat[];
  byKind: KindStat[];
}

/** A viewer currently in the live channel's chat. Provider will become switchable later. */
export interface LiveViewer {
  id: string;
  login: string;
  name: string;
}

/** "Who's on stream now" for the streamer console. `live` = OBS overlay connected (platform-agnostic). */
export interface LivePresence {
  live: boolean;
  /** Source of the viewer list; null when no viewer source is available. */
  provider: 'twitch' | null;
  viewers: LiveViewer[];
  /** When the viewer list was last sampled (epoch ms), null if never. */
  updatedAt: number | null;
}

/** Platforms a channel can be watched on — the subset of SOCIAL_PLATFORMS that carries a stream. */
export const STREAM_PLATFORMS = ['twitch', 'youtube'] as const;
export type StreamPlatform = (typeof STREAM_PLATFORMS)[number];

/**
 * One channel in the directory of channels taking sends. `live` means an overlay is connected,
 * which is the closest platform-agnostic signal we have — never a promise that the stream is up,
 * so the UI says "taking sends" rather than "streaming".
 */
export interface DirectoryChannel {
  login: string;
  displayName: string;
  avatarUrl: string | null;
  description: string | null;
  /** Where to watch them: a stream link they listed, else derived from a Twitch login. */
  streamUrl: string | null;
  streamPlatform: StreamPlatform | null;
  live: boolean;
  /**
   * WHICH overlay is connected, not just whether one is. A channel running only the chat overlay is
   * "live" by every signal we have and still cannot show a single submission, so a card that says
   * "takes images, gifs, videos and sounds" is lying to the viewer at exactly the moment they act on
   * it. Meaningless while `live` is false — nothing is connected then, and the card says so already.
   */
  overlayMedia: boolean;
  overlayChat: boolean;
  /** When their last overlay left (epoch ms); null while live, or if it left before we tracked it. */
  lastLiveAt: number | null;
  isFounder: boolean;
  /** Submissions that actually aired here, minus the streamer's own test sends (same rule as the
   *  'sends' board): the one number that says whether this channel really plays what it gets. */
  aired: number;
  /** The limits and opt-ins the expanded card lists — same fields the channel's own header shows. */
  maxDurationMs: number;
  maxAudioDurationMs: number;
  maxFileSizeBytes: number;
  /** Giphy media (GIF/sticker/clip) airs here without review — see ChannelSettings. */
  autoApproveGifs: boolean;
  autoApproveText: boolean;
  autoApproveYoutube: boolean;
  ttsEnabled: boolean;
  allowViewerPosition: boolean;
  /** Their equipped cosmetics, so the card shows the same name and effect the chat overlay does. */
  nickColor: string | null;
  nickColor2: string | null;
  nickFlow: boolean;
  nickEffect: string | null;
  cardEffect: string | null;
  cardEffectColor: string | null;
  cardEffectColor2: string | null;
}

/** Cross-channel user reputation — aggregates across all channels. */
export interface ReputationStats {
  /** Submissions actually shown on streams (status='played'). */
  accepted: number;
  rejected: number;
  /** Channels where viewer is whitelisted. */
  whitelistedChannels: number;
  /** Channels where viewer is banned. */
  bannedChannels: number;
  isFounder: boolean;
}

export interface ApiError {
  error: string;
  /** Machine-readable code for special client handling (e.g. 'cooldown'). */
  code?: string;
  /** For code='cooldown': seconds until retry allowed. */
  retryAfterSec?: number;
}
