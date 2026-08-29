CREATE TABLE `name_changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`paid_dust` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `users` ADD `platform_name` text;--> statement-breakpoint
ALTER TABLE `users` ADD `custom_name_at` integer;--> statement-breakpoint
--> nobody owns a bought name yet, so today's displayed name IS the provider's
UPDATE `users` SET `platform_name` = `display_name` WHERE `platform_name` IS NULL;