CREATE TABLE `campaign_members` (
	`campaign_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`role` text NOT NULL,
	`joined_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`campaign_id`, `profile_id`),
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `character_assignments` (
	`character_id` text NOT NULL,
	`profile_id` text NOT NULL,
	PRIMARY KEY(`character_id`, `profile_id`),
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `character_classes` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`class_key` text NOT NULL,
	`class_name` text NOT NULL,
	`subclass_name` text DEFAULT '' NOT NULL,
	`level` integer NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `character_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`name` text NOT NULL,
	`maximum` integer NOT NULL,
	`spent` integer DEFAULT 0 NOT NULL,
	`reset_on` text DEFAULT 'MANUAL' NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `character_spells` (
	`character_id` text NOT NULL,
	`spell_id` text NOT NULL,
	`known` integer DEFAULT false NOT NULL,
	`prepared` integer DEFAULT false NOT NULL,
	`always_prepared` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`character_id`, `spell_id`),
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`spell_id`) REFERENCES `spells`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `characters` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`kind` text DEFAULT 'PC' NOT NULL,
	`name` text NOT NULL,
	`species` text DEFAULT '' NOT NULL,
	`background` text DEFAULT '' NOT NULL,
	`alignment` text DEFAULT '' NOT NULL,
	`experience` integer DEFAULT 0 NOT NULL,
	`strength` integer DEFAULT 10 NOT NULL,
	`dexterity` integer DEFAULT 10 NOT NULL,
	`constitution` integer DEFAULT 10 NOT NULL,
	`intelligence` integer DEFAULT 10 NOT NULL,
	`wisdom` integer DEFAULT 10 NOT NULL,
	`charisma` integer DEFAULT 10 NOT NULL,
	`armor_class` integer DEFAULT 10 NOT NULL,
	`speed` integer DEFAULT 30 NOT NULL,
	`maximum_hp` integer DEFAULT 1 NOT NULL,
	`current_hp` integer DEFAULT 1 NOT NULL,
	`temporary_hp` integer DEFAULT 0 NOT NULL,
	`inspiration` integer DEFAULT false NOT NULL,
	`death_successes` integer DEFAULT 0 NOT NULL,
	`death_failures` integer DEFAULT 0 NOT NULL,
	`coins_json` text DEFAULT '{"cp":0,"sp":0,"ep":0,"gp":0,"pp":0}' NOT NULL,
	`equipment_json` text DEFAULT '[]' NOT NULL,
	`notes_json` text DEFAULT '[]' NOT NULL,
	`source` text DEFAULT 'DND_COMPANION' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`global_role` text DEFAULT 'USER' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_profiles_name` ON `profiles` (`name`);--> statement-breakpoint
CREATE TABLE `spell_slot_pools` (
	`character_id` text NOT NULL,
	`pool` text DEFAULT 'STANDARD' NOT NULL,
	`level` integer NOT NULL,
	`maximum` integer DEFAULT 0 NOT NULL,
	`spent` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`character_id`, `pool`, `level`),
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `spells` (
	`id` text PRIMARY KEY NOT NULL,
	`name_en` text NOT NULL,
	`name_ru` text DEFAULT '' NOT NULL,
	`level` integer NOT NULL,
	`school` text NOT NULL,
	`casting_time` text NOT NULL,
	`range` text NOT NULL,
	`components` text NOT NULL,
	`duration` text NOT NULL,
	`classes_json` text DEFAULT '[]' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'CUSTOM' NOT NULL,
	`created_by_profile_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`created_by_profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_spells_name_en_source` ON `spells` (`name_en`,`source`);