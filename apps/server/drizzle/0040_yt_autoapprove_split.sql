ALTER TABLE `channels` ADD `auto_approve_youtube_music` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `channels` ADD `auto_approve_youtube_video` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `channels` SET `auto_approve_youtube_music` = `auto_approve_youtube`, `auto_approve_youtube_video` = `auto_approve_youtube`;--> statement-breakpoint
ALTER TABLE `channels` DROP COLUMN `auto_approve_youtube`;
