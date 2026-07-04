CREATE TABLE `channel_activity` (
	`channel_id` text NOT NULL,
	`platform` text NOT NULL,
	`platform_user_id` text NOT NULL,
	`month` text NOT NULL,
	`display_name` text NOT NULL,
	`login` text NOT NULL,
	`messages` integer DEFAULT 0 NOT NULL,
	`watch_minutes` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`channel_id`, `platform`, `platform_user_id`, `month`)
);
--> statement-breakpoint
CREATE INDEX `idx_channel_activity_top` ON `channel_activity` (`channel_id`,`month`);