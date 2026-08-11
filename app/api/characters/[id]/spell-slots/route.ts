import { env } from "cloudflare:workers";
import { ensureDatabase } from "../../../../../db/bootstrap";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await context.params;
  const body = await request.json() as { profileId?: string; slots?: Array<{ pool: string; level: number; maximum: number; spent: number }> };
  const access = await env.DB.prepare(`SELECT p.global_role AS globalRole,cm.role AS campaignRole,ca.profile_id IS NOT NULL AS assigned FROM characters c JOIN profiles p ON p.id=? LEFT JOIN campaign_members cm ON cm.campaign_id=c.campaign_id AND cm.profile_id=p.id LEFT JOIN character_assignments ca ON ca.character_id=c.id AND ca.profile_id=p.id WHERE c.id=?`).bind(body.profileId, id).first<{ globalRole: string; campaignRole: string | null; assigned: number }>();
  if (!access || (access.globalRole !== "OVERSEER" && access.campaignRole !== "GM" && !access.assigned)) return Response.json({ error: "Нет доступа" }, { status: 403 });
  const privileged = access.globalRole === "OVERSEER" || access.campaignRole === "GM";
  const statements = [];
  for (const slot of body.slots ?? []) {
    const current = await env.DB.prepare("SELECT maximum FROM spell_slot_pools WHERE character_id=? AND pool=? AND level=?").bind(id, slot.pool, slot.level).first<{ maximum: number }>();
    const maximum = privileged ? Math.max(0, Math.min(99, Math.trunc(slot.maximum))) : Number(current?.maximum ?? 0);
    const spent = Math.max(0, Math.min(maximum, Math.trunc(slot.spent)));
    statements.push(env.DB.prepare(`INSERT INTO spell_slot_pools (character_id,pool,level,maximum,spent) VALUES (?,?,?,?,?) ON CONFLICT(character_id,pool,level) DO UPDATE SET maximum=excluded.maximum,spent=excluded.spent`).bind(id, slot.pool, slot.level, maximum, spent));
  }
  if (statements.length) await env.DB.batch(statements);
  return Response.json({ ok: true });
}
