import pool from '../config/database.js';
import PlayerModel from '../models/PlayerModel.js';
import { GAME_RULES } from '../constants/gameRules.js';
import {
  SELECT_ALL_GACHA_POOL,
  SELECT_GACHA_POOL_BY_POSITION,
  SELECT_GACHA_POOL_BY_POSITIONS,
  COUNT_USER_PLAYERS,
  INSERT_USER_PLAYER,
  SELECT_CLUB_LINEUP_WITH_MASTER,
} from '../queries/playerQueries.js';

/** 포지션별 더미 선수 기본 능력치 프로필 */
const DUMMY_PROFILES = {
  GK: { speed: 40, shooting: 20, passing: 50, dribbling: 30, defense: 60, physical: 65, gkReflexes: 72, staminaMax: 90 },
  DF: { speed: 58, shooting: 35, passing: 55, dribbling: 45, defense: 72, physical: 70, gkReflexes: 10, staminaMax: 90 },
  MF: { speed: 62, shooting: 55, passing: 72, dribbling: 68, defense: 55, physical: 60, gkReflexes: 10, staminaMax: 90 },
  FW: { speed: 72, shooting: 72, passing: 58, dribbling: 68, defense: 30, physical: 62, gkReflexes: 10, staminaMax: 90 },
};

/** 더미 18인 스쿼드 구성: GK 2, DF 6, MF 6, FW 4 (선발 4-3-3 + 벤치 GK1/DF2/MF3/FW1) */
const DUMMY_COMPOSITION = [
  ['GK', 2],
  ['DF', 6],
  ['MF', 6],
  ['FW', 4],
];

/**
 * 선수 마스터 / 유저 보유 선수 데이터 접근 계층.
 */
export default class PlayerRepository {
  /**
   * 가챠 후보군을 조회.
   * @param {import('mysql2/promise').PoolConnection|null} conn
   * @param {string|string[]|null} [positionFilter] GK|DF|MF|FW 또는 그 배열. null 이면 전체 풀.
   * @returns {Promise<Array<{id:number, name:string, mainPosition:string, preferredRole:string, dropWeight:number, baseStats:Object, tags:Array}>>}
   */
  static async getGachaCandidatePool(conn, positionFilter = null) {
    const executor = conn || pool;
    let result;
    if (Array.isArray(positionFilter)) result = await executor.query(SELECT_GACHA_POOL_BY_POSITIONS, [positionFilter]);
    else if (positionFilter) result = await executor.query(SELECT_GACHA_POOL_BY_POSITION, [positionFilter]);
    else result = await executor.query(SELECT_ALL_GACHA_POOL);
    return result[0].map((row) => ({
      ...row,
      id: Number(row.id),
      dropWeight: Number(row.dropWeight),
      baseStats: typeof row.baseStats === 'string' ? JSON.parse(row.baseStats) : row.baseStats,
      tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
    }));
  }

  /**
   * 유저 보유 선수 수를 반환.
   * @param {import('mysql2/promise').PoolConnection|null} conn
   * @param {number} userId
   * @returns {Promise<number>}
   */
  static async countUserPlayers(conn, userId) {
    const executor = conn || pool;
    const [rows] = await executor.query(COUNT_USER_PLAYERS, [userId]);
    return Number(rows[0].totalCount);
  }

  /**
   * 유저 인벤토리에 선수를 지급.
   * @param {import('mysql2/promise').PoolConnection|null} conn
   * @param {{userId:number, playerId:number}} params
   * @returns {Promise<number>} 생성된 user_players id
   */
  static async insertUserPlayer(conn, { userId, playerId }) {
    const executor = conn || pool;
    const [result] = await executor.query(INSERT_USER_PLAYER, [userId, playerId]);
    return result.insertId;
  }

  /**
   * 구단 스쿼드(최대 18명)를 PlayerModel 배열로 반환.
   * 보유 선수가 11명 미만이면 시뮬레이션이 멈추지 않도록 기본 더미 18명으로 대체.
   * @param {import('mysql2/promise').PoolConnection|null} conn
   * @param {number} userId
   * @returns {Promise<PlayerModel[]>}
   */
  static async getClubSquadModels(conn, userId) {
    const executor = conn || pool;
    const [rows] = await executor.query(SELECT_CLUB_LINEUP_WITH_MASTER, [userId]);
    if (rows.length < GAME_RULES.MIN_SQUAD_SIZE) {
      return PlayerRepository.createDummySquad();
    }
    return rows.map((row) => new PlayerModel(row));
  }

  /**
   * 포지션별 기본 더미 선수 18명을 생성. (userPlayerId/playerId 는 음수로 실제 데이터와 구분)
   * @returns {PlayerModel[]}
   */
  static createDummySquad() {
    const squad = [];
    let seq = 0;
    for (const [position, count] of DUMMY_COMPOSITION) {
      for (let i = 1; i <= count; i++) {
        seq++;
        const profile = DUMMY_PROFILES[position];
        const variation = (i % 3) * 2;
        const baseStats = {};
        for (const [key, value] of Object.entries(profile)) {
          baseStats[key] = key === 'staminaMax' ? value : value + variation;
        }
        squad.push(
          new PlayerModel({
            userPlayerId: -seq,
            playerId: -seq,
            name: `기본 ${position} ${i}`,
            mainPosition: position,
            level: 1,
            stamina: 100,
            isStarter: false,
            baseStats,
            tags: [],
          })
        );
      }
    }
    return squad;
  }
}
