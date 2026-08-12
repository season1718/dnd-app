export type MutableSpellFields = {
  nameEn: string;
  nameRu: string;
  level: number;
  school: string;
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  classesJson: string;
  description: string;
};

export const mutableSpellKeys = ["nameEn", "nameRu", "level", "school", "castingTime", "range", "components", "duration", "classesJson", "description"] as const;

export function parseObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function spellPatch(base: MutableSpellFields, edited: MutableSpellFields) {
  return Object.fromEntries(mutableSpellKeys.filter((key) => base[key] !== edited[key]).map((key) => [key, edited[key]]));
}

export function applySpellOverride<T extends MutableSpellFields & { patchJson?: unknown; baseSnapshotJson?: unknown }>(spell: T) {
  const patch = parseObject(spell.patchJson);
  const baseSnapshot = parseObject(spell.baseSnapshotJson);
  const overrideConflicts = Object.keys(patch).filter((key) => key in baseSnapshot && key in spell && baseSnapshot[key] !== spell[key as keyof T]);
  const plain = Object.fromEntries(Object.entries(spell).filter(([key]) => key !== "patchJson" && key !== "baseSnapshotJson"));
  return { ...plain, ...patch, overridden: Object.keys(patch).length > 0, overrideConflicts } as Omit<T, "patchJson" | "baseSnapshotJson"> & { overridden: boolean; overrideConflicts: string[] };
}
