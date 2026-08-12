import { env } from "cloudflare:workers";
import { ensureDatabase } from "../../../../db/bootstrap";
import { parseLongStoryShortV2 } from "../../../../domain/importers/long-story-short";
import { importCharacterSchema, parseJsonBody } from "../../../../domain/api-validation";

export async function POST(request: Request) {
  await ensureDatabase();
  const parsed = await parseJsonBody(request, importCharacterSchema);
  if (!parsed.success) return parsed.response;
  const payload = parsed.data;
  const actor = await env.DB.prepare(`SELECT p.global_role AS globalRole, cm.role AS campaignRole FROM profiles p LEFT JOIN campaign_members cm ON cm.profile_id=p.id AND cm.campaign_id=? WHERE p.id=?`).bind(payload.campaignId, payload.profileId).first<{ globalRole: string; campaignRole: string | null }>();
  if (!actor || (actor.globalRole !== "OVERSEER" && actor.campaignRole !== "GM")) return Response.json({ error: "Импортировать системные поля может Мастер или Overseer" }, { status: 403 });

  let imported;
  try { imported = parseLongStoryShortV2(payload.document); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Файл не распознан" }, { status: 422 }); }

  const characterId = crypto.randomUUID();
  const classId = crypto.randomUUID();
  const a = imported.abilities;
  const statements = [
    env.DB.prepare(`INSERT INTO characters (id,campaign_id,kind,name,species,background,alignment,experience,strength,dexterity,constitution,intelligence,wisdom,charisma,armor_class,speed,maximum_hp,current_hp,temporary_hp,inspiration,death_successes,death_failures,coins_json,equipment_json,notes_json,source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(characterId, payload.campaignId, imported.kind, imported.name, imported.species, imported.background, imported.alignment, imported.experience, a.strength, a.dexterity, a.constitution, a.intelligence, a.wisdom, a.charisma, imported.armorClass, imported.speed, imported.maximumHp, Math.min(imported.currentHp, imported.maximumHp), imported.temporaryHp, imported.inspiration ? 1 : 0, imported.deathSuccesses, imported.deathFailures, JSON.stringify(imported.coins), JSON.stringify(imported.equipment), JSON.stringify(imported.notes), "LONG_STORY_SHORT_V2"),
    env.DB.prepare(`INSERT INTO character_classes (id,character_id,class_key,class_name,subclass_name,level) VALUES (?,?,?,?,?,?)`).bind(classId, characterId, imported.classes[0].classKey, imported.classes[0].className, imported.classes[0].subclassName, imported.classes[0].level),
  ];
  const assignee = payload.assignToProfileId;
  if (assignee) {
    const member = await env.DB.prepare("SELECT 1 AS ok FROM campaign_members WHERE campaign_id=? AND profile_id=?").bind(payload.campaignId, assignee).first();
    if (!member) return Response.json({ error: "Назначаемый профиль не состоит в кампании" }, { status: 422 });
    statements.push(env.DB.prepare("INSERT INTO character_assignments (character_id,profile_id) VALUES (?,?)").bind(characterId, assignee));
  }
  await env.DB.batch(statements);
  return Response.json({ id: characterId, name: imported.name, warnings: imported.warnings }, { status: 201 });
}
