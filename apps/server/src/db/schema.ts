import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, primaryKey } from 'drizzle-orm/sqlite-core';
import type {
  ChannelLink,
  EquippedCosmetics,
  MediaKind,
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
  // Limit for video and images; audio has its own, longer limit (music > memes).
  maxDurationMs: integer('max_duration_ms').notNull().default(15_000),
  maxAudioDurationMs: integer('max_audio_duration_ms').notNull().default(60_000),
  maxFileSizeBytes: integer('max_file_size_bytes')
    .notNull()
    .default(50 * 1024 * 1024),
  volume: integer('volume').notNull().default(100),
  accepting: integer('accepting', { mode: 'boolean' }).notNull().default(true),
  // Streamer opt-in: YouTube links bypass moderation (they're already moderated by YouTube).
  autoApproveYoutube: integer('auto_approve_youtube', { mode: 'boolean' }).notNull().default(false),
  // Streamer opt-in (default on): GIFs with a safe Giphy rating bypass moderation.
  autoApproveGifs: integer('auto_approve_gifs', { mode: 'boolean' }).notNull().default(true),
  showSenderName: integer('show_sender_name', { mode: 'boolean' }).notNull().default(true),
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
  description: text('description'),
  links: text('links', { mode: 'json' })
    .$type<ChannelLink[]>()
    .notNull()
    .default(sql`'[]'`),
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
 * One-time founder promo codes, issued by admin. Row kept on redemption
 * (not deleted); redeemedByUserId records who/when for audit.
 */
export const promoCodes = sqliteTable('promo_codes', {
  code: text('code').primaryKey(),
  grant: text('grant').notNull().default('founder'),
  /** Admin note (internal only, never exposed). */
  note: text('note'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  /** null = no expiry. */
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
  /** Who redeemed; null = unused. */
  redeemedByUserId: text('redeemed_by_user_id').references(() => users.id),
  redeemedAt: integer('redeemed_at', { mode: 'timestamp_ms' }),
});

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
  },
  (t) => [index('idx_submissions_channel_status').on(t.channelId, t.status)],
);

export type UserRow = typeof users.$inferSelect;
export type UserCosmeticRow = typeof userCosmetics.$inferSelect;
export type ChannelRow = typeof channels.$inferSelect;
export type SubmissionRow = typeof submissions.$inferSelect;
export type ChannelModeratorRow = typeof channelModerators.$inferSelect;
export type ChannelIntegrationRow = typeof channelIntegrations.$inferSelect;
export type ModInviteRow = typeof modInvites.$inferSelect;
export type PromoCodeRow = typeof promoCodes.$inferSelect;
