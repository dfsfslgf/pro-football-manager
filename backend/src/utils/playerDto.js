import { effectiveStats, computeOverall, rarityFromWeight } from './playerMath.js';


export function toPlayerDto(p) {
  const secondaryList = String(p.secondaryRole || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const roleCodes = [...new Set([p.preferredRole, ...secondaryList].filter(Boolean))];

  return {
    userPlayerId: p.userPlayerId,
    playerId: p.playerId,
    name: p.name,
    mainPosition: p.mainPosition,
    preferredRoleCode: p.preferredRole || roleCodes[0] || p.mainPosition,
    secondaryRoleCode: secondaryList.join(',') || null,
    roleCodes,
    level: p.level,
    exp: p.exp ?? 0,
    stamina: p.stamina,
    baseStats: p.baseStats,
    effectiveStats: effectiveStats(p.baseStats, p.level),
    overall: computeOverall(p.baseStats, p.level, p.mainPosition),
    rarity: rarityFromWeight(p.dropWeight ?? 100),
    tags: p.tags || [],
    instruction: p.instruction || null,
    bonusGauge: p.bonusGauge ?? 0,
    isStarter: Boolean(p.isStarter),
    lineupSlot: p.lineupSlot ?? null,
    stats: {
      matchesPlayed: p.matchesPlayed ?? 0,
      goals: p.goals ?? 0,
      assists: p.assists ?? 0,
      cleanSheets: p.cleanSheets ?? 0,
      goalsConceded: p.goalsConceded ?? 0,
      saves: p.saves ?? 0,
      shotsOnTarget: Math.max(p.goals ?? 0, p.shotsOnTarget ?? 0),
      yellowCards: p.yellowCards ?? 0,
      redCards: p.redCards ?? 0,
      avgRating: p.matchesPlayed ? Math.round((p.ratingSum / p.matchesPlayed) * 100) / 100 : 0,
    },
  };
}