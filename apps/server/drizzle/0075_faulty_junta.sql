CREATE TABLE `dust_gifts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`from_user_id` text NOT NULL,
	`to_platform` text NOT NULL,
	`to_platform_user_id` text NOT NULL,
	`to_user_id` text,
	`amount` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_dust_gifts_from` ON `dust_gifts` (`from_user_id`,`created_at`);