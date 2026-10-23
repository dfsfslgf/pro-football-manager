import { randomUUID } from 'node:crypto';
import pool from '../config/database.js';
import { GAME_RULES } from '../constants/gameRules.js';
import { MATCH_REWARDS, SPONSORS, TRAINING } from '../constants/clubRules.js';
import { NotFoundError, ValidationError } from '../constants/errorCodes.js';
import ClubRepository from '../repositories/ClubRepository.js';
import MatchRepository from '../repositories/MatchRepository.js';
import SquadRepository from '../repositories/SquadRepository.js';
import WalletRepository from '../repositories/WalletRepository.js';
import CompetitionService from './CompetitionService.js';
import WalletService from './WalletService.js';
import { trackDailyQuest } from './QuestTracker.js';

const ALLOWED_EVENT_TYPES = new Set(['GOAL', 'YELLOW_CARD', 'RED_CARD', 'SUBSTITUTION', 'TACTIC_CHANGE']);
const TEAMS = new Set(['HOME', 'AWAY']);
const MAX_EVENTS = 300;
const MAX_GOALS = 20;
const MAX_STAMINA_ENTRIES = 40;
const STAT_LIMITS = { possession: 100, shots: 100, shotsOnTarget: 100, corners: 50, fouls: 100, yellowCards: 30, redCards: 11 };

// 다각화된 확장 스폰서 폴백 테이블 (요구사항 18 반영)
const EXTENDED_SPONSORS = {
  LOCAL_SHOP: { label: '동네 상점 연합', matchFee: 600, winBonus: 400 },
  REGIONAL_CORP: { label: '지역 기업 파트너십', matchFee: 950, winBonus: 750 },
  K_FINTECH: { label: '네오 핀테크 뱅크', matchFee: 1300, winBonus: 1100 },
  GLOBAL_SPORTS: { label: '글로벌 스포츠 브랜드', matchFee: 1700, winBonus: 1500 },
  EURO_AIRLINES: { label: '콘티넨탈 항공 그룹', matchFee: 2200, winBonus: 2000 },
  MEGA_TECH: { label: '실리콘밸리 AI 빅테크', matchFee: 2800, winBonus: 2600 },
  SOVEREIGN_FUND: { label: '글로벌 국부펀드 메가 딜', matchFee: 3500, winBonus: 3500 },
};

function isIntInRange(v, max) {
  return Number.isInteger(v) && v >= 0 && v <= max;
}

function isOptionalString(v, maxLen) {
  return v === null || v === undefined || (typeof v === 'string' && v.length <= maxLen);
}

export function sanitizeAndMapMatchEvents(timelineEvents, homeStarters = [], awayStarters = [], subHistory = []) {
  if (!Array.isArray(timelineEvents)) return [];
  const allParticipated = [...homeStarters, ...awayStarters, ...subHistory].filter(Boolean);
  const idLookup = new Map();
  for (const p of allParticipated) {
    if (p.userPlayerId !== undefined) idLookup.set(String(p.userPlayerId), p);
    if (p.playerId !== undefined) idLookup.set(String(p.playerId), p);
    if (p.id !== undefined) idLookup.set(String(p.id), p);
    if (p.uid !== undefined) idLookup.set(String(p.uid), p);
    if (p.name) idLookup.set(String(p.name).trim(), p);
    if (p.safeName) idLookup.set(String(p.safeName).trim(), p);
  }
  return timelineEvents.map((evt) => {
    const isHomeEvt = evt.team !== 'AWAY';
    const teamPool = (isHomeEvt ? homeStarters : awayStarters).filter(Boolean);
    const defaultScorer =
      teamPool.find((p) => ['ST', 'LST', 'RST', 'LW', 'RW', 'CAM', 'FW'].includes(p.slotRoleCode || p.mainPosition)) ||
      teamPool[0] ||
      allParticipated[0];
    const defaultAssister =
      teamPool.find((p) => p !== defaultScorer && (p.slotRoleCode || p.mainPosition) !== 'GK') || null;
    const rawPid = evt.userPlayerId ?? evt.primaryPlayerId ?? evt.scorerId ?? evt.playerId;
    const rawPName = evt.primaryPlayerName ?? evt.scorerName ?? evt.playerName;
    const matchedPrimary =
      (rawPid !== undefined && idLookup.get(String(rawPid))) ||
      (rawPName && idLookup.get(String(rawPName).trim())) ||
      defaultScorer;
    const rawSid = evt.secondaryPlayerId ?? evt.assisterId;
    const rawSName = evt.secondaryPlayerName ?? evt.assisterName;
    let matchedSecondary =
      (rawSid !== undefined && idLookup.get(String(rawSid))) ||
      (rawSName && idLookup.get(String(rawSName).trim())) ||
      null;
    if (matchedSecondary && matchedPrimary && matchedSecondary === matchedPrimary) {
      matchedSecondary = defaultAssister;
    }
    const validPrimaryId = matchedPrimary
      ? matchedPrimary.userPlayerId ?? matchedPrimary.playerId ?? matchedPrimary.id
      : 1;
    const validPrimaryName = matchedPrimary
      ? matchedPrimary.name || matchedPrimary.safeName || '스트라이커'
      : '스트라이커';
    const validSecondaryId = matchedSecondary
      ? matchedSecondary.userPlayerId ?? matchedSecondary.playerId ?? matchedSecondary.id
      : null;
    const validSecondaryName = matchedSecondary
      ? matchedSecondary.name || matchedSecondary.safeName || null
      : null;
    return {
      ...evt,
      userPlayerId: validPrimaryId,
      playerId: matchedPrimary?.playerId ?? validPrimaryId,
      primaryPlayerId: validPrimaryId,
      scorerId: validPrimaryId,
      primaryPlayerName: validPrimaryName,
      scorerName: validPrimaryName,
      secondaryPlayerId: validSecondaryId,
      assisterId: validSecondaryId,
      secondaryPlayerName: validSecondaryName,
      assisterName: validSecondaryName,
    };
  });
}

export default class LiveMatchEngine {
  static sessions = new Map();

  static startSession(userId, context) {
    const now = Date.now();
    for (const [id, session] of LiveMatchEngine.sessions) {
      if (session.userId === userId || now - session.startedAt > GAME_RULES.LIVE_SESSION_TTL_MS) {
        LiveMatchEngine.sessions.delete(id);
      }
    }
    const sessionId = randomUUID();
    LiveMatchEngine.sessions.set(sessionId, { userId, startedAt: now, context });
    return { sessionId, startedAt: now };
  }

  static validateTactics(tactics) {
    if (tactics === undefined || tactics === null) return null;
    if (typeof tactics !== 'object') throw new ValidationError('팀 전술 형식이 올바르지 않습니다.');
    const normalized = {};
    for (const [key, allowed] of Object.entries(GAME_RULES.TEAM_TACTIC_OPTIONS)) {
      if (!allowed.includes(tactics[key])) throw new ValidationError(`팀 전술 ${key} 값이 올바르지 않습니다.`);
      normalized[key] = tactics[key];
    }
    return normalized;
  }

  static minStaminaDrainPerMinute() {
    const positions = GAME_RULES.POSITION_STAMINA_DRAIN_MULTIPLIER;
    const minInstruction = Math.min(...Object.values(GAME_RULES.INSTRUCTION_STAMINA_MULTIPLIER));
    const minTeam =
      Math.min(...Object.values(GAME_RULES.TEAM_TACTIC_STAMINA_MULTIPLIER.tempo)) *
      Math.min(...Object.values(GAME_RULES.TEAM_TACTIC_STAMINA_MULTIPLIER.pressing));
    const outfieldMin = Math.min(...Object.entries(positions).filter(([code]) => code !== 'GK').map(([, mult]) => mult));
    return GAME_RULES.BASE_TICK_DRAIN_MIN * Math.min(positions.GK * minInstruction, outfieldMin * minTeam * minInstruction);
  }

  static maxStaminaAfter(startStamina, minutesPlayed) {
    const recovery = minutesPlayed > GAME_RULES.HALF_TIME_MINUTE ? GAME_RULES.HALF_TIME_RECOVERY.MAX : 0;
    const drained = startStamina - minutesPlayed * LiveMatchEngine.minStaminaDrainPerMinute() + recovery;
    return Math.min(100, Math.max(GAME_RULES.MIN_STAMINA, drained));
  }

  static validateResult(payload, baseline) {
const { scoreHome, scoreAway, homeStats, awayStats, timelineEvents, playerStamina } = payload || {};
    if (!isIntInRange(scoreHome, MAX_GOALS) || !isIntInRange(scoreAway, MAX_GOALS)) throw new ValidationError('스코어가 올바르지 않습니다.');
    if (scoreHome < baseline.home || scoreAway < baseline.away) throw new ValidationError('스코어가 시작 스코어보다 낮습니다.');
    const playedHome = scoreHome - baseline.home;
    const playedAway = scoreAway - baseline.away;

    const normalizeStats = (stats, minGoals = 0) => {
      const safeStats = stats || {};
      const out = {};
      
      // 통계 필드들 강제 기본값 방어 (null/undefined 절대 차단)
      out.possession = Number.isInteger(safeStats.possession) ? safeStats.possession : 50;
      out.shots = Math.max(minGoals, Number.isInteger(safeStats.shots) ? safeStats.shots : minGoals);
      out.shotsOnTarget = Math.max(minGoals, Number.isInteger(safeStats.shotsOnTarget) ? safeStats.shotsOnTarget : minGoals);
      out.corners = Number.isInteger(safeStats.corners) ? safeStats.corners : 0;
      out.fouls = Number.isInteger(safeStats.fouls) ? safeStats.fouls : 0;
      out.yellowCards = Number.isInteger(safeStats.yellowCards) ? safeStats.yellowCards : 0;
      out.redCards = Number.isInteger(safeStats.redCards) ? safeStats.redCards : 0;
      out.passesAttempted = Number.isInteger(safeStats.passesAttempted) ? safeStats.passesAttempted : 0;
      out.passesCompleted = Number.isInteger(safeStats.passesCompleted) ? safeStats.passesCompleted : 0;
      out.passAccuracy = Number.isInteger(safeStats.passAccuracy) ? safeStats.passAccuracy : 85;
      out.tackles = Number.isInteger(safeStats.tackles) ? safeStats.tackles : 0;
      out.saves = Number.isInteger(safeStats.saves) ? safeStats.saves : 0;

      // 무결성 최종 보정
      if (out.shotsOnTarget > out.shots) out.shots = out.shotsOnTarget;
      return out;
    };

    const home = normalizeStats(homeStats, playedHome);
    const away = normalizeStats(awayStats, playedAway);
    
    if (home.possession + away.possession !== 100) {
      home.possession = clampPossession(home.possession);
      away.possession = 100 - home.possession;
    }

    if (!Array.isArray(timelineEvents) || timelineEvents.length > MAX_EVENTS) throw new ValidationError('타임라인 이벤트가 올바르지 않습니다.');
    const counts = { HOME: { goals: 0, reds: 0, subs: 0 }, AWAY: { goals: 0, reds: 0, subs: 0 } };
    const events = timelineEvents
      .filter((e) => e && ALLOWED_EVENT_TYPES.has(e.type) && TEAMS.has(e.team))
      .map((e) => {
        if (e.type === 'GOAL') counts[e.team].goals++;
        if (e.type === 'RED_CARD') counts[e.team].reds++;
        if (e.type === 'SUBSTITUTION') counts[e.team].subs++;
        return {
          minute: Math.max(1, Math.min(GAME_RULES.MATCH_MINUTES, Number(e.minute) || 1)),
          type: e.type,
          team: e.team,
          primaryPlayerId: e.primaryPlayerId ?? null,
          primaryPlayerName: e.primaryPlayerName ?? null,
          secondaryPlayerId: e.secondaryPlayerId ?? null,
          secondaryPlayerName: e.secondaryPlayerName ?? null,
          description: String(e.description || '').slice(0, 300),
          isUserAction: e.isUserAction === true,
          isPenalty: e.isPenalty === true,
        };
      });

    const staminaList = Array.isArray(playerStamina) ? playerStamina : [];
    const seen = new Set();
    const entries = [];
    for (const entry of staminaList) {
      if (!entry || !Number.isSafeInteger(entry.userPlayerId) || entry.userPlayerId <= 0) continue;
      if (seen.has(entry.userPlayerId)) continue;
      seen.add(entry.userPlayerId);
      const sot = Math.max(0, Math.min(100, Number(entry.shotsOnTarget) || 0));
      const sh = Math.max(sot, Math.min(100, Number(entry.shots) || 0));
      entries.push({
        userPlayerId: entry.userPlayerId,
        stamina: Math.max(GAME_RULES.MIN_STAMINA, Math.min(100, Number(entry.stamina) || 70)),
        minutesPlayed: Math.max(1, Math.min(GAME_RULES.MATCH_MINUTES, Number(entry.minutesPlayed) || 1)),
        enteredAsSub: Boolean(entry.enteredAsSub),
        saves: Math.max(0, Math.min(60, Number(entry.saves) || 0)),
        shots: sh,
        shotsOnTarget: sot,
      });
    }

    const entryIds = new Set(entries.map((e) => e.userPlayerId));
    const fallbackId = entries.length > 0 ? entries[0].userPlayerId : 1;
    for (const e of events) {
      if (e.team !== 'HOME') continue;
      if (['GOAL', 'YELLOW_CARD', 'RED_CARD'].includes(e.type)) {
        const numPid = Number(e.primaryPlayerId);
        if (!numPid || !entryIds.has(numPid)) {
          e.primaryPlayerId = fallbackId;
        } else {
          e.primaryPlayerId = numPid;
        }
      }
      if (e.secondaryPlayerId !== null && e.secondaryPlayerId !== undefined) {
        const numSid = Number(e.secondaryPlayerId);
        e.secondaryPlayerId = numSid && entryIds.has(numSid) && numSid !== e.primaryPlayerId ? numSid : null;
      }
    }

    // 선수별 득점 수와 개인 유효슈팅/슈팅 수 및 팀 전체 슈팅 통계 동기화 (요구사항 17 완벽 해결)
    for (const entry of entries) {
      const playerGoals = events.filter((e) => e.team === 'HOME' && e.type === 'GOAL' && e.primaryPlayerId === entry.userPlayerId).length;
      if (entry.shotsOnTarget < playerGoals) entry.shotsOnTarget = playerGoals;
      if (entry.shots < entry.shotsOnTarget) entry.shots = entry.shotsOnTarget;
    }

    const totalEntrySot = entries.reduce((s, e) => s + e.shotsOnTarget, 0);
    const totalEntryShots = entries.reduce((s, e) => s + e.shots, 0);
    home.shotsOnTarget = Math.max(home.shotsOnTarget, totalEntrySot, playedHome);
    home.shots = Math.max(home.shots, totalEntryShots, home.shotsOnTarget);

    const tactics = LiveMatchEngine.validateTactics(payload.finalTactics);
    return {
      scoreHome,
      scoreAway,
      homeStats: {
        ...home,
        passesAttempted: homeStats?.passesAttempted || 0,
        passesCompleted: homeStats?.passesCompleted || 0,
        passAccuracy: homeStats?.passAccuracy || 85,
        tackles: homeStats?.tackles || 0,
        tactics,
        lockerTalk: payload.lockerTalk ?? null,
      },
      awayStats: {
        ...away,
        passesAttempted: awayStats?.passesAttempted || 0,
        passesCompleted: awayStats?.passesCompleted || 0,
        passAccuracy: awayStats?.passAccuracy || 82,
        tackles: awayStats?.tackles || 0,
      },
      timelineEvents: events,
      entries,
    };
  }

  static buildPlayerReports(validated, positions, outcome) {
    const homeEvents = validated.timelineEvents.filter((e) => e.team === 'HOME');
    const count = (type, key, id) => homeEvents.filter((e) => e.type === type && Number(e[key]) === Number(id)).length;
    const players = validated.entries
      .filter((e) => e.minutesPlayed > 0 && positions.has(e.userPlayerId))
      .map((entry) => {
        const info = positions.get(entry.userPlayerId);
        const goals = count('GOAL', 'primaryPlayerId', entry.userPlayerId);
        const assists = count('GOAL', 'secondaryPlayerId', entry.userPlayerId);
        const yellow = count('YELLOW_CARD', 'primaryPlayerId', entry.userPlayerId);
        const red = count('RED_CARD', 'primaryPlayerId', entry.userPlayerId);
        const isGK = info.mainPosition === 'GK';
        const isDF = info.mainPosition === 'DF';
        const isMF = info.mainPosition === 'MF';
        const cleanSheet = validated.scoreAway === 0 && (isGK || isDF) && entry.minutesPlayed >= 45 ? 1 : 0;
        const conceded = isGK && entry.minutesPlayed >= 45 ? validated.scoreAway : 0;

        // [요구사항 17 완벽 보장] DB에 저장되는 shotsOnTarget은 무조건 이번 경기 goals 이상!
        const validShotsOnTarget = Math.max(goals, entry.shotsOnTarget || 0);

        // [요구사항 19 반영] 포지션별 활약도(수비 무실점, 미드필더 중원 장악, 골키퍼 선방, 공격수 슈팅 효율)에 따른 정밀 평점 산출
        let posBonus = 0;
        if (isMF && entry.minutesPlayed >= 60) posBonus += (validated.homeStats?.possession >= 52 ? 0.45 : 0.2);
        if (isDF && validated.scoreAway <= 1) posBonus += 0.35;
        if (!isGK && validShotsOnTarget >= 2 && goals === 0) posBonus += 0.2;

        const raw =
          6.5 +
          goals * 1.4 +
          assists * 1.0 +
          cleanSheet * 1.1 +
          posBonus +
          Math.min(1.6, entry.saves * 0.22) -
          yellow * 0.35 -
          red * 1.6 +
          (outcome === 'WIN' ? 0.35 : outcome === 'LOSE' ? -0.25 : 0);

        const rating = Math.round(Math.min(10, Math.max(3.5, raw)) * 10) / 10;
        const exp =
          MATCH_REWARDS.expAppearance +
          goals * MATCH_REWARDS.expGoal +
          assists * MATCH_REWARDS.expAssist +
          cleanSheet * 25 +
          (outcome === 'WIN' ? MATCH_REWARDS.expWin : 0);

        return {
          userPlayerId: entry.userPlayerId,
          name: info.name,
          position: info.mainPosition,
          minutes: entry.minutesPlayed,
          rating,
          goals,
          assists,
          cleanSheet,
          conceded,
          saves: entry.saves,
          shotsOnTarget: validShotsOnTarget,
          yellow,
          red,
          exp,
          stamina: entry.stamina,
        };
      });

    const mom =
      [...players].sort(
        (a, b) => b.rating - a.rating || b.goals + b.assists - (a.goals + a.assists) || b.minutes - a.minutes
      )[0] || null;
    return { players, mom };
  }

  static async finishMatch(userId, payload) {
    const sessionId = payload?.sessionId;
    const session = typeof sessionId === 'string' ? LiveMatchEngine.sessions.get(sessionId) : undefined;
    if (!session || session.userId !== userId) throw new NotFoundError('유효한 경기 세션이 없습니다. 경기를 새로 시작해주세요.');
    const { context } = session;
    const validated = LiveMatchEngine.validateResult(payload, context.baseline);
    const outcome = validated.scoreHome > validated.scoreAway ? 'WIN' : validated.scoreHome === validated.scoreAway ? 'DRAW' : 'LOSE';
    LiveMatchEngine.sessions.delete(sessionId);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const wallet = await WalletRepository.findWalletWithLock(conn, userId);
      if (!wallet) throw new NotFoundError('유저 지갑 정보를 찾을 수 없습니다.');
      const ids = validated.entries.map((e) => e.userPlayerId);
      const positions = await ClubRepository.getPlayerPositions(conn, userId, ids);

      const { players, mom } = LiveMatchEngine.buildPlayerReports(validated, positions, outcome);
      const club = await ClubRepository.findClub(conn, userId);
      const sponsor = SPONSORS[club.sponsorKey] || EXTENDED_SPONSORS[club.sponsorKey] || SPONSORS.BASIC;
      const matchGold = MATCH_REWARDS.gold[outcome];
      const sponsorGold = sponsor.matchFee + (outcome === 'WIN' ? sponsor.winBonus : 0);
      const competition = await CompetitionService.applyResult(conn, userId, context, validated.scoreHome, validated.scoreAway);

      // [요구사항 47 반영] 리그/컵/월드컵 우승 달성 시 특별 챔피언 보너스(골드 + 캐시) 추가 지급!
      const isChampion = Boolean(competition.summary?.champion || competition.summary?.seasonEnd?.champion);
      const championBonusGold = isChampion ? 15000 : 0;
      const championBonusCash = isChampion ? 300 : 0;

      const totalCompGold = (competition.reward?.gold || 0) + championBonusGold;
      const totalCompCash = (competition.reward?.cashFree || 0) + championBonusCash;

      const rewards = {
        gold: matchGold + sponsorGold + totalCompGold,
        cashFree: totalCompCash,
        breakdown: {
          match: matchGold,
          sponsor: sponsorGold,
          sponsorName: sponsor.label,
          competition: totalCompGold,
          competitionCash: totalCompCash,
          isChampion,
        },
      };

      // 1. 경기에 출전한 선수들의 기록 및 소모된 체력을 먼저 반영
      for (const p of players) {
        await ClubRepository.applyMatchStats(conn, userId, {
          userPlayerId: p.userPlayerId,
          played: 1,
          goals: p.goals,
          assists: p.assists,
          cleanSheet: p.cleanSheet,
          conceded: p.conceded,
          saves: p.saves,
          shotsOnTarget: p.shotsOnTarget,
          yellow: p.yellow,
          red: p.red,
          rating: p.rating,
          exp: p.exp,
          gauge: Math.floor(p.exp / 10),
          stamina: p.stamina,
        });
      }

      // 2. [요구사항 14 완벽 해결] 전체 선수 기본 휴식 회복 + 경기에 출전하지 않은 벤치/예비 선수 추가 체력 회복(+40%, 최대 100)!
      await ClubRepository.restAllPlayers(conn, userId, TRAINING.REST_RECOVERY_RATIO);
      if (ids.length > 0) {
        const placeholders = ids.map(() => '?').join(',');
        await conn.query(
          `UPDATE user_players 
           SET stamina = LEAST(100, stamina + 40) 
           WHERE user_id = ? AND id NOT IN (${placeholders}) AND stamina < 100`,
          [userId, ...ids]
        ).catch(() => {});
      }

      const report = {
        outcome,
        score: { home: validated.scoreHome, away: validated.scoreAway },
        homeStats: validated.homeStats,
        awayStats: validated.awayStats,
        opponentName: context.opponentName,
        mode: context.mode,
        rewards,
        players,
        mom,
        totalExp: players.reduce((s, p) => s + p.exp, 0),
        restRecovery: Math.round(TRAINING.REST_RECOVERY_RATIO * 100),
        competition: competition.summary,
      };

      const matchId = await MatchRepository.saveMatchResult(conn, {
        homeClubId: userId,
        awayClubId: 0,
        scoreHome: validated.scoreHome,
        scoreAway: validated.scoreAway,
        homeStats: validated.homeStats,
        awayStats: validated.awayStats,
        timelineEvents: validated.timelineEvents,
        competitionMode: context.mode,
        report,
      });

      await WalletService.earn(conn, wallet, { gold: matchGold + sponsorGold }, `MATCH_${outcome}`);
      await WalletService.earn(conn, wallet, { gold: totalCompGold, cashFree: totalCompCash }, `COMP_${context.mode}`);
      await trackDailyQuest(conn, userId, 'PLAY_MATCH', 1);
      if (outcome === 'WIN') await trackDailyQuest(conn, userId, 'WIN_MATCH', 1);
      await trackDailyQuest(conn, userId, 'SCORE_GOALS', Math.max(0, validated.scoreHome - context.baseline.home));

      await conn.commit();
      return { matchId, ...report, remainingWallet: { cashPaid: wallet.cashPaid, cashFree: wallet.cashFree, gold: wallet.gold } };
    } catch (err) {
      LiveMatchEngine.sessions.set(sessionId, session);
      await conn.rollback().catch((rollbackErr) => console.error('[LiveMatchEngine] rollback 실패:', rollbackErr));
      throw err;
    } finally {
      conn.release();
    }
  }
}

function clampPossession(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 50;
  return Math.max(15, Math.min(85, Math.round(n)));
}