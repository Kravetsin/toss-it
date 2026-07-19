-- Music player size was never surfaced in the UI, so every row still holds the old default (80).
-- Now that size is actually rendered, 80 would blow the compact music player up to 80% of the
-- screen — reset all rows to the compact music size.
UPDATE `channels` SET `music_size` = 20;
--> statement-breakpoint
-- The background music player used to be hard-coded bottom-left. It now follows the music layout, so
-- give it a bottom-left corner by default for channels that never used a separate music layout
-- (music_* was unused there, so this only positions the background player, not song requests).
-- Channels that opted into a separate layout keep their chosen anchor.
UPDATE `channels` SET `music_position` = 'bottom-left', `music_margin` = 2 WHERE `music_separate` = 0;
