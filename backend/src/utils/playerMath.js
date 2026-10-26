import { RARITY_BY_WEIGHT } from '../constants/clubRules.js';

/**
 * 레벨 성장(1 + (level - 1) * 0.02)을 반영한 능력치 계산.
 * @param {Object<string, number>} baseStats
 * @param {number} level
 * @returns {Object<string, number>}
 */
export function effectiveStats(baseStats, level) {
  const multiplier = 1 + (Number(level || 1) - 1) * 0.02;
  const keys = ['speed', 'shooting', 'passing', 'dribbling', 'defense', 'physical', 'gkReflexes'];
  return Object.fromEntries(keys.map((k) => [k, Math.round(Number(baseStats?.[k] ?? 0) * multiplier * 10) / 10]));
}

/**
 * 주 포지션 기준 종합 능력치(OVR).
 * @param {Object<string, number>} baseStats
 * @param {number} level
 * @param {'GK'|'DF'|'MF'|'FW'} position
 * @returns {number}
 */
export function computeOverall(baseStats, level, position) {
  const s = effectiveStats(baseStats, level);
  switch (position) {
    case 'GK':
      return Math.round(s.gkReflexes * 0.7 + s.defense * 0.15 + s.physical * 0.15);
    case 'DF':
      return Math.round(s.defense * 0.5 + s.physical * 0.25 + s.speed * 0.15 + s.passing * 0.1);
    case 'MF':
      return Math.round(s.passing * 0.35 + s.dribbling * 0.3 + s.defense * 0.15 + s.shooting * 0.1 + s.speed * 0.1);
    default:
      return Math.round(s.shooting * 0.4 + s.speed * 0.25 + s.dribbling * 0.25 + s.physical * 0.1);
  }
}

/**
 * 가챠 가중치로 희귀도 등급을 결정.
 * @param {number} dropWeight
 * @returns {'LEGEND'|'EPIC'|'RARE'|'COMMON'}
 */
export function rarityFromWeight(dropWeight) {
  return RARITY_BY_WEIGHT.find((r) => dropWeight <= r.maxWeight).rarity;
}
