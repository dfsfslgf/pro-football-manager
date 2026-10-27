import pool from '../config/database.js';
import * as Q from '../queries/clubQueries.js';

function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export default class ClubRepository {
  static async insertUser(conn, nickname, passwordHash) {
    const [result] = await (conn || pool).query(Q.INSERT_USER, [nickname, passwordHash]);
    return result.insertId;
  }

  static async findUserByNickname(conn, nickname) {
    const [rows] = await (conn || pool).query(Q.SELECT_USER_BY_NICKNAME, [nickname]);
    return rows[0] ? { ...rows[0], id: Number(rows[0].id) } : null;
  }

  static async findClub(conn, userId) {
    const [rows] = await (conn || pool).query(Q.SELECT_CLUB, [userId]);
    return rows[0] ? { ...rows[0], userId: Number(rows[0].userId) } : null;
  }

  static async insertClub(conn, club) {
    await (conn || pool).query(Q.INSERT_CLUB, [club.userId, club.name, club.emblemIcon, club.emblemColor, club.sponsorKey]);
  }

  static async updateSponsor(conn, userId, sponsorKey) {
    await (conn || pool).query(Q.UPDATE_CLUB_SPONSOR, [sponsorKey, userId]);
  }

  static async insertWallet(conn, userId, grant) {
    await (conn || pool).query(Q.INSERT_WALLET, [userId, grant.cashPaid, grant.cashFree, grant.gold]);
  }

  static async findCommonMasters(conn, position, role) {
    const executor = conn || pool;
    const [rows] = role
      ? await executor.query(Q.SELECT_COMMON_MASTER_BY_ROLE, [position, role])
      : await executor.query(Q.SELECT_COMMON_MASTER_BY_POSITION, [position]);
    return rows.map((r) => ({ ...r, id: Number(r.id) }));
  }

  static async insertSlottedPlayer(conn, userId, playerMasterId, isStarter, lineupSlot) {
    const [result] = await (conn || pool).query(Q.INSERT_STARTER_PLAYER, [userId, playerMasterId, isStarter, lineupSlot]);
    return result.insertId;
  }

  /**
   * 보유 선수 전체를 누적 기록, 퇴장 출장 정지 잔여 경기 수(suspendedMatches), 한계돌파 최대 레벨(maxLevel)과 함께 조회함
   */
  static async getFullPlayers(conn, userId) {
    const executor = conn || pool;
    const [rows] = await executor.query(Q.SELECT_FULL_PLAYERS, [userId]);

    const extraMap = new Map();
    try {
      const [extraRows] = await executor.query(
        'SELECT id, suspended_matches AS suspendedMatches, max_level AS maxLevel FROM user_players WHERE user_id = ?',
        [userId]
      );
      for (const er of extraRows) {
        extraMap.set(Number(er.id), {
          suspendedMatches: Number(er.suspendedMatches || 0),
          maxLevel: Number(er.maxLevel || 20),
        });
      }
    } catch {
      // 컬럼 미생성 시 기본값 사용
    }

    return rows.map((r) => {
      const uid = Number(r.userPlayerId);
      const goals = Number(r.goals || 0);
      const rawSot = Number(r.shotsOnTarget || 0);
      const extra = extraMap.get(uid) || { suspendedMatches: 0, maxLevel: 20 };

      return {
        userPlayerId: uid,
        playerId: Number(r.playerId),
        name: r.name,
        mainPosition: r.mainPosition,
        preferredRole: r.preferredRole,
        secondaryRole: r.secondaryRole,
        level: Number(r.level),
        maxLevel: extra.maxLevel,
        suspendedMatches: extra.suspendedMatches,
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
        shotsOnTarget: Math.max(goals, rawSot),
        yellowCards: Number(r.yellowCards),
        redCards: Number(r.redCards),
        ratingSum: Number(r.ratingSum),
      };
    });
  }

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

  static async updatePlayerLevel(conn, userId, userPlayerId, level, gauge) {
    await conn.query(Q.UPDATE_PLAYER_LEVEL, [level, gauge, userPlayerId, userId]);
  }

  static async updatePlayerGauge(conn, userId, userPlayerId, gauge) {
    await conn.query(Q.UPDATE_PLAYER_GAUGE, [gauge, userPlayerId, userId]);
  }

  static async updateSecondaryRole(conn, userId, userPlayerId, role) {
    await conn.query(Q.UPDATE_PLAYER_SECONDARY_ROLE, [role, userPlayerId, userId]);
  }

  static async findLowStamina(conn, userId) {
    const [rows] = await conn.query(Q.SELECT_LOW_STAMINA, [userId]);
    return rows.map((r) => ({ id: Number(r.id), stamina: Number(r.stamina) }));
  }

  static async restoreStamina(conn, userId, userPlayerId) {
    if (userPlayerId) await conn.query(Q.UPDATE_PLAYER_STAMINA_ONE, [userPlayerId, userId]);
    else await conn.query(Q.UPDATE_PLAYER_STAMINA_ALL, [userId]);
  }

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

  static async deletePlayer(conn, userId, userPlayerId) {
    await conn.query(Q.DELETE_USER_PLAYER, [userPlayerId, userId]);
  }

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

  static async getPlayerPositions(conn, userId, ids) {
    if (ids.length === 0) return new Map();
    const [rows] = await (conn || pool).query(Q.SELECT_PLAYER_POSITIONS, [userId, ids]);
    return new Map(
      rows.map((r) => [Number(r.userPlayerId), { name: r.name, mainPosition: r.mainPosition, stamina: Number(r.stamina) }])
    );
  }

  static async getSquadSettings(conn, userId) {
    const [rows] = await (conn || pool).query(Q.SELECT_SQUAD_SETTINGS, [userId]);
    return rows[0] ? { formation: rows[0].formation, teamTactics: parseJson(rows[0].teamTactics, null) } : null;
  }

  static async saveSquadSettings(conn, userId, formation, teamTactics) {
    await conn.query(Q.UPSERT_SQUAD_SETTINGS, [userId, formation, JSON.stringify(teamTactics)]);
  }

  static async saveInstructions(conn, userId, entries) {
    await conn.query(Q.RESET_ALL_INSTRUCTIONS, [userId]);
    for (const [id, instruction] of entries) await conn.query(Q.UPDATE_PLAYER_INSTRUCTION, [instruction, id, userId]);
  }

  static async getCompetition(conn, userId, mode, forUpdate = false) {
    const [rows] = await (conn || pool).query(forUpdate ? Q.SELECT_COMPETITION_FOR_UPDATE : Q.SELECT_COMPETITION, [userId, mode]);
    return rows[0] ? { mode: rows[0].mode, status: rows[0].status, state: parseJson(rows[0].state, {}) } : null;
  }

  static async getAllCompetitions(conn, userId) {
    const [rows] = await (conn || pool).query(Q.SELECT_ALL_COMPETITIONS, [userId]);
    return rows.map((r) => ({ mode: r.mode, status: r.status, state: parseJson(r.state, {}) }));
  }

  static async saveCompetition(conn, userId, mode, status, state) {
    await conn.query(Q.UPSERT_COMPETITION, [userId, mode, status, JSON.stringify(state)]);
  }

  static async getQuests(conn, userId, dailyKey) {
    const [rows] = await (conn || pool).query(Q.SELECT_QUESTS, [userId, dailyKey, 'ALL']);
    return rows.map((r) => ({ ...r, progress: Number(r.progress), claimed: Boolean(r.claimed) }));
  }

  static async addQuestProgress(conn, userId, questKey, periodKey, amount) {
    await conn.query(Q.UPSERT_QUEST_PROGRESS, [userId, questKey, periodKey, amount]);
  }

  static async getQuestForUpdate(conn, userId, questKey, periodKey) {
    const [rows] = await conn.query(Q.SELECT_QUEST_FOR_UPDATE, [userId, questKey, periodKey]);
    return rows[0] ? { progress: Number(rows[0].progress), claimed: Boolean(rows[0].claimed) } : null;
  }

  static async markQuestClaimed(conn, userId, questKey, periodKey) {
    await conn.query(Q.UPSERT_QUEST_CLAIM, [userId, questKey, periodKey]);
  }

  static async getPurchases(conn, userId, date) {
    const [rows] = await (conn || pool).query(Q.SELECT_PURCHASES, [userId, date]);
    return rows.map((r) => r.listingKey);
  }

  static async insertPurchase(conn, userId, date, listingKey) {
    await conn.query(Q.INSERT_PURCHASE, [userId, date, listingKey]);
  }

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

  static async insertPlainPlayer(conn, userId, playerMasterId) {
    const [result] = await conn.query(Q.INSERT_PLAYER_PLAIN, [userId, playerMasterId]);
    return result.insertId;
  }
}