CREATE TABLE `channel_daily` (
	`channel_id` text NOT NULL,
	`day` text NOT NULL,
	`messages` integer DEFAULT 0 NOT NULL,
	`watch_minutes` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`channel_id`, `day`)
);
