CREATE TABLE `linked_identities` (
	`provider` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`provider`, `provider_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `linked_identities` (`provider`, `provider_id`, `user_id`, `created_at`)
SELECT substr(`id`, 1, instr(`id`, ':') - 1), substr(`id`, instr(`id`, ':') + 1), `id`, `created_at`
FROM `users` WHERE instr(`id`, ':') > 0;
