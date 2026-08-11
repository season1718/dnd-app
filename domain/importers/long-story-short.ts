export type ImportedCharacter = {
  name: string;
  kind: "PC" | "NPC";
  species: string;
  background: string;
  alignment: string;
  experience: number;
  abilities: { strength: number; dexterity: number; constitution: number; intelligence: number; wisdom: number; charisma: number };
  armorClass: number;
  speed: number;
  maximumHp: number;
  currentHp: number;
  temporaryHp: number;
  deathSuccesses: number;
  deathFailures: number;
  inspiration: boolean;
  coins: Record<"cp" | "sp" | "ep" | "gp" | "pp", number>;
  equipment: string[];
  notes: Array<{ title: string; text: string }>;
  classes: Array<{ classKey: string; className: string; subclassName: string; level: number }>;
  resources: Array<{ name: string; maximum: number; spent: number; resetOn: "SHORT_REST" | "LONG_REST" | "MANUAL" }>;
  warnings: string[];
};

type AnyRecord = Record<string, any>;

function record(value: unknown, label: string): AnyRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}: ожидался объект`);
  return value as AnyRecord;
}

function number(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }

function richTextToPlain(value: unknown): string {
  if (typeof value === "string") {
    return value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  if (!value || typeof value !== "object") return "";
  const node = value as AnyRecord;
  const own = typeof node.text === "string" ? node.text : "";
  const children = Array.isArray(node.content) ? node.content.map(richTextToPlain).filter(Boolean) : [];
  return [own, ...children].filter(Boolean).join(node.type === "paragraph" || node.type === "taskItem" ? "\n" : "").trim();
}

function fieldValue(parent: AnyRecord | undefined, key: string, fallback: unknown = "") {
  return parent?.[key]?.value ?? fallback;
}

function readEquipment(sheet: AnyRecord): string[] {
  const content = sheet.text?.equipment?.value?.data?.content;
  if (!Array.isArray(content)) return [];
  const values: string[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const item = node as AnyRecord;
    if (item.type === "taskItem") {
      const label = richTextToPlain(item).replace(/\n/g, " ").trim();
      if (label) values.push(label);
      return;
    }
    if (Array.isArray(item.content)) item.content.forEach(visit);
  };
  content.forEach(visit);
  return [...new Set(values)];
}

function readNotes(sheet: AnyRecord) {
  const notes: Array<{ title: string; text: string }> = [];
  const blocks = sheet.text ?? {};
  for (const [key, block] of Object.entries(blocks)) {
    if (!key.startsWith("notes-") && !["traits", "background", "allies", "quests", "features"].includes(key)) continue;
    const raw = (block as AnyRecord)?.value?.data;
    const parsed = richTextToPlain(raw);
    if (parsed) notes.push({ title: key, text: parsed });
  }
  return notes;
}

export function parseLongStoryShortV2(input: unknown): ImportedCharacter {
  const envelope = record(input, "Файл");
  if (envelope.jsonType !== "character" || String(envelope.version) !== "2") throw new Error("Поддерживается экспорт Long Story Short: character v2");
  let sheet: AnyRecord;
  try { sheet = record(JSON.parse(text(envelope.data)), "Поле data"); }
  catch (error) { if (error instanceof SyntaxError) throw new Error("Поле data содержит некорректный JSON"); throw error; }
  if (sheet.jsonType !== "character") throw new Error("Во вложенных данных не найден персонаж");

  const charClass = text(fieldValue(sheet.info, "charClass")) || "Неизвестный класс";
  const level = Math.max(1, Math.trunc(number(fieldValue(sheet.info, "level"), 1)));
  const vitality = sheet.vitality ?? {};
  const stats = sheet.stats ?? {};
  const coins = sheet.coins ?? {};
  const warnings: string[] = [];
  if (sheet.spells && !Array.isArray(sheet.spells)) warnings.push("Текстовые блоки заклинаний сохранены отдельно от каталога и не импортированы как заклинания.");
  if (Array.isArray(sheet.weaponsList) && sheet.weaponsList.length) warnings.push("Оружие перенесено в снаряжение; структурированные атаки будут добавлены следующим форматом импорта.");

  const equipment = readEquipment(sheet);
  for (const weapon of sheet.weaponsList ?? []) {
    const label = [text(weapon?.name?.value), text(weapon?.dmg?.value)].filter(Boolean).join(" — ");
    if (label && !equipment.includes(label)) equipment.push(label);
  }

  return {
    name: text(sheet.name?.value) || "Безымянный персонаж",
    kind: "PC",
    species: text(fieldValue(sheet.info, "race")),
    background: text(fieldValue(sheet.info, "background")),
    alignment: text(fieldValue(sheet.info, "alignment")),
    experience: Math.max(0, Math.trunc(number(fieldValue(sheet.info, "experience")))),
    abilities: {
      strength: number(stats.str?.score, 10), dexterity: number(stats.dex?.score, 10),
      constitution: number(stats.con?.score, 10), intelligence: number(stats.int?.score, 10),
      wisdom: number(stats.wis?.score, 10), charisma: number(stats.cha?.score, 10),
    },
    armorClass: number(vitality.ac?.value, 10), speed: number(vitality.speed?.value, 30),
    maximumHp: Math.max(1, number(vitality["hp-max"]?.value, 1)),
    currentHp: Math.max(0, number(vitality["hp-current"]?.value, 1)),
    temporaryHp: Math.max(0, number(vitality["hp-temp"]?.value)),
    deathSuccesses: Math.max(0, Math.min(3, number(sheet.deathSuccesses ?? vitality.deathSuccesses))),
    deathFailures: Math.max(0, Math.min(3, number(sheet.deathFails ?? vitality.deathFails))),
    inspiration: Boolean(sheet.inspiration),
    coins: { cp: number(coins.cp?.value), sp: number(coins.sp?.value), ep: number(coins.ep?.value), gp: number(coins.gp?.value), pp: number(coins.pp?.value) },
    equipment, notes: readNotes(sheet),
    classes: [{ classKey: charClass.toLocaleLowerCase("ru").replace(/\s+/g, "-"), className: charClass, subclassName: text(fieldValue(sheet.info, "charSubclass")), level }],
    resources: [], warnings,
  };
}
