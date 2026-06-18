ALTER TABLE `channels` ADD `description` text;--> statement-breakpoint
ALTER TABLE `channels` ADD `links` text DEFAULT '[]' NOT NULL;