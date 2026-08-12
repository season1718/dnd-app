CREATE TABLE `spell_overrides` (
	`spell_id` text PRIMARY KEY NOT NULL,
	`patch_json` text DEFAULT '{}' NOT NULL,
	`base_snapshot_json` text DEFAULT '{}' NOT NULL,
	`base_catalog_version` text DEFAULT '' NOT NULL,
	`updated_by_profile_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`spell_id`) REFERENCES `spells`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by_profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
