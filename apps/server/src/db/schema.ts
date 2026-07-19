import { eq, sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, primaryKey } from 'drizzle-orm/sqlite-core';
import type {
  ChannelLink,
  EquippedCosmetics,
  MediaKind,
  MusicTrack,
  OverlayPosition,
  SubmissionStatus,
} from '@tmw/shared';

export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/** id format: 'twitch:<id>', or 'fake:<login>' in dev mode without keys. */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  login: text('login').notNull().unique(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  /** When founder status was granted (via promo code); null = regular user. */
  founderSince: integer('founder_since', { mode: 'timestamp_ms' }),
  /** Global cosmetic currency, earned through activity. */
  stardust: integer('stardust').notNull().default(0),
  /** Equipped cosmetics (nick color, etc.); null = nothing equipped. */
  equipped: text('equipped', { mode: 'json' }).$type<EquippedCosmetics>(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

/**
 * Which provider identity opens which account. One user may have several rows
 * (native + linked); a provider identity maps to exactly one user (PK).
 * Backfilled from users.id ('provider:rest') in migration 0021.
 */
export const linkedIdentities = sqliteTable(
  'linked_identities',
  {
    provider: text('provider').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerId] })],
);

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

/** One per user; overlay_token is the secret for the OBS Browser Source. */
export const channels = sqliteTable('channels', {
  id: text('id').primaryKey(),
  ownerUserId: text('owner_user_id')
    .notNull()
    .unique()
    .references(() => users.id),
  overlayToken: text('overlay_token').notNull().unique(),
  // Limit for video; images and audio have their own (music > memes; images just display a while).
  maxDurationMs: integer('max_duration_ms').notNull().default(15_000),
  /** How long static images and gifs stay on screen. */
  imageDurationMs: integer('image_duration_ms').notNull().default(8_000),
  maxAudioDurationMs: integer('max_audio_duration_ms').notNull().default(60_000),
  maxFileSizeBytes: integer('max_file_size_bytes')
    .notNull()
    .default(50 * 1024 * 1024),
  volume: integer('volume').notNull().default(100),
  accepting: integer('accepting', { mode: 'boolean' }).notNull().default(true),
  // Streamer opt-in: viewer YouTube links bypass moderation. Split by type because a full-screen
  // video can take over the whole stream, while music is a compact corner player — so music defaults
  // ON (low-risk) and video must be enabled deliberately. Music vs video is decided by the YouTube
  // category (music.youtube.com OR category 10), not just the URL.
  autoApproveYoutubeMusic: integer('auto_approve_youtube_music', { mode: 'boolean' })
    .notNull()
    .default(true),
  autoApproveYoutubeVideo: integer('auto_approve_youtube_video', { mode: 'boolean' })
    .notNull()
    .default(false),
  // With auto-approve on, YouTube links this long or shorter air automatically; longer ones fall to
  // moderation instead (a viewer-requested 1h video shouldn't auto-play). Minutes; 1–10.
  youtubeAutoMaxMinutes: integer('youtube_auto_max_minutes').notNull().default(10),
  // Streamer opt-in (default on): GIFs with a safe Giphy rating bypass moderation.
  autoApproveGifs: integer('auto_approve_gifs', { mode: 'boolean' }).notNull().default(true),
  showSenderName: integer('show_sender_name', { mode: 'boolean' }).notNull().default(true),
  // Streamer opt-out: render the Twitch chat (with Tossit cosmetics) in the chat overlay source.
  chatOverlayEnabled: integer('chat_overlay_enabled', { mode: 'boolean' }).notNull().default(true),
  chatFontSize: integer('chat_font_size').notNull().default(19),
  // Seconds before a chat message fades out; 0 = keep until pushed off by newer ones.
  chatFadeSeconds: integer('chat_fade_seconds').notNull().default(0),
  // Chat overlay per-element toggles (all default on): Twitch badges, level numeral, role borders.
  chatShowBadges: integer('chat_show_badges', { mode: 'boolean' }).notNull().default(true),
  chatShowLevel: integer('chat_show_level', { mode: 'boolean' }).notNull().default(true),
  chatRoleBorders: integer('chat_role_borders', { mode: 'boolean' }).notNull().default(true),
  soundAlert: integer('sound_alert', { mode: 'boolean' }).notNull().default(false),
  ttsName: integer('tts_name', { mode: 'boolean' }).notNull().default(false),
  ttsMessage: integer('tts_message', { mode: 'boolean' }).notNull().default(false),
  // Overlay layout: anchor position, size (% of viewport), margin from edge (% of viewport).
  overlayPosition: text('overlay_position').$type<OverlayPosition>().notNull().default('center'),
  overlaySize: integer('overlay_size').notNull().default(80),
  overlayMargin: integer('overlay_margin').notNull().default(0),
  // Separate layout for the music player when musicSeparate; otherwise inherits overlay*.
  musicSeparate: integer('music_separate', { mode: 'boolean' }).notNull().default(false),
  musicPosition: text('music_position').$type<OverlayPosition>().notNull().default('center'),
  musicSize: integer('music_size').notNull().default(80),
  musicMargin: integer('music_margin').notNull().default(0),
  // Background music: last imported playlist id (source) + the owned editable track list.
  bgMusicPlaylist: text('bg_music_playlist'),
  bgMusicTracks: text('bg_music_tracks', { mode: 'json' })
    .$type<MusicTrack[]>()
    .notNull()
    .default(sql`'[]'`),
  bgMusicShuffle: integer('bg_music_shuffle', { mode: 'boolean' }).notNull().default(false),
  bgMusicVolume: integer('bg_music_volume').notNull().default(50),
  bgMusicHidden: integer('bg_music_hidden', { mode: 'boolean' }).notNull().default(false),
  /** Streamer hid the earned galaxy background (a preference; the earn gate is the played count). */
  nebulaHidden: integer('nebula_hidden', { mode: 'boolean' }).notNull().default(false),
  description: text('description'),
  links: text('links', { mode: 'json' })
    .$type<ChannelLink[]>()
    .notNull()
    .default(sql`'[]'`),
  // Channel page theme (see @tmw/shared resolveTheme): the streamer picks hues, we own lightness.
  // null = knob untouched, so the hand-tuned index.css token is left alone rather than regenerated.
  accentHue: integer('accent_hue'),
  bgHue: integer('bg_hue'),
  bgTint: integer('bg_tint').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

/**
 * Donation-service links (Donatello etc.). Money never flows through us; we listen
 * to donation events and turn them into overlay effects. Token is AES-GCM encrypted.
 */
export const channelIntegrations = sqliteTable(
  'channel_integrations',
  {
    channelId: text('channel_id')
      .notNull()
      .references(() => channels.id),
    /** Provider: 'donatello' | ... (one per provider per channel). */
    provider: text('provider').notNull(),
    /** Encrypted provider API token. Never sent to the client. */
    encToken: text('enc_token').notNull(),
    /** Provider account name (from /me), for "Connected as X". */
    externalName: text('external_name'),
    /** Dedup cursor: pubId of the last processed donation. */
    lastDonationId: text('last_donation_id'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.channelId, t.provider] })],
);

/**
 * Channel-points opt-in: the streamer's OAuth token, one per channel. Our app creates and OWNS
 * custom rewards on their channel (needs the `channel:manage:redemptions` token, stored encrypted so
 * we can refresh it, fulfill redemptions, and delete rewards on disconnect). The rewards themselves
 * live in channelPointRewards (many per channel, different kinds).
 */
export const channelPointConnections = sqliteTable('channel_point_connections', {
  channelId: text('channel_id')
    .primaryKey()
    .references(() => channels.id),
  /** Raw numeric Twitch id of the broadcaster (the rewards live on this channel). */
  broadcasterId: text('broadcaster_id').notNull(),
  /** AES-GCM encrypted JSON {accessToken, refreshToken}; never sent to the client. */
  encTokens: text('enc_tokens').notNull(),
  /** Broadcaster login/name for the dashboard's "Connected as X". */
  externalName: text('external_name'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

/**
 * One app-owned channel-point reward. Many per channel; `kind` routes a redemption to its handler
 * ('stardust' = buy dust, 'youtube' = submit a YouTube link). Cost is not stored — read live from the
 * redemption event so a streamer editing the price in Twitch just works.
 */
export const channelPointRewards = sqliteTable('channel_point_rewards', {
  /** Id of the custom reward we created — the redemption subscription filters on it. */
  rewardId: text('reward_id').primaryKey(),
  channelId: text('channel_id')
    .notNull()
    .references(() => channelPointConnections.channelId),
  /** 'stardust' | 'youtube'. */
  kind: text('kind').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

/** Whitelist: these viewers' submissions go on screen without moderation. */
export const whitelist = sqliteTable(
  'whitelist',
  {
    channelId: text('channel_id')
      .notNull()
      .references(() => channels.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.channelId, t.userId] })],
);

/** Bans: submissions silently rejected (viewer still sees the normal "pending"). */
export const bans = sqliteTable(
  'bans',
  {
    channelId: text('channel_id')
      .notNull()
      .references(() => channels.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.channelId, t.userId] })],
);

/** Moderators: same moderation access as owner, but not settings/token. */
export const channelModerators = sqliteTable(
  'channel_moderators',
  {
    channelId: text('channel_id')
      .notNull()
      .references(() => channels.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.channelId, t.userId] })],
);

/**
 * Global leaderboard exclusions (admin-managed): twitch logins hidden from every
 * channel's leaderboard, and skipped by chat collection/dust. login is lowercase.
 */
export const leaderboardExclusions = sqliteTable('leaderboard_exclusions', {
  login: text('login').primaryKey(),
  /** Display name the admin typed / last seen — for the admin list only. */
  note: text('note'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

/** One-time moderator invites (TTL ~1h; deleted on accept). */
export const modInvites = sqliteTable('mod_invites', {
  token: text('token').primaryKey(),
  channelId: text('channel_id')
    .notNull()
    .references(() => channels.id),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

/**
 * Promo codes issued by admin, redeemable up to maxUses times.
 * Who redeemed what lives in promoRedemptions, not here.
 */
export const promoCodes = sqliteTable('promo_codes', {
  code: text('code').primaryKey(),
  grant: text('grant').notNull().default('founder'),
  /** Grant payload (dust amount for 'stardust'); null for grants that carry no amount. */
  grantAmount: integer('grant_amount'),
  /** Admin note (internal only, never exposed). */
  note: text('note'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  /** null = no expiry. Admin revoke sets this to now, which the redeem check already rejects. */
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
  maxUses: integer('max_uses').notNull().default(1),
  /** Claimed seats; redeem is refused once it reaches maxUses. */
  usedCount: integer('used_count').notNull().default(0),
});

/** One row per (code, user) — the PK is what stops a viewer redeeming the same code twice. */
export const promoRedemptions = sqliteTable(
  'promo_redemptions',
  {
    code: text('code')
      .notNull()
      .references(() => promoCodes.code),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.code, t.userId] })],
);

/**
 * Per-channel chat activity counters (leaderboard: messages / watch time),
 * keyed by platform identity — chatters often have no Tossit account.
 * month = 'YYYY-MM' (UTC); "all time" is summed across months at query time.
 */
export const channelActivity = sqliteTable(
  'channel_activity',
  {
    channelId: text('channel_id').notNull(),
    platform: text('platform').notNull(),
    platformUserId: text('platform_user_id').notNull(),
    month: text('month').notNull(),
    /** Last seen chatter name/login — render without extra provider lookups. */
    displayName: text('display_name').notNull(),
    login: text('login').notNull(),
    messages: integer('messages').notNull().default(0),
    watchMinutes: integer('watch_minutes').notNull().default(0),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.channelId, t.platform, t.platformUserId, t.month] }),
    index('idx_channel_activity_top').on(t.channelId, t.month),
  ],
);

/**
 * Per-channel per-day chat activity (channel totals, not per-user) for the streamer stats charts.
 * channel_activity is monthly only, so daily message/watch series live here. day = 'YYYY-MM-DD'
 * (UTC). Submission counts per day come from the submissions table directly (no bucket needed).
 */
export const channelDaily = sqliteTable(
  'channel_daily',
  {
    channelId: text('channel_id').notNull(),
    day: text('day').notNull(),
    messages: integer('messages').notNull().default(0),
    watchMinutes: integer('watch_minutes').notNull().default(0),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.channelId, t.day] })],
);

/**
 * Stardust earned by a platform identity (chat bot) with no user row yet.
 * Claimed and deleted at first login with that identity. platform: 'twitch' | ...
 */
export const pendingDust = sqliteTable(
  'pending_dust',
  {
    platform: text('platform').notNull(),
    platformUserId: text('platform_user_id').notNull(),
    amount: integer('amount').notNull().default(0),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.platform, t.platformUserId] })],
);

/** Cosmetics a user owns (bought with stardust). itemId = catalog id from COSMETICS. */
export const userCosmetics = sqliteTable(
  'user_cosmetics',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    itemId: text('item_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.itemId] })],
);

export const submissions = sqliteTable(
  'submissions',
  {
    id: text('id').primaryKey(),
    channelId: text('channel_id').notNull(),
    senderUserId: text('sender_user_id'),
    senderName: text('sender_name'),
    /** Original filename, metadata only; never used in paths. */
    originalName: text('original_name').notNull(),
    /** Storage path relative to media root. NULL after ephemeral file deletion or for text-only. */
    filePath: text('file_path'),
    /** Caption for a file, or body of a text-only submission (kind='text'). */
    text: text('text'),
    mime: text('mime').notNull(),
    kind: text('kind').$type<MediaKind>().notNull(),
    durationMs: integer('duration_ms').notNull(),
    status: text('status').$type<SubmissionStatus>().notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    /** YouTube video id (kind='youtube'), else null. No file; played via embedded player. */
    youtubeId: text('youtube_id'),
    /** YouTube start second from the link timecode. */
    youtubeStart: integer('youtube_start').notNull().default(0),
    /** Giphy id (kind='gif'), else null. No file; rendered from Giphy's CDN. */
    giphyId: text('giphy_id'),
    /** TTS voice picked by the sender (catalog id from ttsVoices), null = auto by language. */
    ttsVoice: text('tts_voice'),
    /**
     * The channel owner sending to their own channel (tests, mostly). Derived at insert, never
     * taken from the client. Plays for real, but counts nowhere and the sweep drops the row.
     */
    isSelfSend: integer('is_self_send', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [
    index('idx_submissions_channel_status').on(t.channelId, t.status),
    // Cleanup sweep runs channel-agnostic queries; without these it full-scans
    // the ever-growing history every cycle (Turso bills rows read).
    index('idx_submissions_status_created').on(t.status, t.createdAt),
    index('idx_submissions_files')
      .on(t.status, t.updatedAt)
      .where(sql`file_path IS NOT NULL`),
  ],
);

/**
 * Belongs in the WHERE of every read that counts submissions (history, stats, levels, leaderboards,
 * limits). Playback is the one place that must NOT use it — a self-send has to actually play.
 */
export const excludeSelfSends = eq(submissions.isSelfSend, false);

export type UserRow = typeof users.$inferSelect;
export type UserCosmeticRow = typeof userCosmetics.$inferSelect;
export type ChannelRow = typeof channels.$inferSelect;
export type SubmissionRow = typeof submissions.$inferSelect;
export type ChannelModeratorRow = typeof channelModerators.$inferSelect;
export type ChannelIntegrationRow = typeof channelIntegrations.$inferSelect;
export type ChannelPointConnectionRow = typeof channelPointConnections.$inferSelect;
export type ChannelPointRewardRow = typeof channelPointRewards.$inferSelect;
export type ModInviteRow = typeof modInvites.$inferSelect;
export type PromoCodeRow = typeof promoCodes.$inferSelect;
export type PromoRedemptionRow = typeof promoRedemptions.$inferSelect;
