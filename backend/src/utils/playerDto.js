import { effectiveStats, computeOverall, rarityFromWeight } from './playerMath.js';

/**
 * 보유 선수 행을 API 응답용 선수 DTO로 변환함
 */
export function toPlayerDto(p) {
  const secondaryList = String(p.secondaryRole || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const roleCodes = [...new Set([p.preferredRole, ...secondaryList].filter(Boolean))];
  const baseStats = p.baseStats || {};
  const maxLevel = Number(p.maxLevel || baseStats.maxLevel || 20);
  const suspendedMatches = Number(p.suspendedMatches ?? baseStats.suspendedMatches ?? 0);

  return {
    userPlayerId: p.userPlayerId,
    playerId: p.playerId,
    name: p.name,
    mainPosition: p.mainPosition,
    preferredRoleCode: p.preferredRole || roleCodes[0] || p.mainPosition,
    secondaryRoleCode: secondaryList.join(',') || null,
    roleCodes,
    level: p.level,
    maxLevel,
    suspendedMatches,
    exp: p.exp ?? 0,
    stamina: p.stamina,
    baseStats,
    effectiveStats: effectiveStats(baseStats, p.level),
    overall: computeOverall(baseStats, p.level, p.mainPosition),
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