import pool from '../config/database.js';
import {
  SELECT_OWNED_PLAYER_IDS_FOR_UPDATE,
  RESET_LINEUP_SLOTS,
  UPDATE_LINEUP_SLOT,
  SELECT_PLAYER_STAMINA_BY_IDS,
} from '../queries/squadQueries.js';

/** 선발 슬롯(0~10) 다음부터 벤치 슬롯이 시작됩니다. */
export const BENCH_SLOT_OFFSET = 11;

/**
 * 라인업(선발/벤치 슬롯) 데이터 접근 계층. 쓰기 메서드는 트랜잭션 conn 을 첫 인자로 받습니다.
 */
export default class SquadRepository {
  /**
   * 요청한 선수 ID 중 해당 유저가 실제 소유한 선수 ID 를 FOR UPDATE 로 잠그며 반환합니다.
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {number} userId
   * @param {number[]} playerIds
   * @returns {Promise<number[]>}
   */
  static async findOwnedPlayerIdsForUpdate(conn, userId, playerIds) {
    if (playerIds.length === 0) return [];
    const [rows] = await conn.query(SELECT_OWNED_PLAYER_IDS_FOR_UPDATE, [userId, playerIds]);
    return rows.map((row) => Number(row.id));
  }

  /**
   * 선발/벤치 슬롯을 일괄 저장합니다: 전원 초기화 -> 선발(슬롯 0~10) -> 벤치(슬롯 11~).
   * 반드시 호출자가 연 트랜잭션 안에서 실행해야 합니다.
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {number} userId
   * @param {number[]} starterIds
   * @param {number[]} benchIds
   * @returns {Promise<void>}
   */
  static async saveSlots(conn, userId, starterIds, benchIds) {
    await conn.query(RESET_LINEUP_SLOTS, [userId]);
    for (let i = 0; i < starterIds.length; i++) {
      await conn.query(UPDATE_LINEUP_SLOT, [true, i, starterIds[i], userId]);
    }
    for (let i = 0; i < benchIds.length; i++) {
      await conn.query(UPDATE_LINEUP_SLOT, [false, BENCH_SLOT_OFFSET + i, benchIds[i], userId]);
    }
  }

  /**
   * 해당 유저가 소유한 선수들의 현재 체력을 조회합니다.
   * @param {import('mysql2/promise').PoolConnection|null} conn
   * @param {number} userId
   * @param {number[]} playerIds
   * @returns {Promise<Map<number, number>>} userPlayerId -> stamina
   */
  static async getPlayerStamina(conn, userId, playerIds) {
    const executor = conn || pool;
    if (playerIds.length === 0) return new Map();
    const [rows] = await executor.query(SELECT_PLAYER_STAMINA_BY_IDS, [userId, playerIds]);
    return new Map(rows.map((row) => [Number(row.id), Number(row.stamina)]));
  }
}
