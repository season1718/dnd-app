export const canonicalSpellClasses = [
  ["bard", "Бард"],
  ["cleric", "Жрец"],
  ["druid", "Друид"],
  ["paladin", "Паладин"],
  ["ranger", "Следопыт"],
  ["sorcerer", "Чародей"],
  ["warlock", "Колдун"],
  ["wizard", "Волшебник"],
] as const;

const aliases = new Map<string, string>(canonicalSpellClasses.flatMap(([key, label]) => [[key, key], [label.toLocaleLowerCase("ru"), key]]));

export function canonicalClassKey(value: string) {
  return aliases.get(value.trim().toLocaleLowerCase("ru")) ?? "other";
}

export function spellMatchesClassFilter(classes: string[], filter: string) {
  if (filter === "all") return true;
  return classes.some((className) => canonicalClassKey(className) === filter);
}

export function spellMatchesClassFilters(classes: string[], filters: string[]) {
  return filters.length === 0 || filters.some((filter) => spellMatchesClassFilter(classes, filter));
}
