DROP TABLE `roulette_seeds`;--> statement-breakpoint
ALTER TABLE `roulette_spins` DROP COLUMN `seed_hash`;--> statement-breakpoint
ALTER TABLE `roulette_spins` DROP COLUMN `nonce`;