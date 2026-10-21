import { effectiveStats, computeOverall, rarityFromWeight } from './playerMath.js';

/**
 * ClubRepository.getFullPlayers 행을 API 응답용 선수 DTO 로 변환합니다.
 * roleCodes: 선호 세부 포지션 + 훈련으로 얻은 보조 포지션 (둘 다 자연스러운 포지션으로 취급)
 * @param {Object} p
 * @returns {Object}
 */
export function toPlayerDto(p) {
  const roleCodes = [p.preferredRole, p.secondaryRole].filter(Boolean);
  return {
    userPlayerId: p.userPlayerId,
    playerId: p.playerId,
    name: p.name,
    mainPosition: p.mainPosition,
    preferredRoleCode: p.preferredRole || null,
    secondaryRoleCode: p.secondaryRole || null,
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
      shotsOnTarget: p.shotsOnTarget ?? 0,
      yellowCards: p.yellowCards ?? 0,
      redCards: p.redCards ?? 0,
      avgRating: p.matchesPlayed ? Math.round((p.ratingSum / p.matchesPlayed) * 100) / 100 : 0,
    },
  };
}
