import { env } from "cloudflare:workers";
import { ensureDatabase } from "../../../../db/bootstrap";
import { dndCompanionCharacterSchema } from "../../../../domain/character-transfer";
import { importCharacterSchema, parseJsonBody } from "../../../../domain/api-validation";

export async function POST(request: Request) {
  await ensureDatabase();
  const envelope = await parseJsonBody(request, importCharacterSchema);
  if (!envelope.success) return envelope.response;
  const { profileId, campaignId, assignToProfileId, document } = envelope.data;
  const actor = await env.DB.prepare(`SELECT p.global_role AS globalRole,cm.role AS campaignRole FROM profiles p LEFT JOIN campaign_members cm ON cm.profile_id=p.id AND cm.campaign_id=? WHERE p.id=?`).bind(campaignId, profileId).first<{ globalRole: string; campaignRole: string | null }>();
  if (!actor || (actor.globalRole !== "OVERSEER" && actor.campaignRole !== "GM")) return Response.json({ error: "Импортировать персонажей может Мастер или Overseer" }, { status: 403 });
  const parsed = dndCompanionCharacterSchema.safeParse(document);
  if (!parsed.success) return Response.json({ error: "Файл D&D Companion не прошёл проверку", issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) }, { status: 422 });
  if (assignToProfileId) {
    const member = await env.DB.prepare("SELECT 1 AS ok FROM campaign_members WHERE campaign_id=? AND profile_id=?").bind(campaignId, assignToProfileId).first();
    if (!member) return Response.json({ error: "Назначаемый профиль не состоит в кампании" }, { status: 422 });
  }
  const data = parsed.data.character;
  const duplicate = await env.DB.prepare("SELECT id FROM characters WHERE campaign_id=? AND name=? LIMIT 1").bind(campaignId, data.name).first();
  const characterId = crypto.randomUUID();
  const a = data.abilities;
  const statements = [env.DB.prepare(`INSERT INTO characters (id,campaign_id,kind,name,species,background,alignment,portrait_data_url,experience,strength,dexterity,constitution,intelligence,wisdom,charisma,armor_class,speed,maximum_hp,current_hp,temporary_hp,inspiration,death_successes,death_failures,coins_json,equipment_json,notes_json,source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(characterId, campaignId, data.kind, data.name, data.species, data.background, data.alignment, data.portraitDataUrl, data.experience, a.strength, a.dexterity, a.constitution, a.intelligence, a.wisdom, a.charisma, data.armorClass, data.speed, data.maximumHp, data.currentHp, data.temporaryHp, data.inspiration ? 1 : 0, data.deathSuccesses, data.deathFailures, JSON.stringify(data.coins), JSON.stringify(data.equipment), JSON.stringify(data.notes), "DND_COMPANION_V1")];
  data.classes.forEach((item) => statements.push(env.DB.prepare("INSERT INTO character_classes (id,character_id,class_key,class_name,subclass_name,level) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), characterId, item.className.toLocaleLowerCase("ru").replace(/\s+/g, "-"), item.className, item.subclassName, item.level)));
  data.resources.forEach((item) => statements.push(env.DB.prepare("INSERT INTO character_resources (id,character_id,name,maximum,spent,reset_on) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), characterId, item.name, item.maximum, item.spent, item.resetOn)));
  Object.entries(data.sections).forEach(([section, value]) => statements.push(env.DB.prepare("INSERT INTO character_sections (character_id,section,data_json) VALUES (?,?,?)").bind(characterId, section, JSON.stringify(value))));
  data.spellSlots.forEach((slot) => statements.push(env.DB.prepare("INSERT INTO spell_slot_pools (character_id,pool,level,maximum,spent) VALUES (?,?,?,?,?)").bind(characterId, slot.pool, slot.level, slot.maximum, slot.spent)));
  data.spells.forEach((spell) => {
    statements.push(env.DB.prepare("INSERT OR IGNORE INTO spells (id,name_en,name_ru,level,school,casting_time,range,components,duration,classes_json,description,source,source_book,source_page) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(spell.id, spell.nameEn, spell.nameRu, spell.level, spell.school, spell.castingTime, spell.range, spell.components, spell.duration, JSON.stringify(spell.classes), spell.description, spell.source, spell.sourceBook, spell.sourcePage));
    statements.push(env.DB.prepare("INSERT INTO character_spells (character_id,spell_id,known,prepared,always_prepared) VALUES (?,?,?,?,?)").bind(characterId, spell.id, spell.known ? 1 : 0, spell.prepared ? 1 : 0, spell.alwaysPrepared ? 1 : 0));
  });
  if (assignToProfileId) statements.push(env.DB.prepare("INSERT INTO character_assignments (character_id,profile_id) VALUES (?,?)").bind(characterId, assignToProfileId));
  await env.DB.batch(statements);
  return Response.json({ id: characterId, name: data.name, warnings: duplicate ? ["В кампании уже есть персонаж с таким именем. Импорт создан как отдельный персонаж."] : [] }, { status: 201 });
}
