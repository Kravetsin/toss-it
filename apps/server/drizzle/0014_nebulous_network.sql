CREATE TABLE `channel_integrations` (
	`channel_id` text NOT NULL,
	`provider` text NOT NULL,
	`enc_token` text NOT NULL,
	`external_name` text,
	`last_donation_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`channel_id`, `provider`),
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action
);
