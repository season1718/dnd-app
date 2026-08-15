const descriptions: Record<string, string> = {
  "cleric:Испепеление нежити": "Когда вы используете Изгнание нежити, бросьте количество к8, равное вашему модификатору Мудрости (минимум 1к8), и сложите результаты. Каждая нежить, провалившая спасбросок против этого применения, получает равный сумме урон излучением. Этот урон не прекращает эффект изгнания.",
};

export function classFeatureDescription(classKey: string, featureName: string) {
  return descriptions[`${classKey}:${featureName}`] ?? null;
}
