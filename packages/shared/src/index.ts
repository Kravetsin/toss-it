// Local bindings for use in the interfaces below; also re-exported for consumers (see `export *`).
import type { EquippedCosmetics } from './cosmetics';
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

/** Max message/caption length; validated on both client and server. */
export const TEXT_MAX_LEN = 280;

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
  position: OverlayPosition;
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
  | { type: 'mention'; text: string };

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
  fragments: ChatFragment[];
}

/** Display config for the chat overlay (font size, auto-hide, per-element toggles). */
export interface ChatOverlayConfig {
  /** Message font size in px. */
  fontSize: number;
  /** Seconds a message stays before fading out; 0 = keep until pushed off. */
  fadeSeconds: number;
  /** Render native Twitch badges next to the nick. */
  showBadges: boolean;
  /** Render the numeric level (Roman numeral) before the nick — star is unaffected. */
  showLevel: boolean;
  /** Tint the message border by role (broadcaster/mod/vip/sub). */
  roleBorders: boolean;
}

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
  /** Hide the player in OBS (audio-only) — it keeps playing, just not visible. */
  hidden: boolean;
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

/** Background-music dashboard payload: the owned track list plus the DJ knobs (shuffle/volume/hidden).
 *  Accessible to the owner AND moderators, so a mod can run the music without settings/token access. */
export interface MusicDashboard {
  tracks: MusicTrack[];
  shuffle: boolean;
  volume: number;
  hidden: boolean;
}

/** Build the overlay's music config from a channel's stored background-music fields. The background
 *  player always uses the music layout block (music*); the musicSeparate toggle only decides whether
 *  song-request cards share it (that choice is applied server-side when a submission plays). */
export function musicConfigFrom(ch: {
  bgMusicTracks: MusicTrack[];
  bgMusicPlaylist: string | null;
  bgMusicShuffle: boolean;
  bgMusicVolume: number;
  bgMusicHidden: boolean;
  musicPosition: OverlayPosition;
  musicSize: number;
  musicMargin: number;
}): MusicConfig {
  return {
    trackIds: ch.bgMusicTracks.map((t) => t.videoId),
    playlistId: ch.bgMusicPlaylist,
    shuffle: ch.bgMusicShuffle,
    volume: ch.bgMusicVolume,
    hidden: ch.bgMusicHidden,
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

export interface ServerToOverlayEvents {
  'media:play': (payload: MediaPlayPayload) => void;
  'media:skip': (submissionId: string) => void;
  /** Pause/resume the current show (dashboard → overlay). Skip is media:skip. */
  'media:control': (action: 'pause' | 'resume') => void;
  /** Live content volume (0-100) applied to the current show — the dashboard's now-playing slider. */
  'media:volume': (volume: number) => void;
  /** Seek the current show to `seconds` (video/audio/YouTube only) — the now-playing scrub bar. */
  'media:seek': (seconds: number) => void;
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

export interface OverlayToServerEvents {
  'playback:done': (submissionId: string) => void;
  /** Overlay learned real clip duration (YouTube: only during playback). */
  'playback:duration': (submissionId: string, durationMs: number) => void;
  /** Live position of the current show, throttled; relayed to the dashboard's progress bar. */
  'playback:progress': (p: PlaybackProgress) => void;
  /** Background-music player state, relayed to the dashboard. */
  'music:state': (state: MusicState) => void;
}

export interface SubmissionSummary {
  id: string;
  senderUserId: string | null;
  senderName: string | null;
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
}

/** Live position of whatever is currently on the overlay — drives the dashboard's progress bar. */
export interface PlaybackProgress {
  submissionId: string;
  positionMs: number;
  /** Total length; 0 = unknown yet (e.g. a YouTube clip still loading). */
  durationMs: number;
  paused: boolean;
}

export interface ServerToDashboardEvents {
  'moderation:new': (submission: SubmissionSummary) => void;
  /** Submission left pending (approved/rejected) — remove from list. */
  'moderation:resolved': (submissionId: string) => void;
  'playback:started': (submission: SubmissionSummary) => void;
  'playback:ended': (submissionId: string) => void;
  /** The waiting queue changed (item added/played/reordered) — full ordered list, next-first. */
  'playback:queue': (queue: SubmissionSummary[]) => void;
  /** Live progress of the current show (relayed from the overlay), for the now-playing controls. */
  'playback:progress': (p: PlaybackProgress) => void;
  /** Live background-music player state (relayed from the overlay). */
  'music:state': (state: MusicState) => void;
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
  /** Streamer opt-in: GIFs with a safe Giphy rating skip moderation (risky ones still queue). */
  autoApproveGifs: boolean;
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
  /** Chat overlay message font size, px. */
  chatFontSize: number;
  /** Chat overlay: seconds before a message fades out; 0 = keep until pushed off. */
  chatFadeSeconds: number;
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
  /** Hide the background-music player in OBS (audio keeps playing). */
  bgMusicHidden: boolean;
  /** Hide the earned galaxy page background even after unlocking it (a preference, not the gate). */
  nebulaHidden: boolean;
  /** Derived (read-only): whether the galaxy background has been unlocked (>= NEBULA_MIN_PLAYED aired).
   *  Drives the settings picker — you can only choose a background you've actually earned. */
  nebulaEarned: boolean;
  /** Channel description on viewer page; null/'' = default subtitle shown. */
  description: string | null;
  /** Social links in viewer page header (order preserved). */
  links: ChannelLink[];
  /** Viewer-page color theme (hues only; see @tmw/shared resolveTheme). */
  theme: ChannelTheme;
}

export interface HistoryEntry extends SubmissionSummary {
  status: SubmissionStatus;
  isFounder: boolean;
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
}

/**
 * Cosmetics bought with stardust (never with money — see CLAUDE.md / product notes). The catalog
 * and its module system live in ./cosmetics; this re-export keeps `@tmw/shared` the single import
 * for COSMETICS, makeParticles, the effect helpers, and the cosmetic types.
 */
export * from './cosmetics';
export * from './dust';
export * from './level';
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
  displayName: string;
  avatarUrl: string | null;
  /** Founder — redeemed founder promo. Grants badge and grandfathering. */
  isFounder: boolean;
  /** In ADMIN_USER_IDS — may issue promo codes. */
  isAdmin: boolean;
  /** Stardust — user's global cosmetic wallet. */
  stardust: number;
  /** Catalog ids the user owns (from COSMETICS). */
  ownedCosmetics: string[];
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
  /** Chat bot is configured server-side (step hidden otherwise). */
  botAvailable: boolean;
  botReading: boolean;
}

/** Played (aired) submissions a channel needs before the galaxy page background unlocks. Shared so
 *  the server gate and the dashboard "Achievements" progress agree on one number. */
export const NEBULA_MIN_PLAYED = 500;

export interface PublicChannelInfo {
  login: string;
  displayName: string;
  avatarUrl: string | null;
  /** false = streamer paused submissions. */
  accepting: boolean;
  /** Channel limits — shown to viewer before sending, not errored after. */
  maxDurationMs: number;
  maxAudioDurationMs: number;
  maxFileSizeBytes: number;
  /** Whether safe-rated GIFs skip moderation here — viewer page shows honest "instant vs review" copy. */
  autoApproveGifs: boolean;
  /** Whether the streamer reads sends aloud (name or message) — drives the voice picker. */
  ttsEnabled: boolean;
  /** The logged-in viewer's own per-channel level (0 = anon/none) — for their header card. */
  viewerLevel: number;
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
  /** Earned page background: the galaxy shows once the channel has reached the played-submission
   *  milestone (see NEBULA_MIN_PLAYED on the server). A reward, not a purchase. */
  nebula: boolean;
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
  /** How many channels whitelisted this user. */
  whitelistedIn: number;
  /** How many channels banned this user. */
  bannedIn: number;
  /** Their channel's overlay is connected right now (≈ streaming). */
  isLive: boolean;
}

export type AdminUsersSort = 'created' | 'stardust';

/** A channel whose OBS overlay is connected right now (admin "who's live" view). */
export interface AdminLiveChannel {
  login: string;
  displayName: string;
  avatarUrl: string | null;
  /** Connected overlay sockets (usually 1). */
  overlays: number;
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

export interface LeaderboardEntry {
  /**
   * Tossit account id when known; chatters without an account get the synthetic
   * 'twitch:<id>' (their future native id — platform glyph and "you" highlight work).
   */
  userId: string;
  login: string;
  displayName: string;
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
  /** Per-channel level 0–10 (0/absent = no rank) — the rarity rail + Roman numeral. */
  level?: number;
}

/** One UTC day bucket for the streamer stats charts. */
export interface DailyStat {
  /** 'YYYY-MM-DD' (UTC). */
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
  totalSubmissions: number;
  totalAired: number;
  totalRejected: number;
  monthSubmissions: number;
  todaySubmissions: number;
  /** Distinct registered senders (by account id) all-time. */
  uniqueContributors: number;
  /** Chat totals for the current UTC month (from channel activity). */
  monthMessages: number;
  monthWatchMinutes: number;
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
