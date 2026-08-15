import { env } from "cloudflare:workers";

let initialized = false;

const statements = [
  `CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, global_role TEXT NOT NULL DEFAULT 'USER', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS campaigns (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS campaign_members (campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE, profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, role TEXT NOT NULL, joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (campaign_id, profile_id))`,
  `CREATE TABLE IF NOT EXISTS characters (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE, kind TEXT NOT NULL DEFAULT 'PC', name TEXT NOT NULL, species TEXT NOT NULL DEFAULT '', background TEXT NOT NULL DEFAULT '', alignment TEXT NOT NULL DEFAULT '', experience INTEGER NOT NULL DEFAULT 0, strength INTEGER NOT NULL DEFAULT 10, dexterity INTEGER NOT NULL DEFAULT 10, constitution INTEGER NOT NULL DEFAULT 10, intelligence INTEGER NOT NULL DEFAULT 10, wisdom INTEGER NOT NULL DEFAULT 10, charisma INTEGER NOT NULL DEFAULT 10, armor_class INTEGER NOT NULL DEFAULT 10, speed INTEGER NOT NULL DEFAULT 30, maximum_hp INTEGER NOT NULL DEFAULT 1, current_hp INTEGER NOT NULL DEFAULT 1, temporary_hp INTEGER NOT NULL DEFAULT 0, inspiration INTEGER NOT NULL DEFAULT 0, death_successes INTEGER NOT NULL DEFAULT 0, death_failures INTEGER NOT NULL DEFAULT 0, coins_json TEXT NOT NULL DEFAULT '{}', equipment_json TEXT NOT NULL DEFAULT '[]', notes_json TEXT NOT NULL DEFAULT '[]', source TEXT NOT NULL DEFAULT 'DND_COMPANION', revision TEXT NOT NULL DEFAULT '', spellbook_revision TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS character_assignments (character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE, profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, PRIMARY KEY (character_id, profile_id))`,
  `CREATE TABLE IF NOT EXISTS character_classes (id TEXT PRIMARY KEY, character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE, class_key TEXT NOT NULL, class_name TEXT NOT NULL, subclass_name TEXT NOT NULL DEFAULT '', level INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS character_resources (id TEXT PRIMARY KEY, character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE, name TEXT NOT NULL, maximum INTEGER NOT NULL, spent INTEGER NOT NULL DEFAULT 0, reset_on TEXT NOT NULL DEFAULT 'MANUAL')`,
  `CREATE TABLE IF NOT EXISTS character_sections (character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE, section TEXT NOT NULL, data_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (character_id, section))`,
  `CREATE TABLE IF NOT EXISTS spells (id TEXT PRIMARY KEY, name_en TEXT NOT NULL, name_ru TEXT NOT NULL DEFAULT '', level INTEGER NOT NULL, school TEXT NOT NULL, casting_time TEXT NOT NULL, range TEXT NOT NULL, components TEXT NOT NULL, duration TEXT NOT NULL, classes_json TEXT NOT NULL DEFAULT '[]', description TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'CUSTOM', source_book TEXT NOT NULL DEFAULT '', source_page INTEGER, created_by_profile_id TEXT REFERENCES profiles(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS spell_overrides (spell_id TEXT PRIMARY KEY REFERENCES spells(id) ON DELETE CASCADE, patch_json TEXT NOT NULL DEFAULT '{}', base_snapshot_json TEXT NOT NULL DEFAULT '{}', base_catalog_version TEXT NOT NULL DEFAULT '', updated_by_profile_id TEXT REFERENCES profiles(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_spells_name_en_source ON spells(name_en, source)`,
  `CREATE TABLE IF NOT EXISTS character_spells (character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE, spell_id TEXT NOT NULL REFERENCES spells(id) ON DELETE CASCADE, known INTEGER NOT NULL DEFAULT 0, prepared INTEGER NOT NULL DEFAULT 0, always_prepared INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (character_id, spell_id))`,
  `CREATE TABLE IF NOT EXISTS spell_slot_pools (character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE, pool TEXT NOT NULL DEFAULT 'STANDARD', level INTEGER NOT NULL, maximum INTEGER NOT NULL DEFAULT 0, spent INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (character_id, pool, level))`,
  `CREATE INDEX IF NOT EXISTS idx_character_spells_character_id ON character_spells(character_id)`,
  `CREATE INDEX IF NOT EXISTS idx_spells_level_school ON spells(level,school)`,
];

export async function ensureDatabase() {
  if (initialized) return;
  await env.DB.batch(statements.map((statement) => env.DB.prepare(statement)));
  const columns = (await env.DB.prepare("PRAGMA table_info(characters)").all()).results as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "revision")) await env.DB.prepare("ALTER TABLE characters ADD COLUMN revision TEXT NOT NULL DEFAULT ''").run();
  if (!columns.some((column) => column.name === "spellbook_revision")) await env.DB.prepare("ALTER TABLE characters ADD COLUMN spellbook_revision TEXT NOT NULL DEFAULT ''").run();
  if (!columns.some((column) => column.name === "portrait_data_url")) await env.DB.prepare("ALTER TABLE characters ADD COLUMN portrait_data_url TEXT NOT NULL DEFAULT ''").run();
  const spellColumns = (await env.DB.prepare("PRAGMA table_info(spells)").all()).results as Array<{ name: string }>;
  if (!spellColumns.some((column) => column.name === "source_book")) await env.DB.prepare("ALTER TABLE spells ADD COLUMN source_book TEXT NOT NULL DEFAULT ''").run();
  if (!spellColumns.some((column) => column.name === "source_page")) await env.DB.prepare("ALTER TABLE spells ADD COLUMN source_page INTEGER").run();
  await env.DB.prepare(`UPDATE character_resources AS kept SET maximum=(SELECT MAX(other.maximum) FROM character_resources other WHERE other.character_id=kept.character_id AND LOWER(TRIM(other.name))=LOWER(TRIM(kept.name))),spent=(SELECT MAX(other.spent) FROM character_resources other WHERE other.character_id=kept.character_id AND LOWER(TRIM(other.name))=LOWER(TRIM(kept.name)))`).run();
  await env.DB.prepare(`DELETE FROM character_resources WHERE rowid NOT IN (SELECT MIN(rowid) FROM character_resources GROUP BY character_id,LOWER(TRIM(name)))`).run();
  await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_character_resources_character_name ON character_resources(character_id,name COLLATE NOCASE)").run();
  initialized = true;
}
