ALTER TABLE `channels` ADD `bg_music_display` text DEFAULT 'full' NOT NULL;--> statement-breakpoint
UPDATE `channels` SET `bg_music_display` = 'hidden' WHERE `bg_music_hidden` = 1;
