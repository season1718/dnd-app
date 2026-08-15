import { z } from "zod";

const integer = (minimum: number, maximum: number) => z.number().finite().int().min(minimum).max(maximum);
const text = (maximum: number) => z.string().max(maximum);
const portraitDataUrl = z.string().max(2_000_000).refine((value) => value === "" || /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(value), "Некорректный портрет");

const classSchema = z.object({ className: text(80).min(1), subclassName: text(80), level: integer(1, 20) }).strict();
const resourceSchema = z.object({ name: text(120).min(1), maximum: integer(0, 999), spent: integer(0, 999), resetOn: z.enum(["SHORT_REST", "LONG_REST", "MANUAL"]) }).strict()
  .refine((resource) => resource.spent <= resource.maximum, { path: ["spent"], message: "Расход ресурса превышает максимум" });
const slotSchema = z.object({ pool: z.enum(["STANDARD", "PACT", "SPECIAL"]), level: integer(0, 9), maximum: integer(0, 99), spent: integer(0, 99) }).strict()
  .refine((slot) => slot.spent <= slot.maximum, { path: ["spent"], message: "Расход ячеек превышает максимум" });
const spellSchema = z.object({
  id: text(120).min(1), nameEn: text(120).min(1), nameRu: text(120), level: integer(0, 9), school: text(60).min(1),
  castingTime: text(100).min(1), range: text(100).min(1), components: text(500), duration: text(100).min(1),
  classes: z.array(text(80).min(1)).max(30), description: text(10_000), source: text(120).min(1), sourceBook: text(200).optional().default(""), sourcePage: integer(1, 10_000).nullable().optional().default(null),
  known: z.boolean(), prepared: z.boolean(), alwaysPrepared: z.boolean(),
}).strict();

export const dndCompanionCharacterSchema = z.object({
  format: z.literal("dnd-companion-character"),
  version: z.literal(1),
  exportedAt: z.string(),
  character: z.object({
    name: text(100).min(1), kind: z.enum(["PC", "NPC"]), species: text(100), background: text(100), alignment: text(100),
    portraitDataUrl: portraitDataUrl.optional().default(""),
    experience: integer(0, 10_000_000), abilities: z.object({ strength: integer(1, 30), dexterity: integer(1, 30), constitution: integer(1, 30), intelligence: integer(1, 30), wisdom: integer(1, 30), charisma: integer(1, 30) }).strict(),
    armorClass: integer(0, 100), speed: integer(0, 1000), maximumHp: integer(1, 1_000_000), currentHp: integer(0, 1_000_000), temporaryHp: integer(0, 1_000_000),
    inspiration: z.boolean(), deathSuccesses: integer(0, 3), deathFailures: integer(0, 3),
    coins: z.object({ cp: integer(0, 1_000_000_000), sp: integer(0, 1_000_000_000), ep: integer(0, 1_000_000_000), gp: integer(0, 1_000_000_000), pp: integer(0, 1_000_000_000) }).strict(),
    equipment: z.array(text(500)).max(1000), notes: z.array(z.union([text(5000), z.object({ title: text(200), text: text(5000) }).strict()])).max(1000),
    classes: z.array(classSchema).max(20), resources: z.array(resourceSchema).max(200), sections: z.record(z.string(), z.unknown()),
    spellSlots: z.array(slotSchema).max(30), spells: z.array(spellSchema).max(1000),
  }).strict().refine((character) => character.currentHp <= character.maximumHp, { path: ["currentHp"], message: "Текущие хиты превышают максимум" }),
}).strict();

export type DndCompanionCharacterDocument = z.infer<typeof dndCompanionCharacterSchema>;
