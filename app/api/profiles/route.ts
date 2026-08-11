import { env } from "cloudflare:workers";
import { ensureDatabase } from "../../../db/bootstrap";

export async function GET() {
  await ensureDatabase();
  const profiles = (await env.DB.prepare("SELECT id,name,global_role AS globalRole,created_at AS createdAt FROM profiles ORDER BY name").all()).results;
  return Response.json({ profiles });
}

export async function POST(request: Request) {
  await ensureDatabase();
  const body = await request.json() as { actorProfileId?: string; name?: string; globalRole?: string };
  const actor = await env.DB.prepare("SELECT global_role AS role FROM profiles WHERE id=?").bind(body.actorProfileId).first<{ role: string }>();
  if (actor?.role !== "OVERSEER") return Response.json({ error: "Создавать профили может Overseer" }, { status: 403 });
  const name = body.name?.trim();
  if (!name || name.length > 60) return Response.json({ error: "Имя должно содержать от 1 до 60 символов" }, { status: 400 });
  const id = crypto.randomUUID();
  try { await env.DB.prepare("INSERT INTO profiles (id,name,global_role) VALUES (?,?,?)").bind(id, name, body.globalRole === "OVERSEER" ? "OVERSEER" : "USER").run(); }
  catch { return Response.json({ error: "Профиль с таким именем уже существует" }, { status: 409 }); }
  return Response.json({ id, name }, { status: 201 });
}
