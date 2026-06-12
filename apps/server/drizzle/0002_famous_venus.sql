CREATE TABLE `channels` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`overlay_token` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `channels_owner_user_id_unique` ON `channels` (`owner_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `channels_overlay_token_unique` ON `channels` (`overlay_token`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`login` text NOT NULL,
	`display_name` text NOT NULL,
	`avatar_url` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_login_unique` ON `users` (`login`);--> statement-breakpoint
ALTER TABLE `submissions` ADD `sender_user_id` text;