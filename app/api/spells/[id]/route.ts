import { env } from "cloudflare:workers";
import { ensureDatabase } from "../../../../db/bootstrap";
import { parseJsonBody, spellMutationSchema } from "../../../../domain/api-validation";
import { spellCatalogMetadata } from "../../../../domain/spell-catalog";
import { spellPatch, type MutableSpellFields } from "../../../../domain/spell-overrides";

async function editorAccess(actorProfileId: string | null) {
  return env.DB.prepare(`SELECT p.global_role AS globalRole,MAX(CASE WHEN cm.role='GM' THEN 1 ELSE 0 END) AS isGm FROM profiles p LEFT JOIN campaign_members cm ON cm.profile_id=p.id WHERE p.id=? GROUP BY p.id`).bind(actorProfileId).first<{ globalRole: string; isGm: number }>();
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await context.params;
  const parsed = await parseJsonBody(request, spellMutationSchema);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;
  const actorProfileId = body.actorProfileId;
  const access = await editorAccess(actorProfileId);
  if (!access || (access.globalRole !== "OVERSEER" && !access.isGm)) return Response.json({ error: "Редактировать заклинания может Мастер или Overseer" }, { status: 403 });
  const spell = await env.DB.prepare(`SELECT id,name_en AS nameEn,name_ru AS nameRu,level,school,casting_time AS castingTime,range,components,duration,classes_json AS classesJson,description,source FROM spells WHERE id=?`).bind(id).first<MutableSpellFields & { id: string; source: string }>();
  if (!spell) return Response.json({ error: "Заклинание не найдено" }, { status: 404 });
  const nameEn = body.nameEn;
  const edited: MutableSpellFields = { nameEn, nameRu: body.nameRu, level: body.level, school: body.school, castingTime: body.castingTime, range: body.range, components: body.components, duration: body.duration, classesJson: JSON.stringify(body.classes), description: body.description };
  if (spell.source === "CUSTOM") {
    await env.DB.prepare(`UPDATE spells SET name_en=?,name_ru=?,level=?,school=?,casting_time=?,range=?,components=?,duration=?,classes_json=?,description=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(nameEn, body.nameRu, body.level, body.school, body.castingTime, body.range, body.components, body.duration, edited.classesJson, body.description, id).run();
  } else {
    const base: MutableSpellFields = { nameEn: spell.nameEn, nameRu: spell.nameRu, level: spell.level, school: spell.school, castingTime: spell.castingTime, range: spell.range, components: spell.components, duration: spell.duration, classesJson: spell.classesJson, description: spell.description };
    const patch = spellPatch(base, edited);
    if (Object.keys(patch).length) await env.DB.prepare(`INSERT INTO spell_overrides (spell_id,patch_json,base_snapshot_json,base_catalog_version,updated_by_profile_id) VALUES (?,?,?,?,?) ON CONFLICT(spell_id) DO UPDATE SET patch_json=excluded.patch_json,base_snapshot_json=excluded.base_snapshot_json,base_catalog_version=excluded.base_catalog_version,updated_by_profile_id=excluded.updated_by_profile_id,updated_at=CURRENT_TIMESTAMP`).bind(id, JSON.stringify(patch), JSON.stringify(base), spellCatalogMetadata.version, actorProfileId).run();
    else await env.DB.prepare("DELETE FROM spell_overrides WHERE spell_id=?").bind(id).run();
  }
  return Response.json({ id, nameEn, overridden: spell.source !== "CUSTOM" });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await context.params;
  const actorProfileId = new URL(request.url).searchParams.get("actorProfileId");
  const access = await editorAccess(actorProfileId);
  if (!access || (access.globalRole !== "OVERSEER" && !access.isGm)) return Response.json({ error: "Удалять заклинания может Мастер или Overseer" }, { status: 403 });

  const spell = await env.DB.prepare("SELECT id,name_en AS nameEn,source FROM spells WHERE id=?").bind(id).first<{ id: string; nameEn: string; source: string }>();
  if (!spell) return Response.json({ error: "Заклинание не найдено" }, { status: 404 });
  if (spell.source !== "CUSTOM") return Response.json({ error: "Удалять можно только пользовательские заклинания. Импортированные данные защищены" }, { status: 409 });

  const result = await env.DB.prepare(`DELETE FROM spells WHERE id=? AND source='CUSTOM' AND NOT EXISTS (SELECT 1 FROM character_spells WHERE spell_id=? AND (known=1 OR prepared=1 OR always_prepared=1))`).bind(id, id).run();
  if (!result.meta.changes) {
    const uses = (await env.DB.prepare(`SELECT c.id,c.name,ca.name AS campaignName,cs.known,cs.prepared,cs.always_prepared AS alwaysPrepared FROM character_spells cs JOIN characters c ON c.id=cs.character_id JOIN campaigns ca ON ca.id=c.campaign_id WHERE cs.spell_id=? AND (cs.known=1 OR cs.prepared=1 OR cs.always_prepared=1) ORDER BY ca.name,c.name`).bind(id).all()).results;
    return Response.json({ error: `Заклинание «${spell.nameEn}» используется персонажами и не может быть удалено`, uses }, { status: 409 });
  }
  return Response.json({ ok: true, id });
}
