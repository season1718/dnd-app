import { env } from "cloudflare:workers";
import { ensureDatabase } from "../../../../../db/bootstrap";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await context.params;
  const body = await request.json() as { profileId?: string; preparedLimit?: number; spells?: Array<{ spellId: string; known: boolean; prepared: boolean }> };
  const access = await env.DB.prepare(`SELECT p.global_role AS globalRole,cm.role AS campaignRole,ca.profile_id IS NOT NULL AS assigned FROM characters c JOIN profiles p ON p.id=? LEFT JOIN campaign_members cm ON cm.campaign_id=c.campaign_id AND cm.profile_id=p.id LEFT JOIN character_assignments ca ON ca.character_id=c.id AND ca.profile_id=p.id WHERE c.id=?`).bind(body.profileId, id).first<{ globalRole: string; campaignRole: string | null; assigned: number }>();
  if (!access || (access.globalRole !== "OVERSEER" && access.campaignRole !== "GM" && !access.assigned)) return Response.json({ error: "Нет доступа" }, { status: 403 });
  const privileged = access.globalRole === "OVERSEER" || access.campaignRole === "GM";
  const stored = await env.DB.prepare("SELECT data_json AS dataJson FROM character_sections WHERE character_id=? AND section='spellcasting'").bind(id).first<{ dataJson: string }>();
  const currentLimit = Number(JSON.parse(stored?.dataJson ?? "{}")?.preparedLimit ?? 0);
  const preparedLimit = privileged ? Math.max(0, Math.min(99, Math.trunc(Number(body.preparedLimit ?? currentLimit)))) : currentLimit;
  const preparedCount = (body.spells ?? []).filter((spell) => spell.known && spell.prepared).length;
  if (preparedLimit > 0 && preparedCount > preparedLimit) return Response.json({ error: `Можно подготовить не более ${preparedLimit} заклинаний` }, { status: 400 });
  const statements = [];
  for (const spell of body.spells ?? []) {
    const current = await env.DB.prepare("SELECT known,always_prepared AS alwaysPrepared FROM character_spells WHERE character_id=? AND spell_id=?").bind(id, spell.spellId).first<{ known: number; alwaysPrepared: number }>();
    const known = privileged ? Boolean(spell.known) : Boolean(current?.known);
    const prepared = known && (Boolean(current?.alwaysPrepared) || Boolean(spell.prepared));
    statements.push(env.DB.prepare(`INSERT INTO character_spells (character_id,spell_id,known,prepared,always_prepared) VALUES (?,?,?,?,?) ON CONFLICT(character_id,spell_id) DO UPDATE SET known=excluded.known,prepared=excluded.prepared`).bind(id, spell.spellId, known ? 1 : 0, prepared ? 1 : 0, current?.alwaysPrepared ?? 0));
  }
  if (statements.length) await env.DB.batch(statements);
  if (privileged) await env.DB.prepare(`INSERT INTO character_sections (character_id,section,data_json) VALUES (?,?,?) ON CONFLICT(character_id,section) DO UPDATE SET data_json=excluded.data_json,updated_at=CURRENT_TIMESTAMP`).bind(id, "spellcasting", JSON.stringify({ preparedLimit })).run();
  return Response.json({ ok: true });
}
