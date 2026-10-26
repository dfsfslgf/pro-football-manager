import pool from '../config/database.js';
import {
  SELECT_OWNED_PLAYER_IDS_FOR_UPDATE,
  RESET_LINEUP_SLOTS,
  UPDATE_LINEUP_SLOT,
  SELECT_PLAYER_STAMINA_BY_IDS,
} from '../queries/squadQueries.js';

/** 선발 슬롯(0~10) 다음부터 벤치 슬롯이 시작됩니다. (최대 11명 지원) */
export const BENCH_SLOT_OFFSET = 11;

/**
 * 라인업(선발/벤치 슬롯) 데이터 접근 계층. 쓰기 메서드는 트랜잭션 conn 을 첫 인자로 받음.
 */
export default class SquadRepository {
  /**
   * 요청한 선수 ID 중 해당 유저가 실제 소유한 선수 ID 를 FOR UPDATE 로 잠그며 반환.
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {number} userId
   * @param {number[]} playerIds
   * @returns {Promise<number[]>}
   */
  static async findOwnedPlayerIdsForUpdate(conn, userId, playerIds) {
    if (!Array.isArray(playerIds) || playerIds.length === 0) return [];
    const validIds = playerIds.filter((id) => Number.isInteger(Number(id)) && Number(id) > 0);
    if (validIds.length === 0) return [];
    const [rows] = await conn.query(SELECT_OWNED_PLAYER_IDS_FOR_UPDATE, [userId, validIds]);
    return rows.map((row) => Number(row.id));
  }

  /**
   * 선발/벤치 슬롯을 일괄 저장: 전원 초기화 -> 선발(슬롯 0~10) -> 벤치(슬롯 11~21).
   * 최대 11명의 후보 선수가 누락되지 않도록 안전하게 바인딩.
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {number} userId
   * @param {number[]} starterIds
   * @param {number[]} benchIds
   * @returns {Promise<void>}
   */
  static async saveSlots(conn, userId, starterIds, benchIds) {
    // 기존 유저의 모든 선발/벤치 슬롯 상태를 초기화
    await conn.query(RESET_LINEUP_SLOTS, [userId]);

    // 선발 11명(is_starter = true, slot 0~10) 일괄 업데이트
    const safeStarters = Array.isArray(starterIds) ? starterIds.slice(0, 11) : [];
    for (let i = 0; i < safeStarters.length; i++) {
      const pid = Number(safeStarters[i]);
      if (pid > 0) {
        await conn.query(UPDATE_LINEUP_SLOT, [true, i, pid, userId]);
      }
    }

    // 벤치 후보 최대 11명(is_starter = false, slot 11~21) 일괄 업데이트 (누락 방지)
    const safeBench = Array.isArray(benchIds) ? benchIds.slice(0, 11) : [];
    for (let i = 0; i < safeBench.length; i++) {
      const pid = Number(safeBench[i]);
      if (pid > 0) {
        const slotIdx = BENCH_SLOT_OFFSET + i; // 11부터 최대 21까지 할당
        await conn.query(UPDATE_LINEUP_SLOT, [false, slotIdx, pid, userId]);
      }
    }
  }

  /**
   * 해당 유저가 소유한 선수들의 현재 체력을 조회.
   * @param {import('mysql2/promise').PoolConnection|null} conn
   * @param {number} userId
   * @param {number[]} playerIds
   * @returns {Promise<Map<number, number>>} userPlayerId -> stamina
   */
  static async getPlayerStamina(conn, userId, playerIds) {
    const executor = conn || pool;
    if (!Array.isArray(playerIds) || playerIds.length === 0) return new Map();
    const [rows] = await executor.query(SELECT_PLAYER_STAMINA_BY_IDS, [userId, playerIds]);
    return new Map(rows.map((row) => [Number(row.id), Number(row.stamina)]));
  }
}

