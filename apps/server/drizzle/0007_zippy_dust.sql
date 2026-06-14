ALTER TABLE `channels` ADD `overlay_position` text DEFAULT 'center' NOT NULL;--> statement-breakpoint
ALTER TABLE `channels` ADD `overlay_size` integer DEFAULT 80 NOT NULL;--> statement-breakpoint
ALTER TABLE `channels` ADD `overlay_margin` integer DEFAULT 0 NOT NULL;