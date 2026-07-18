CREATE TABLE `channel_point_connections` (
	`channel_id` text PRIMARY KEY NOT NULL,
	`broadcaster_id` text NOT NULL,
	`enc_tokens` text NOT NULL,
	`external_name` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `channel_point_connections` (`channel_id`, `broadcaster_id`, `enc_tokens`, `external_name`, `created_at`, `updated_at`)
	SELECT `channel_id`, `broadcaster_id`, `enc_tokens`, `external_name`, `created_at`, `updated_at` FROM `channel_point_rewards`;
--> statement-breakpoint
CREATE TABLE `channel_point_rewards_new` (
	`reward_id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channel_point_connections`(`channel_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `channel_point_rewards_new` (`reward_id`, `channel_id`, `kind`, `created_at`, `updated_at`)
	SELECT `reward_id`, `channel_id`, 'stardust', `created_at`, `updated_at` FROM `channel_point_rewards`;
--> statement-breakpoint
DROP TABLE `channel_point_rewards`;
--> statement-breakpoint
ALTER TABLE `channel_point_rewards_new` RENAME TO `channel_point_rewards`;
