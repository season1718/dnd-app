export type CharacterResourceValue = { id: string; maximum: number; spent: number };

export function spendCharacterResource<T extends CharacterResourceValue>(resources: T[], id: string) {
  return resources.map((resource) => resource.id === id ? { ...resource, spent: Math.min(resource.maximum, resource.spent + 1) } : resource);
}

export function restoreCharacterResource<T extends CharacterResourceValue>(resources: T[], id: string) {
  return resources.map((resource) => resource.id === id ? { ...resource, spent: Math.max(0, resource.spent - 1) } : resource);
}
