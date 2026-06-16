ALTER TABLE `submissions` ADD `youtube_id` text;--> statement-breakpoint
ALTER TABLE `submissions` ADD `youtube_start` integer DEFAULT 0 NOT NULL;