// Local binding for use in the interfaces below; also re-exported for consumers (see `export *`).
import type { EquippedCosmetics } from './cosmetics';

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
  /** Sender's equipped nick effect id (e.g. 'nick-glow'); absent if none. */
  senderEffect?: string;
  /** Sender's equipped card effect id (e.g. 'card-levitation', 'card-stardust'); absent if none. */
  senderCardEffect?: string;
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

/** Donation integration status (dashboard). Callback model: provider POSTs to us. */
export interface IntegrationStatus {
  provider: string;
  connected: boolean;
  /** Callback URL the streamer sets in Donatello (our public POST endpoint). */
  callbackUrl: string | null;
  /** Secret for X-Key header — verifies request came from Donatello. */
  key: string | null;
}

/** One piece of a chat message: plain text or a native Twitch emote. */
export type ChatFragment =
  | { type: 'text'; text: string }
  | { type: 'emote'; id: string; text: string };

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
  fragments: ChatFragment[];
}

/** Display config for the chat overlay (font size, auto-hide). */
export interface ChatOverlayConfig {
  /** Message font size in px. */
  fontSize: number;
  /** Seconds a message stays before fading out; 0 = keep until pushed off. */
  fadeSeconds: number;
}

export interface ServerToOverlayEvents {
  'media:play': (payload: MediaPlayPayload) => void;
  'media:skip': (submissionId: string) => void;
  /** Channel donation → fullscreen burst FX over media display. */
  'donation:fx': (fx: DonationFx) => void;
  /** Chat display config, sent on connect and whenever settings change. */
  'chat:config': (cfg: ChatOverlayConfig) => void;
  /** New chat line for the chat overlay source. */
  'chat:message': (msg: ChatOverlayMessage) => void;
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
}

export interface SubmissionSummary {
  id: string;
  senderUserId: string | null;
  senderName: string | null;
  /** Sender's equipped nickname color (#rrggbb), null if none/anon. */
  senderColor: string | null;
  /** Sender's equipped nick effect id, null if none. */
  senderEffect: string | null;
  /** Sender's equipped card effect id, null if none. */
  senderCardEffect: string | null;
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

export interface ServerToDashboardEvents {
  'moderation:new': (submission: SubmissionSummary) => void;
  /** Submission left pending (approved/rejected) — remove from list. */
  'moderation:resolved': (submissionId: string) => void;
  'playback:started': (submission: SubmissionSummary) => void;
  'playback:ended': (submissionId: string) => void;
}

export interface ChannelSettings {
  /** Duration cap for video and images, ms. Longer videos are truncated. */
  maxDurationMs: number;
  /** Separate cap for audio (music runs longer than memes), ms. */
  maxAudioDurationMs: number;
  maxFileSizeBytes: number;
  /** Overlay volume, 0-100. */
  volume: number;
  /** Kill switch: false = submissions paused. */
  accepting: boolean;
  /** Streamer opt-in: YouTube submissions skip moderation (go straight to screen). */
  autoApproveYoutube: boolean;
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
  /** Channel description on viewer page; null/'' = default subtitle shown. */
  description: string | null;
  /** Social links in viewer page header (order preserved). */
  links: ChannelLink[];
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

/** Validate a #rrggbb hex color (exactly 6 hex digits, no alpha). */
export function isHexColor(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v);
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
  isFounder: boolean;
  /** Streamer description; null = viewer sees default subtitle. */
  description: string | null;
  links: ChannelLink[];
  /** Streamer's own equipped cosmetics, shown on their channel header. */
  nickColor: string | null;
  nickEffect: string | null;
  cardEffect: string | null;
}

export interface PromoRedeemResult {
  ok: true;
  /** Redeemed grant type ('founder' etc.) — frontend messages per type. */
  grant: string;
}

export interface AdminPromoCode {
  code: string;
  grant: string;
  note: string | null;
  createdAt: number;
  /** Redeemer's login, or null if code unused. */
  redeemedByLogin: string | null;
  redeemedAt: number | null;
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
  /** Equipped nick effect id, null if none. */
  nickEffect: string | null;
  /** Equipped card effect id, null if none. */
  cardEffect: string | null;
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
