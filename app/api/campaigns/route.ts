import { env } from "cloudflare:workers";
import { ensureDatabase } from "../../../db/bootstrap";
import { createCampaignSchema, parseJsonBody } from "../../../domain/api-validation";

export async function GET(request: Request) {
  await ensureDatabase();
  const profileId = new URL(request.url).searchParams.get("profileId");
  const actor = await env.DB.prepare("SELECT global_role AS role FROM profiles WHERE id=?").bind(profileId).first<{ role: string }>();
  const campaigns = actor?.role === "OVERSEER"
    ? (await env.DB.prepare("SELECT id,name,description FROM campaigns ORDER BY name").all()).results
    : (await env.DB.prepare("SELECT c.id,c.name,c.description,cm.role FROM campaigns c JOIN campaign_members cm ON cm.campaign_id=c.id WHERE cm.profile_id=? ORDER BY c.name").bind(profileId).all()).results;
  return Response.json({ campaigns });
}

export async function POST(request: Request) {
  await ensureDatabase();
  const parsed = await parseJsonBody(request, createCampaignSchema);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;
  const actor = await env.DB.prepare("SELECT id FROM profiles WHERE id=?").bind(body.actorProfileId).first();
  if (!actor) return Response.json({ error: "Профиль не найден" }, { status: 404 });
  const name = body.name;
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO campaigns (id,name,description) VALUES (?,?,?)").bind(id, name, body.description),
    env.DB.prepare("INSERT INTO campaign_members (campaign_id,profile_id,role) VALUES (?,?,?)").bind(id, body.actorProfileId, "GM"),
  ]);
  return Response.json({ id, name }, { status: 201 });
}
