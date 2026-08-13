import { env } from "cloudflare:workers";
import { ensureDatabase } from "../../../../db/bootstrap";
import { mutateProfileSchema, parseJsonBody } from "../../../../domain/api-validation";

async function overseer(profileId: string | null) {
  return env.DB.prepare("SELECT global_role AS role FROM profiles WHERE id=?").bind(profileId).first<{ role: string }>();
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await context.params;
  const parsed = await parseJsonBody(request, mutateProfileSchema);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;
  if ((await overseer(body.actorProfileId ?? null))?.role !== "OVERSEER") return Response.json({ error: "Редактировать профили может Overseer" }, { status: 403 });
  await env.DB.prepare("UPDATE profiles SET name=?,global_role=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(body.name, body.globalRole, id).run();
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
  if (!target) return Response.json({ error: "Профиль не найден" }, { status: 404 });
  try {
    await env.DB.batch([
      env.DB.prepare("UPDATE spells SET created_by_profile_id=NULL WHERE created_by_profile_id=?").bind(id),
      env.DB.prepare("UPDATE spell_overrides SET updated_by_profile_id=NULL WHERE updated_by_profile_id=?").bind(id),
      env.DB.prepare("DELETE FROM profiles WHERE id=?").bind(id),
    ]);
  } catch {
    return Response.json({ error: "Профиль связан с данными, которые пока нельзя безопасно удалить" }, { status: 409 });
  }
  return Response.json({ ok: true });
}
