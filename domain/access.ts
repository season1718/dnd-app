export type GlobalRole = "USER" | "OVERSEER";
export type CampaignRole = "PLAYER" | "GM";

export type CharacterField =
  | "currentHp" | "temporaryHp" | "spentHitDice" | "deathSaves"
  | "inspiration" | "conditions" | "resources" | "equipment"
  | "coins" | "preparedSpells" | "notes"
  | "identity" | "classes" | "abilityScores" | "maximumHp"
  | "features" | "availableSpells";

const PLAYER_FIELDS = new Set<CharacterField>([
  "currentHp", "temporaryHp", "spentHitDice", "deathSaves", "inspiration",
  "conditions", "resources", "equipment", "coins", "preparedSpells", "notes",
]);

export function canEditCharacterField(input: {
  globalRole: GlobalRole;
  campaignRole: CampaignRole;
  assigned: boolean;
  field: CharacterField;
}) {
  if (input.globalRole === "OVERSEER" || input.campaignRole === "GM") return true;
  return input.assigned && PLAYER_FIELDS.has(input.field);
}
