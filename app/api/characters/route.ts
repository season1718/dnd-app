import { env } from "cloudflare:workers";
import { ensureDatabase } from "../../../db/bootstrap";

export async function POST(request: Request) {
  await ensureDatabase();
  const body = await request.json() as { actorProfileId?: string; campaignId?: string; name?: string; kind?: string; assignToProfileId?: string };
  const access = await env.DB.prepare(`SELECT p.global_role AS globalRole,cm.role AS campaignRole FROM profiles p LEFT JOIN campaign_members cm ON cm.profile_id=p.id AND cm.campaign_id=? WHERE p.id=?`).bind(body.campaignId, body.actorProfileId).first<{ globalRole: string; campaignRole: string | null }>();
  if (!access || (access.globalRole !== "OVERSEER" && access.campaignRole !== "GM")) return Response.json({ error: "Создавать персонажей может Мастер или Overseer" }, { status: 403 });
  const name = body.name?.trim();
  if (!name || !body.campaignId) return Response.json({ error: "Имя и кампания обязательны" }, { status: 400 });
  const id = crypto.randomUUID();
  const statements = [env.DB.prepare("INSERT INTO characters (id,campaign_id,kind,name) VALUES (?,?,?,?)").bind(id, body.campaignId, body.kind === "NPC" ? "NPC" : "PC", name)];
  if (body.assignToProfileId) statements.push(env.DB.prepare("INSERT INTO character_assignments (character_id,profile_id) VALUES (?,?)").bind(id, body.assignToProfileId));
  await env.DB.batch(statements);
  return Response.json({ id, name }, { status: 201 });
}
