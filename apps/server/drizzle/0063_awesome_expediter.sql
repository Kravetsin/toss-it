CREATE TABLE `chat_moderator_sightings` (
	`channel_id` text NOT NULL,
	`platform` text NOT NULL,
	`platform_user_id` text NOT NULL,
	`seen_at` integer NOT NULL,
	PRIMARY KEY(`channel_id`, `platform`, `platform_user_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_chat_mod_sightings_user` ON `chat_moderator_sightings` (`platform`,`platform_user_id`);