PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_promo_codes` (
	`code` text PRIMARY KEY NOT NULL,
	`grant` text DEFAULT 'founder' NOT NULL,
	`grant_amount` integer,
	`note` text,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	`max_uses` integer DEFAULT 1 NOT NULL,
	`used_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_promo_codes`("code", "grant", "grant_amount", "note", "created_at", "expires_at", "max_uses", "used_count") SELECT "code", "grant", "grant_amount", "note", "created_at", "expires_at", "max_uses", "used_count" FROM `promo_codes`;--> statement-breakpoint
DROP TABLE `promo_codes`;--> statement-breakpoint
ALTER TABLE `__new_promo_codes` RENAME TO `promo_codes`;--> statement-breakpoint
PRAGMA foreign_keys=ON;