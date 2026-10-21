import { MATCH_RULES } from '../constants/matchConfig.js';

/** 레벨 성장 및 스태미나 페널티가 적용되는 능력치 키 */
export const STAT_KEYS = ['speed', 'shooting', 'passing', 'dribbling', 'defense', 'physical', 'gkReflexes'];

/**
 * 레벨 비례 실효 스탯을 계산합니다. (multiplier = 1 + (level - 1) * 0.02, 소수점 첫째 자리 보존)
 * @param {Object<string, number>} baseStats DB base_stats JSON
 * @param {number} level 선수 레벨
 * @returns {Object<string, number>}
 */
export function computeEffectiveStats(baseStats, level) {
  const multiplier = 1 + (Number(level || 1) - 1) * 0.02;
  const result = {};
  for (const key of STAT_KEYS) {
    result[key] = Math.round(Number(baseStats?.[key] ?? 0) * multiplier * 10) / 10;
  }
  return result;
}

/**
 * 현재 슬롯과의 포지션 적합도 배율(1.0 / 0.9 / 0.75 / 0.4)을 반환합니다. 슬롯에 배치되지 않은 선수는 1 입니다.
 * @param {{familiarityMultiplier?:number}} player
 * @returns {number}
 */
export function getPositionFactor(player) {
  return player.familiarityMultiplier ?? 1;
}

/**
 * 현재 체력과 포지션 적합도를 반영한 실시간 전투 스탯을 반환합니다.
 * 체력 30 이하이면 staminaFactor = 0.5 + stamina / 60, 초과이면 1.0.
 * @param {{effectiveStats:Object<string, number>, currentStamina:number, familiarityMultiplier?:number}} player
 * @returns {Object<string, number>}
 */
export function getLiveStats(player) {
  const staminaFactor =
    player.currentStamina <= MATCH_RULES.STAMINA_DEBUFF_THRESHOLD ? 0.5 + player.currentStamina / 60 : 1.0;
  const factor = staminaFactor * getPositionFactor(player);
  const live = {};
  for (const key of STAT_KEYS) live[key] = player.effectiveStats[key] * factor;
  return live;
}

/**
 * 주 포지션 기준 종합 능력치(표시용)를 계산합니다.
 * @param {{effectiveStats:Object<string, number>, mainPosition:string}} player
 * @returns {number} 정수 종합 점수
 */
export function getOverall(player) {
  const s = player.effectiveStats;
  switch (player.mainPosition) {
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
 * 경기 중 활약(득점/도움/경고/퇴장)을 반영한 현재 평점(1.0~10.0)을 계산합니다.
 * @param {{goals?:number, assists?:number, yellowCards?:number, isSentOff?:boolean}} player
 * @returns {number} 소수점 첫째 자리 평점
 */
export function getRating(player) {
  const raw = 6 + (player.goals || 0) * 1.0 + (player.assists || 0) * 0.6 - (player.yellowCards || 0) * 0.4 - (player.isSentOff ? 2 : 0);
  return Math.round(Math.max(1, Math.min(10, raw)) * 10) / 10;
}
