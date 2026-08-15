export function compactSpellComponents(value: string) {
  const verbal = /(?:^|[,;]\s*)V(?:\s*[,;]|$)|вербальн/i.test(value);
  const somatic = /(?:^|[,;]\s*)S(?:\s*[,;]|$)|соматическ/i.test(value);
  const material = /(?:^|[,;]\s*)M(?:\s|[,;(]|$)|материальн|material/i.test(value);
  const materialMatch = value.match(/(?:материальн[а-яё]*|material(?:\s+component)?|(?:^|[,;]\s*)M)\s*(?:\(([^)]+)\)|[:—–-]\s*(.+))?/i);
  return {
    verbal,
    somatic,
    material,
    materialText: materialMatch?.[1]?.trim() || materialMatch?.[2]?.trim() || "Материальный компонент указан без подробного описания",
  };
}
