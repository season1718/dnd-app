import { env } from "cloudflare:workers";
import { ensureDatabase } from "../../../../db/bootstrap";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await context.params;
  const profileId = new URL(request.url).searchParams.get("profileId");
  if (!profileId) return Response.json({ error: "Не указан профиль" }, { status: 400 });
  const access = await env.DB.prepare(`SELECT p.global_role AS globalRole, cm.role AS campaignRole, ca.profile_id IS NOT NULL AS assigned FROM characters c JOIN profiles p ON p.id=? LEFT JOIN campaign_members cm ON cm.campaign_id=c.campaign_id AND cm.profile_id=p.id LEFT JOIN character_assignments ca ON ca.character_id=c.id AND ca.profile_id=p.id WHERE c.id=?`).bind(profileId, id).first<{ globalRole: string; campaignRole: string | null; assigned: number }>();
  if (!access || (access.globalRole !== "OVERSEER" && access.campaignRole !== "GM" && !access.assigned)) return Response.json({ error: "Нет доступа" }, { status: 403 });
  const character = await env.DB.prepare("SELECT * FROM characters WHERE id=?").bind(id).first();
  if (!character) return Response.json({ error: "Персонаж не найден" }, { status: 404 });
  const classes = (await env.DB.prepare("SELECT class_key AS classKey,class_name AS className,subclass_name AS subclassName,level FROM character_classes WHERE character_id=? ORDER BY id").bind(id).all()).results;
  const resources = (await env.DB.prepare("SELECT id,name,maximum,spent,reset_on AS resetOn FROM character_resources WHERE character_id=? ORDER BY name").bind(id).all()).results;
  const spellSlots = (await env.DB.prepare("SELECT pool,level,maximum,spent FROM spell_slot_pools WHERE character_id=? ORDER BY pool,level").bind(id).all()).results;
  const sectionRows = (await env.DB.prepare("SELECT section,data_json AS dataJson FROM character_sections WHERE character_id=?").bind(id).all()).results as Array<{ section: string; dataJson: string }>;
  const sections = Object.fromEntries(sectionRows.map((row) => [row.section, JSON.parse(row.dataJson)]));
  const assignedProfileIds = (await env.DB.prepare("SELECT profile_id AS profileId FROM character_assignments WHERE character_id=?").bind(id).all()).results.map((row) => row.profileId);
  return Response.json({ ...character, classes, resources, spellSlots, sections, assignedProfileIds, permissions: { privileged: access.globalRole === "OVERSEER" || access.campaignRole === "GM" } });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await context.params;
  const body = await request.json() as { profileId?: string; currentHp?: number; temporaryHp?: number; coins?: { gp?: number }; notes?: string; inspiration?: boolean; deathSuccesses?: number; deathFailures?: number; resources?: Array<{ id?: string; spent?: number; maximum?: number; resetOn?: string }>; system?: Record<string, unknown>; sections?: Record<string, unknown> };
  if (!body.profileId || !Number.isInteger(body.currentHp) || (body.currentHp ?? -1) < 0) return Response.json({ error: "Некорректные данные" }, { status: 400 });

  const access = await env.DB.prepare(`SELECT p.global_role AS globalRole, cm.role AS campaignRole, ca.profile_id IS NOT NULL AS assigned, c.maximum_hp AS maximumHp FROM characters c JOIN profiles p ON p.id=? LEFT JOIN campaign_members cm ON cm.campaign_id=c.campaign_id AND cm.profile_id=p.id LEFT JOIN character_assignments ca ON ca.character_id=c.id AND ca.profile_id=p.id WHERE c.id=?`).bind(body.profileId, id).first<{ globalRole: string; campaignRole: string | null; assigned: number; maximumHp: number }>();
  if (!access || (access.globalRole !== "OVERSEER" && access.campaignRole !== "GM" && !access.assigned)) return Response.json({ error: "Нет доступа" }, { status: 403 });
  const privileged = access.globalRole === "OVERSEER" || access.campaignRole === "GM";
  const hp = Math.min(body.currentHp!, access.maximumHp);
  const coins = JSON.stringify({ cp: 0, sp: 0, ep: 0, gp: Math.max(0, body.coins?.gp ?? 0), pp: 0 });
  const notes = JSON.stringify([body.notes ?? ""]);
  await env.DB.prepare("UPDATE characters SET current_hp=?,temporary_hp=?,inspiration=?,death_successes=?,death_failures=?,coins_json=?,notes_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(hp, Math.max(0, Number(body.temporaryHp ?? 0)), body.inspiration ? 1 : 0, Math.max(0, Math.min(3, Number(body.deathSuccesses ?? 0))), Math.max(0, Math.min(3, Number(body.deathFailures ?? 0))), coins, notes, id).run();
  if (body.system && privileged) {
    const value = body.system;
    const ability = (key: string) => Math.max(1, Math.min(30, Number(value[key] ?? 10)));
    await env.DB.prepare(`UPDATE characters SET name=?,kind=?,species=?,background=?,alignment=?,experience=?,strength=?,dexterity=?,constitution=?,intelligence=?,wisdom=?,charisma=?,armor_class=?,speed=?,maximum_hp=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(String(value.name ?? "Безымянный").trim().slice(0, 100), value.kind === "NPC" ? "NPC" : "PC", String(value.species ?? "").slice(0, 100), String(value.background ?? "").slice(0, 100), String(value.alignment ?? "").slice(0, 100), Math.max(0, Number(value.experience ?? 0)), ability("strength"), ability("dexterity"), ability("constitution"), ability("intelligence"), ability("wisdom"), ability("charisma"), Math.max(0, Number(value.armorClass ?? 10)), Math.max(0, Number(value.speed ?? 30)), Math.max(1, Number(value.maximumHp ?? 1)), id).run();
  }
  if (body.sections && privileged) {
    const allowed = new Set(["skills", "saves", "attacks", "features", "proficiencies", "conditions", "hitDice"]);
    const statements = Object.entries(body.sections).filter(([section]) => allowed.has(section)).map(([section, data]) => env.DB.prepare(`INSERT INTO character_sections (character_id,section,data_json) VALUES (?,?,?) ON CONFLICT(character_id,section) DO UPDATE SET data_json=excluded.data_json,updated_at=CURRENT_TIMESTAMP`).bind(id, section, JSON.stringify(data)));
    if (statements.length) await env.DB.batch(statements);
  }
  if (Array.isArray(body.resources)) {
    const statements = [];
    for (const resource of body.resources) {
      if (!resource.id) continue;
      const current = await env.DB.prepare("SELECT maximum,reset_on AS resetOn FROM character_resources WHERE id=? AND character_id=?").bind(resource.id, id).first<{ maximum: number; resetOn: string }>();
      if (!current) continue;
      const maximum = privileged ? Math.max(0, Math.trunc(Number(resource.maximum ?? current.maximum))) : current.maximum;
      const spent = Math.max(0, Math.min(maximum, Math.trunc(Number(resource.spent ?? 0))));
      const resetOn = privileged && ["SHORT_REST", "LONG_REST", "MANUAL"].includes(resource.resetOn ?? "") ? resource.resetOn! : current.resetOn;
      statements.push(env.DB.prepare("UPDATE character_resources SET maximum=?,spent=?,reset_on=? WHERE id=? AND character_id=?").bind(maximum, spent, resetOn, resource.id, id));
    }
    if (statements.length) await env.DB.batch(statements);
  }
  return Response.json({ ok: true, currentHp: hp, coins: JSON.parse(coins), notes: body.notes ?? "" });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await context.params;
  const body = await request.json() as { actorProfileId?: string; assignedProfileIds?: string[] };
  const access = await env.DB.prepare(`SELECT p.global_role AS globalRole,cm.role AS campaignRole FROM characters c JOIN profiles p ON p.id=? LEFT JOIN campaign_members cm ON cm.profile_id=p.id AND cm.campaign_id=c.campaign_id WHERE c.id=?`).bind(body.actorProfileId, id).first<{ globalRole: string; campaignRole: string | null }>();
  if (!access || (access.globalRole !== "OVERSEER" && access.campaignRole !== "GM")) return Response.json({ error: "Назначать персонажей может Мастер или Overseer" }, { status: 403 });
  const ids = [...new Set(body.assignedProfileIds ?? [])];
  await env.DB.prepare("DELETE FROM character_assignments WHERE character_id=?").bind(id).run();
  if (ids.length) await env.DB.batch(ids.map((profileId) => env.DB.prepare("INSERT INTO character_assignments (character_id,profile_id) SELECT ?,? WHERE EXISTS (SELECT 1 FROM profiles p JOIN characters c ON c.id=? JOIN campaign_members cm ON cm.campaign_id=c.campaign_id AND cm.profile_id=p.id WHERE p.id=?)").bind(id, profileId, id, profileId)));
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await context.params;
  const profileId = new URL(request.url).searchParams.get("profileId");
  if (!profileId) return Response.json({ error: "Не указан профиль" }, { status: 400 });
  const access = await env.DB.prepare(`SELECT p.global_role AS globalRole, cm.role AS campaignRole FROM characters c JOIN profiles p ON p.id=? LEFT JOIN campaign_members cm ON cm.campaign_id=c.campaign_id AND cm.profile_id=p.id WHERE c.id=?`).bind(profileId, id).first<{ globalRole: string; campaignRole: string | null }>();
  if (!access || (access.globalRole !== "OVERSEER" && access.campaignRole !== "GM")) return Response.json({ error: "Удалять персонажей может Мастер или Overseer" }, { status: 403 });
  await env.DB.prepare("DELETE FROM characters WHERE id=?").bind(id).run();
  return Response.json({ ok: true });
}
