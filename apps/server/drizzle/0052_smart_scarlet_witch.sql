CREATE TABLE `submission_payouts` (
	`submission_id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`sender_platform_user_id` text NOT NULL,
	`broadcaster_id` text NOT NULL,
	`dust` integer NOT NULL,
	`reward_id` text,
	`redemption_id` text,
	`created_at` integer NOT NULL,
	`settled_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payouts_redemption` ON `submission_payouts` (`redemption_id`) WHERE redemption_id IS NOT NULL;