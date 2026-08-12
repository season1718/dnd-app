import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { updateCharacterClassesSchema, updateCharacterSchema, updateCharacterSpellsSchema, updateSpellbookSchema, updateSpellSlotsSchema } from "../domain/api-validation.ts";
import { canEditCharacterField } from "../domain/access.ts";
import { dndCompanionCharacterSchema } from "../domain/character-transfer.ts";
import { applySpellOverride, spellPatch } from "../domain/spell-overrides.ts";
import { canonicalSpellClasses, spellMatchesClassFilter, spellMatchesClassFilters } from "../domain/spell-classes.ts";
import { restoreSpellSlot, spendSpellSlot } from "../domain/spell-slots.ts";
import { restoreCharacterResource, spendCharacterResource } from "../domain/character-resources.ts";

test("contains the D&D Companion product shell", async () => {
  const [page, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /D&D Companion/);
  assert.match(page, /ManagementPanel/);
  assert.match(page, /Spellbook/);
});

test("ships the validated 2024 spell catalog", async () => {
  const catalog = JSON.parse(await readFile(new URL("../data/spells-2024-ru.json", import.meta.url), "utf8"));
  assert.equal(catalog.spell_count, 387);
  assert.equal(catalog.spells.length, 387);
  assert.equal(new Set(catalog.spells.map((spell) => spell.id)).size, 387);
});

test("validates bounded character classes and rejects invalid totals", () => {
  assert.equal(updateCharacterClassesSchema.safeParse({ actorProfileId: "gm", expectedRevision: "r1", classes: [{ className: "Воин", level: 20 }] }).success, true);
  assert.equal(updateCharacterClassesSchema.safeParse({ actorProfileId: "gm", expectedRevision: "r1", classes: [{ className: "Воин", level: 20 }, { className: "Плут", level: 1 }] }).success, false);
  assert.equal(updateCharacterClassesSchema.safeParse({ actorProfileId: "gm", expectedRevision: "r1", classes: [{ className: "Воин", level: Number.NaN }] }).success, false);
});

test("rejects malformed slot pools and duplicate spell updates", () => {
  assert.equal(updateSpellSlotsSchema.safeParse({ profileId: "player", slots: [{ pool: "STANDARD", level: 1, maximum: 2, spent: 3 }] }).success, false);
  assert.equal(updateSpellSlotsSchema.safeParse({ profileId: "player", slots: [{ pool: "INVALID", level: 1, maximum: 2, spent: 0 }] }).success, false);
  assert.equal(updateCharacterSpellsSchema.safeParse({ profileId: "player", spells: [
    { spellId: "spell-1", known: true, prepared: false },
    { spellId: "spell-1", known: true, prepared: true },
  ] }).success, false);
});

test("requires an optimistic revision for character saves", () => {
  const payload = { profileId: "player", currentHp: 10 };
  assert.equal(updateCharacterSchema.safeParse(payload).success, false);
  assert.equal(updateCharacterSchema.safeParse({ ...payload, expectedRevision: "revision-1" }).success, true);
});

test("requires a separate optimistic revision for atomic spellbook saves", () => {
  const payload = { profileId: "player", preparedLimit: 3, spells: [], slots: [] };
  assert.equal(updateSpellbookSchema.safeParse(payload).success, false);
  assert.equal(updateSpellbookSchema.safeParse({ ...payload, expectedRevision: "spellbook-r1" }).success, true);
});

test("enforces Player, GM and Overseer character-field rules", () => {
  assert.equal(canEditCharacterField({ globalRole: "USER", campaignRole: "PLAYER", assigned: true, field: "currentHp" }), true);
  assert.equal(canEditCharacterField({ globalRole: "USER", campaignRole: "PLAYER", assigned: false, field: "currentHp" }), false);
  assert.equal(canEditCharacterField({ globalRole: "USER", campaignRole: "PLAYER", assigned: true, field: "classes" }), false);
  assert.equal(canEditCharacterField({ globalRole: "USER", campaignRole: "GM", assigned: false, field: "classes" }), true);
  assert.equal(canEditCharacterField({ globalRole: "OVERSEER", campaignRole: "PLAYER", assigned: false, field: "classes" }), true);
});

test("validates the versioned D&D Companion transfer format", () => {
  const document = {
    format: "dnd-companion-character", version: 1, exportedAt: "2026-08-12T00:00:00.000Z",
    character: {
      name: "Тестовый герой", kind: "PC", species: "Человек", background: "", alignment: "", experience: 0,
      abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
      armorClass: 10, speed: 30, maximumHp: 10, currentHp: 10, temporaryHp: 0, inspiration: false, deathSuccesses: 0, deathFailures: 0,
      coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }, equipment: [], notes: [], classes: [], resources: [], sections: {}, spellSlots: [], spells: [],
    },
  };
  assert.equal(dndCompanionCharacterSchema.safeParse(document).success, true);
  assert.equal(dndCompanionCharacterSchema.safeParse({ ...document, version: 2 }).success, false);
  assert.equal(dndCompanionCharacterSchema.safeParse({ ...document, character: { ...document.character, currentHp: 11 } }).success, false);
});

test("keeps campaign selection dynamic in client components", async () => {
  const [page, management] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ManagementPanel.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(page, /campaign-lss/);
  assert.doesNotMatch(management, /campaign-lss/);
  assert.match(page, /campaignId=/);
});

test("exposes spellbook sorting, preparation filters, reset, and full details", async () => {
  const spellbook = await readFile(new URL("../app/Spellbook.tsx", import.meta.url), "utf8");
  assert.match(spellbook, /Сортировка заклинаний/);
  assert.match(spellbook, /Подготовленные/);
  assert.match(spellbook, /Сбросить/);
  assert.match(spellbook, /role="dialog"/);
  assert.match(spellbook, /sourcePage/);
  assert.match(spellbook, /Правки каталога/);
  assert.match(spellbook, /document\.body\.style\.overflow = "hidden"/);
  assert.match(spellbook, /detailReturnFocusRef/);
});

test("uses canonical catalog spells for the Mirena fixture", async () => {
  const bootstrap = await readFile(new URL("../app/api/bootstrap/route.ts", import.meta.url), "utf8");
  assert.match(bootstrap, /phb2024-cure-wounds/);
  assert.match(bootstrap, /phb2024-guiding-bolt/);
  assert.match(bootstrap, /phb2024-spiritual-weapon/);
  assert.doesNotMatch(bootstrap, /"Abjuration"|"Evocation"/);
});

test("allows the spellbook to collapse per character", async () => {
  const spellbook = await readFile(new URL("../app/Spellbook.tsx", import.meta.url), "utf8");
  assert.match(spellbook, /spellbook-expanded:\$\{characterId\}/);
  assert.match(spellbook, /aria-expanded=\{expanded\}/);
  assert.match(spellbook, /Скрыть книгу/);
  assert.match(spellbook, /Показать книгу/);
});

test("protects catalog spells and exposes guarded custom-spell deletion", async () => {
  const spellbook = await readFile(new URL("../app/Spellbook.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/spells/[id]/route.ts", import.meta.url), "utf8");
  assert.match(spellbook, /spell\.source === "CUSTOM"/);
  assert.match(spellbook, /Это действие нельзя отменить/);
  assert.match(spellbook, /импортировано из каталога/);
  assert.match(spellbook, /const \{ classesText, \.\.\.spellFields \} = draft/);
  assert.match(route, /spell\.source !== "CUSTOM"/);
  assert.match(route, /NOT EXISTS \(SELECT 1 FROM character_spells/);
});

test("keeps catalog overrides separate and reports same-field conflicts", () => {
  const base = { nameEn: "Aid", nameRu: "Подмога", level: 2, school: "ограждение", castingTime: "1 действие", range: "30 футов", components: "В, С, М", duration: "8 часов", classesJson: "[]", description: "Исходное описание" };
  const patch = spellPatch(base, { ...base, description: "Пользовательская правка" });
  assert.deepEqual(patch, { description: "Пользовательская правка" });
  const merged = applySpellOverride({ ...base, description: "Обновлённое исходное описание", patchJson: JSON.stringify(patch), baseSnapshotJson: JSON.stringify(base) });
  assert.equal(merged.description, "Пользовательская правка");
  assert.deepEqual(merged.overrideConflicts, ["description"]);
});

test("groups spell filters into magical base classes and supports multi-select", () => {
  assert.equal(canonicalSpellClasses.length, 8);
  assert.deepEqual(canonicalSpellClasses.map(([, label]) => label), ["Бард", "Жрец", "Друид", "Паладин", "Следопыт", "Чародей", "Колдун", "Волшебник"]);
  assert.equal(spellMatchesClassFilter(["волшебник"], "wizard"), true);
  assert.equal(spellMatchesClassFilter(["Волшебник"], "wizard"), true);
  assert.equal(spellMatchesClassFilter(["иллюзионист"], "other"), true);
  assert.equal(spellMatchesClassFilter(["домен жизни"], "cleric"), false);
  assert.equal(spellMatchesClassFilters(["Жрец"], ["wizard", "cleric"]), true);
  assert.equal(spellMatchesClassFilters(["Друид"], ["wizard", "cleric"]), false);
});

test("bounds spell-slot spending and restoration", () => {
  const slots = [{ pool: "STANDARD", level: 1, maximum: 2, spent: 0 }];
  assert.equal(restoreSpellSlot(slots, 0)[0].spent, 0);
  assert.equal(spendSpellSlot(slots, 0)[0].spent, 1);
  assert.equal(spendSpellSlot([{ ...slots[0], spent: 2 }], 0)[0].spent, 2);
});

test("bounds character-resource spending and restoration", () => {
  const resources = [{ id: "second-wind", maximum: 2, spent: 0 }];
  assert.equal(restoreCharacterResource(resources, "second-wind")[0].spent, 0);
  assert.equal(spendCharacterResource(resources, "second-wind")[0].spent, 1);
  assert.equal(spendCharacterResource([{ ...resources[0], spent: 2 }], "second-wind")[0].spent, 2);
});
