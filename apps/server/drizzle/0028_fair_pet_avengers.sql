ALTER TABLE `channels` ADD `bg_music_playlist` text;--> statement-breakpoint
ALTER TABLE `channels` ADD `bg_music_volume` integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE `channels` ADD `bg_music_hidden` integer DEFAULT false NOT NULL;