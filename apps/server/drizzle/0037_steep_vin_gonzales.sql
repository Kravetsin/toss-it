CREATE TABLE `channel_point_rewards` (
	`channel_id` text PRIMARY KEY NOT NULL,
	`broadcaster_id` text NOT NULL,
	`reward_id` text NOT NULL,
	`enc_tokens` text NOT NULL,
	`external_name` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action
);
