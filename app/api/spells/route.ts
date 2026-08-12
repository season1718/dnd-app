import { env } from "cloudflare:workers";
import { ensureDatabase } from "../../../db/bootstrap";
import { ensureSpellCatalog, spellCatalogMetadata } from "../../../domain/spell-catalog";
import { parseJsonBody, spellMutationSchema } from "../../../domain/api-validation";
import { applySpellOverride } from "../../../domain/spell-overrides";

async function privileged(profileId: string) {
  return env.DB.prepare(`SELECT p.global_role AS globalRole,MAX(CASE WHEN cm.role='GM' THEN 1 ELSE 0 END) AS isGm FROM profiles p LEFT JOIN campaign_members cm ON cm.profile_id=p.id WHERE p.id=? GROUP BY p.id`).bind(profileId).first<{ globalRole: string; isGm: number }>();
}

export async function GET(request: Request) {
  await ensureDatabase();
  await ensureSpellCatalog();
  const url = new URL(request.url);
  const profileId = url.searchParams.get("profileId");
  const characterId = url.searchParams.get("characterId");
  if (!profileId || !characterId) return Response.json({ error: "Не указан профиль или персонаж" }, { status: 400 });
  const access = await env.DB.prepare(`SELECT p.global_role AS globalRole,cm.role AS campaignRole,ca.profile_id IS NOT NULL AS assigned,c.spellbook_revision AS spellbookRevision FROM characters c JOIN profiles p ON p.id=? LEFT JOIN campaign_members cm ON cm.campaign_id=c.campaign_id AND cm.profile_id=p.id LEFT JOIN character_assignments ca ON ca.character_id=c.id AND ca.profile_id=p.id WHERE c.id=?`).bind(profileId, characterId).first<{ globalRole: string; campaignRole: string | null; assigned: number; spellbookRevision: string }>();
  if (!access || (access.globalRole !== "OVERSEER" && access.campaignRole !== "GM" && !access.assigned)) return Response.json({ error: "Нет доступа" }, { status: 403 });
  const rawSpells = (await env.DB.prepare(`SELECT s.id,s.name_en AS nameEn,s.name_ru AS nameRu,s.level,s.school,s.casting_time AS castingTime,s.range,s.components,s.duration,s.classes_json AS classesJson,s.description,s.source,s.source_book AS sourceBook,s.source_page AS sourcePage,o.patch_json AS patchJson,o.base_snapshot_json AS baseSnapshotJson,COALESCE(cs.known,0) AS known,COALESCE(cs.prepared,0) AS prepared,COALESCE(cs.always_prepared,0) AS alwaysPrepared FROM spells s LEFT JOIN spell_overrides o ON o.spell_id=s.id LEFT JOIN character_spells cs ON cs.spell_id=s.id AND cs.character_id=? ORDER BY s.level,s.name_en`).bind(characterId).all()).results;
  const spells = rawSpells.map((spell) => applySpellOverride(spell as Parameters<typeof applySpellOverride>[0]));
  const slots = (await env.DB.prepare("SELECT pool,level,maximum,spent FROM spell_slot_pools WHERE character_id=? ORDER BY pool,level").bind(characterId).all()).results;
  const spellcasting = await env.DB.prepare("SELECT data_json AS dataJson FROM character_sections WHERE character_id=? AND section='spellcasting'").bind(characterId).first<{ dataJson: string }>();
  const preparedLimit = Number(JSON.parse(spellcasting?.dataJson ?? "{}")?.preparedLimit ?? 0);
  return Response.json({ spells, slots, preparedLimit, revision: access.spellbookRevision, catalog: spellCatalogMetadata, privileged: access.globalRole === "OVERSEER" || access.campaignRole === "GM" });
}

export async function POST(request: Request) {
  await ensureDatabase();
  const parsed = await parseJsonBody(request, spellMutationSchema);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;
  const actorProfileId = body.actorProfileId;
  const access = await privileged(actorProfileId);
  if (!access || (access.globalRole !== "OVERSEER" && !access.isGm)) return Response.json({ error: "Создавать заклинания может Мастер или Overseer" }, { status: 403 });
  const nameEn = body.nameEn;
  const id = `spell-${crypto.randomUUID()}`;
  await env.DB.prepare(`INSERT INTO spells (id,name_en,name_ru,level,school,casting_time,range,components,duration,classes_json,description,source,created_by_profile_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, nameEn, body.nameRu, body.level, body.school, body.castingTime, body.range, body.components, body.duration, JSON.stringify(body.classes), body.description, "CUSTOM", actorProfileId).run();
  return Response.json({ id, nameEn }, { status: 201 });
}
