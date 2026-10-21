import pool from '../config/database.js';
import * as Q from '../queries/clubQueries.js';

/**
 * JSON 컬럼 값을 객체로 변환합니다.
 * @param {string|Object|null} value
 * @param {*} fallback
 * @returns {*}
 */
function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/**
 * 유저/구단/선수 상세/대회/퀘스트/이적시장 데이터 접근 계층. conn 이 없으면 pool 을 사용합니다.
 */
export default class ClubRepository {
  /**
   * @param {import('mysql2/promise').PoolConnection|null} conn
   * @param {string} nickname
   * @param {string} passwordHash
   * @returns {Promise<number>} 생성된 user id
   */
  static async insertUser(conn, nickname, passwordHash) {
    const [result] = await (conn || pool).query(Q.INSERT_USER, [nickname, passwordHash]);
    return result.insertId;
  }

  /**
   * @param {import('mysql2/promise').PoolConnection|null} conn
   * @param {string} nickname
   * @returns {Promise<{id:number, nickname:string, passwordHash:string}|null>}
   */
  static async findUserByNickname(conn, nickname) {
    const [rows] = await (conn || pool).query(Q.SELECT_USER_BY_NICKNAME, [nickname]);
    return rows[0] ? { ...rows[0], id: Number(rows[0].id) } : null;
  }

  /**
   * @param {import('mysql2/promise').PoolConnection|null} conn
   * @param {number} userId
   * @returns {Promise<{userId:number, name:string, emblemIcon:string, emblemColor:string, sponsorKey:string, nickname:string}|null>}
   */
  static async findClub(conn, userId) {
    const [rows] = await (conn || pool).query(Q.SELECT_CLUB, [userId]);
    return rows[0] ? { ...rows[0], userId: Number(rows[0].userId) } : null;
  }

  /**
   * @param {import('mysql2/promise').PoolConnection|null} conn
   * @param {{userId:number, name:string, emblemIcon:string, emblemColor:string, sponsorKey:string}} club
   * @returns {Promise<void>}
   */
  static async insertClub(conn, club) {
    await (conn || pool).query(Q.INSERT_CLUB, [club.userId, club.name, club.emblemIcon, club.emblemColor, club.sponsorKey]);
  }

  /**
   * @param {import('mysql2/promise').PoolConnection|null} conn
   * @param {number} userId
   * @param {string} sponsorKey
   * @returns {Promise<void>}
   */
  static async updateSponsor(conn, userId, sponsorKey) {
    await (conn || pool).query(Q.UPDATE_CLUB_SPONSOR, [sponsorKey, userId]);
  }

  /**
   * @param {import('mysql2/promise').PoolConnection|null} conn
   * @param {number} userId
   * @param {{gold:number, cashFree:number, cashPaid:number}} grant
   * @returns {Promise<void>}
   */
  static async insertWallet(conn, userId, grant) {
    await (conn || pool).query(Q.INSERT_WALLET, [userId, grant.cashPaid, grant.cashFree, grant.gold]);
  }

  /**
   * 일반 등급 마스터 선수를 (포지션, 세부 포지션) 조건으로 조회합니다.
   * @param {import('mysql2/promise').PoolConnection|null} conn
   * @param {string} position
   * @param {string|null} role
   * @returns {Promise<Array<{id:number, mainPosition:string, preferredRole:string}>>}
   */
  static async findCommonMasters(conn, position, role) {
    const executor = conn || pool;
    const [rows] = role
      ? await executor.query(Q.SELECT_COMMON_MASTER_BY_ROLE, [position, role])
      : await executor.query(Q.SELECT_COMMON_MASTER_BY_POSITION, [position]);
    return rows.map((r) => ({ ...r, id: Number(r.id) }));
  }

  /**
   * 라인업 슬롯을 지정해 선수를 지급합니다.
   * @param {import('mysql2/promise').PoolConnection|null} conn
   * @param {number} userId
   * @param {number} playerMasterId
   * @param {boolean} isStarter
   * @param {number|null} lineupSlot
   * @returns {Promise<number>} user_players id
   */
  static async insertSlottedPlayer(conn, userId, playerMasterId, isStarter, lineupSlot) {
    const [result] = await (conn || pool).query(Q.INSERT_STARTER_PLAYER, [userId, playerMasterId, isStarter, lineupSlot]);
    return result.insertId;
  }

  /**
   * 보유 선수 전체를 누적 기록과 함께 조회합니다.
   * (과거 데이터의 유효슈팅 < 득점 불일치를 조회 시점에 자동 교정합니다)
   * @param {import('mysql2/promise').PoolConnection|null} conn
   * @param {number} userId
   * @returns {Promise<Object[]>}
   */
  static async getFullPlayers(conn, userId) {
    const [rows] = await (conn || pool).query(Q.SELECT_FULL_PLAYERS, [userId]);
    return rows.map((r) => {
      const goals = Number(r.goals || 0);
      const rawSot = Number(r.shotsOnTarget || 0);
      return {
        userPlayerId: Number(r.userPlayerId),
        playerId: Number(r.playerId),
        name: r.name,
        mainPosition: r.mainPosition,
        preferredRole: r.preferredRole,
        secondaryRole: r.secondaryRole,
        level: Number(r.level),
        exp: Number(r.exp),
        stamina: Number(r.stamina),
        isStarter: Boolean(r.isStarter),
        lineupSlot: r.lineupSlot === null ? null : Number(r.lineupSlot),
        instruction: r.instruction,
        bonusGauge: Number(r.bonusGauge),
        dropWeight: Number(r.dropWeight),
        baseStats: parseJson(r.baseStats, {}),
        tags: parseJson(r.tags, []),
        matchesPlayed: Number(r.matchesPlayed),
        goals,
        assists: Number(r.assists),
        cleanSheets: Number(r.cleanSheets),
        goalsConceded: Number(r.goalsConceded),
        saves: Number(r.saves),
        shotsOnTarget: Math.max(goals, rawSot), // 유효슈팅 >= 득점 무결성 100% 보장
        yellowCards: Number(r.yellowCards),
        redCards: Number(r.redCards),
        ratingSum: Number(r.ratingSum),
      };
    });
  }

  /**
   * 선수 1명을 행 잠금으로 조회합니다.
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {number} userId
   * @param {number} userPlayerId
   * @returns {Promise<Object|null>}
   */
  static async findPlayerForUpdate(conn, userId, userPlayerId) {
    const [rows] = await conn.query(Q.SELECT_PLAYER_FOR_UPDATE, [userPlayerId, userId]);
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      userPlayerId: Number(r.userPlayerId),
      playerId: Number(r.playerId),
      level: Number(r.level),
      stamina: Number(r.stamina),
      isStarter: Boolean(r.isStarter),
      lineupSlot: r.lineupSlot === null ? null : Number(r.lineupSlot),
      bonusGauge: Number(r.bonusGauge),
      secondaryRole: r.secondaryRole,
      name: r.name,
      mainPosition: r.mainPosition,
      preferredRole: r.preferredRole,
      dropWeight: Number(r.dropWeight),
      baseStats: parseJson(r.baseStats, {}),
    };
  }

  /**
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {number} userId
   * @param {number} userPlayerId
   * @param {number} level
   * @param {number} gauge
   * @returns {Promise<void>}
   */
  static async updatePlayerLevel(conn, userId, userPlayerId, level, gauge) {
    await conn.query(Q.UPDATE_PLAYER_LEVEL, [level, gauge, userPlayerId, userId]);
  }

  /**
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {number} userId
   * @param {number} userPlayerId
   * @param {number} gauge
   * @returns {Promise<void>}
   */
  static async updatePlayerGauge(conn, userId, userPlayerId, gauge) {
    await conn.query(Q.UPDATE_PLAYER_GAUGE, [gauge, userPlayerId, userId]);
  }

  /**
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {number} userId
   * @param {number} userPlayerId
   * @param {string} role
   * @returns {Promise<void>}
   */
  static async updateSecondaryRole(conn, userId, userPlayerId, role) {
    await conn.query(Q.UPDATE_PLAYER_SECONDARY_ROLE, [role, userPlayerId, userId]);
  }

  /**
   * 소모 체력이 있는 선수 목록을 잠금 조회합니다.
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {number} userId
   * @returns {Promise<Array<{id:number, stamina:number}>>}
   */
  static async findLowStamina(conn, userId) {
    const [rows] = await conn.query(Q.SELECT_LOW_STAMINA, [userId]);
    return rows.map((r) => ({ id: Number(r.id), stamina: Number(r.stamina) }));
  }

  /**
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {number} userId
   * @param {number|null} userPlayerId null 이면 전체 선수
   * @returns {Promise<void>}
   */
  static async restoreStamina(conn, userId, userPlayerId) {
    if (userPlayerId) await conn.query(Q.UPDATE_PLAYER_STAMINA_ONE, [userPlayerId, userId]);
    else await conn.query(Q.UPDATE_PLAYER_STAMINA_ALL, [userId]);
  }

  /**
   * [요구사항 14 완벽 반영]
   * 경기 사이의 휴식 회복: 전 선수가 잃은 체력의 ratio 만큼 회복하며,
   * 경기에 출전하지 않은 벤치/예비 선수들은 휴식 보너스로 손실 체력의 85%(최소 +35)를 즉시 추가 회복합니다.
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {number} userId
   * @param {number} ratio 0~1 회복 비율
   * @param {number[]} [participatedIds=[]] 이번 경기에 출전한 userPlayerId 목록
   * @returns {Promise<void>}
   */
  static async restAllPlayers(conn, userId, ratio, participatedIds = []) {
    await conn.query(Q.UPDATE_PLAYER_STAMINA_REST, [ratio, userId]);
    if (Array.isArray(participatedIds) && participatedIds.length > 0) {
      const placeholders = participatedIds.map(() => '?').join(',');
      await conn
        .query(
          `UPDATE user_players 
           SET stamina = LEAST(100, GREATEST(stamina + 35, ROUND(stamina + (100 - stamina) * 0.85))) 
           WHERE user_id = ? AND id NOT IN (${placeholders}) AND stamina < 100`,
          [userId, ...participatedIds]
        )
        .catch(() => {});
    } else {
      await conn
        .query(
          `UPDATE user_players 
           SET stamina = LEAST(100, stamina + 30) 
           WHERE user_id = ? AND is_starter = 0 AND stamina < 100`,
          [userId]
        )
        .catch(() => {});
    }
  }

  /**
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {number} userId
   * @param {number} userPlayerId
   * @returns {Promise<void>}
   */
  static async deletePlayer(conn, userId, userPlayerId) {
    await conn.query(Q.DELETE_USER_PLAYER, [userPlayerId, userId]);
  }

  /**
   * 경기 후 선수 한 명의 누적 기록/경험치/체력을 반영합니다.
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {number} userId
   * @param {Object} s { userPlayerId, played, goals, assists, cleanSheet, conceded, saves, shotsOnTarget, yellow, red, rating, exp, gauge, stamina }
   * @returns {Promise<void>}
   */
  static async applyMatchStats(conn, userId, s) {
    const safeGoals = Number(s.goals || 0);
    const safeShotsOnTarget = Math.max(safeGoals, Number(s.shotsOnTarget || 0));
    await conn.query(Q.UPDATE_PLAYER_MATCH_STATS, [
      s.played,
      safeGoals,
      s.assists,
      s.cleanSheet,
      s.conceded,
      s.saves,
      safeShotsOnTarget,
      s.yellow,
      s.red,
      s.rating,
      s.exp,
      s.gauge,
      s.stamina,
      s.userPlayerId,
      userId,
    ]);
  }

  /**
   * 요청한 선수들의 포지션/현재 체력을 조회합니다.
   * @param {import('mysql2/promise').PoolConnection|null} conn
   * @param {number} userId
   * @param {number[]} ids
   * @returns {Promise<Map<number, {name:string, mainPosition:string, stamina:number}>>}
   */
  static async getPlayerPositions(conn, userId, ids) {
    if (ids.length === 0) return new Map();
    const [rows] = await (conn || pool).query(Q.SELECT_PLAYER_POSITIONS, [userId, ids]);
    return new Map(rows.map((r) => [Number(r.userPlayerId), { name: r.name, mainPosition: r.mainPosition, stamina: Number(r.stamina) }]));
  }

  /**
   * 포메이션/팀 전술 설정을 조회합니다.
   * @param {import('mysql2/promise').PoolConnection|null} conn
   * @param {number} userId
   * @returns {Promise<{formation:string, teamTactics:Object|null}|null>}
   */
  static async getSquadSettings(conn, userId) {
    const [rows] = await (conn || pool).query(Q.SELECT_SQUAD_SETTINGS, [userId]);
    return rows[0] ? { formation: rows[0].formation, teamTactics: parseJson(rows[0].teamTactics, null) } : null;
  }

  /**
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {number} userId
   * @param {string} formation
   * @param {Object} teamTactics
   * @returns {Promise<void>}
   */
  static async saveSquadSettings(conn, userId, formation, teamTactics) {
    await conn.query(Q.UPSERT_SQUAD_SETTINGS, [userId, formation, JSON.stringify(teamTactics)]);
  }

  /**
   * 선수 개인 지침 일괄 저장 (전원 초기화 후 지정한 선수만 설정)
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {number} userId
   * @param {Array<[number, string]>} entries [userPlayerId, instruction]
   * @returns {Promise<void>}
   */
  static async saveInstructions(conn, userId, entries) {
    await conn.query(Q.RESET_ALL_INSTRUCTIONS, [userId]);
    for (const [id, instruction] of entries) await conn.query(Q.UPDATE_PLAYER_INSTRUCTION, [instruction, id, userId]);
  }

  /**
   * @param {import('mysql2/promise').PoolConnection|null} conn
   * @param {number} userId
   * @param {string} mode
   * @param {boolean} [forUpdate=false]
   * @returns {Promise<{mode:string, status:string, state:Object}|null>}
   */
  static async getCompetition(conn, userId, mode, forUpdate = false) {
    const [rows] = await (conn || pool).query(forUpdate ? Q.SELECT_COMPETITION_FOR_UPDATE : Q.SELECT_COMPETITION, [userId, mode]);
    return rows[0] ? { mode: rows[0].mode, status: rows[0].status, state: parseJson(rows[0].state, {}) } : null;
  }

  /**
   * @param {import('mysql2/promise').PoolConnection|null} conn
   * @param {number} userId
   * @returns {Promise<Array<{mode:string, status:string, state:Object}>>}
   */
  static async getAllCompetitions(conn, userId) {
    const [rows] = await (conn || pool).query(Q.SELECT_ALL_COMPETITIONS, [userId]);
    return rows.map((r) => ({ mode: r.mode, status: r.status, state: parseJson(r.state, {}) }));
  }

  /**
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {number} userId
   * @param {string} mode
   * @param {string} status
   * @param {Object} state
   * @returns {Promise<void>}
   */
  static async saveCompetition(conn, userId, mode, status, state) {
    await conn.query(Q.UPSERT_COMPETITION, [userId, mode, status, JSON.stringify(state)]);
  }

  /**
   * @param {import('mysql2/promise').PoolConnection|null} conn
   * @param {number} userId
   * @param {string} dailyKey
   * @returns {Promise<Array<{questKey:string, periodKey:string, progress:number, claimed:boolean}>>}
   */
  static async getQuests(conn, userId, dailyKey) {
    const [rows] = await (conn || pool).query(Q.SELECT_QUESTS, [userId, dailyKey, 'ALL']);
    return rows.map((r) => ({ ...r, progress: Number(r.progress), claimed: Boolean(r.claimed) }));
  }

  /**
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {number} userId
   * @param {string} questKey
   * @param {string} periodKey
   * @param {number} amount
   * @returns {Promise<void>}
   */
  static async addQuestProgress(conn, userId, questKey, periodKey, amount) {
    await conn.query(Q.UPSERT_QUEST_PROGRESS, [userId, questKey, periodKey, amount]);
  }

  /**
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {number} userId
   * @param {string} questKey
   * @param {string} periodKey
   * @returns {Promise<{progress:number, claimed:boolean}|null>}
   */
  static async getQuestForUpdate(conn, userId, questKey, periodKey) {
    const [rows] = await conn.query(Q.SELECT_QUEST_FOR_UPDATE, [userId, questKey, periodKey]);
    return rows[0] ? { progress: Number(rows[0].progress), claimed: Boolean(rows[0].claimed) } : null;
  }

  /**
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {number} userId
   * @param {string} questKey
   * @param {string} periodKey
   * @returns {Promise<void>}
   */
  static async markQuestClaimed(conn, userId, questKey, periodKey) {
    await conn.query(Q.UPSERT_QUEST_CLAIM, [userId, questKey, periodKey]);
  }

  /**
   * @param {import('mysql2/promise').PoolConnection|null} conn
   * @param {number} userId
   * @param {string} date YYYY-MM-DD
   * @returns {Promise<string[]>}
   */
  static async getPurchases(conn, userId, date) {
    const [rows] = await (conn || pool).query(Q.SELECT_PURCHASES, [userId, date]);
    return rows.map((r) => r.listingKey);
  }

  /**
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {number} userId
   * @param {string} date
   * @param {string} listingKey
   * @returns {Promise<void>}
   */
  static async insertPurchase(conn, userId, date, listingKey) {
    await conn.query(Q.INSERT_PURCHASE, [userId, date, listingKey]);
  }

  /**
   * 구단 통산 전적(대회 경기 기준)을 집계합니다.
   * @param {import('mysql2/promise').PoolConnection|null} conn
   * @param {number} userId
   * @returns {Promise<{matches:number, wins:number, draws:number, losses:number, goalsFor:number, goalsAgainst:number}>}
   */
  static async getClubRecord(conn, userId) {
    const [rows] = await (conn || pool).query(Q.SELECT_CLUB_RECORD, [userId]);
    const r = rows[0] || {};
    return {
      matches: Number(r.matches || 0),
      wins: Number(r.wins || 0),
      draws: Number(r.draws || 0),
      losses: Number(r.losses || 0),
      goalsFor: Number(r.goalsFor || 0),
      goalsAgainst: Number(r.goalsAgainst || 0),
    };
  }

  /**
   * @param {import('mysql2/promise').PoolConnection|null} conn
   * @returns {Promise<Object[]>} player_master 전체
   */
  static async getAllMasters(conn) {
    const [rows] = await (conn || pool).query(Q.SELECT_MASTER_ALL);
    return rows.map((r) => ({
      ...r,
      id: Number(r.id),
      dropWeight: Number(r.dropWeight),
      baseStats: parseJson(r.baseStats, {}),
      tags: parseJson(r.tags, []),
    }));
  }

  /**
   * @param {import('mysql2/promise').PoolConnection|null} conn
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  static async getMasterById(conn, id) {
    const [rows] = await (conn || pool).query(Q.SELECT_MASTER_BY_ID, [id]);
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      ...r,
      id: Number(r.id),
      dropWeight: Number(r.dropWeight),
      baseStats: parseJson(r.baseStats, {}),
      tags: parseJson(r.tags, []),
    };
  }

  /**
   * 후보 선수를 지급합니다. (벤치/라인업 미배치)
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {number} userId
   * @param {number} playerMasterId
   * @returns {Promise<number>}
   */
  static async insertPlainPlayer(conn, userId, playerMasterId) {
    const [result] = await conn.query(Q.INSERT_PLAYER_PLAIN, [userId, playerMasterId]);
    return result.insertId;
  }
}