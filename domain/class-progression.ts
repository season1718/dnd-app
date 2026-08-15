import progression from "../data/class-progression-2024.json" with { type: "json" };

const aliases: Record<string, keyof typeof progression.classes> = {
  варвар: "barbarian", bard: "bard", бард: "bard", barbarian: "barbarian", жрец: "cleric", cleric: "cleric", друид: "druid", druid: "druid",
  воин: "fighter", fighter: "fighter", монах: "monk", monk: "monk", паладин: "paladin", paladin: "paladin", следопыт: "ranger", ranger: "ranger",
  плут: "rogue", rogue: "rogue", чародей: "sorcerer", sorcerer: "sorcerer", колдун: "warlock", warlock: "warlock", волшебник: "wizard", wizard: "wizard",
};

export function classProgressionKey(name: string) { return aliases[name.trim().toLocaleLowerCase("ru")] ?? null; }

export type LevelUpChoice =
  | { id: string; kind: "ABILITY_OR_FEAT"; label: string }
  | { id: string; kind: "FEATURE" | "SUBCLASS" | "PROFICIENCY"; label: string };

const progressionValueLabels: Record<string, string> = {
  "Bardic Die": "Кость бардовского вдохновения", Cantrips: "Заговоры", "Channel Divinity": "Божественный канал",
  "Eldritch Invocations": "Таинственные воззвания", "Favored Enemy": "Избранный враг", "Focus Points": "Очки фокуса",
  "Martial Arts": "Боевые искусства", "Prepared Spells": "Подготовленные заклинания", "Rage Damage": "Урон ярости",
  Rages: "Использования ярости", "Second Wind": "Второе дыхание", "Slot Level": "Круг ячеек", "Sneak Attack": "Скрытая атака",
  "Sorcery Points": "Очки чародейства", "Spell Slots": "Ячейки заклинаний", "Unarmored Movement": "Движение без доспехов",
  "Weapon Mastery": "Оружейные приёмы", "Wild Shape": "Дикая форма",
};

export function progressionValueLabel(name: string) {
  const slot = name.match(/^Slot ([1-9])$/);
  return slot ? `Ячейки ${slot[1]} круга` : progressionValueLabels[name] ?? name;
}

export function previewClassLevelUp(className: string, currentLevel: number) {
  const key = classProgressionKey(className);
  if (!key || currentLevel < 1 || currentLevel >= 20) return null;
  const next = progression.classes[key].levels[currentLevel];
  const slots = Object.entries(next.values).filter(([name]) => name.startsWith("Slot ")).map(([name, value]) => ({ level: Number(name.slice(5)), maximum: value === "—" ? 0 : Number(value) }));
  const preparedSpells = "Prepared Spells" in next.values ? Number(next.values["Prepared Spells" as keyof typeof next.values]) : null;
  const resources: Array<{ key: string; name: string; maximum: number; resetOn: "SHORT_REST" | "LONG_REST" }> = [];
  const resourceColumns: Record<string, [string, "SHORT_REST" | "LONG_REST"]> = { Rages: ["Ярость", "LONG_REST"], "Second Wind": ["Второе дыхание", "SHORT_REST"], "Focus Points": ["Очки фокуса", "SHORT_REST"], "Channel Divinity": ["Божественный канал", "SHORT_REST"], "Sorcery Points": ["Очки чародейства", "LONG_REST"] };
  Object.entries(next.values).forEach(([column, value]) => { const mapped = resourceColumns[column]; const maximum = Number(value); if (mapped && Number.isFinite(maximum)) resources.push({ key: column.toLocaleLowerCase("en").replace(/\s+/g, "-"), name: mapped[0], maximum, resetOn: mapped[1] }); });
  const actionSurge = next.featuresRu.find((feature) => feature.toLocaleLowerCase("ru").startsWith("всплеск действий"));
  if (actionSurge) resources.push({ key: "action-surge", name: "Всплеск действий", maximum: Number(actionSurge.match(/(\d+)/)?.[1] ?? 1), resetOn: "SHORT_REST" });
  const choices: LevelUpChoice[] = next.featuresRu.flatMap((feature): LevelUpChoice[] => {
    const value = feature.toLocaleLowerCase("ru");
    if (value === "улучшение характеристик") return [{ id: "ability-or-feat", kind: "ABILITY_OR_FEAT" as const, label: "Улучшение характеристик или черта" }];
    if (value === "эпическая черта") return [{ id: "epic-feat", kind: "FEATURE", label: "Выберите эпическую черту" }];
    if (value.includes("подкласс") && !value.includes("умение подкласса")) return [{ id: "subclass", kind: "SUBCLASS" as const, label: "Выберите подкласс" }];
    if (value.includes("боевой стиль")) return [{ id: "fighting-style", kind: "FEATURE" as const, label: "Выберите боевой стиль" }];
    if (value.includes("метамагия")) return [{ id: "metamagic", kind: "FEATURE" as const, label: "Укажите выбранную метамагию" }];
    if (value.includes("таинственные воззвания")) return [{ id: "invocation", kind: "FEATURE" as const, label: "Укажите выбранное воззвание" }];
    if (value === "божественный порядок") return [{ id: "divine-order", kind: "FEATURE", label: "Выберите Божественный порядок" }];
    if (value === "первобытный порядок") return [{ id: "primal-order", kind: "FEATURE", label: "Выберите Первобытный порядок" }];
    return [];
  });
  return { source: progression.source, version: progression.version, classKey: key, className: progression.classes[key].nameRu, previousLevel: currentLevel, newLevel: currentLevel + 1, proficiencyBonus: next.proficiencyBonus, features: next.featuresRu, values: next.values, slots, preparedSpells, resources, choices };
}
