CREATE TABLE `roulette_seeds` (
	`seed_hash` text PRIMARY KEY NOT NULL,
	`seed` text,
	`nonce` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`revealed_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_roulette_seed_live` ON `roulette_seeds` (`revealed_at`);--> statement-breakpoint
CREATE TABLE `roulette_spins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel_id` text,
	`platform` text NOT NULL,
	`platform_user_id` text NOT NULL,
	`user_id` text,
	`stake` integer NOT NULL,
	`bet_color` text NOT NULL,
	`slot` integer NOT NULL,
	`payout` integer NOT NULL,
	`seed_hash` text NOT NULL,
	`nonce` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_roulette_spins_channel` ON `roulette_spins` (`channel_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `channels` ADD `chat_roulette_command` integer DEFAULT false NOT NULL;