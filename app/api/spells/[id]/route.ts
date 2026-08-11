import { env } from "cloudflare:workers";
import { ensureDatabase } from "../../../../db/bootstrap";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await context.params;
  const body = await request.json() as Record<string, unknown>;
  const actorProfileId = String(body.actorProfileId ?? "");
  const access = await env.DB.prepare(`SELECT p.global_role AS globalRole,MAX(CASE WHEN cm.role='GM' THEN 1 ELSE 0 END) AS isGm FROM profiles p LEFT JOIN campaign_members cm ON cm.profile_id=p.id WHERE p.id=? GROUP BY p.id`).bind(actorProfileId).first<{ globalRole: string; isGm: number }>();
  if (!access || (access.globalRole !== "OVERSEER" && !access.isGm)) return Response.json({ error: "Редактировать заклинания может Мастер или Overseer" }, { status: 403 });
  const spell = await env.DB.prepare("SELECT id FROM spells WHERE id=?").bind(id).first<{ id: string }>();
  if (!spell) return Response.json({ error: "Заклинание не найдено" }, { status: 404 });
  const nameEn = String(body.nameEn ?? "").trim().slice(0, 120);
  if (!nameEn) return Response.json({ error: "Укажите английское название" }, { status: 400 });
  await env.DB.prepare(`UPDATE spells SET name_en=?,name_ru=?,level=?,school=?,casting_time=?,range=?,components=?,duration=?,classes_json=?,description=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(nameEn, String(body.nameRu ?? "").trim().slice(0, 120), Math.max(0, Math.min(9, Number(body.level ?? 0))), String(body.school ?? "Other").slice(0, 60), String(body.castingTime ?? "Действие").slice(0, 100), String(body.range ?? "На себя").slice(0, 100), String(body.components ?? "").slice(0, 500), String(body.duration ?? "Мгновенно").slice(0, 100), JSON.stringify(body.classes ?? []), String(body.description ?? "").slice(0, 10000), id).run();
  return Response.json({ id, nameEn });
}
