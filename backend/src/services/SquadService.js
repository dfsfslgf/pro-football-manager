import pool from '../config/database.js';
import { GAME_RULES } from '../constants/gameRules.js';
import { DEFAULT_FORMATION, FORMATION_CODES, getFormationSlots, isValidFormation } from '../constants/formationCoords.js';
import { NotFoundError, ValidationError } from '../constants/errorCodes.js';
import ClubRepository from '../repositories/ClubRepository.js';
import SquadRepository from '../repositories/SquadRepository.js';
import { toPlayerDto } from '../utils/playerDto.js';

const STARTER_COUNT = 11;
const MAX_BENCH_COUNT = 11;
const DEFAULT_TEAM_TACTICS = {
  mentality: 'BALANCED',
  passingStyle: 'MIXED',
  tempo: 'NORMAL',
  defensiveLine: 'NORMAL',
  pressing: 'MEDIUM',
  offsideTrap: 'OFF',
};

const POS_ORDER = { FW: 1, MF: 2, DF: 3, GK: 4 };

function isPositiveInt(v) {
  return Number.isSafeInteger(v) && v > 0;
}

function bySlotThenLevel(a, b) {
  const sa = a.lineupSlot === null ? Number.MAX_SAFE_INTEGER : Number(a.lineupSlot);
  const sb = b.lineupSlot === null ? Number.MAX_SAFE_INTEGER : Number(b.lineupSlot);
  return sa - sb || b.level - a.level;
}

function byPositionThenLevel(a, b) {
  const pa = POS_ORDER[a.mainPosition] || 99;
  const pb = POS_ORDER[b.mainPosition] || 99;
  if (pa !== pb) return pa - pb;
  return b.level - a.level || a.userPlayerId - b.userPlayerId;
}

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

export default class SquadService {
  static async getSquad(userId) {
    const players = await ClubRepository.getFullPlayers(null, userId);
    const settings = await ClubRepository.getSquadSettings(null, userId);
    const formation = isValidFormation(settings?.formation) ? settings.formation : DEFAULT_FORMATION;

    const savedStarters = players.filter((p) => p.isStarter).sort(bySlotThenLevel);
    const starters =
      savedStarters.length >= STARTER_COUNT ? savedStarters.slice(0, STARTER_COUNT) : autoPickStarters(players, formation);
    const usedIds = new Set(starters.map((p) => p.userPlayerId));
    const rest = players.filter((p) => !usedIds.has(p.userPlayerId));

    // [요구사항 2번 핵심 해결]
    // DB에 저장된 벤치 후보(lineupSlot !== null)가 있으면, 절대 임의로 섞거나 예비 선수와 합치지 않고 저장된 슬롯 순서 그대로 반환!
    const savedBench = rest
      .filter((p) => p.lineupSlot !== null && Number(p.lineupSlot) >= 11)
      .sort(bySlotThenLevel);

    let benchRaw;
    if (savedBench.length > 0) {
      benchRaw = savedBench.slice(0, MAX_BENCH_COUNT);
    } else {
      // 최초 생성 시에만 기본 후보 자동 배정
      benchRaw = [...rest].sort(byPositionThenLevel).slice(0, MAX_BENCH_COUNT);
    }

    const benchIdsSet = new Set(benchRaw.map((p) => p.userPlayerId));
    const reserveRaw = rest.filter((p) => !benchIdsSet.has(p.userPlayerId)).sort(byPositionThenLevel);

    return {
      formation,
      teamTactics: normalizeTeamTactics(settings?.teamTactics),
      starters: starters.map(toPlayerDto),
      bench: benchRaw.map(toPlayerDto),
      reserve: reserveRaw.map(toPlayerDto),
    };
  }

  static async saveSquad(userId, lineup) {
    const { formation, starterIds, benchIds = [], instructions = {} } = lineup || {};
    if (!isValidFormation(formation)) {
      throw new ValidationError(`formation 은 ${FORMATION_CODES.join(', ')} 중 하나여야 합니다.`);
    }
    if (!Array.isArray(starterIds) || starterIds.length !== STARTER_COUNT) {
      throw new ValidationError('선발 선수는 정확히 11명이어야 합니다.');
    }
    const normalizedBenchIds = Array.isArray(benchIds) ? benchIds.map(Number).filter(isPositiveInt).slice(0, MAX_BENCH_COUNT) : [];
    const normalizedStarterIds = starterIds.map(Number);
    const allIds = [...normalizedStarterIds, ...normalizedBenchIds];
    if (!allIds.every(isPositiveInt)) throw new ValidationError('선수 ID 는 1 이상의 정수여야 합니다.');
    if (new Set(allIds).size !== allIds.length) throw new ValidationError('선발/벤치에 중복된 선수가 있습니다.');
    const teamTactics = normalizeTeamTactics(lineup.teamTactics);

    const instructionEntries = [];
    if (instructions && typeof instructions === 'object') {
      for (const [id, instruction] of Object.entries(instructions)) {
        if (
          !isPositiveInt(Number(id)) ||
          !Object.prototype.hasOwnProperty.call(GAME_RULES.INSTRUCTION_STAMINA_MULTIPLIER, instruction)
        ) {
          continue;
        }
        if (!normalizedStarterIds.includes(Number(id))) continue;
        instructionEntries.push([Number(id), instruction]);
      }
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const owned = await SquadRepository.findOwnedPlayerIdsForUpdate(conn, userId, allIds);
      if (owned.length !== allIds.length) throw new NotFoundError('보유하지 않은 선수가 라인업에 포함되어 있습니다.');

      await SquadRepository.saveSlots(conn, userId, normalizedStarterIds, normalizedBenchIds);
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