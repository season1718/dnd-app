export const experienceThresholds = [
  0, 300, 900, 2_700, 6_500, 14_000, 23_000, 34_000, 48_000, 64_000,
  85_000, 100_000, 120_000, 140_000, 165_000, 195_000, 225_000, 265_000, 305_000, 355_000,
] as const;

export function getExperienceProgress(level: number, experience: number) {
  const currentLevel = Math.max(1, Math.min(20, Math.trunc(level) || 1));
  const currentExperience = Math.max(0, Math.trunc(experience) || 0);
  const currentThreshold = experienceThresholds[currentLevel - 1];
  const nextThreshold = currentLevel < 20 ? experienceThresholds[currentLevel] : null;
  if (nextThreshold === null) return { currentLevel, currentExperience, currentThreshold, nextThreshold, nextLevel: null, remaining: 0, percent: 100, ready: true };
  const percent = Math.max(0, Math.min(100, (currentExperience / nextThreshold) * 100));
  const remaining = Math.max(0, nextThreshold - currentExperience);
  return { currentLevel, currentExperience, currentThreshold, nextThreshold, nextLevel: currentLevel + 1, remaining, percent, ready: remaining === 0 };
}
