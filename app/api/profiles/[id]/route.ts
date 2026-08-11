import { env } from "cloudflare:workers";
import { ensureDatabase } from "../../../../db/bootstrap";

async function overseer(profileId: string | null) {
  return env.DB.prepare("SELECT global_role AS role FROM profiles WHERE id=?").bind(profileId).first<{ role: string }>();
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await context.params;
  const body = await request.json() as { actorProfileId?: string; name?: string; globalRole?: string };
  if ((await overseer(body.actorProfileId ?? null))?.role !== "OVERSEER") return Response.json({ error: "Редактировать профили может Overseer" }, { status: 403 });
  const name = body.name?.trim();
  if (!name) return Response.json({ error: "Имя обязательно" }, { status: 400 });
  await env.DB.prepare("UPDATE profiles SET name=?,global_role=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(name.slice(0, 60), body.globalRole === "OVERSEER" ? "OVERSEER" : "USER", id).run();
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await context.params;
  const actorProfileId = new URL(request.url).searchParams.get("actorProfileId");
  if ((await overseer(actorProfileId))?.role !== "OVERSEER") return Response.json({ error: "Удалять профили может Overseer" }, { status: 403 });
  if (id === actorProfileId) return Response.json({ error: "Нельзя удалить активный профиль" }, { status: 409 });
  const target = await env.DB.prepare("SELECT global_role AS role FROM profiles WHERE id=?").bind(id).first<{ role: string }>();
  if (target?.role === "OVERSEER") {
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM profiles WHERE global_role='OVERSEER'").first<{ count: number }>();
    if ((count?.count ?? 0) <= 1) return Response.json({ error: "Нельзя удалить последнего Overseer" }, { status: 409 });
  }
  await env.DB.prepare("DELETE FROM profiles WHERE id=?").bind(id).run();
  return Response.json({ ok: true });
}
