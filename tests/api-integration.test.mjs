import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";

const port = 43000 + Math.floor(Math.random() * 1000);
let baseUrl = `http://localhost:${port}`;
let server;
let serverOutput = "";

async function waitForServer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Dev server exited early:\n${serverOutput}`);
    try {
      const response = await fetch(`${baseUrl}/api/profiles`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Dev server did not start:\n${serverOutput}`);
}

async function request(path, init = {}, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json().catch(() => ({}));
  assert.equal(response.status, expectedStatus, `${init.method ?? "GET"} ${path}: ${JSON.stringify(body)}`);
  return body;
}

function json(method, body) {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

test.before(async () => {
  try {
    const existing = await fetch("http://localhost:3000/api/profiles");
    if (existing.ok) {
      baseUrl = "http://localhost:3000";
      return;
    }
  } catch {
    // No preview server is running; start an isolated test server below.
  }
  server = spawn(process.execPath, ["node_modules/vinext/dist/cli.js", "dev", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => { serverOutput += chunk; });
  server.stderr.on("data", (chunk) => { serverOutput += chunk; });
  await waitForServer();
});

test.after(async () => {
  if (!server || server.exitCode !== null) return;
  server.kill("SIGTERM");
  await Promise.race([once(server, "exit"), new Promise((resolve) => setTimeout(resolve, 5000))]);
  if (server.exitCode === null) server.kill("SIGKILL");
});

test("enforces roles, revisions, transfer safety, and campaign isolation through HTTP", async () => {
  await request("/api/bootstrap?profileId=profile-overseer");
  // Seed characters are intentionally deletable, so integration scenarios must
  // create their own fixtures instead of depending on Ori or Mirena.
  const suffix = crypto.randomUUID().slice(0, 8);
  const outsider = await request("/api/profiles", json("POST", { actorProfileId: "profile-overseer", name: `Тестовый игрок ${suffix}` }), 201);
  const disposableProfile = await request("/api/profiles", json("POST", { actorProfileId: "profile-overseer", name: `Удаляемый профиль ${suffix}`, globalRole: "OVERSEER" }), 201);
  const disposableSpell = await request("/api/spells", json("POST", { actorProfileId: disposableProfile.id, nameEn: `Disposable Spell ${suffix}`, nameRu: "Удаляемая авторская ссылка", level: 0, school: "воплощение", castingTime: "1 действие", range: "На себя", components: "В", duration: "Мгновенно", classes: [], description: "Проверка удаления профиля-автора." }), 201);
  await request(`/api/profiles/${disposableProfile.id}?actorProfileId=profile-gm`, { method: "DELETE" }, 403);
  await request(`/api/profiles/${disposableProfile.id}?actorProfileId=profile-overseer`, { method: "DELETE" });
  const profilesAfterDeletion = await request("/api/profiles");
  assert.equal(profilesAfterDeletion.profiles.some((profile) => profile.id === disposableProfile.id), false);
  await request(`/api/spells/${disposableSpell.id}?actorProfileId=profile-overseer`, { method: "DELETE" });
  await request("/api/profiles/profile-overseer?actorProfileId=profile-overseer", { method: "DELETE" }, 409);
  let campaignId;
  let linkedCustomSpellId;
  try {
    const campaign = await request("/api/campaigns", json("POST", { actorProfileId: "profile-gm", name: `API Test ${suffix}`, description: "Изолированная интеграционная кампания" }), 201);
    campaignId = campaign.id;
    await request(`/api/campaigns/${campaignId}/members`, json("PUT", { actorProfileId: "profile-gm", profileId: outsider.id, role: "PLAYER" }));

    const first = await request("/api/characters", json("POST", { actorProfileId: "profile-gm", campaignId, name: `Герой ${suffix}`, kind: "PC", assignToProfileId: outsider.id }), 201);
    const second = await request("/api/characters", json("POST", { actorProfileId: "profile-gm", campaignId, name: `Спутник ${suffix}`, kind: "PC", assignToProfileId: outsider.id }), 201);

    const playerWorkspace = await request(`/api/bootstrap?profileId=${outsider.id}&campaignId=${campaignId}`);
    assert.deepEqual(new Set(playerWorkspace.characters.map((character) => character.id)), new Set([first.id, second.id]));
    await request(`/api/characters/${first.id}?profileId=profile-ori`, {}, 403);
    await request(`/api/characters/${second.id}?profileId=profile-gm`, { method: "DELETE" });
    const afterCharacterDeletion = await request(`/api/bootstrap?profileId=${outsider.id}&campaignId=${campaignId}`);
    assert.deepEqual(afterCharacterDeletion.characters.map((character) => character.id), [first.id]);
    assert.equal(afterCharacterDeletion.character.id, first.id);

    const original = await request(`/api/characters/${first.id}?profileId=${outsider.id}`);
    const playerSave = { profileId: outsider.id, expectedRevision: original.revision, currentHp: 1, coins: { gp: 7 }, notes: "Интеграционный черновик" };
    await request(`/api/characters/${first.id}`, json("PATCH", { ...playerSave, system: { name: "Подмена системного имени" } }), 400);
    const saved = await request(`/api/characters/${first.id}`, json("PATCH", playerSave));
    assert.notEqual(saved.revision, original.revision);
    await request(`/api/characters/${first.id}`, json("PATCH", playerSave), 409);
    const protectedCharacter = await request(`/api/characters/${first.id}?profileId=profile-gm`);
    assert.equal(protectedCharacter.name, `Герой ${suffix}`);
    assert.equal(protectedCharacter.current_hp, 1);

    const spellbook = await request(`/api/spells?profileId=${outsider.id}&characterId=${first.id}`);
    const bookSave = { profileId: outsider.id, expectedRevision: spellbook.revision, preparedLimit: spellbook.preparedLimit, spells: [], slots: [] };
    const savedBook = await request(`/api/characters/${first.id}/spellbook`, json("PUT", bookSave));
    assert.notEqual(savedBook.revision, spellbook.revision);
    await request(`/api/characters/${first.id}/spellbook`, json("PUT", bookSave), 409);
    await request(`/api/characters/${first.id}/spells`, json("PUT", {}), 410);
    await request(`/api/characters/${first.id}/spell-slots`, json("PATCH", {}), 410);

    const spellPayload = { actorProfileId: "profile-gm", nameEn: `Integration Spell ${suffix}`, nameRu: "Интеграционное заклинание", level: 1, school: "воплощение", castingTime: "1 действие", range: "30 футов", components: "В, С", duration: "Мгновенно", classes: ["Волшебник"], description: "Создано интеграционным тестом." };
    await request("/api/spells", json("POST", { ...spellPayload, actorProfileId: outsider.id }), 403);
    const unusedSpell = await request("/api/spells", json("POST", spellPayload), 201);
    await request(`/api/spells/${unusedSpell.id}?actorProfileId=${outsider.id}`, { method: "DELETE" }, 403);
    await request(`/api/spells/${unusedSpell.id}?actorProfileId=profile-gm`, { method: "DELETE" });
    await request("/api/spells/phb2024-cure-wounds?actorProfileId=profile-gm", { method: "DELETE" }, 409);

    const catalogBook = await request(`/api/spells?profileId=profile-gm&characterId=${first.id}`);
    const cureWounds = catalogBook.spells.find((spell) => spell.id === "phb2024-cure-wounds");
    const catalogEdit = { actorProfileId: "profile-gm", nameEn: cureWounds.nameEn, nameRu: `${cureWounds.nameRu} · тест`, level: cureWounds.level, school: cureWounds.school, castingTime: cureWounds.castingTime, range: cureWounds.range, components: cureWounds.components, duration: cureWounds.duration, classes: JSON.parse(cureWounds.classesJson), description: cureWounds.description };
    await request("/api/spells/phb2024-cure-wounds", json("PATCH", { ...catalogEdit, actorProfileId: outsider.id }), 403);
    await request("/api/spells/phb2024-cure-wounds", json("PATCH", catalogEdit));
    const editedCatalogBook = await request(`/api/spells?profileId=profile-gm&characterId=${first.id}`);
    const editedCureWounds = editedCatalogBook.spells.find((spell) => spell.id === "phb2024-cure-wounds");
    assert.equal(editedCureWounds.nameRu, `${cureWounds.nameRu} · тест`);
    assert.equal(editedCureWounds.overridden, true);
    await request("/api/spells/phb2024-cure-wounds/override?actorProfileId=" + outsider.id, { method: "DELETE" }, 403);
    await request("/api/spells/phb2024-cure-wounds/override?actorProfileId=profile-gm", { method: "DELETE" });
    const resetCatalogBook = await request(`/api/spells?profileId=profile-gm&characterId=${first.id}`);
    assert.equal(resetCatalogBook.spells.find((spell) => spell.id === "phb2024-cure-wounds").nameRu, cureWounds.nameRu);

    const linkedSpell = await request("/api/spells", json("POST", { ...spellPayload, nameEn: `Linked Spell ${suffix}` }), 201);
    linkedCustomSpellId = linkedSpell.id;
    const currentBook = await request(`/api/spells?profileId=${outsider.id}&characterId=${first.id}`);
    await request(`/api/characters/${first.id}/spellbook`, json("PUT", { profileId: "profile-gm", expectedRevision: currentBook.revision, preparedLimit: currentBook.preparedLimit, spells: [{ spellId: linkedSpell.id, known: true, prepared: true }], slots: currentBook.slots }));
    const blockedDeletion = await request(`/api/spells/${linkedSpell.id}?actorProfileId=profile-gm`, { method: "DELETE" }, 409);
    assert.equal(blockedDeletion.uses[0].name, `Герой ${suffix}`);

    const exported = await request(`/api/characters/${first.id}/export?profileId=profile-gm`);
    assert.equal(exported.format, "dnd-companion-character");
    const importedOnce = await request("/api/imports/dnd-companion", json("POST", { profileId: "profile-gm", campaignId, assignToProfileId: outsider.id, document: exported }), 201);
    const importedTwice = await request("/api/imports/dnd-companion", json("POST", { profileId: "profile-gm", campaignId, document: exported }), 201);
    assert.notEqual(importedOnce.id, first.id);
    assert.notEqual(importedTwice.id, importedOnce.id);
    assert.ok(importedTwice.warnings.length > 0);

    await request(`/api/characters/${first.id}?profileId=${outsider.id}`, { method: "DELETE" }, 403);
  } finally {
    await request("/api/spells/phb2024-cure-wounds/override?actorProfileId=profile-overseer", { method: "DELETE" });
    if (campaignId) await request(`/api/campaigns/${campaignId}?actorProfileId=profile-overseer`, { method: "DELETE" });
    if (linkedCustomSpellId) await request(`/api/spells/${linkedCustomSpellId}?actorProfileId=profile-overseer`, { method: "DELETE" });
    await request(`/api/profiles/${outsider.id}?actorProfileId=profile-overseer`, { method: "DELETE" });
  }
});
