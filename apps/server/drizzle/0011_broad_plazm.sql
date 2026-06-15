CREATE TABLE `promo_codes` (
	`code` text PRIMARY KEY NOT NULL,
	`grant` text DEFAULT 'founder' NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	`redeemed_by_user_id` text,
	`redeemed_at` integer,
	FOREIGN KEY (`redeemed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `users` ADD `founder_since` integer;