import { env } from "cloudflare:workers";
import { ensureDatabase } from "../../../../../db/bootstrap";
import { parseJsonBody, updateSpellbookSchema } from "../../../../../domain/api-validation";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await context.params;
  const parsed = await parseJsonBody(request, updateSpellbookSchema);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;
  const access = await env.DB.prepare(`SELECT p.global_role AS globalRole,cm.role AS campaignRole,ca.profile_id IS NOT NULL AS assigned,c.spellbook_revision AS revision FROM characters c JOIN profiles p ON p.id=? LEFT JOIN campaign_members cm ON cm.campaign_id=c.campaign_id AND cm.profile_id=p.id LEFT JOIN character_assignments ca ON ca.character_id=c.id AND ca.profile_id=p.id WHERE c.id=?`).bind(body.profileId, id).first<{ globalRole: string; campaignRole: string | null; assigned: number; revision: string }>();
  if (!access || (access.globalRole !== "OVERSEER" && access.campaignRole !== "GM" && !access.assigned)) return Response.json({ error: "Нет доступа" }, { status: 403 });
  if (access.revision !== body.expectedRevision) return Response.json({ error: "Книга заклинаний уже изменена в другом окне. Обновите её перед повторным сохранением" }, { status: 409 });
  const privileged = access.globalRole === "OVERSEER" || access.campaignRole === "GM";
  const stored = await env.DB.prepare("SELECT data_json AS dataJson FROM character_sections WHERE character_id=? AND section='spellcasting'").bind(id).first<{ dataJson: string }>();
  const currentLimit = Number(JSON.parse(stored?.dataJson ?? "{}").preparedLimit ?? 0);
  const preparedLimit = privileged ? body.preparedLimit : currentLimit;
  const resolvedSpells = [];
  let preparedCount = 0;
  for (const spell of body.spells) {
    const current = await env.DB.prepare("SELECT s.id,cs.known,COALESCE(cs.always_prepared,0) AS alwaysPrepared FROM spells s LEFT JOIN character_spells cs ON cs.spell_id=s.id AND cs.character_id=? WHERE s.id=?").bind(id, spell.spellId).first<{ id: string; known: number | null; alwaysPrepared: number }>();
    if (!current) return Response.json({ error: `Заклинание ${spell.spellId} не найдено` }, { status: 422 });
    const known = privileged ? spell.known : Boolean(current.known);
    const prepared = known && (Boolean(current.alwaysPrepared) || spell.prepared);
    if (prepared) preparedCount += 1;
    resolvedSpells.push({ ...spell, known, prepared, alwaysPrepared: Boolean(current.alwaysPrepared) });
  }
  if (preparedLimit > 0 && preparedCount > preparedLimit) return Response.json({ error: `Можно подготовить не более ${preparedLimit} заклинаний` }, { status: 400 });
  const resolvedSlots = [];
  for (const slot of body.slots) {
    const current = await env.DB.prepare("SELECT maximum FROM spell_slot_pools WHERE character_id=? AND pool=? AND level=?").bind(id, slot.pool, slot.level).first<{ maximum: number }>();
    const maximum = privileged ? slot.maximum : Number(current?.maximum ?? 0);
    resolvedSlots.push({ ...slot, maximum, spent: Math.min(slot.spent, maximum) });
  }
  const revision = crypto.randomUUID();
  const statements = [];
  resolvedSpells.forEach((spell) => statements.push(env.DB.prepare(`INSERT INTO character_spells (character_id,spell_id,known,prepared,always_prepared) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM characters WHERE id=? AND spellbook_revision=?) ON CONFLICT(character_id,spell_id) DO UPDATE SET known=excluded.known,prepared=excluded.prepared`).bind(id, spell.spellId, spell.known ? 1 : 0, spell.prepared ? 1 : 0, spell.alwaysPrepared ? 1 : 0, id, body.expectedRevision)));
  resolvedSlots.forEach((slot) => statements.push(env.DB.prepare(`INSERT INTO spell_slot_pools (character_id,pool,level,maximum,spent) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM characters WHERE id=? AND spellbook_revision=?) ON CONFLICT(character_id,pool,level) DO UPDATE SET maximum=excluded.maximum,spent=excluded.spent`).bind(id, slot.pool, slot.level, slot.maximum, slot.spent, id, body.expectedRevision)));
  if (privileged) statements.push(env.DB.prepare(`INSERT INTO character_sections (character_id,section,data_json) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM characters WHERE id=? AND spellbook_revision=?) ON CONFLICT(character_id,section) DO UPDATE SET data_json=excluded.data_json,updated_at=CURRENT_TIMESTAMP`).bind(id, "spellcasting", JSON.stringify({ preparedLimit }), id, body.expectedRevision));
  statements.push(env.DB.prepare("UPDATE characters SET spellbook_revision=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND spellbook_revision=?").bind(revision, id, body.expectedRevision));
  const results = await env.DB.batch(statements);
  if (!results.at(-1)?.meta?.changes) return Response.json({ error: "Книга заклинаний уже изменена в другом окне. Обновите её перед повторным сохранением" }, { status: 409 });
  return Response.json({ ok: true, revision, preparedLimit });
}
