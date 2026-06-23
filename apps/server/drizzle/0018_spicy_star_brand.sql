ALTER TABLE `channels` ADD `auto_approve_gifs` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `submissions` ADD `giphy_id` text;