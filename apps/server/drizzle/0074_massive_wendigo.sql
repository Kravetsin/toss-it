PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`overlay_token` text NOT NULL,
	`max_duration_ms` integer DEFAULT 15000 NOT NULL,
	`image_duration_ms` integer DEFAULT 8000 NOT NULL,
	`max_audio_duration_ms` integer DEFAULT 60000 NOT NULL,
	`max_file_size_bytes` integer DEFAULT 52428800 NOT NULL,
	`volume` integer DEFAULT 100 NOT NULL,
	`accepting` integer DEFAULT true NOT NULL,
	`auto_approve_youtube_music` integer DEFAULT true NOT NULL,
	`auto_approve_youtube_video` integer DEFAULT false NOT NULL,
	`youtube_auto_max_minutes` integer DEFAULT 10 NOT NULL,
	`auto_approve_gifs` integer DEFAULT true NOT NULL,
	`auto_approve_text` integer DEFAULT false NOT NULL,
	`show_sender_name` integer DEFAULT true NOT NULL,
	`chat_overlay_enabled` integer DEFAULT true NOT NULL,
	`chat_bot_replies` integer DEFAULT false NOT NULL,
	`chat_play_command` integer DEFAULT false NOT NULL,
	`chat_tts_command` integer DEFAULT false NOT NULL,
	`chat_skip_command` integer DEFAULT false NOT NULL,
	`chat_roulette_command` integer DEFAULT true NOT NULL,
	`skip_votes_needed` integer DEFAULT 3 NOT NULL,
	`bot_locale` text DEFAULT 'ru' NOT NULL,
	`chat_font_size` integer DEFAULT 19 NOT NULL,
	`chat_bg_opacity` integer DEFAULT 58 NOT NULL,
	`chat_gap` integer DEFAULT 40 NOT NULL,
	`chat_radius` integer DEFAULT 12 NOT NULL,
	`chat_compact` integer DEFAULT false NOT NULL,
	`chat_fade_seconds` integer DEFAULT 0 NOT NULL,
	`chat_show_badges` integer DEFAULT true NOT NULL,
	`chat_show_level` integer DEFAULT true NOT NULL,
	`chat_role_borders` integer DEFAULT true NOT NULL,
	`sound_alert` integer DEFAULT false NOT NULL,
	`tts_name` integer DEFAULT false NOT NULL,
	`tts_message` integer DEFAULT false NOT NULL,
	`overlay_position` text DEFAULT 'center' NOT NULL,
	`overlay_size` integer DEFAULT 80 NOT NULL,
	`overlay_margin` integer DEFAULT 0 NOT NULL,
	`allow_viewer_position` integer DEFAULT false NOT NULL,
	`youtube_as_music` integer DEFAULT true NOT NULL,
	`parallel_slots` integer DEFAULT true NOT NULL,
	`music_separate` integer DEFAULT false NOT NULL,
	`music_position` text DEFAULT 'center' NOT NULL,
	`music_size` integer DEFAULT 80 NOT NULL,
	`music_margin` integer DEFAULT 0 NOT NULL,
	`bg_music_playlist` text,
	`bg_music_tracks` text DEFAULT '[]' NOT NULL,
	`bg_music_shuffle` integer DEFAULT false NOT NULL,
	`bg_music_volume` integer DEFAULT 50 NOT NULL,
	`bg_music_hidden` integer DEFAULT false NOT NULL,
	`bg_music_display` text DEFAULT 'full' NOT NULL,
	`nebula_hidden` integer DEFAULT false NOT NULL,
	`page_background` text DEFAULT '' NOT NULL,
	`description` text,
	`links` text DEFAULT '[]' NOT NULL,
	`accent_hue` integer,
	`bg_hue` integer,
	`bg_tint` integer DEFAULT 0 NOT NULL,
	`last_live_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_channels`("id", "owner_user_id", "overlay_token", "max_duration_ms", "image_duration_ms", "max_audio_duration_ms", "max_file_size_bytes", "volume", "accepting", "auto_approve_youtube_music", "auto_approve_youtube_video", "youtube_auto_max_minutes", "auto_approve_gifs", "auto_approve_text", "show_sender_name", "chat_overlay_enabled", "chat_bot_replies", "chat_play_command", "chat_tts_command", "chat_skip_command", "chat_roulette_command", "skip_votes_needed", "bot_locale", "chat_font_size", "chat_bg_opacity", "chat_gap", "chat_radius", "chat_compact", "chat_fade_seconds", "chat_show_badges", "chat_show_level", "chat_role_borders", "sound_alert", "tts_name", "tts_message", "overlay_position", "overlay_size", "overlay_margin", "allow_viewer_position", "youtube_as_music", "parallel_slots", "music_separate", "music_position", "music_size", "music_margin", "bg_music_playlist", "bg_music_tracks", "bg_music_shuffle", "bg_music_volume", "bg_music_hidden", "bg_music_display", "nebula_hidden", "page_background", "description", "links", "accent_hue", "bg_hue", "bg_tint", "last_live_at", "created_at") SELECT "id", "owner_user_id", "overlay_token", "max_duration_ms", "image_duration_ms", "max_audio_duration_ms", "max_file_size_bytes", "volume", "accepting", "auto_approve_youtube_music", "auto_approve_youtube_video", "youtube_auto_max_minutes", "auto_approve_gifs", "auto_approve_text", "show_sender_name", "chat_overlay_enabled", "chat_bot_replies", "chat_play_command", "chat_tts_command", "chat_skip_command", "chat_roulette_command", "skip_votes_needed", "bot_locale", "chat_font_size", "chat_bg_opacity", "chat_gap", "chat_radius", "chat_compact", "chat_fade_seconds", "chat_show_badges", "chat_show_level", "chat_role_borders", "sound_alert", "tts_name", "tts_message", "overlay_position", "overlay_size", "overlay_margin", "allow_viewer_position", "youtube_as_music", "parallel_slots", "music_separate", "music_position", "music_size", "music_margin", "bg_music_playlist", "bg_music_tracks", "bg_music_shuffle", "bg_music_volume", "bg_music_hidden", "bg_music_display", "nebula_hidden", "page_background", "description", "links", "accent_hue", "bg_hue", "bg_tint", "last_live_at", "created_at" FROM `channels`;--> statement-breakpoint
DROP TABLE `channels`;--> statement-breakpoint
ALTER TABLE `__new_channels` RENAME TO `channels`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `channels_owner_user_id_unique` ON `channels` (`owner_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `channels_overlay_token_unique` ON `channels` (`overlay_token`);
--> statement-breakpoint
--> the recreate above copies the old values, so every existing channel would land on 0 and lose a
--> command its chat is already using — a gate fix must not read as a feature being taken away
UPDATE `channels` SET `chat_roulette_command` = 1;
