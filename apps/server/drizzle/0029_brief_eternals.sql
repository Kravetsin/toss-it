ALTER TABLE `channels` ADD `bg_music_tracks` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `channels` ADD `bg_music_shuffle` integer DEFAULT false NOT NULL;