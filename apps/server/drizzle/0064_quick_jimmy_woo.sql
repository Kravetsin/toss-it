ALTER TABLE `channels` ADD `chat_skip_command` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `channels` ADD `skip_votes_needed` integer DEFAULT 3 NOT NULL;