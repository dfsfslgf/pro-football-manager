import { GAME_RULES } from '../constants/gameRules.js';

/** 레벨 비례 성장 및 스태미나 페널티가 적용되는 능력치 키 목록 */
const STAT_KEYS = ['speed', 'shooting', 'passing', 'dribbling', 'defense', 'physical', 'gkReflexes'];

/**
 * JSON 컬럼 값이 문자열이면 파싱하고, 이미 객체면 그대로 반환.
 * @param {string|Object|Array|null|undefined} value
 * @param {Object|Array} fallback 값이 비어 있을 때 사용할 기본값
 * @returns {Object|Array}
 */
function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  return typeof value === 'string' ? JSON.parse(value) : value;
}

/**
 * DB Row 를 받아 경기 시뮬레이션에서 사용하는 선수 도메인 객체로 변환.
 * 쿼리 alias(camelCase)와 snake_case Row 를 모두 허용.
 */
export default class PlayerModel {
  /**
   * @param {Object} row 선수 + 마스터 JOIN 결과 Row
   * @param {number} [row.userPlayerId] (또는 row.user_player_id)
   * @param {number} [row.playerId] (또는 row.player_id)
   * @param {string} row.name
   * @param {string} [row.mainPosition] (또는 row.main_position) GK|DF|MF|FW
   * @param {number} [row.level]
   * @param {number} [row.stamina]
   * @param {boolean|number} [row.isStarter] (또는 row.is_starter)
   * @param {string|Object} [row.baseStats] (또는 row.base_stats)
   * @param {string|Array} [row.tags]
   */
  constructor(row) {
    this.userPlayerId = row.userPlayerId ?? row.user_player_id ?? null;
    this.playerId = row.playerId ?? row.player_id ?? null;
    this.name = row.name;
    this.mainPosition = row.mainPosition ?? row.main_position;
    this.level = Number(row.level ?? 1);
    this.stamina = Number(row.stamina ?? 100);
    this.isStarter = Boolean(row.isStarter ?? row.is_starter ?? false);
    this.baseStats = parseJson(row.baseStats ?? row.base_stats, {});
    this.tags = parseJson(row.tags, []);

    /** 경기 중 가변 상태 */
    this.currentStamina = this.stamina;
    this.yellowCards = 0;
    this.isSentOff = false;
    this.goals = 0;
    this.assists = 0;

    /** @type {Object<string, number>} */
    this.effectiveStats = {};
    this.calculateInitialEffectiveStats();
  }

  /**
   * 레벨 비례 성장 공식(multiplier = 1 + (level - 1) * 0.02)을 적용해
   * 소수점 첫째 자리까지 보존한 effectiveStats 를 초기화.
   * @returns {Object<string, number>} 초기화된 effectiveStats
   */
  calculateInitialEffectiveStats() {
    const multiplier = 1 + (this.level - 1) * 0.02;
    const stats = {};
    for (const key of STAT_KEYS) {
      const base = Number(this.baseStats[key] ?? 0);
      stats[key] = Math.round(base * multiplier * 10) / 10;
    }
    this.effectiveStats = stats;
    return stats;
  }

  /**
   * 현재 체력을 반영한 실시간 전투 능력치를 반환.
   * 체력이 임계치(30) 이하이면 staminaFactor = 0.5 + currentStamina / 60, 초과이면 1.0.
   * @returns {Object<string, number>} speed/shooting/passing/dribbling/defense/physical/gkReflexes
   */
  getLiveStats() {
    const staminaFactor =
      this.currentStamina <= GAME_RULES.STAMINA_DEBUFF_THRESHOLD ? 0.5 + this.currentStamina / 60 : 1.0;
    const live = {};
    for (const key of STAT_KEYS) {
      live[key] = this.effectiveStats[key] * staminaFactor;
    }
    return live;
  }
}
