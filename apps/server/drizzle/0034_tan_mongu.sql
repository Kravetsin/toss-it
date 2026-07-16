CREATE TABLE `promo_redemptions` (
	`code` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`code`, `user_id`),
	FOREIGN KEY (`code`) REFERENCES `promo_codes`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `promo_codes` ADD `grant_amount` integer;--> statement-breakpoint
ALTER TABLE `promo_codes` ADD `max_uses` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `promo_codes` ADD `used_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
INSERT INTO `promo_redemptions` (`code`, `user_id`, `created_at`)
SELECT `code`, `redeemed_by_user_id`, COALESCE(`redeemed_at`, `created_at`)
FROM `promo_codes` WHERE `redeemed_by_user_id` IS NOT NULL;--> statement-breakpoint
UPDATE `promo_codes` SET `used_count` = 1 WHERE `redeemed_by_user_id` IS NOT NULL;