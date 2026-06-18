import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, primaryKey } from 'drizzle-orm/sqlite-core';
import type { ChannelLink, MediaKind, OverlayPosition, SubmissionStatus } from '@tmw/shared';

/**
 * Служебная таблица «ключ-значение»: health-check и прочая мелочь.
 */
export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/** Учётка Twitch. id: 'twitch:<id>' или 'fake:<login>' в dev-режиме без ключей. */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  login: text('login').notNull().unique(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  /** Время выдачи статуса «первопроходец» (через промокод); null — обычный пользователь. */
  founderSince: integer('founder_since', { mode: 'timestamp_ms' }),
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

/** Канал стримера. Один на пользователя; overlay_token — секрет для OBS Browser Source. */
export const channels = sqliteTable('channels', {
  id: text('id').primaryKey(),
  ownerUserId: text('owner_user_id')
    .notNull()
    .unique()
    .references(() => users.id),
  overlayToken: text('overlay_token').notNull().unique(),
  // Настройки канала (правятся в дашборде).
  // Лимит для видео и картинок; у аудио свой, более длинный (музыка длиннее мемов).
  maxDurationMs: integer('max_duration_ms').notNull().default(15_000),
  maxAudioDurationMs: integer('max_audio_duration_ms').notNull().default(60_000),
  maxFileSizeBytes: integer('max_file_size_bytes').notNull().default(50 * 1024 * 1024),
  volume: integer('volume').notNull().default(100),
  accepting: integer('accepting', { mode: 'boolean' }).notNull().default(true),
  showSenderName: integer('show_sender_name', { mode: 'boolean' }).notNull().default(true),
  soundAlert: integer('sound_alert', { mode: 'boolean' }).notNull().default(false),
  ttsName: integer('tts_name', { mode: 'boolean' }).notNull().default(false),
  ttsMessage: integer('tts_message', { mode: 'boolean' }).notNull().default(false),
  // Раскладка оверлея: якорь-позиция, размер (% вьюпорта) и отступ от края (% вьюпорта).
  overlayPosition: text('overlay_position').$type<OverlayPosition>().notNull().default('center'),
  overlaySize: integer('overlay_size').notNull().default(80),
  overlayMargin: integer('overlay_margin').notNull().default(0),
  // Отдельная раскладка для музыкального плеера (если musicSeparate, иначе наследует overlay*).
  musicSeparate: integer('music_separate', { mode: 'boolean' }).notNull().default(false),
  musicPosition: text('music_position').$type<OverlayPosition>().notNull().default('center'),
  musicSize: integer('music_size').notNull().default(80),
  musicMargin: integer('music_margin').notNull().default(0),
  // Публичный профиль (правится в дашборде, показывается зрителю в шапке).
  description: text('description'),
  links: text('links', { mode: 'json' })
    .$type<ChannelLink[]>()
    .notNull()
    .default(sql`'[]'`),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

/** Белый список: отправки этих зрителей идут на экран без модерации. */
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

/** Баны: отправки молчаливо отклоняются (зритель видит обычный «ждёт модерации»). */
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

/** Модераторы канала: имеют тот же доступ к модерации, что и владелец (но не к настройкам/токену). */
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

/** Одноразовые инвайты в модераторы (TTL ~1ч; удаляются при принятии). */
export const modInvites = sqliteTable('mod_invites', {
  token: text('token').primaryKey(),
  channelId: text('channel_id')
    .notNull()
    .references(() => channels.id),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

/**
 * Одноразовые промокоды для статуса «первопроходец». Выпускает админ.
 * Строку не удаляем при гашении — помечаем redeemedByUserId (аудит «кто/когда»).
 */
export const promoCodes = sqliteTable('promo_codes', {
  code: text('code').primaryKey(),
  grant: text('grant').notNull().default('founder'),
  /** Заметка админа («для стримера X») — для себя, наружу не светится. */
  note: text('note'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  /** null — бессрочно. */
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
  /** Кто погасил; null — код ещё не использован. */
  redeemedByUserId: text('redeemed_by_user_id').references(() => users.id),
  redeemedAt: integer('redeemed_at', { mode: 'timestamp_ms' }),
});

export const submissions = sqliteTable(
  'submissions',
  {
    id: text('id').primaryKey(),
    channelId: text('channel_id').notNull(),
    senderUserId: text('sender_user_id'),
    senderName: text('sender_name'),
    /** Оригинальное имя файла — только как метаданные, в путях не используется. */
    originalName: text('original_name').notNull(),
    /** Путь в хранилище относительно корня медиа. NULL после эфемерного удаления файла или для текста-онли. */
    filePath: text('file_path'),
    /** Текст: подпись к файлу или тело текста-онли (kind='text'). */
    text: text('text'),
    mime: text('mime').notNull(),
    kind: text('kind').$type<MediaKind>().notNull(),
    durationMs: integer('duration_ms').notNull(),
    status: text('status').$type<SubmissionStatus>().notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    /** YouTube: id видео (kind='youtube'), иначе null. Файла нет — играем встроенным плеером. */
    youtubeId: text('youtube_id'),
    /** YouTube: старт-секунда из таймкода ссылки. */
    youtubeStart: integer('youtube_start').notNull().default(0),
  },
  (t) => [index('idx_submissions_channel_status').on(t.channelId, t.status)],
);

export type UserRow = typeof users.$inferSelect;
export type ChannelRow = typeof channels.$inferSelect;
export type SubmissionRow = typeof submissions.$inferSelect;
export type ChannelModeratorRow = typeof channelModerators.$inferSelect;
export type ModInviteRow = typeof modInvites.$inferSelect;
export type PromoCodeRow = typeof promoCodes.$inferSelect;
