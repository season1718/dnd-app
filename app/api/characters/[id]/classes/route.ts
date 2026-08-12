import { env } from "cloudflare:workers";
import { ensureDatabase } from "../../../../../db/bootstrap";
import { parseJsonBody, updateCharacterClassesSchema } from "../../../../../domain/api-validation";

async function privileged(characterId: string, profileId: string | undefined) {
  const access = await env.DB.prepare(`SELECT p.global_role AS globalRole,cm.role AS campaignRole,c.revision FROM characters c JOIN profiles p ON p.id=? LEFT JOIN campaign_members cm ON cm.profile_id=p.id AND cm.campaign_id=c.campaign_id WHERE c.id=?`).bind(profileId, characterId).first<{ globalRole: string; campaignRole: string | null; revision: string }>();
  return access && (access.globalRole === "OVERSEER" || access.campaignRole === "GM") ? access : null;
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await context.params;
  const parsed = await parseJsonBody(request, updateCharacterClassesSchema);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;
  const access = await privileged(id, body.actorProfileId);
  if (!access) return Response.json({ error: "Классами управляет Мастер или Overseer" }, { status: 403 });
  if (access.revision !== body.expectedRevision) return Response.json({ error: "Персонаж уже изменён в другом окне" }, { status: 409 });
  const classes = body.classes;
  const totalLevel = classes.reduce((sum, item) => sum + item.level, 0);
  if (!classes.length || totalLevel > 20) return Response.json({ error: "Нужен хотя бы один класс; общий уровень не может превышать 20" }, { status: 400 });
  const revision = crypto.randomUUID();
  const statements = [env.DB.prepare("DELETE FROM character_classes WHERE character_id=? AND EXISTS (SELECT 1 FROM characters WHERE id=? AND revision=?)").bind(id, id, body.expectedRevision)];
  classes.forEach((item) => statements.push(env.DB.prepare("INSERT INTO character_classes (id,character_id,class_key,class_name,subclass_name,level) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM characters WHERE id=? AND revision=?)").bind(crypto.randomUUID(), id, item.className.toLocaleLowerCase("ru").replace(/\s+/g, "-"), item.className, item.subclassName, item.level, id, body.expectedRevision)));
  statements.push(env.DB.prepare("UPDATE characters SET revision=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=?").bind(revision, id, body.expectedRevision));
  const results = await env.DB.batch(statements);
  if (!results.at(-1)?.meta?.changes) return Response.json({ error: "Персонаж уже изменён в другом окне" }, { status: 409 });
  return Response.json({ ok: true, classes, totalLevel, revision });
}
