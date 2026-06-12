import { sqliteTable, text, integer, index, primaryKey } from 'drizzle-orm/sqlite-core';
import type { MediaKind, SubmissionStatus } from '@tmw/shared';

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
  maxDurationMs: integer('max_duration_ms').notNull().default(15_000),
  maxFileSizeBytes: integer('max_file_size_bytes').notNull().default(50 * 1024 * 1024),
  volume: integer('volume').notNull().default(100),
  accepting: integer('accepting', { mode: 'boolean' }).notNull().default(true),
  showSenderName: integer('show_sender_name', { mode: 'boolean' }).notNull().default(true),
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

export const submissions = sqliteTable(
  'submissions',
  {
    id: text('id').primaryKey(),
    channelId: text('channel_id').notNull(),
    senderUserId: text('sender_user_id'),
    senderName: text('sender_name'),
    /** Оригинальное имя файла — только как метаданные, в путях не используется. */
    originalName: text('original_name').notNull(),
    /** Путь в хранилище относительно корня медиа. NULL после эфемерного удаления файла. */
    filePath: text('file_path'),
    mime: text('mime').notNull(),
    kind: text('kind').$type<MediaKind>().notNull(),
    durationMs: integer('duration_ms').notNull(),
    status: text('status').$type<SubmissionStatus>().notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('idx_submissions_channel_status').on(t.channelId, t.status)],
);

export type UserRow = typeof users.$inferSelect;
export type ChannelRow = typeof channels.$inferSelect;
export type SubmissionRow = typeof submissions.$inferSelect;
