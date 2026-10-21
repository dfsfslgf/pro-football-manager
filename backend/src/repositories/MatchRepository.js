import pool from '../config/database.js';
import { INSERT_MATCH_HISTORY, SELECT_MATCH_BY_ID } from '../queries/matchQueries.js';

/**
 * JSON 컬럼 값을 객체로 변환합니다. (드라이버가 이미 파싱한 경우 그대로 반환)
 * @param {string|Object|Array} value
 * @returns {Object|Array}
 */
function parseJsonColumn(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

/**
 * 경기 결과 데이터 접근 계층.
 */
export default class MatchRepository {
  /**
   * 경기 결과를 저장합니다. 통계/타임라인은 JSON 문자열로 직렬화됩니다.
   * @param {import('mysql2/promise').PoolConnection|null} conn
   * @param {{homeClubId:number, awayClubId:number, scoreHome:number, scoreAway:number, homeStats:Object, awayStats:Object, timelineEvents:Array}} matchData
   * @returns {Promise<number>} 생성된 match id
   */
  static async saveMatchResult(conn, matchData) {
    const executor = conn || pool;
    const [result] = await executor.query(INSERT_MATCH_HISTORY, [
      matchData.homeClubId,
      matchData.awayClubId,
      matchData.scoreHome,
      matchData.scoreAway,
      JSON.stringify(matchData.homeStats),
      JSON.stringify(matchData.awayStats),
      JSON.stringify(matchData.timelineEvents),
      matchData.competitionMode ?? null,
      matchData.report ? JSON.stringify(matchData.report) : null,
    ]);
    return result.insertId;
  }

  /**
   * 경기 결과를 조회하고 JSON 필드를 객체로 파싱해 반환합니다.
   * @param {import('mysql2/promise').PoolConnection|null} conn
   * @param {number} matchId
   * @returns {Promise<Object|null>} 경기 결과 (없으면 null)
   */
  static async getMatchById(conn, matchId) {
    const executor = conn || pool;
    const [rows] = await executor.query(SELECT_MATCH_BY_ID, [matchId]);
    if (!rows[0]) return null;
    const row = rows[0];
    return {
      ...row,
      homeStats: parseJsonColumn(row.homeStats),
      awayStats: parseJsonColumn(row.awayStats),
      timelineEvents: parseJsonColumn(row.timelineEvents),
      report: row.report ? parseJsonColumn(row.report) : null,
    };
  }
}
