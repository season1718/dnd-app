CREATE INDEX `idx_character_spells_character_id` ON `character_spells` (`character_id`);--> statement-breakpoint
CREATE INDEX `idx_spells_level_school` ON `spells` (`level`,`school`);