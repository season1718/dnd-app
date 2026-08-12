import { env } from "cloudflare:workers";
import { ensureDatabase } from "../../../../../db/bootstrap";
import { parseJsonBody, updateCampaignMemberSchema } from "../../../../../domain/api-validation";

async function canManage(campaignId: string, profileId: string | undefined) {
  return env.DB.prepare(`SELECT p.global_role AS globalRole,cm.role AS campaignRole FROM profiles p LEFT JOIN campaign_members cm ON cm.profile_id=p.id AND cm.campaign_id=? WHERE p.id=?`).bind(campaignId, profileId).first<{ globalRole: string; campaignRole: string | null }>();
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await context.params;
  const profileId = new URL(request.url).searchParams.get("profileId") ?? undefined;
  const access = await canManage(id, profileId);
  if (!access) return Response.json({ error: "Нет доступа" }, { status: 403 });
  const members = (await env.DB.prepare(`SELECT p.id,p.name,p.global_role AS globalRole,cm.role FROM campaign_members cm JOIN profiles p ON p.id=cm.profile_id WHERE cm.campaign_id=? ORDER BY cm.role,p.name`).bind(id).all()).results;
  return Response.json({ members });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await context.params;
  const parsed = await parseJsonBody(request, updateCampaignMemberSchema);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;
  const access = await canManage(id, body.actorProfileId);
  if (!access || (access.globalRole !== "OVERSEER" && access.campaignRole !== "GM")) return Response.json({ error: "Управлять участниками может Мастер или Overseer" }, { status: 403 });
  await env.DB.prepare(`INSERT INTO campaign_members (campaign_id,profile_id,role) VALUES (?,?,?) ON CONFLICT(campaign_id,profile_id) DO UPDATE SET role=excluded.role`).bind(id, body.profileId, body.role).run();
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await context.params;
  const url = new URL(request.url);
  const actorProfileId = url.searchParams.get("actorProfileId") ?? undefined;
  const profileId = url.searchParams.get("profileId");
  const access = await canManage(id, actorProfileId);
  if (!access || (access.globalRole !== "OVERSEER" && access.campaignRole !== "GM")) return Response.json({ error: "Управлять участниками может Мастер или Overseer" }, { status: 403 });
  if (!profileId || profileId === actorProfileId) return Response.json({ error: "Нельзя удалить активного Мастера из кампании" }, { status: 409 });
  const gmCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM campaign_members WHERE campaign_id=? AND role='GM'").bind(id).first<{ count: number }>();
  const target = await env.DB.prepare("SELECT role FROM campaign_members WHERE campaign_id=? AND profile_id=?").bind(id, profileId).first<{ role: string }>();
  if (target?.role === "GM" && (gmCount?.count ?? 0) <= 1) return Response.json({ error: "В кампании должен остаться хотя бы один Мастер" }, { status: 409 });
  await env.DB.prepare("DELETE FROM campaign_members WHERE campaign_id=? AND profile_id=?").bind(id, profileId).run();
  return Response.json({ ok: true });
}
