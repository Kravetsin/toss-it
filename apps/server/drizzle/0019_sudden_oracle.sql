CREATE TABLE `pending_dust` (
	`platform` text NOT NULL,
	`platform_user_id` text NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`platform`, `platform_user_id`)
);
--> statement-breakpoint
ALTER TABLE `channels` ADD `chat_dust_enabled` integer DEFAULT false NOT NULL;