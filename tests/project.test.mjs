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
import { characterFeatureFixtures } from "../domain/character-feature-fixtures.ts";
import { experienceThresholds, getExperienceProgress } from "../domain/experience.ts";
import { compactSpellComponents } from "../domain/spell-components.ts";
import { previewClassLevelUp, progressionValueLabel } from "../domain/class-progression.ts";
import { classFeatureDescription } from "../domain/class-feature-descriptions.ts";

test("contains the D&D Companion product shell", async () => {
  const [page, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /D&D Companion/);
  assert.match(page, /ManagementPanel/);
  assert.match(page, /Spellbook/);
});

test("uses an eleven-point star as the product mark", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const points = page.match(/<polygon points="([^"]+)"/)?.[1].trim().split(/\s+/) ?? [];
  assert.equal(points.length, 22);
  assert.match(page, /className="brand-mark" aria-hidden="true"/);
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

test("allows privileged users to delete seed characters with confirmation", async () => {
  const management = await readFile(new URL("../app/ManagementPanel.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(management, /character\.id !== "character-ori"|character\.id !== "character-mirena"/);
  assert.match(management, /Удалить персонажа: \$\{character\.name\}/);
  assert.match(management, /без возможности восстановления/);
});

test("allows Overseer to delete inactive local profiles with confirmation", async () => {
  const management = await readFile(new URL("../app/ManagementPanel.tsx", import.meta.url), "utf8");
  assert.match(management, /Удалить профиль: \$\{profile\.name\}/);
  assert.match(management, /Сами персонажи останутся/);
  assert.match(management, /profile\.id === actor\.id/);
  assert.match(management, /response\.json\(\)\.catch\(\(\) => \(\{\}\)\)/);
});

test("recovers when the initially selected local profile was deleted", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /response\.status === 404 && allowProfileRecovery/);
  assert.match(page, /item\.globalRole === "OVERSEER"/);
  assert.match(page, /setProfile\(fallback\.name\)/);
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

test("offers a persistent compact spell-row view with component details", async () => {
  const [spellbook, styles] = await Promise.all([
    readFile(new URL("../app/Spellbook.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(spellbook, /spellbook-view/);
  assert.match(spellbook, /aria-pressed=\{viewMode === "rows"\}/);
  assert.match(spellbook, /compactSpellComponents\(spell\.components\)/);
  assert.match(spellbook, /Вербальный компонент/);
  assert.match(spellbook, /Соматический компонент/);
  assert.match(spellbook, /className="material-component"/);
  assert.match(spellbook, /<PreparedFlame\/>/);
  assert.match(styles, /\.spell-table-row/);
});

test("prioritizes prepared, then known, then unavailable spells by default", async () => {
  const spellbook = await readFile(new URL("../app/Spellbook.tsx", import.meta.url), "utf8");
  assert.match(spellbook, /availability === "all" && preparation === "all"/);
  assert.match(spellbook, /left\.prepared \? 0 : left\.known \? 1 : 2/);
  assert.match(spellbook, /right\.prepared \? 0 : right\.known \? 1 : 2/);
  assert.match(spellbook, /if \(leftGroup !== rightGroup\) return leftGroup - rightGroup/);
});

test("uses a flame-only preparation control for players and checkboxes for privileged roles", async () => {
  const spellbook = await readFile(new URL("../app/Spellbook.tsx", import.meta.url), "utf8");
  assert.match(spellbook, /function PreparationToggle/);
  assert.match(spellbook, /prepared && <PreparedFlame\/>/);
  assert.match(spellbook, /aria-pressed=\{prepared\}/);
  assert.match(spellbook, /privileged \? <label><input type="checkbox"/);
  assert.match(spellbook, /Подготовлено<\/label> : <PreparationToggle/);
  assert.match(spellbook, /spell\.prepared \? "Да" : "Нет"/);
});

test("extracts every material component description from the spell catalog", async () => {
  const catalog = JSON.parse(await readFile(new URL("../data/spells-2024-ru.json", import.meta.url), "utf8"));
  const materialSpells = catalog.spells.filter((spell) => spell.components.M);
  assert.equal(materialSpells.length, 212);
  for (const spell of materialSpells) {
    const parsed = compactSpellComponents(spell.components.source_text);
    assert.equal(parsed.material, true, spell.name_en);
    assert.equal(parsed.materialText, spell.components.material, spell.name_en);
  }
  assert.equal(compactSpellComponents("Вербальный, материальный (светлячок или фосфоресцирующий мох)").materialText, "светлячок или фосфоресцирующий мох");
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

test("renders all standard skills in a compact three-column grid", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  for (const skill of ["Акробатика", "Анализ", "Атлетика", "Внимательность", "Выживание", "Выступление", "Запугивание", "История", "Ловкость рук", "Магия", "Медицина", "Обман", "Природа", "Проницательность", "Религия", "Скрытность", "Убеждение", "Уход за животными"]) assert.match(page, new RegExp(`name: "${skill}"`));
  assert.match(page, /withStandardSkills\(data\.sections\?\.skills\)/);
  assert.match(page, /skill\.proficient \? "skill proficient" : "skill"/);
  assert.doesNotMatch(page, /Бонус мастерства \+\{proficiencyBonus\}/);
  assert.match(styles, /\.skill-grid \{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(styles, /\.skill\.proficient \{[^}]*background:color-mix/);
});

test("does not leak Ori-specific combat data into other characters", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /attacks: \[\]/);
  assert.match(page, /features: \[\]/);
  assert.match(page, /proficiencies: \[\]/);
  assert.match(page, /hitDice: \[\]/);
  assert.doesNotMatch(page, /Двуручный меч|Второе дыхание|Тяжёлые доспехи|к10/);
  assert.match(page, /proficient: false/);
});

test("seeds Player's Handbook features for the current party", async () => {
  assert.deepEqual(Object.keys(characterFeatureFixtures).sort(), ["Амрот", "Кара", "Лотти Аккерман Лиадон", "Ори Картанг", "Роберт Баша", "Сестра Мирена"].sort());
  assert.equal(characterFeatureFixtures["Ори Картанг"].some((feature) => feature.name === "Второе дыхание"), true);
  assert.equal(characterFeatureFixtures["Сестра Мирена"].some((feature) => feature.name === "Сохранение жизни"), true);
  assert.match(characterFeatureFixtures["Амрот"].find((feature) => feature.name === "Происхождение исчадия")?.description ?? "", /не указан/);
  const bootstrap = await readFile(new URL("../app/api/bootstrap/route.ts", import.meta.url), "utf8");
  assert.match(bootstrap, /INSERT OR IGNORE INTO character_sections \(character_id,section,data_json\) SELECT id,'features'/);
});

test("allows GM and Overseer to remove character features from the draft", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /privileged \? <>/);
  assert.match(page, /Удалить особенность: \$\{feature\.name\}/);
  assert.match(page, /features\.filter\(\(_, itemIndex\) => itemIndex !== index\)/);
  assert.match(page, /Удалить особенность «\$\{feature\.name\}» из черновика\?/);
});

test("shows a dedicated module with removable proficiencies", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /<header><h3>Владения<\/h3>/);
  assert.doesNotMatch(page, /<h3>Спасброски и владения<\/h3>|Владение спасброском:/);
  assert.match(page, /Удалить владение: \$\{item\}/);
  assert.match(page, /proficiencies\.filter\(\(_, itemIndex\) => itemIndex !== index\)/);
});

test("calculates character experience progress without changing levels", async () => {
  assert.equal(experienceThresholds.length, 20);
  assert.equal(experienceThresholds[19], 355_000);
  const firstLevelProgress = getExperienceProgress(1, 200);
  assert.deepEqual({ ...firstLevelProgress, percent: Math.round(firstLevelProgress.percent) }, { currentLevel: 1, currentExperience: 200, currentThreshold: 0, nextThreshold: 300, nextLevel: 2, remaining: 100, percent: 67, ready: false });
  assert.equal(getExperienceProgress(1, 350).ready, true);
  assert.equal(getExperienceProgress(1, 350).percent, 100);
  assert.equal(getExperienceProgress(20, 355_000).nextLevel, null);
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /className="experience-track" role="progressbar"/);
  assert.match(page, /Доступен \$\{experienceProgress\.nextLevel\} уровень/);
});

test("does not duplicate Mirena's seeded cleric class", async () => {
  const bootstrap = await readFile(new URL("../app/api/bootstrap/route.ts", import.meta.url), "utf8");
  assert.match(bootstrap, /existing\.id<>'class-mirena-cleric'/);
  assert.match(bootstrap, /WHERE NOT EXISTS \(SELECT 1 FROM character_classes WHERE character_id=\? AND class_name='Жрец'\)/);
});

test("lets GM and Overseer add experience to the manual-save draft", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /function addExperienceDraft\(event: React\.FormEvent\)/);
  assert.match(page, /character\.experience \+ amount/);
  assert.match(page, /aria-label="Количество добавляемого опыта"/);
  assert.match(page, /onSubmit=\{addExperienceDraft\}/);
  assert.match(page, /сохраните изменения/);
});

test("uses inline forms instead of unsupported browser prompts", async () => {
  const [page, management] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ManagementPanel.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(`${page}\n${management}`, /window\.prompt|\bprompt\(/);
  assert.match(page, /aria-label="Новое владение"/);
  assert.match(page, /aria-label="Название нового класса"/);
  assert.match(management, /aria-label="Название новой кампании"/);
});

test("supports privileged portrait upload, cropping, validation, and transfer", async () => {
  const [page, cropper, database, validation, characterRoute, exportRoute, importRoute] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PortraitCropper.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/bootstrap.ts", import.meta.url), "utf8"),
    readFile(new URL("../domain/api-validation.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/characters/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/characters/[id]/export/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/imports/dnd-companion/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /privileged && <div className="portrait-actions">/);
  assert.match(page, /image\/png,image\/jpeg,image\/webp/);
  assert.match(cropper, /Положение портрета по горизонтали/);
  assert.match(cropper, /Положение портрета по вертикали/);
  assert.match(cropper, /Масштаб портрета/);
  assert.match(cropper, /toDataURL\("image\/jpeg", \.88\)/);
  assert.match(database, /ALTER TABLE characters ADD COLUMN portrait_data_url/);
  assert.match(validation, /portraitDataUrl/);
  assert.match(characterRoute, /value\.portraitDataUrl \?\? access\.portraitDataUrl/);
  assert.match(exportRoute, /portraitDataUrl: character\.portrait_data_url/);
  assert.match(importRoute, /portrait_data_url/);
  assert.match(page, /setResources\(savedResources\); setMessage\("Все изменения сохранены"\)/);
  const portraitDocument = {
    format: "dnd-companion-character", version: 1, exportedAt: "2026-08-14T00:00:00.000Z",
    character: {
      name: "Герой с портретом", kind: "PC", species: "Человек", background: "", alignment: "", portraitDataUrl: "data:image/jpeg;base64,YQ==", experience: 0,
      abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 }, armorClass: 10, speed: 30,
      maximumHp: 10, currentHp: 10, temporaryHp: 0, inspiration: false, deathSuccesses: 0, deathFailures: 0,
      coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }, equipment: [], notes: [], classes: [], resources: [], sections: {}, spellSlots: [], spells: [],
    },
  };
  assert.equal(dndCompanionCharacterSchema.safeParse(portraitDocument).success, true);
  assert.equal(dndCompanionCharacterSchema.safeParse({ ...portraitDocument, character: { ...portraitDocument.character, portraitDataUrl: "https://example.com/avatar.jpg" } }).success, false);
});

test("builds verified automatic class level-up previews", () => {
  const fighter = previewClassLevelUp("Воин", 4);
  assert.equal(fighter.newLevel, 5);
  assert.deepEqual(fighter.features, ["Дополнительная атака", "Тактическое перемещение"]);
  assert.equal(fighter.proficiencyBonus, 3);
  const cleric = previewClassLevelUp("Жрец", 4);
  assert.equal(cleric.preparedSpells, 9);
  assert.deepEqual(cleric.slots.slice(0, 3), [{ level: 1, maximum: 4 }, { level: 2, maximum: 3 }, { level: 3, maximum: 2 }]);
  assert.equal(previewClassLevelUp("Неизвестный класс", 1), null);
  assert.equal(previewClassLevelUp("Воин", 20), null);
  const fighterTwo = previewClassLevelUp("Воин", 1);
  assert.ok(fighterTwo.features.some((feature) => feature.startsWith("Всплеск действий")));
  assert.deepEqual(fighterTwo.resources.find((resource) => resource.key === "action-surge"), { key: "action-surge", name: "Всплеск действий", maximum: 1, resetOn: "SHORT_REST" });
  assert.deepEqual(previewClassLevelUp("Воин", 2).choices, [{ id: "subclass", kind: "SUBCLASS", label: "Выберите подкласс" }]);
  assert.deepEqual(previewClassLevelUp("Воин", 3).choices, [{ id: "ability-or-feat", kind: "ABILITY_OR_FEAT", label: "Улучшение характеристик или черта" }]);
});

test("localizes every class progression table label", async () => {
  const progression = JSON.parse(await readFile(new URL("../data/class-progression-2024.json", import.meta.url), "utf8"));
  const labels = new Set(Object.values(progression.classes).flatMap((characterClass) => characterClass.levels.flatMap((level) => Object.keys(level.values))));
  for (const label of labels) assert.doesNotMatch(progressionValueLabel(label), /^(?:Slot|Bardic|Cantrips|Channel|Eldritch|Favored|Focus|Martial|Prepared|Rage|Rages|Second|Sneak|Sorcery|Spell|Unarmored|Weapon|Wild)/, label);
  assert.equal(progressionValueLabel("Slot 9"), "Ячейки 9 круга");
});

test("uses handbook descriptions and deduplicates semantic resources during level-up", async () => {
  assert.match(classFeatureDescription("cleric", "Испепеление нежити") ?? "", /Изгнание нежити/);
  assert.match(classFeatureDescription("cleric", "Испепеление нежити") ?? "", /не прекращает эффект изгнания/);
  const [route, database] = await Promise.all([
    readFile(new URL("../app/api/characters/[id]/level-ups/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/bootstrap.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(route, /Получено на \$\{preview\.newLevel\}/);
  assert.match(route, /classFeatureDescription\(preview\.classKey, name\)/);
  assert.match(route, /ON CONFLICT DO UPDATE SET maximum=excluded\.maximum/);
  assert.match(database, /idx_character_resources_character_name/);
  assert.match(database, /GROUP BY character_id,LOWER\(TRIM\(name\)\)/);
  const bootstrap = await readFile(new URL("../app/api/bootstrap/route.ts", import.meta.url), "utf8");
  assert.match(bootstrap, /\^Получено на \\d\+ уровне класса/);
  assert.match(bootstrap, /classFeatureDescription\(classKey, feature\.name\)/);
});

test("applies level-ups to classes, features, resources, spell tables, and player notifications", async () => {
  const [route, panel] = await Promise.all([readFile(new URL("../app/api/characters/[id]/level-ups/route.ts", import.meta.url), "utf8"), readFile(new URL("../app/LevelUpPanel.tsx", import.meta.url), "utf8")]);
  assert.match(route, /UPDATE character_classes SET level=/);
  assert.match(route, /section='features'/);
  assert.match(route, /character_resources/);
  assert.match(route, /preparedLimit: preview\.preparedSpells/);
  assert.match(route, /pool='PACT'/);
  assert.match(route, /section='levelUps'/);
  assert.match(route, /choice\.kind === "PROFICIENCY"/);
  assert.match(route, /choice\.kind === "SUBCLASS"/);
  assert.match(route, /choice\.kind !== "ABILITY"/);
  assert.match(route, /choice\.kind === "FEATURE" \|\| choice\.kind === "FEAT"/);
  assert.match(panel, /Обязательные решения/);
  assert.match(panel, /disabled=\{!choicesComplete\}/);
  assert.match(panel, /Подтвердить повышение/);
  assert.match(panel, /Ознакомился/);
});

test("stacks sheet modules without cross-column gaps and protects GM notes", async () => {
  const [page, styles, route, bootstrap, exportRoute] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/characters/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/bootstrap/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/characters/[id]/export/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /sheet-column sheet-column-primary/);
  assert.match(page, /sheet-column sheet-column-secondary/);
  assert.ok(page.indexOf('id="features"') < page.indexOf('className="panel skills"'));
  assert.ok(page.indexOf('className="panel attacks-panel"') < page.indexOf('className="panel skills"'));
  assert.ok(page.indexOf('id="proficiencies"') > page.indexOf('className="panel skills"'));
  assert.match(styles, /\.sheet-column \{ display:grid;gap:14px/);
  assert.match(styles, /\.sheet-column\{display:contents\}/);
  assert.match(page, /\+ Дополнительная заметка/);
  assert.match(page, /\+ Заметка Мастера/);
  assert.match(page, /sections: privileged \? sections : \{ playerNotes: sections\.playerNotes \}/);
  assert.match(route, /row\.section !== "gmNotes"/);
  assert.match(bootstrap, /row\.section !== "gmNotes"/);
  assert.match(exportRoute, /row\.section !== "gmNotes"/);
  assert.match(route, /new Set\(\["playerNotes"\]\)/);
  const valid = updateCharacterSchema.safeParse({ profileId: "player", expectedRevision: "r1", currentHp: 10, sections: { playerNotes: [{ id: "note-1", text: "Запись" }] } });
  const invalid = updateCharacterSchema.safeParse({ profileId: "player", expectedRevision: "r1", currentHp: 10, sections: { gmNotes: [{ id: "note-1", text: 42 }] } });
  assert.equal(valid.success, true);
  assert.equal(invalid.success, false);
});
