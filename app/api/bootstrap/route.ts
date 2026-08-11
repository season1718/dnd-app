import { env } from "cloudflare:workers";
import { ensureDatabase } from "../../../db/bootstrap";

const ids = { player: "profile-ori", gm: "profile-gm", overseer: "profile-overseer", campaign: "campaign-lss", character: "character-ori", npc: "character-mirena" };

export async function GET(request: Request) {
  await ensureDatabase();
  const existing = await env.DB.prepare("SELECT id FROM profiles LIMIT 1").first();
  if (!existing) {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO profiles (id,name,global_role) VALUES (?,?,?)").bind(ids.player, "Ори Картанг", "USER"),
      env.DB.prepare("INSERT INTO profiles (id,name,global_role) VALUES (?,?,?)").bind(ids.gm, "Мастер", "USER"),
      env.DB.prepare("INSERT INTO profiles (id,name,global_role) VALUES (?,?,?)").bind(ids.overseer, "Overseer", "OVERSEER"),
      env.DB.prepare("INSERT INTO campaigns (id,name,description) VALUES (?,?,?)").bind(ids.campaign, "Long Story Short", "Туманный город"),
      env.DB.prepare("INSERT INTO campaign_members (campaign_id,profile_id,role) VALUES (?,?,?)").bind(ids.campaign, ids.player, "PLAYER"),
      env.DB.prepare("INSERT INTO campaign_members (campaign_id,profile_id,role) VALUES (?,?,?)").bind(ids.campaign, ids.gm, "GM"),
      env.DB.prepare("INSERT INTO characters (id,campaign_id,name,species,background,alignment,experience,strength,dexterity,constitution,intelligence,wisdom,charisma,armor_class,speed,maximum_hp,current_hp,coins_json,notes_json,source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(ids.character, ids.campaign, "Ори Картанг", "Дварф", "Стражник", "Нейтральный злой", 200, 15, 12, 15, 11, 12, 10, 16, 30, 12, 12, '{"cp":0,"sp":0,"ep":0,"gp":16,"pp":0}', '["Кол-во использований «Второго дыхания»: 2"]', "LONG_STORY_SHORT_V2"),
      env.DB.prepare("INSERT INTO character_assignments (character_id,profile_id) VALUES (?,?)").bind(ids.character, ids.player),
      env.DB.prepare("INSERT INTO character_classes (id,character_id,class_key,class_name,level) VALUES (?,?,?,?,?)").bind("class-ori-fighter", ids.character, "fighter", "Воин", 1),
      env.DB.prepare("INSERT INTO character_resources (id,character_id,name,maximum,spent,reset_on) VALUES (?,?,?,?,?,?)").bind("resource-second-wind", ids.character, "Второе дыхание", 2, 0, "SHORT_REST"),
    ]);
  }

  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO characters (id,campaign_id,kind,name,species,background,alignment,experience,strength,dexterity,constitution,intelligence,wisdom,charisma,armor_class,speed,maximum_hp,current_hp,coins_json,equipment_json,notes_json,source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(ids.npc, ids.campaign, "NPC", "Сестра Мирена", "Человек", "Хранительница приюта", "Законно-нейтральная", 0, 9, 13, 12, 14, 16, 15, 13, 30, 18, 18, '{"cp":0,"sp":8,"ep":0,"gp":4,"pp":0}', '["Посох","Священный символ","Лечебный набор"]', '[{"title":"Секрет Мастера","text":"Знает старый путь под городскими стенами."}]', "TEST_FIXTURE"),
    env.DB.prepare(`INSERT OR IGNORE INTO character_classes (id,character_id,class_key,class_name,subclass_name,level) VALUES (?,?,?,?,?,?)`).bind("class-mirena-cleric", ids.npc, "cleric", "Жрец", "Домен Жизни", 3),
    env.DB.prepare(`INSERT OR IGNORE INTO character_resources (id,character_id,name,maximum,spent,reset_on) VALUES (?,?,?,?,?,?)`).bind("resource-mirena-channel", ids.npc, "Божественный канал", 2, 0, "SHORT_REST"),
    env.DB.prepare(`INSERT OR IGNORE INTO spell_slot_pools (character_id,pool,level,maximum,spent) VALUES (?,?,?,?,?)`).bind(ids.npc, "STANDARD", 1, 4, 0),
    env.DB.prepare(`INSERT OR IGNORE INTO spell_slot_pools (character_id,pool,level,maximum,spent) VALUES (?,?,?,?,?)`).bind(ids.npc, "STANDARD", 2, 2, 0),
    env.DB.prepare(`INSERT OR IGNORE INTO spells (id,name_en,name_ru,level,school,casting_time,range,components,duration,classes_json,description,source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind("spell-cure-wounds", "Cure Wounds", "Лечение ран", 1, "Abjuration", "Действие", "Касание", "V, S", "Мгновенно", '["Cleric","Druid","Bard"]', "Восстанавливает хиты существу, которого касается заклинатель.", "REFERENCE"),
    env.DB.prepare(`INSERT OR IGNORE INTO spells (id,name_en,name_ru,level,school,casting_time,range,components,duration,classes_json,description,source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind("spell-guiding-bolt", "Guiding Bolt", "Направляющий снаряд", 1, "Evocation", "Действие", "120 фт.", "V, S", "1 раунд", '["Cleric"]', "Луч наносит урон и помогает следующей атаке по цели.", "REFERENCE"),
    env.DB.prepare(`INSERT OR IGNORE INTO spells (id,name_en,name_ru,level,school,casting_time,range,components,duration,classes_json,description,source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind("spell-spiritual-weapon", "Spiritual Weapon", "Духовное оружие", 2, "Evocation", "Бонусное действие", "60 фт.", "V, S", "1 минута", '["Cleric"]', "Создаёт магическое оружие, которым можно атаковать на расстоянии.", "REFERENCE"),
    env.DB.prepare(`INSERT OR IGNORE INTO character_spells (character_id,spell_id,known,prepared,always_prepared) VALUES (?,?,?,?,?)`).bind(ids.npc, "spell-cure-wounds", 1, 1, 0),
    env.DB.prepare(`INSERT OR IGNORE INTO character_spells (character_id,spell_id,known,prepared,always_prepared) VALUES (?,?,?,?,?)`).bind(ids.npc, "spell-guiding-bolt", 1, 1, 0),
    env.DB.prepare(`INSERT OR IGNORE INTO character_spells (character_id,spell_id,known,prepared,always_prepared) VALUES (?,?,?,?,?)`).bind(ids.npc, "spell-spiritual-weapon", 1, 0, 0),
    env.DB.prepare(`INSERT OR IGNORE INTO character_sections (character_id,section,data_json) VALUES (?,?,?)`).bind(ids.npc, "spellcasting", '{"preparedLimit":6}'),
  ]);

  const profiles = (await env.DB.prepare("SELECT id,name,global_role AS globalRole FROM profiles ORDER BY name").all()).results;
  const profileId = new URL(request.url).searchParams.get("profileId") ?? ids.player;
  const profile = await env.DB.prepare("SELECT global_role AS globalRole FROM profiles WHERE id=?").bind(profileId).first<{ globalRole: string }>();
  const membership = await env.DB.prepare("SELECT role FROM campaign_members WHERE campaign_id=? AND profile_id=?").bind(ids.campaign, profileId).first<{ role: string }>();
  const privileged = profile?.globalRole === "OVERSEER" || membership?.role === "GM";
  const characters = privileged
    ? (await env.DB.prepare(`SELECT c.id,c.name,c.kind,c.species,COALESCE(SUM(cc.level),0) AS level,GROUP_CONCAT(cc.class_name, ' / ') AS classes FROM characters c LEFT JOIN character_classes cc ON cc.character_id=c.id WHERE c.campaign_id=? GROUP BY c.id ORDER BY c.kind,c.name`).bind(ids.campaign).all()).results
    : (await env.DB.prepare(`SELECT c.id,c.name,c.kind,c.species,COALESCE(SUM(cc.level),0) AS level,GROUP_CONCAT(cc.class_name, ' / ') AS classes FROM characters c JOIN character_assignments ca ON ca.character_id=c.id LEFT JOIN character_classes cc ON cc.character_id=c.id WHERE c.campaign_id=? AND ca.profile_id=? GROUP BY c.id ORDER BY c.name`).bind(ids.campaign, profileId).all()).results;
  const firstCharacterId = String(characters[0]?.id ?? ids.character);
  const character = await env.DB.prepare("SELECT * FROM characters WHERE id=?").bind(firstCharacterId).first();
  const classes = (await env.DB.prepare("SELECT class_key AS classKey,class_name AS className,subclass_name AS subclassName,level FROM character_classes WHERE character_id=?").bind(firstCharacterId).all()).results;
  const resources = (await env.DB.prepare("SELECT id,name,maximum,spent,reset_on AS resetOn FROM character_resources WHERE character_id=? ORDER BY name").bind(firstCharacterId).all()).results;
  const spellSlots = (await env.DB.prepare("SELECT pool,level,maximum,spent FROM spell_slot_pools WHERE character_id=? ORDER BY pool,level").bind(firstCharacterId).all()).results;
  const sectionRows = (await env.DB.prepare("SELECT section,data_json AS dataJson FROM character_sections WHERE character_id=?").bind(firstCharacterId).all()).results as Array<{ section: string; dataJson: string }>;
  const sections = Object.fromEntries(sectionRows.map((row) => [row.section, JSON.parse(row.dataJson)]));
  return Response.json({ profiles, characters, permissions: { privileged }, campaign: { id: ids.campaign, name: "Long Story Short", description: "Туманный город" }, character: { ...character, classes, resources, spellSlots, sections } });
}
