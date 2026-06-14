ALTER TABLE `channels` ADD `music_separate` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `channels` ADD `music_position` text DEFAULT 'center' NOT NULL;--> statement-breakpoint
ALTER TABLE `channels` ADD `music_size` integer DEFAULT 80 NOT NULL;--> statement-breakpoint
ALTER TABLE `channels` ADD `music_margin` integer DEFAULT 0 NOT NULL;