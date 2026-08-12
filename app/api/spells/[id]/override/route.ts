import { env } from "cloudflare:workers";
import { ensureDatabase } from "../../../../../db/bootstrap";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await context.params;
  const actorProfileId = new URL(request.url).searchParams.get("actorProfileId");
  const access = await env.DB.prepare(`SELECT p.global_role AS globalRole,MAX(CASE WHEN cm.role='GM' THEN 1 ELSE 0 END) AS isGm FROM profiles p LEFT JOIN campaign_members cm ON cm.profile_id=p.id WHERE p.id=? GROUP BY p.id`).bind(actorProfileId).first<{ globalRole: string; isGm: number }>();
  if (!access || (access.globalRole !== "OVERSEER" && !access.isGm)) return Response.json({ error: "Сбрасывать правки может Мастер или Overseer" }, { status: 403 });
  const spell = await env.DB.prepare("SELECT source FROM spells WHERE id=?").bind(id).first<{ source: string }>();
  if (!spell) return Response.json({ error: "Заклинание не найдено" }, { status: 404 });
  if (spell.source === "CUSTOM") return Response.json({ error: "У пользовательского заклинания нет исходной каталожной версии" }, { status: 409 });
  const result = await env.DB.prepare("DELETE FROM spell_overrides WHERE spell_id=?").bind(id).run();
  return Response.json({ ok: true, reset: Boolean(result.meta.changes) });
}
