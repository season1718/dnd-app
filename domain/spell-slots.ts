export type SpellSlot = { pool: string; level: number; maximum: number; spent: number };

export function spendSpellSlot(slots: SpellSlot[], index: number) {
  return slots.map((slot, slotIndex) => slotIndex === index ? { ...slot, spent: Math.min(slot.maximum, slot.spent + 1) } : slot);
}

export function restoreSpellSlot(slots: SpellSlot[], index: number) {
  return slots.map((slot, slotIndex) => slotIndex === index ? { ...slot, spent: Math.max(0, slot.spent - 1) } : slot);
}
