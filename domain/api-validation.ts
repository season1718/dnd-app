import { z } from "zod";

const identifier = z.string().trim().min(1).max(120);
const boundedText = (maximum: number) => z.string().trim().max(maximum);
const finiteInteger = (minimum: number, maximum: number) => z.number().finite().int().min(minimum).max(maximum);
const portraitDataUrl = z.string().max(2_000_000).refine((value) => value === "" || /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(value), "Портрет должен быть изображением JPEG, PNG или WebP");

export const createCampaignSchema = z.object({
  actorProfileId: identifier,
  name: boundedText(100).min(1),
  description: boundedText(500).optional().default(""),
}).strict();

export const updateCampaignSchema = createCampaignSchema;

export const mutateProfileSchema = z.object({
  actorProfileId: identifier,
  name: boundedText(60).min(1),
  globalRole: z.enum(["USER", "OVERSEER"]).optional().default("USER"),
}).strict();

export const updateCampaignMemberSchema = z.object({
  actorProfileId: identifier,
  profileId: identifier,
  role: z.enum(["PLAYER", "GM"]),
}).strict();

export const createCharacterSchema = z.object({
  actorProfileId: identifier,
  campaignId: identifier,
  name: boundedText(100).min(1),
  kind: z.enum(["PC", "NPC"]).optional().default("PC"),
  assignToProfileId: identifier.optional(),
}).strict();

export const assignCharacterSchema = z.object({
  actorProfileId: identifier,
  assignedProfileIds: z.array(identifier).max(100),
}).strict().transform((value) => ({ ...value, assignedProfileIds: [...new Set(value.assignedProfileIds)] }));

export const importCharacterSchema = z.object({
  profileId: identifier,
  campaignId: identifier,
  assignToProfileId: identifier.optional(),
  document: z.unknown().refine((value) => value !== null && value !== undefined, "Документ обязателен"),
}).strict();

export const updateCharacterSchema = z.object({
  profileId: identifier,
  expectedRevision: z.string().max(120),
  currentHp: finiteInteger(0, 1_000_000),
  temporaryHp: finiteInteger(0, 1_000_000).optional(),
  coins: z.object({ gp: finiteInteger(0, 1_000_000_000).optional() }).strict().optional(),
  notes: boundedText(5000).optional(),
  inspiration: z.boolean().optional(),
  deathSuccesses: finiteInteger(0, 3).optional(),
  deathFailures: finiteInteger(0, 3).optional(),
  resources: z.array(z.object({
    id: identifier, name: boundedText(120).optional(), spent: finiteInteger(0, 999),
    maximum: finiteInteger(0, 999).optional(), resetOn: z.enum(["SHORT_REST", "LONG_REST", "MANUAL"]).optional(),
  }).strict()).max(200).optional(),
  system: z.object({
    name: boundedText(100).min(1), kind: z.enum(["PC", "NPC"]), species: boundedText(100), background: boundedText(100), alignment: boundedText(100),
    experience: finiteInteger(0, 1_000_000_000), armorClass: finiteInteger(0, 100), speed: finiteInteger(0, 1000), maximumHp: finiteInteger(1, 1_000_000),
    portraitDataUrl: portraitDataUrl.optional(),
    strength: finiteInteger(1, 30), dexterity: finiteInteger(1, 30), constitution: finiteInteger(1, 30), intelligence: finiteInteger(1, 30), wisdom: finiteInteger(1, 30), charisma: finiteInteger(1, 30),
  }).strict().optional(),
  sections: z.record(z.string(), z.unknown()).superRefine((sections, context) => {
    const noteSchema = z.array(z.object({ id: identifier, text: boundedText(5000) }).strict()).max(100);
    for (const key of ["playerNotes", "gmNotes"] as const) if (key in sections) {
      const result = noteSchema.safeParse(sections[key]);
      if (!result.success) context.addIssue({ code: "custom", path: [key], message: "Некорректный формат заметок" });
    }
  }).optional(),
  classes: z.array(z.lazy(() => characterClassSchema)).max(20).optional(),
}).strict().superRefine(({ classes }, context) => {
  if (classes && classes.reduce((total, item) => total + item.level, 0) > 20) context.addIssue({ code: "custom", path: ["classes"], message: "Общий уровень не может превышать 20" });
});

export const characterClassSchema = z.object({
  className: boundedText(80).min(1),
  subclassName: boundedText(80).optional().default(""),
  level: finiteInteger(1, 20),
}).strict();

export const updateCharacterClassesSchema = z.object({
  actorProfileId: identifier,
  expectedRevision: z.string().max(120),
  classes: z.array(characterClassSchema).min(1).max(20),
}).strict().superRefine(({ classes }, context) => {
  if (classes.reduce((total, item) => total + item.level, 0) > 20) {
    context.addIssue({ code: "custom", path: ["classes"], message: "Общий уровень не может превышать 20" });
  }
});

export const applyLevelUpSchema = z.object({
  actorProfileId: identifier,
  expectedRevision: z.string().max(120),
  classKey: identifier,
  choices: z.array(z.object({
    id: identifier,
    kind: z.enum(["FEATURE", "SUBCLASS", "PROFICIENCY", "ABILITY", "FEAT"]),
    name: boundedText(120).optional().default(""),
    description: boundedText(2000).optional().default(""),
    ability: z.enum(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]).optional(),
    amount: finiteInteger(1, 2).optional(),
  }).strict()).max(20).optional().default([]),
}).strict();

export const acknowledgeLevelUpSchema = z.object({ profileId: identifier, eventId: identifier }).strict();

export const spellSlotSchema = z.object({
  pool: z.enum(["STANDARD", "PACT", "SPECIAL"]),
  level: finiteInteger(0, 9),
  maximum: finiteInteger(0, 99),
  spent: finiteInteger(0, 99),
}).strict().refine((slot) => slot.spent <= slot.maximum, {
  path: ["spent"],
  message: "Потраченных ячеек не может быть больше максимума",
});

export const updateSpellSlotsSchema = z.object({
  profileId: identifier,
  slots: z.array(spellSlotSchema).max(30),
}).strict();

export const characterSpellSchema = z.object({
  spellId: identifier,
  known: z.boolean(),
  prepared: z.boolean(),
}).strict();

export const updateCharacterSpellsSchema = z.object({
  profileId: identifier,
  preparedLimit: finiteInteger(0, 99).optional(),
  spells: z.array(characterSpellSchema).max(1000),
}).strict().superRefine(({ spells }, context) => {
  const ids = new Set<string>();
  spells.forEach((spell, index) => {
    if (ids.has(spell.spellId)) context.addIssue({ code: "custom", path: ["spells", index, "spellId"], message: "Заклинание указано повторно" });
    ids.add(spell.spellId);
  });
});

export const updateSpellbookSchema = z.object({
  profileId: identifier,
  expectedRevision: z.string().max(120),
  preparedLimit: finiteInteger(0, 99),
  spells: z.array(characterSpellSchema).max(1000),
  slots: z.array(spellSlotSchema).max(30),
}).strict().superRefine(({ spells }, context) => {
  const ids = new Set<string>();
  spells.forEach((spell, index) => {
    if (ids.has(spell.spellId)) context.addIssue({ code: "custom", path: ["spells", index, "spellId"], message: "Заклинание указано повторно" });
    ids.add(spell.spellId);
  });
});

export const spellMutationSchema = z.object({
  actorProfileId: identifier,
  nameEn: boundedText(120).min(1),
  nameRu: boundedText(120).optional().default(""),
  level: finiteInteger(0, 9),
  school: boundedText(60).min(1),
  castingTime: boundedText(100).min(1),
  range: boundedText(100).min(1),
  components: boundedText(500).optional().default(""),
  duration: boundedText(100).min(1),
  classes: z.array(boundedText(80).min(1)).max(30),
  description: boundedText(10_000).optional().default(""),
}).strict();

export async function parseJsonBody<T>(request: Request, schema: z.ZodType<T>): Promise<
  { success: true; data: T } | { success: false; response: Response }
> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return { success: false, response: Response.json({ error: "Тело запроса должно быть корректным JSON" }, { status: 400 }) };
  }

  const result = schema.safeParse(input);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    response: Response.json({
      error: "Некорректные данные запроса",
      issues: result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    }, { status: 400 }),
  };
}
