import { env } from "cloudflare:workers";
import { ensureDatabase } from "../../../db/bootstrap";
import { ensureSpellCatalog } from "../../../domain/spell-catalog";
import { characterFeatureFixtures } from "../../../domain/character-feature-fixtures";
import { classFeatureDescription } from "../../../domain/class-feature-descriptions";

const ids = { player: "profile-ori", gm: "profile-gm", overseer: "profile-overseer", campaign: "campaign-lss", character: "character-ori", npc: "character-mirena" };

export async function GET(request: Request) {
  await ensureDatabase();
  await ensureSpellCatalog();
  const generatedFeatureSections = (await env.DB.prepare("SELECT cs.character_id AS characterId,cs.data_json AS dataJson,GROUP_CONCAT(cc.class_key) AS classKeys FROM character_sections cs JOIN character_classes cc ON cc.character_id=cs.character_id WHERE cs.section='features' GROUP BY cs.character_id").all()).results as Array<{ characterId: string; dataJson: string; classKeys: string }>;
  for (const row of generatedFeatureSections) {
    const features = JSON.parse(row.dataJson) as Array<{ name: string; description: string }>;
    let changed = false;
    for (const feature of features) {
      if (!/^Получено на \d+ уровне класса/u.test(feature.description)) continue;
      const replacement = row.classKeys.split(",").map((classKey) => classFeatureDescription(classKey, feature.name)).find(Boolean);
      if (replacement) { feature.description = replacement; changed = true; }
    }
    if (changed) await env.DB.prepare("UPDATE character_sections SET data_json=?,updated_at=CURRENT_TIMESTAMP WHERE character_id=? AND section='features'").bind(JSON.stringify(features), row.characterId).run();
  }
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
    env.DB.prepare(`DELETE FROM character_classes WHERE id='class-mirena-cleric' AND EXISTS (SELECT 1 FROM character_classes existing WHERE existing.character_id=? AND existing.id<>'class-mirena-cleric' AND existing.class_name='Жрец' AND existing.level=3)`).bind(ids.npc),
    env.DB.prepare(`INSERT OR IGNORE INTO characters (id,campaign_id,kind,name,species,background,alignment,experience,strength,dexterity,constitution,intelligence,wisdom,charisma,armor_class,speed,maximum_hp,current_hp,coins_json,equipment_json,notes_json,source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(ids.npc, ids.campaign, "NPC", "Сестра Мирена", "Человек", "Хранительница приюта", "Законно-нейтральная", 0, 9, 13, 12, 14, 16, 15, 13, 30, 18, 18, '{"cp":0,"sp":8,"ep":0,"gp":4,"pp":0}', '["Посох","Священный символ","Лечебный набор"]', '[{"title":"Секрет Мастера","text":"Знает старый путь под городскими стенами."}]', "TEST_FIXTURE"),
    env.DB.prepare(`INSERT INTO character_classes (id,character_id,class_key,class_name,subclass_name,level) SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM character_classes WHERE character_id=? AND class_name='Жрец')`).bind("class-mirena-cleric", ids.npc, "cleric", "Жрец", "Домен Жизни", 3, ids.npc),
    env.DB.prepare(`INSERT OR IGNORE INTO character_resources (id,character_id,name,maximum,spent,reset_on) VALUES (?,?,?,?,?,?)`).bind("resource-mirena-channel", ids.npc, "Божественный канал", 2, 0, "SHORT_REST"),
    env.DB.prepare(`INSERT OR IGNORE INTO spell_slot_pools (character_id,pool,level,maximum,spent) VALUES (?,?,?,?,?)`).bind(ids.npc, "STANDARD", 1, 4, 0),
    env.DB.prepare(`INSERT OR IGNORE INTO spell_slot_pools (character_id,pool,level,maximum,spent) VALUES (?,?,?,?,?)`).bind(ids.npc, "STANDARD", 2, 2, 0),
    env.DB.prepare(`INSERT OR IGNORE INTO character_spells (character_id,spell_id,known,prepared,always_prepared) VALUES (?,?,?,?,?)`).bind(ids.npc, "phb2024-cure-wounds", 1, 1, 0),
    env.DB.prepare(`INSERT OR IGNORE INTO character_spells (character_id,spell_id,known,prepared,always_prepared) VALUES (?,?,?,?,?)`).bind(ids.npc, "phb2024-guiding-bolt", 1, 1, 0),
    env.DB.prepare(`INSERT OR IGNORE INTO character_spells (character_id,spell_id,known,prepared,always_prepared) VALUES (?,?,?,?,?)`).bind(ids.npc, "phb2024-spiritual-weapon", 1, 0, 0),
    env.DB.prepare(`DELETE FROM spells WHERE source='REFERENCE' AND id IN ('spell-cure-wounds','spell-guiding-bolt','spell-spiritual-weapon')`),
    env.DB.prepare(`INSERT OR IGNORE INTO character_sections (character_id,section,data_json) VALUES (?,?,?)`).bind(ids.npc, "spellcasting", '{"preparedLimit":6}'),
  ]);

  await env.DB.batch(Object.entries(characterFeatureFixtures).map(([name, features]) =>
    env.DB.prepare(`INSERT OR IGNORE INTO character_sections (character_id,section,data_json) SELECT id,'features',? FROM characters WHERE name=?`).bind(JSON.stringify(features), name),
  ));

  const profiles = (await env.DB.prepare("SELECT id,name,global_role AS globalRole FROM profiles ORDER BY name").all()).results;
  const url = new URL(request.url);
  const profileId = url.searchParams.get("profileId") ?? ids.player;
  const profile = await env.DB.prepare("SELECT global_role AS globalRole FROM profiles WHERE id=?").bind(profileId).first<{ globalRole: string }>();
  if (!profile) return Response.json({ error: "Профиль не найден" }, { status: 404 });
  const campaigns = profile.globalRole === "OVERSEER"
    ? (await env.DB.prepare("SELECT id,name,description,NULL AS role FROM campaigns ORDER BY name").all()).results
    : (await env.DB.prepare("SELECT c.id,c.name,c.description,cm.role FROM campaigns c JOIN campaign_members cm ON cm.campaign_id=c.id WHERE cm.profile_id=? ORDER BY c.name").bind(profileId).all()).results;
  const requestedCampaignId = url.searchParams.get("campaignId");
  const campaign = campaigns.find((item) => item.id === requestedCampaignId) ?? campaigns[0] ?? null;
  if (!campaign) return Response.json({ profiles, campaigns: [], campaign: null, characters: [], character: null, permissions: { privileged: profile.globalRole === "OVERSEER" } });
  const campaignId = String(campaign.id);
  const membership = await env.DB.prepare("SELECT role FROM campaign_members WHERE campaign_id=? AND profile_id=?").bind(campaignId, profileId).first<{ role: string }>();
  const privileged = profile?.globalRole === "OVERSEER" || membership?.role === "GM";
  const characters = privileged
    ? (await env.DB.prepare(`SELECT c.id,c.name,c.kind,c.species,COALESCE(SUM(cc.level),0) AS level,GROUP_CONCAT(cc.class_name, ' / ') AS classes FROM characters c LEFT JOIN character_classes cc ON cc.character_id=c.id WHERE c.campaign_id=? GROUP BY c.id ORDER BY c.kind,c.name`).bind(campaignId).all()).results
    : (await env.DB.prepare(`SELECT c.id,c.name,c.kind,c.species,COALESCE(SUM(cc.level),0) AS level,GROUP_CONCAT(cc.class_name, ' / ') AS classes FROM characters c JOIN character_assignments ca ON ca.character_id=c.id LEFT JOIN character_classes cc ON cc.character_id=c.id WHERE c.campaign_id=? AND ca.profile_id=? GROUP BY c.id ORDER BY c.name`).bind(campaignId, profileId).all()).results;
  const firstCharacterId = characters[0]?.id ? String(characters[0].id) : null;
  if (!firstCharacterId) return Response.json({ profiles, campaigns, permissions: { privileged }, campaign, characters, character: null });
  const character = await env.DB.prepare("SELECT * FROM characters WHERE id=?").bind(firstCharacterId).first();
  const classes = (await env.DB.prepare("SELECT class_key AS classKey,class_name AS className,subclass_name AS subclassName,level FROM character_classes WHERE character_id=?").bind(firstCharacterId).all()).results;
  const resources = (await env.DB.prepare("SELECT id,name,maximum,spent,reset_on AS resetOn FROM character_resources WHERE character_id=? ORDER BY name").bind(firstCharacterId).all()).results;
  const spellSlots = (await env.DB.prepare("SELECT pool,level,maximum,spent FROM spell_slot_pools WHERE character_id=? ORDER BY pool,level").bind(firstCharacterId).all()).results;
  const sectionRows = (await env.DB.prepare("SELECT section,data_json AS dataJson FROM character_sections WHERE character_id=?").bind(firstCharacterId).all()).results as Array<{ section: string; dataJson: string }>;
  const sections = Object.fromEntries(sectionRows.filter((row) => privileged || row.section !== "gmNotes").map((row) => [row.section, JSON.parse(row.dataJson)]));
  return Response.json({ profiles, campaigns, characters, permissions: { privileged }, campaign, character: { ...character, classes, resources, spellSlots, sections } });
}
