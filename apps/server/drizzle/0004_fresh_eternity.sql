ALTER TABLE `channels` ADD `max_duration_ms` integer DEFAULT 15000 NOT NULL;--> statement-breakpoint
ALTER TABLE `channels` ADD `max_file_size_bytes` integer DEFAULT 52428800 NOT NULL;--> statement-breakpoint
ALTER TABLE `channels` ADD `volume` integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE `channels` ADD `accepting` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `channels` ADD `show_sender_name` integer DEFAULT true NOT NULL;