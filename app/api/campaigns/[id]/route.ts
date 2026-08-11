import { env } from "cloudflare:workers";
import { ensureDatabase } from "../../../../db/bootstrap";

async function access(campaignId: string, profileId: string | undefined) {
  return env.DB.prepare(`SELECT p.global_role AS globalRole,cm.role AS campaignRole FROM profiles p LEFT JOIN campaign_members cm ON cm.profile_id=p.id AND cm.campaign_id=? WHERE p.id=?`).bind(campaignId, profileId).first<{ globalRole: string; campaignRole: string | null }>();
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await context.params;
  const body = await request.json() as { actorProfileId?: string; name?: string; description?: string };
  const actor = await access(id, body.actorProfileId);
  if (!actor || (actor.globalRole !== "OVERSEER" && actor.campaignRole !== "GM")) return Response.json({ error: "Редактировать кампанию может Мастер или Overseer" }, { status: 403 });
  if (!body.name?.trim()) return Response.json({ error: "Название обязательно" }, { status: 400 });
  await env.DB.prepare("UPDATE campaigns SET name=?,description=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(body.name.trim().slice(0, 100), body.description?.trim().slice(0, 500) ?? "", id).run();
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await context.params;
  const actorProfileId = new URL(request.url).searchParams.get("actorProfileId") ?? undefined;
  const actor = await access(id, actorProfileId);
  if (!actor || actor.globalRole !== "OVERSEER") return Response.json({ error: "Удалять кампании может только Overseer" }, { status: 403 });
  await env.DB.prepare("DELETE FROM campaigns WHERE id=?").bind(id).run();
  return Response.json({ ok: true });
}
