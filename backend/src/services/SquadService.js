import pool from '../config/database.js';
import { GAME_RULES } from '../constants/gameRules.js';
import { DEFAULT_FORMATION, FORMATION_CODES, getFormationSlots, isValidFormation } from '../constants/formationCoords.js';
import { NotFoundError, ValidationError } from '../constants/errorCodes.js';
import ClubRepository from '../repositories/ClubRepository.js';
import SquadRepository from '../repositories/SquadRepository.js';
import { toPlayerDto } from '../utils/playerDto.js';

const STARTER_COUNT = 11;
const DEFAULT_TEAM_TACTICS = { mentality: 'BALANCED', passingStyle: 'MIXED', tempo: 'NORMAL', defensiveLine: 'NORMAL', pressing: 'MEDIUM' };

/**
 * @param {unknown} v
 * @returns {boolean}
 */
function isPositiveInt(v) {
  return Number.isSafeInteger(v) && v > 0;
}

/**
 * lineupSlot 오름차순(null 은 뒤로), 동률이면 레벨 내림차순 비교 함수.
 * @param {{lineupSlot:number|null, level:number}} a
 * @param {{lineupSlot:number|null, level:number}} b
 * @returns {number}
 */
function bySlotThenLevel(a, b) {
  const sa = a.lineupSlot === null ? Number.MAX_SAFE_INTEGER : a.lineupSlot;
  const sb = b.lineupSlot === null ? Number.MAX_SAFE_INTEGER : b.lineupSlot;
  return sa - sb || b.level - a.level;
}

/**
 * 라인업이 저장되지 않은 유저를 위해 슬롯 포지션에 맞는 고레벨 선수를 자동 배치합니다.
 * @param {Object[]} players
 * @param {string} formation
 * @returns {Object[]} 길이 11, index = slotIndex
 */
function autoPickStarters(players, formation) {
  const slots = getFormationSlots(formation);
  const remaining = [...players].sort((a, b) => b.level - a.level);
  const picked = new Array(slots.length).fill(null);
  slots.forEach((slot, i) => {
    const idx = remaining.findIndex((p) => p.mainPosition === slot.role);
    if (idx >= 0) picked[i] = remaining.splice(idx, 1)[0];
  });
  return picked.map((p) => p || remaining.shift());
}

/**
 * 팀 세부 전술 값을 검증/정규화합니다. 없으면 기본값을 반환합니다.
 * @param {Object|undefined|null} tactics
 * @returns {Object}
 * @throws {ValidationError}
 */
export function normalizeTeamTactics(tactics) {
  if (tactics === undefined || tactics === null) return { ...DEFAULT_TEAM_TACTICS };
  const result = {};
  for (const [key, allowed] of Object.entries(GAME_RULES.TEAM_TACTIC_OPTIONS)) {
    const value = tactics[key] ?? DEFAULT_TEAM_TACTICS[key];
    if (!allowed.includes(value)) throw new ValidationError(`팀 전술 ${key} 값이 올바르지 않습니다.`);
    result[key] = value;
  }
  return result;
}

/**
 * 포메이션 검증, 선발 11명 + 벤치 7명 + 후보 배치, 팀 전술/개인 지침 영구 저장 비즈니스 로직.
 */
export default class SquadService {
  /**
   * 유저의 포메이션/팀 전술/선발/벤치/후보 전체를 조회합니다.
   * @param {number} userId
   * @returns {Promise<{formation:string, teamTactics:Object, starters:Object[], bench:Object[], reserve:Object[]}>}
   */
  static async getSquad(userId) {
    const players = await ClubRepository.getFullPlayers(null, userId);
    const settings = await ClubRepository.getSquadSettings(null, userId);
    const formation = isValidFormation(settings?.formation) ? settings.formation : DEFAULT_FORMATION;

    const savedStarters = players.filter((p) => p.isStarter).sort(bySlotThenLevel);
    const starters = savedStarters.length >= STARTER_COUNT ? savedStarters.slice(0, STARTER_COUNT) : autoPickStarters(players, formation);
    const usedIds = new Set(starters.map((p) => p.userPlayerId));
    const rest = players.filter((p) => !usedIds.has(p.userPlayerId)).sort(bySlotThenLevel);
    const bench = rest.slice(0, GAME_RULES.BENCH_SIZE);
    const reserve = rest.slice(GAME_RULES.BENCH_SIZE);

    return {
      formation,
      teamTactics: normalizeTeamTactics(settings?.teamTactics),
      starters: starters.map(toPlayerDto),
      bench: bench.map(toPlayerDto),
      reserve: reserve.map(toPlayerDto),
    };
  }

  /**
   * 라인업(포메이션/전술/선발/벤치/개인 지침)을 검증하고 트랜잭션으로 저장합니다.
   * @param {number} userId
   * @param {{formation:string, teamTactics?:Object, starterIds:number[], benchIds:number[], instructions?:Object<string,string>}} lineup
   * @returns {Promise<{formation:string}>}
   * @throws {ValidationError|NotFoundError}
   */
  static async saveSquad(userId, lineup) {
    const { formation, starterIds, benchIds = [], instructions = {} } = lineup || {};
    if (!isValidFormation(formation)) {
      throw new ValidationError(`formation 은 ${FORMATION_CODES.join(', ')} 중 하나여야 합니다.`);
    }
    if (!Array.isArray(starterIds) || starterIds.length !== STARTER_COUNT) throw new ValidationError('선발 선수는 정확히 11명이어야 합니다.');
    if (!Array.isArray(benchIds) || benchIds.length > GAME_RULES.BENCH_SIZE) throw new ValidationError(`벤치 선수는 최대 ${GAME_RULES.BENCH_SIZE}명입니다.`);
    const allIds = [...starterIds, ...benchIds];
    if (!allIds.every(isPositiveInt)) throw new ValidationError('선수 ID 는 1 이상의 정수여야 합니다.');
    if (new Set(allIds).size !== allIds.length) throw new ValidationError('선발/벤치에 중복된 선수가 있습니다.');
    const teamTactics = normalizeTeamTactics(lineup.teamTactics);

    const instructionEntries = [];
    if (instructions && typeof instructions === 'object') {
      for (const [id, instruction] of Object.entries(instructions)) {
        if (!isPositiveInt(Number(id)) || !Object.prototype.hasOwnProperty.call(GAME_RULES.INSTRUCTION_STAMINA_MULTIPLIER, instruction)) {
          throw new ValidationError('개인 지침 값이 올바르지 않습니다.');
        }
        if (!starterIds.includes(Number(id))) continue;
        instructionEntries.push([Number(id), instruction]);
      }
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const owned = await SquadRepository.findOwnedPlayerIdsForUpdate(conn, userId, allIds);
      if (owned.length !== allIds.length) throw new NotFoundError('보유하지 않은 선수가 라인업에 포함되어 있습니다.');

      await SquadRepository.saveSlots(conn, userId, starterIds, benchIds);
      await ClubRepository.saveInstructions(conn, userId, instructionEntries);
      await ClubRepository.saveSquadSettings(conn, userId, formation, teamTactics);
      await conn.commit();
      return { formation };
    } catch (err) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error('[SquadService] rollback 실패:', rollbackErr);
      }
      throw err;
    } finally {
      conn.release();
    }
  }
}
