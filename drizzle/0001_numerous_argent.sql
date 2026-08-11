CREATE TABLE `character_sections` (
	`character_id` text NOT NULL,
	`section` text NOT NULL,
	`data_json` text DEFAULT '{}' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`character_id`, `section`),
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
