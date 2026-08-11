import { env } from "cloudflare:workers";
import { ensureDatabase } from "../../../db/bootstrap";
import { ensureSpellCatalog, spellCatalogMetadata } from "../../../domain/spell-catalog";

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
  const access = await env.DB.prepare(`SELECT p.global_role AS globalRole,cm.role AS campaignRole,ca.profile_id IS NOT NULL AS assigned FROM characters c JOIN profiles p ON p.id=? LEFT JOIN campaign_members cm ON cm.campaign_id=c.campaign_id AND cm.profile_id=p.id LEFT JOIN character_assignments ca ON ca.character_id=c.id AND ca.profile_id=p.id WHERE c.id=?`).bind(profileId, characterId).first<{ globalRole: string; campaignRole: string | null; assigned: number }>();
  if (!access || (access.globalRole !== "OVERSEER" && access.campaignRole !== "GM" && !access.assigned)) return Response.json({ error: "Нет доступа" }, { status: 403 });
  const spells = (await env.DB.prepare(`SELECT s.id,s.name_en AS nameEn,s.name_ru AS nameRu,s.level,s.school,s.casting_time AS castingTime,s.range,s.components,s.duration,s.classes_json AS classesJson,s.description,s.source,COALESCE(cs.known,0) AS known,COALESCE(cs.prepared,0) AS prepared,COALESCE(cs.always_prepared,0) AS alwaysPrepared FROM spells s LEFT JOIN character_spells cs ON cs.spell_id=s.id AND cs.character_id=? ORDER BY s.level,s.name_en`).bind(characterId).all()).results;
  const slots = (await env.DB.prepare("SELECT pool,level,maximum,spent FROM spell_slot_pools WHERE character_id=? ORDER BY pool,level").bind(characterId).all()).results;
  const spellcasting = await env.DB.prepare("SELECT data_json AS dataJson FROM character_sections WHERE character_id=? AND section='spellcasting'").bind(characterId).first<{ dataJson: string }>();
  const preparedLimit = Number(JSON.parse(spellcasting?.dataJson ?? "{}")?.preparedLimit ?? 0);
  return Response.json({ spells, slots, preparedLimit, catalog: spellCatalogMetadata, privileged: access.globalRole === "OVERSEER" || access.campaignRole === "GM" });
}

export async function POST(request: Request) {
  await ensureDatabase();
  const body = await request.json() as Record<string, unknown>;
  const actorProfileId = String(body.actorProfileId ?? "");
  const access = await privileged(actorProfileId);
  if (!access || (access.globalRole !== "OVERSEER" && !access.isGm)) return Response.json({ error: "Создавать заклинания может Мастер или Overseer" }, { status: 403 });
  const nameEn = String(body.nameEn ?? "").trim().slice(0, 120);
  if (!nameEn) return Response.json({ error: "Укажите английское название" }, { status: 400 });
  const id = `spell-${crypto.randomUUID()}`;
  await env.DB.prepare(`INSERT INTO spells (id,name_en,name_ru,level,school,casting_time,range,components,duration,classes_json,description,source,created_by_profile_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, nameEn, String(body.nameRu ?? "").trim().slice(0, 120), Math.max(0, Math.min(9, Number(body.level ?? 0))), String(body.school ?? "Other").slice(0, 60), String(body.castingTime ?? "Действие").slice(0, 100), String(body.range ?? "На себя").slice(0, 100), String(body.components ?? "").slice(0, 100), String(body.duration ?? "Мгновенно").slice(0, 100), JSON.stringify(body.classes ?? []), String(body.description ?? "").slice(0, 5000), "CUSTOM", actorProfileId).run();
  return Response.json({ id, nameEn }, { status: 201 });
}
