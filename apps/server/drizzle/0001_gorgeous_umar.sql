CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`sender_name` text,
	`original_name` text NOT NULL,
	`file_path` text,
	`mime` text NOT NULL,
	`kind` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_submissions_channel_status` ON `submissions` (`channel_id`,`status`);