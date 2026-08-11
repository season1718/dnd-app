import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  globalRole: text("global_role", { enum: ["USER", "OVERSEER"] }).notNull().default("USER"),
  ...timestamps,
}, (table) => [uniqueIndex("idx_profiles_name").on(table.name)]);

export const campaigns = sqliteTable("campaigns", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  ...timestamps,
});

export const campaignMembers = sqliteTable("campaign_members", {
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["PLAYER", "GM"] }).notNull(),
  joinedAt: text("joined_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [primaryKey({ columns: [table.campaignId, table.profileId] })]);

export const characters = sqliteTable("characters", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["PC", "NPC"] }).notNull().default("PC"),
  name: text("name").notNull(),
  species: text("species").notNull().default(""),
  background: text("background").notNull().default(""),
  alignment: text("alignment").notNull().default(""),
  experience: integer("experience").notNull().default(0),
  strength: integer("strength").notNull().default(10),
  dexterity: integer("dexterity").notNull().default(10),
  constitution: integer("constitution").notNull().default(10),
  intelligence: integer("intelligence").notNull().default(10),
  wisdom: integer("wisdom").notNull().default(10),
  charisma: integer("charisma").notNull().default(10),
  armorClass: integer("armor_class").notNull().default(10),
  speed: integer("speed").notNull().default(30),
  maximumHp: integer("maximum_hp").notNull().default(1),
  currentHp: integer("current_hp").notNull().default(1),
  temporaryHp: integer("temporary_hp").notNull().default(0),
  inspiration: integer("inspiration", { mode: "boolean" }).notNull().default(false),
  deathSuccesses: integer("death_successes").notNull().default(0),
  deathFailures: integer("death_failures").notNull().default(0),
  coinsJson: text("coins_json").notNull().default('{"cp":0,"sp":0,"ep":0,"gp":0,"pp":0}'),
  equipmentJson: text("equipment_json").notNull().default("[]"),
  notesJson: text("notes_json").notNull().default("[]"),
  source: text("source").notNull().default("DND_COMPANION"),
  ...timestamps,
});

export const characterAssignments = sqliteTable("character_assignments", {
  characterId: text("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
  profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
}, (table) => [primaryKey({ columns: [table.characterId, table.profileId] })]);

export const characterClasses = sqliteTable("character_classes", {
  id: text("id").primaryKey(),
  characterId: text("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
  classKey: text("class_key").notNull(),
  className: text("class_name").notNull(),
  subclassName: text("subclass_name").notNull().default(""),
  level: integer("level").notNull(),
});

export const characterResources = sqliteTable("character_resources", {
  id: text("id").primaryKey(),
  characterId: text("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  maximum: integer("maximum").notNull(),
  spent: integer("spent").notNull().default(0),
  resetOn: text("reset_on", { enum: ["SHORT_REST", "LONG_REST", "MANUAL"] }).notNull().default("MANUAL"),
});

export const characterSections = sqliteTable("character_sections", {
  characterId: text("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
  section: text("section").notNull(),
  dataJson: text("data_json").notNull().default("{}"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [primaryKey({ columns: [table.characterId, table.section] })]);

export const spells = sqliteTable("spells", {
  id: text("id").primaryKey(),
  nameEn: text("name_en").notNull(),
  nameRu: text("name_ru").notNull().default(""),
  level: integer("level").notNull(),
  school: text("school").notNull(),
  castingTime: text("casting_time").notNull(),
  range: text("range").notNull(),
  components: text("components").notNull(),
  duration: text("duration").notNull(),
  classesJson: text("classes_json").notNull().default("[]"),
  description: text("description").notNull().default(""),
  source: text("source").notNull().default("CUSTOM"),
  createdByProfileId: text("created_by_profile_id").references(() => profiles.id),
  ...timestamps,
}, (table) => [uniqueIndex("idx_spells_name_en_source").on(table.nameEn, table.source), index("idx_spells_level_school").on(table.level, table.school)]);

export const characterSpells = sqliteTable("character_spells", {
  characterId: text("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
  spellId: text("spell_id").notNull().references(() => spells.id, { onDelete: "cascade" }),
  known: integer("known", { mode: "boolean" }).notNull().default(false),
  prepared: integer("prepared", { mode: "boolean" }).notNull().default(false),
  alwaysPrepared: integer("always_prepared", { mode: "boolean" }).notNull().default(false),
}, (table) => [primaryKey({ columns: [table.characterId, table.spellId] }), index("idx_character_spells_character_id").on(table.characterId)]);

export const spellSlotPools = sqliteTable("spell_slot_pools", {
  characterId: text("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
  pool: text("pool", { enum: ["STANDARD", "PACT", "SPECIAL"] }).notNull().default("STANDARD"),
  level: integer("level").notNull(),
  maximum: integer("maximum").notNull().default(0),
  spent: integer("spent").notNull().default(0),
}, (table) => [primaryKey({ columns: [table.characterId, table.pool, table.level] })]);
