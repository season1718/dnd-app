import { env } from "cloudflare:workers";
import { ensureDatabase } from "../../../../db/bootstrap";
import { parseJsonBody, updateCampaignSchema } from "../../../../domain/api-validation";

async function access(campaignId: string, profileId: string | undefined) {
  return env.DB.prepare(`SELECT p.global_role AS globalRole,cm.role AS campaignRole FROM profiles p LEFT JOIN campaign_members cm ON cm.profile_id=p.id AND cm.campaign_id=? WHERE p.id=?`).bind(campaignId, profileId).first<{ globalRole: string; campaignRole: string | null }>();
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await context.params;
  const parsed = await parseJsonBody(request, updateCampaignSchema);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;
  const actor = await access(id, body.actorProfileId);
  if (!actor || (actor.globalRole !== "OVERSEER" && actor.campaignRole !== "GM")) return Response.json({ error: "Редактировать кампанию может Мастер или Overseer" }, { status: 403 });
  await env.DB.prepare("UPDATE campaigns SET name=?,description=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(body.name, body.description, id).run();
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
