import { env } from "cloudflare:workers";
import { ensureDatabase } from "../../../db/bootstrap";

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
  const body = await request.json() as { actorProfileId?: string; name?: string; description?: string };
  const actor = await env.DB.prepare("SELECT id FROM profiles WHERE id=?").bind(body.actorProfileId).first();
  if (!actor) return Response.json({ error: "Профиль не найден" }, { status: 404 });
  const name = body.name?.trim();
  if (!name) return Response.json({ error: "Название кампании обязательно" }, { status: 400 });
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO campaigns (id,name,description) VALUES (?,?,?)").bind(id, name, body.description?.trim() ?? ""),
    env.DB.prepare("INSERT INTO campaign_members (campaign_id,profile_id,role) VALUES (?,?,?)").bind(id, body.actorProfileId, "GM"),
  ]);
  return Response.json({ id, name }, { status: 201 });
}
