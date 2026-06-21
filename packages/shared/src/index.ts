export type MediaKind = 'image' | 'video' | 'audio' | 'text' | 'youtube';

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

export interface ServerToOverlayEvents {
  'media:play': (payload: MediaPlayPayload) => void;
  'media:skip': (submissionId: string) => void;
  /** Channel donation → fullscreen burst FX over media display. */
  'donation:fx': (fx: DonationFx) => void;
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
  showSenderName: boolean;
  soundAlert: boolean;
  ttsName: boolean;
  ttsMessage: boolean;
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
 * Cosmetics bought with stardust (never with money — see CLAUDE.md / product notes).
 * Catalog lives here in code; the DB stores only ownership + equip state.
 */
/**
 * Cosmetic categories: nick color, nick effects (glow on the name), and card effects
 * (animation across the whole submission card / leaderboard row).
 */
export type CosmeticType = 'nick_color' | 'nick_effect' | 'card_effect';

export interface CosmeticItem {
  /** Stable catalog id; stored in user_cosmetics. */
  id: string;
  type: CosmeticType;
  /** Price in stardust. */
  costDust: number;
}

/** Single source of truth for buyable cosmetics. */
export const COSMETICS: CosmeticItem[] = [
  { id: 'nick-color', type: 'nick_color', costDust: 100 },
  { id: 'nick-glow', type: 'nick_effect', costDust: 150 },
  { id: 'card-levitation', type: 'card_effect', costDust: 250 },
  { id: 'card-stardust', type: 'card_effect', costDust: 350 },
];

/** What a user currently has equipped (one slot per category). */
export interface EquippedCosmetics {
  /** Free-form #rrggbb nickname color; requires owning the 'nick-color' item. */
  nickColor?: string | null;
  /** Equipped nick effect item id (e.g. 'nick-glow'); requires owning it. */
  nickEffect?: string | null;
  /** Equipped card effect item id (e.g. 'card-levitation', 'card-stardust'); requires owning it. */
  cardEffect?: string | null;
}

/** Validate a #rrggbb hex color (exactly 6 hex digits, no alpha). */
export function isHexColor(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}

/** Whether an id is a buyable cosmetic of the given type. */
export function isCosmeticOfType(id: string, type: CosmeticType): boolean {
  return COSMETICS.some((c) => c.id === id && c.type === type);
}

/**
 * Inline styles for one card-effect particle, randomized so the swarm looks organic instead
 * of a looped GIF: random column, speed, size, drift/angle, and a NEGATIVE delay so each
 * particle starts mid-flight (desynced from the others). Keys are camelCase / CSS custom
 * properties, usable directly as a React style object or via element.style in the overlay.
 * Generate once per mount (the values are random each call).
 */
export function makeParticles(effect: string, count: number): Record<string, string>[] {
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  return Array.from({ length: count }, (): Record<string, string> => {
    if (effect === 'card-stardust') {
      // Meteors share one fixed direction (set in CSS so the streak points the way it flies);
      // only the spawn point, length, speed and phase are random.
      const dur = rnd(1.8, 3.0);
      return {
        left: `${rnd(-10, 92).toFixed(1)}%`,
        top: `${rnd(-25, 35).toFixed(1)}%`,
        height: `${rnd(16, 28).toFixed(0)}px`,
        animationDuration: `${dur.toFixed(2)}s`,
        animationDelay: `${(-rnd(0, dur)).toFixed(2)}s`,
      };
    }
    const dur = rnd(2.8, 4.6);
    return {
      left: `${rnd(2, 98).toFixed(1)}%`,
      '--drift': `${rnd(-18, 18).toFixed(0)}px`,
      '--s': rnd(0.65, 1.35).toFixed(2),
      animationDuration: `${dur.toFixed(2)}s`,
      animationDelay: `${(-rnd(0, dur)).toFixed(2)}s`,
    };
  });
}

/** Returned by /api/cosmetics/buy and /equip — the user's post-mutation cosmetic state. */
export interface CosmeticStateResponse {
  stardust: number;
  ownedCosmetics: string[];
  equipped: EquippedCosmetics;
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
  isFounder: boolean;
  /** Streamer description; null = viewer sees default subtitle. */
  description: string | null;
  links: ChannelLink[];
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

export interface LeaderboardEntry {
  userId: string;
  login: string;
  displayName: string;
  /** How many of this viewer's media actually played on stream. */
  count: number;
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
