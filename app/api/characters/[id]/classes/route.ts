import { env } from "cloudflare:workers";
import { ensureDatabase } from "../../../../../db/bootstrap";

async function privileged(characterId: string, profileId: string | undefined) {
  const access = await env.DB.prepare(`SELECT p.global_role AS globalRole,cm.role AS campaignRole FROM characters c JOIN profiles p ON p.id=? LEFT JOIN campaign_members cm ON cm.profile_id=p.id AND cm.campaign_id=c.campaign_id WHERE c.id=?`).bind(profileId, characterId).first<{ globalRole: string; campaignRole: string | null }>();
  return access && (access.globalRole === "OVERSEER" || access.campaignRole === "GM");
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await context.params;
  const body = await request.json() as { actorProfileId?: string; classes?: Array<{ className?: string; subclassName?: string; level?: number }> };
  if (!await privileged(id, body.actorProfileId)) return Response.json({ error: "Классами управляет Мастер или Overseer" }, { status: 403 });
  const classes = (body.classes ?? []).filter((item) => item.className?.trim()).map((item) => ({ className: item.className!.trim().slice(0, 80), subclassName: item.subclassName?.trim().slice(0, 80) ?? "", level: Math.max(1, Math.min(20, Math.trunc(Number(item.level ?? 1)))) }));
  const totalLevel = classes.reduce((sum, item) => sum + item.level, 0);
  if (!classes.length || totalLevel > 20) return Response.json({ error: "Нужен хотя бы один класс; общий уровень не может превышать 20" }, { status: 400 });
  await env.DB.prepare("DELETE FROM character_classes WHERE character_id=?").bind(id).run();
  await env.DB.batch(classes.map((item) => env.DB.prepare("INSERT INTO character_classes (id,character_id,class_key,class_name,subclass_name,level) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), id, item.className.toLocaleLowerCase("ru").replace(/\s+/g, "-"), item.className, item.subclassName, item.level)));
  return Response.json({ ok: true, classes, totalLevel });
}
