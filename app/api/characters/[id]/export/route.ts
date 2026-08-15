import { env } from "cloudflare:workers";
import { ensureDatabase } from "../../../../../db/bootstrap";
import { applySpellOverride } from "../../../../../domain/spell-overrides";

function json(value: unknown, fallback: unknown) {
  try { return JSON.parse(String(value ?? "")); }
  catch { return fallback; }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await context.params;
  const profileId = new URL(request.url).searchParams.get("profileId");
  if (!profileId) return Response.json({ error: "Не указан профиль" }, { status: 400 });
  const character = await env.DB.prepare(`SELECT c.*,p.global_role AS globalRole,cm.role AS campaignRole,ca.profile_id IS NOT NULL AS assigned FROM characters c JOIN profiles p ON p.id=? LEFT JOIN campaign_members cm ON cm.campaign_id=c.campaign_id AND cm.profile_id=p.id LEFT JOIN character_assignments ca ON ca.character_id=c.id AND ca.profile_id=p.id WHERE c.id=?`).bind(profileId, id).first<Record<string, unknown>>();
  if (!character || (character.globalRole !== "OVERSEER" && character.campaignRole !== "GM" && !character.assigned)) return Response.json({ error: "Нет доступа" }, { status: 403 });
  const privileged = character.globalRole === "OVERSEER" || character.campaignRole === "GM";

  const classes = (await env.DB.prepare("SELECT class_name AS className,subclass_name AS subclassName,level FROM character_classes WHERE character_id=? ORDER BY id").bind(id).all()).results;
  const resources = (await env.DB.prepare("SELECT name,maximum,spent,reset_on AS resetOn FROM character_resources WHERE character_id=? ORDER BY name").bind(id).all()).results;
  const sectionRows = (await env.DB.prepare("SELECT section,data_json AS dataJson FROM character_sections WHERE character_id=?").bind(id).all()).results as Array<{ section: string; dataJson: string }>;
  const spellSlots = (await env.DB.prepare("SELECT pool,level,maximum,spent FROM spell_slot_pools WHERE character_id=? ORDER BY pool,level").bind(id).all()).results;
  const spells = (await env.DB.prepare(`SELECT s.id,s.name_en AS nameEn,s.name_ru AS nameRu,s.level,s.school,s.casting_time AS castingTime,s.range,s.components,s.duration,s.classes_json AS classesJson,s.description,s.source,s.source_book AS sourceBook,s.source_page AS sourcePage,o.patch_json AS patchJson,o.base_snapshot_json AS baseSnapshotJson,cs.known,cs.prepared,cs.always_prepared AS alwaysPrepared FROM character_spells cs JOIN spells s ON s.id=cs.spell_id LEFT JOIN spell_overrides o ON o.spell_id=s.id WHERE cs.character_id=? ORDER BY s.level,s.name_en`).bind(id).all()).results.map((spell) => applySpellOverride(spell as Parameters<typeof applySpellOverride>[0])) as Array<Record<string, unknown>>;
  return Response.json({
    format: "dnd-companion-character", version: 1, exportedAt: new Date().toISOString(),
    character: {
      name: character.name, kind: character.kind, species: character.species, background: character.background, alignment: character.alignment, portraitDataUrl: character.portrait_data_url ?? "", experience: character.experience,
      abilities: { strength: character.strength, dexterity: character.dexterity, constitution: character.constitution, intelligence: character.intelligence, wisdom: character.wisdom, charisma: character.charisma },
      armorClass: character.armor_class, speed: character.speed, maximumHp: character.maximum_hp, currentHp: character.current_hp, temporaryHp: character.temporary_hp,
      inspiration: Boolean(character.inspiration), deathSuccesses: character.death_successes, deathFailures: character.death_failures,
      coins: json(character.coins_json, { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }), equipment: json(character.equipment_json, []), notes: json(character.notes_json, []),
      classes, resources, sections: Object.fromEntries(sectionRows.filter((row) => privileged || row.section !== "gmNotes").map((row) => [row.section, json(row.dataJson, {})])), spellSlots,
      spells: spells.map(({ classesJson, known, prepared, alwaysPrepared, ...spell }) => {
        delete spell.overridden; delete spell.overrideConflicts;
        return { ...spell, classes: json(classesJson, []), known: Boolean(known), prepared: Boolean(prepared), alwaysPrepared: Boolean(alwaysPrepared) };
      }),
    },
  }, { headers: { "content-disposition": `attachment; filename="character-${id}.json"` } });
}
