import { env } from "cloudflare:workers";
import { ensureDatabase } from "../../../db/bootstrap";
import { createCharacterSchema, parseJsonBody } from "../../../domain/api-validation";

export async function POST(request: Request) {
  await ensureDatabase();
  const parsed = await parseJsonBody(request, createCharacterSchema);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;
  const access = await env.DB.prepare(`SELECT p.global_role AS globalRole,cm.role AS campaignRole FROM profiles p LEFT JOIN campaign_members cm ON cm.profile_id=p.id AND cm.campaign_id=? WHERE p.id=?`).bind(body.campaignId, body.actorProfileId).first<{ globalRole: string; campaignRole: string | null }>();
  if (!access || (access.globalRole !== "OVERSEER" && access.campaignRole !== "GM")) return Response.json({ error: "Создавать персонажей может Мастер или Overseer" }, { status: 403 });
  const name = body.name;
  const id = crypto.randomUUID();
  const statements = [env.DB.prepare("INSERT INTO characters (id,campaign_id,kind,name) VALUES (?,?,?,?)").bind(id, body.campaignId, body.kind, name)];
  if (body.assignToProfileId) statements.push(env.DB.prepare("INSERT INTO character_assignments (character_id,profile_id) VALUES (?,?)").bind(id, body.assignToProfileId));
  await env.DB.batch(statements);
  return Response.json({ id, name }, { status: 201 });
}
