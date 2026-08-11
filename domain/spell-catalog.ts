import { env } from "cloudflare:workers";
import catalog from "../data/spells-2024-ru.json";

type CatalogSpell = (typeof catalog.spells)[number];
const SOURCE = "PHB2024_RU_VALIDATED_V1_1";
let ready = false;

function componentsText(spell: CatalogSpell) {
  if (spell.components.source_text) return spell.components.source_text;
  return [spell.components.V && "V", spell.components.S && "S", spell.components.M && "M"].filter(Boolean).join(", ");
}

export async function ensureSpellCatalog() {
  if (ready) return;
  const existing = await env.DB.prepare("SELECT COUNT(*) AS count FROM spells WHERE source=?").bind(SOURCE).first<{ count: number }>();
  if (Number(existing?.count ?? 0) !== catalog.spells.length) {
    const statements = catalog.spells.map((spell) => env.DB.prepare(`INSERT INTO spells (id,name_en,name_ru,level,school,casting_time,range,components,duration,classes_json,description,source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name_en=excluded.name_en,name_ru=excluded.name_ru,level=excluded.level,school=excluded.school,casting_time=excluded.casting_time,range=excluded.range,components=excluded.components,duration=excluded.duration,classes_json=excluded.classes_json,description=excluded.description,source=excluded.source,updated_at=CURRENT_TIMESTAMP`).bind(`phb2024-${spell.id}`, spell.name_en, spell.name_ru, spell.level, spell.school, spell.casting_time, spell.range, componentsText(spell), spell.duration, JSON.stringify(spell.classes), spell.description, SOURCE));
    for (let index = 0; index < statements.length; index += 75) await env.DB.batch(statements.slice(index, index + 75));
  }
  ready = true;
}

export const spellCatalogMetadata = {
  source: catalog.source,
  version: catalog.schema_version,
  count: catalog.spell_count,
  validation: catalog.validation.status,
};
