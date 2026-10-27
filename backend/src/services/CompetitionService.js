import pool from '../config/database.js';
import {
  AI_CLUB_NAMES,
  CUP,
  LEAGUE,
  MODES,
  MODE_LABELS,
  RANKED,
  RANK_TIERS,
  TOWER_REPEAT_REWARD,
  TOWER_STAGES,
  WORLD_CUP,
  WORLD_CUP_NATIONS_META,
} from '../constants/competitionRules.js';
import { NotFoundError, ValidationError } from '../constants/errorCodes.js';
import ClubRepository from '../repositories/ClubRepository.js';
import { computeOverall } from '../utils/playerMath.js';
import { createRng } from '../utils/seededRandom.js';
import { buildOpponent, emblemFor } from './OpponentFactory.js';

const GROUP_MATCHDAYS = [
  [
    [0, 1],
    [2, 3],
  ],
  [
    [0, 2],
    [1, 3],
  ],
  [
    [0, 3],
    [1, 2],
  ],
];

const REAL_LEAGUE_CONFIGS = {
  EPL_1: {
    code: 'EPL_1',
    title: '잉글랜드 프리미어리그 (1부 · 20개 구단)',
    teamCount: 20,
    clubs: [
      { name: '맨체스터 블루', strength: 88 },
      { name: '노스 런던 레드', strength: 86 },
      { name: '머지사이드 레드', strength: 86 },
      { name: '노스이스트 런던', strength: 83 },
      { name: '웨스트 런던 블루', strength: 83 },
      { name: '맨체스터 레드', strength: 82 },
      { name: '타인사이드 블랙화이트', strength: 82 },
      { name: '버밍엄 클라렛', strength: 82 },
      { name: '서식스 시걸스', strength: 79 },
      { name: '이스트 런던 해머스', strength: 79 },
      { name: '사우스 런던 이글스', strength: 78 },
      { name: '템스 화이트', strength: 77 },
      { name: '미들랜즈 골드울브스', strength: 77 },
      { name: '웨스트 런던 비즈', strength: 77 },
      { name: '도싯 체리레드', strength: 76 },
      { name: '머지사이드 블루', strength: 76 },
      { name: '노팅엄 포레스트 레드', strength: 76 },
      { name: '레스터 폭스 블루', strength: 74 },
      { name: '서퍽 트랙터 블루', strength: 73 },
      { name: '사우스코스트 세인츠', strength: 74 },
    ],
  },
  EFL_2: {
    code: 'EFL_2',
    title: 'EFL 챔피언십 (2부 · 24개 구단)',
    teamCount: 24,
    clubs: [
      { name: '리즈 화이트', strength: 76 },
      { name: '번리 클라렛', strength: 75 },
      { name: '셰필드 블레이즈', strength: 75 },
      { name: '선덜랜드 블랙캣츠', strength: 74 },
      { name: '미들즈브러 레드', strength: 74 },
      { name: '웨스트 브롬 스로슬스', strength: 73 },
      { name: '노리치 카나리아', strength: 73 },
      { name: '코번트리 스카이블루', strength: 73 },
      { name: '블랙번 로버스', strength: 72 },
      { name: '브리스톨 로빈스', strength: 72 },
      { name: '왓포드 호넷츠', strength: 72 },
      { name: '스완지 스완즈', strength: 71 },
      { name: '밀월 라이온스', strength: 71 },
      { name: '프레스턴 릴리와이츠', strength: 71 },
      { name: '퀸즈 파크 후프스', strength: 70 },
      { name: '스토크 포터스', strength: 70 },
      { name: '헐 타이거즈', strength: 70 },
      { name: '카디프 블루버즈', strength: 70 },
      { name: '더비 램스', strength: 69 },
      { name: '포츠머스 폼페이', strength: 69 },
      { name: '옥스퍼드 옐로우스', strength: 68 },
      { name: '플리머스 필그림스', strength: 68 },
      { name: '루턴 해터스', strength: 72 },
      { name: '셰필드 아울스', strength: 69 },
    ],
  },
  KLEAGUE_1: {
    code: 'KLEAGUE_1',
    title: 'K리그 1 (1부 · 12개 구단)',
    teamCount: 12,
    clubs: [
      { name: '울산 블루타이거즈', strength: 79 },
      { name: '포항 스틸레드', strength: 77 },
      { name: '서울 블랙레드', strength: 77 },
      { name: '강원 오렌지베어스', strength: 76 },
      { name: '수원 캐슬블루레드', strength: 75 },
      { name: '김천 밀리터리레드', strength: 76 },
      { name: '전북 그린워리어스', strength: 77 },
      { name: '광주 그리핀옐로우', strength: 75 },
      { name: '제주 아일랜드오렌지', strength: 74 },
      { name: '대전 퍼플시티즌', strength: 74 },
      { name: '대구 스카이블루', strength: 73 },
      { name: '인천 블루블랙', strength: 73 },
    ],
  },
  KLEAGUE_2: {
    code: 'KLEAGUE_2',
    title: 'K리그 2 (2부 · 14개 구단)',
    teamCount: 14,
    clubs: [
      { name: '안양 바이올렛', strength: 73 },
      { name: '수원 블루윙즈', strength: 74 },
      { name: '서울 이랜드 레오파즈', strength: 72 },
      { name: '전남 드래곤즈옐로우', strength: 72 },
      { name: '부산 아이파크레드', strength: 72 },
      { name: '충남아산 아울스', strength: 71 },
      { name: '김포 골든호크스', strength: 70 },
      { name: '부천 헤르메스레드', strength: 70 },
      { name: '천안 시티블루', strength: 69 },
      { name: '충북청주 라이온스', strength: 69 },
      { name: '성남 블랙까치', strength: 70 },
      { name: '안산 그린울브스', strength: 68 },
      { name: '경남 로즈레드', strength: 69 },
      { name: '화성 오렌지FC', strength: 68 },
    ],
  },
};

function detectLeagueConfigForClub(clubName, division) {
  const name = String(clubName || '');
  const isKoreanClub = [
    '울산', '포항', '서울', '전북', '수원', '강원', '김천', '광주', '제주', '대전', '대구', '인천', '성남', '부산', '전남', '안양',
  ].some((kw) => name.includes(kw));
  if (isKoreanClub) {
    return division === 1 ? REAL_LEAGUE_CONFIGS.KLEAGUE_1 : REAL_LEAGUE_CONFIGS.KLEAGUE_2;
  }
  return division === 1 ? REAL_LEAGUE_CONFIGS.EPL_1 : REAL_LEAGUE_CONFIGS.EFL_2;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function newRow(team) {
  return {
    id: team.id,
    code: team.code || team.id,
    name: team.name,
    emblem: team.emblem,
    confed: team.confed || null,
    p: 0,
    w: 0,
    d: 0,
    l: 0,
    gf: 0,
    ga: 0,
    gd: 0,
    pts: 0,
  };
}

function recordResult(table, aId, bId, ga, gb) {
  const a = table[aId];
  const b = table[bId];
  if (!a || !b) return;
  a.p += 1;
  b.p += 1;
  a.gf += ga;
  a.ga += gb;
  a.gd = a.gf - a.ga;
  b.gf += gb;
  b.ga += ga;
  b.gd = b.gf - b.ga;
  if (ga > gb) {
    a.w += 1;
    b.l += 1;
    a.pts += LEAGUE.POINTS.WIN;
  } else if (ga < gb) {
    b.w += 1;
    a.l += 1;
    b.pts += LEAGUE.POINTS.WIN;
  } else {
    a.d += 1;
    b.d += 1;
    a.pts += LEAGUE.POINTS.DRAW;
    b.pts += LEAGUE.POINTS.DRAW;
  }
}

export function rankRows(rows) {
  return [...rows]
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || String(a.id).localeCompare(String(b.id)))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

function sampleGoals(rng, lambda) {
  let acc = Math.exp(-lambda);
  let k = 0;
  const u = rng.next();
  let p = Math.exp(-lambda);
  while (u > acc && k < 6) {
    k += 1;
    p *= lambda / k;
    acc += p;
  }
  return k;
}

export function simulateScore(strengthA, strengthB, rng) {
  const diff = (strengthA - strengthB) / 14;
  const lambdaA = Math.max(0.3, Math.min(3.2, 1.3 + diff));
  const lambdaB = Math.max(0.3, Math.min(3.2, 1.3 - diff));
  return [sampleGoals(rng, lambdaA), sampleGoals(rng, lambdaB)];
}

function scaleReward(reward, tierLevel = 1) {
  const mult = Math.pow(1.35, Math.max(0, tierLevel - 1));
  return {
    gold: Math.round((reward?.gold || 0) * mult),
    cashFree: Math.round((reward?.cashFree || 0) * mult),
  };
}

function pairUp(ids) {
  const matches = [];
  for (let i = 0; i < ids.length; i += 2) {
    matches.push({ a: ids[i], b: ids[i + 1], ga: null, gb: null, winner: null, penaltyNote: null });
  }
  return matches;
}

function knockoutNext(userId, state, prefix, title) {
  const userIdKey = state.userTeamId || 'USER';
  const round = state.rounds[state.roundIndex];
  const match = round.matches.find((m) => m.a === userIdKey || m.b === userIdKey) || round.matches[0];
  const oppId = match.a === userIdKey ? match.b : match.a;
  const opp = state.teams[oppId];
  const tierNote = (state.tierLevel || 1) > 1 ? ` [난이도 Lv.${state.tierLevel}]` : '';
  return {
    ref: `${prefix}:${state.roundIndex}`,
    label: `${title}${tierNote} ${round.name}`,
    opponentSpec: {
      seed: `${prefix}:${userId}:${state.roundIndex}`,
      name: opp.name,
      strength: opp.strength,
      isNationalTeam: prefix === 'WK',
    },
  };
}

function knockoutSummary(userMatch, roundName) {
  return {
    roundName,
    userScore: { a: userMatch.ga, b: userMatch.gb },
    penaltyNote: userMatch.penaltyNote,
  };
}

function playKnockoutRound(state, userGoals, oppGoals, userStrength, rng) {
  const userIdKey = state.userTeamId || 'USER';
  const round = state.rounds[state.roundIndex];
  const winners = [];
  let userMatch = null;
  let userWon = false;

  for (const m of round.matches) {
    if (m.a === userIdKey || m.b === userIdKey) {
      const userIsA = m.a === userIdKey;
      m.ga = userIsA ? userGoals : oppGoals;
      m.gb = userIsA ? oppGoals : userGoals;
      const oppId = userIsA ? m.b : m.a;
      if (m.ga > m.gb) {
        m.winner = m.a;
      } else if (m.gb > m.ga) {
        m.winner = m.b;
      } else {
        const oppStrength = state.teams[oppId].strength;
        const winChance = clamp(0.5 + (userStrength - oppStrength) * 0.02, 0.25, 0.75);
        userWon = rng.next() < winChance;
        m.winner = userWon ? userIdKey : oppId;
        m.penaltyNote = `승부차기 ${userWon ? '승' : '패'}`;
      }
      userWon = m.winner === userIdKey;
      userMatch = m;
    } else {
      const [ga, gb] = simulateScore(state.teams[m.a].strength, state.teams[m.b].strength, rng);
      m.ga = ga;
      m.gb = gb;
      if (ga !== gb) {
        m.winner = ga > gb ? m.a : m.b;
      } else {
        m.winner = rng.next() < 0.5 ? m.a : m.b;
        m.penaltyNote = '승부차기';
      }
    }
    winners.push(m.winner);
  }

  const isFinal = state.roundIndex >= state.roundNames.length - 1;
  if (!userWon) {
    state.eliminatedAt = round.name;
    state.champion = winners[0];
    return { roundName: round.name, userMatch, userWon: false, champion: false, eliminated: true };
  }
  if (isFinal) {
    state.champion = userIdKey;
    return { roundName: round.name, userMatch, userWon: true, champion: true, eliminated: false };
  }
  state.roundIndex += 1;
  state.rounds.push({ name: state.roundNames[state.roundIndex], matches: pairUp(winners) });
  return { roundName: round.name, userMatch, userWon: true, champion: false, eliminated: false };
}

function checkEarlyTitleClinch(standings, currentRound, totalRounds) {
  if (!Array.isArray(standings) || standings.length < 2) return { clinched: false, winnerId: null };
  const remainingMatches = Math.max(0, totalRounds - currentRound);
  const maxPossibleGain = remainingMatches * 3;
  const first = standings[0];
  const second = standings[1];
  if (first.pts - second.pts > maxPossibleGain) {
    return { clinched: true, winnerId: first.id, winnerName: first.name, remainingMatches };
  }
  return { clinched: false, winnerId: null };
}

/* ------------------------------------------------------------------ */
/* 1. 리그 핸들러                                                       */
/* ------------------------------------------------------------------ */

const leagueHandler = {
  create({ userId, club, prev }) {
    const season = prev ? prev.season + 1 : 1;
    const division = prev?.nextDivision ?? LEAGUE.START_DIVISION;
    const prevTitles = prev?.titlesWon || 0;
    const tierLevel = prev?.finalRank === 1 ? (prev.tierLevel || 1) + 1 : prev?.tierLevel || 1;
    const difficultyBoost = (tierLevel - 1) * 3;
    const rng = createRng(`league:${userId}:${season}:${division}`);

    const leagueCfg = detectLeagueConfigForClub(club.name, division);
    const totalTeams = leagueCfg.teamCount;

    const relegatedSet = new Set(prev?.relegatedClubNames || []);
    const promotedList = Array.isArray(prev?.promotedClubNames) ? prev.promotedClubNames : [];

    let poolClubs = leagueCfg.clubs.filter(
      (c) =>
        !String(club.name).includes(c.name) &&
        !c.name.includes(String(club.name)) &&
        !relegatedSet.has(c.name)
    );

    const promotedObjects = promotedList
      .filter((pName) => !poolClubs.some((c) => c.name === pName))
      .map((pName) => ({
        name: pName,
        emblem: emblemFor(pName),
        strength: division === 1 ? 78 : 74,
      }));

    poolClubs = [...promotedObjects, ...rng.shuffle(poolClubs)];
    const pickedAiClubs = poolClubs.slice(0, totalTeams - 1);

    while (pickedAiClubs.length < totalTeams - 1) {
      const fallbackName = AI_CLUB_NAMES.LEAGUE[pickedAiClubs.length % AI_CLUB_NAMES.LEAGUE.length];
      pickedAiClubs.push({
        name: `${fallbackName} FC`,
        emblem: emblemFor(fallbackName),
        strength: (LEAGUE.STRENGTH_BASE[division] || 78) + rng.int(-3, 3),
      });
    }

    const teams = {
      USER: { id: 'USER', name: club.name, emblem: club.emblemIcon, strength: null },
    };
    pickedAiClubs.forEach((c, i) => {
      const id = `T${i + 1}`;
      teams[id] = {
        id,
        name: c.name,
        emblem: c.emblem || emblemFor(c.name),
        strength: clamp(c.strength + difficultyBoost + rng.int(-1, 2), 55, 97),
      };
    });

    const ids = Object.keys(teams);
    const firstLeg = [];
    let arr = [...ids];
    for (let r = 0; r < ids.length - 1; r++) {
      const round = [];
      for (let i = 0; i < ids.length / 2; i++) {
        const a = arr[i];
        const b = arr[ids.length - 1 - i];
        round.push((i + r) % 2 === 0 ? [a, b] : [b, a]);
      }
      firstLeg.push(round);
      arr = [arr[0], arr[arr.length - 1], ...arr.slice(1, arr.length - 1)];
    }
    const secondLeg = firstLeg.map((round) => round.map(([h, a]) => [a, h]));
    const allFixtures = [...firstLeg, ...secondLeg];

    return {
      season,
      division,
      tierLevel,
      titlesWon: prevTitles,
      leagueCode: leagueCfg.code,
      leagueTitle: leagueCfg.title,
      teamCount: totalTeams,
      round: 1,
      totalRounds: allFixtures.length,
      teams,
      fixtures: allFixtures,
      table: Object.fromEntries(ids.map((id) => [id, newRow(teams[id])])),
      lastRound: null,
      nextDivision: division,
      relegatedClubNames: [],
      promotedClubNames: [],
      earlyTitleClinched: false,
    };
  },

  next(userId, state) {
    const safeRoundIdx = Math.max(0, Math.min(state.fixtures.length - 1, state.round - 1));
    const fixture = state.fixtures[safeRoundIdx].find(([h, a]) => h === 'USER' || a === 'USER');
    const oppId = fixture[0] === 'USER' ? fixture[1] : fixture[0];
    const opp = state.teams[oppId];
    const tierNote = (state.tierLevel || 1) > 1 ? ` [난이도 Lv.${state.tierLevel}]` : '';
    return {
      ref: `L:${state.season}:${state.round}`,
      label: `${state.leagueTitle || `${state.division}부 리그`}${tierNote} ${state.round}/${state.totalRounds}라운드`,
      opponentSpec: { seed: `league:${userId}:${state.season}:${state.round}`, name: opp.name, strength: opp.strength },
    };
  },

  apply({ userId, state, userGoals, oppGoals }) {
    const round = state.round;
    const rng = createRng(`lg-sim:${userId}:${state.season}:${round}`);
    const results = [];
    const before = rankRows(Object.values(state.table)).find((r) => r.id === 'USER');
    for (const [h, a] of state.fixtures[round - 1]) {
      let hg;
      let ag;
      if (h === 'USER') [hg, ag] = [userGoals, oppGoals];
      else if (a === 'USER') [hg, ag] = [oppGoals, userGoals];
      else [hg, ag] = simulateScore(state.teams[h].strength, state.teams[a].strength, rng);
      recordResult(state.table, h, a, hg, ag);
      results.push({ h, a, hg, ag });
    }
    state.lastRound = { round, results };
    state.round += 1;

    const standings = rankRows(Object.values(state.table));
    const me = standings.find((r) => r.id === 'USER');

    const clinchInfo = checkEarlyTitleClinch(standings, round, state.totalRounds);
    const newlyClinchedByUser = clinchInfo.clinched && clinchInfo.winnerId === 'USER' && !state.earlyTitleClinched;
    if (clinchInfo.clinched && clinchInfo.winnerId === 'USER') {
      state.earlyTitleClinched = true;
      state.earlyClinchRound = state.earlyClinchRound || round;
    }

    const summary = {
      type: 'LEAGUE',
      leagueTitle: state.leagueTitle,
      tierLevel: state.tierLevel || 1,
      round,
      totalRounds: state.totalRounds,
      rankBefore: before.rank,
      rank: me.rank,
      points: me.pts,
      standings,
      results,
      earlyTitleClinched: Boolean(state.earlyTitleClinched),
      newlyClinchedByUser,
      champion: newlyClinchedByUser,
    };

    let reward = { gold: 0, cashFree: 0 };
    const finished = state.round > state.totalRounds;
    if (finished) {
      const rank = me.rank;
      const baseReward =
        rank === 1
          ? { gold: 25000, cashFree: 350 }
          : rank === 2
          ? { gold: 14000, cashFree: 200 }
          : rank <= 4
          ? { gold: 9000, cashFree: 120 }
          : rank <= 6
          ? { gold: 5000, cashFree: 70 }
          : { gold: 2500, cashFree: 30 };
      reward = scaleReward(baseReward, state.tierLevel || 1);
      state.finalRank = rank;
      if (rank === 1) state.titlesWon = (state.titlesWon || 0) + 1;

      const totalTeams = Object.keys(state.teams).length;
      const isSmallLeague = state.leagueCode === 'BUNDES_1' || totalTeams <= 18;
      const relegateCount = isSmallLeague ? 2 : 3;
      const relegateThreshold = totalTeams - relegateCount + 1;

      const relegatedRows = standings.slice(-relegateCount).filter((r) => r.id !== 'USER');
      state.relegatedClubNames = relegatedRows.map((r) => r.name);

      const secondDivPool =
        state.leagueCode === 'KLEAGUE_1' ? REAL_LEAGUE_CONFIGS.KLEAGUE_2.clubs : REAL_LEAGUE_CONFIGS.EFL_2.clubs;
      state.promotedClubNames = rng
        .shuffle(secondDivPool)
        .slice(0, relegateCount)
        .map((c) => c.name);

      state.nextDivision =
        state.division > 1 && rank <= 3
          ? Math.max(1, state.division - 1)
          : state.division === 1 && rank >= relegateThreshold
          ? 2
          : state.division;

      summary.champion = rank === 1;
      summary.seasonEnd = {
        rank,
        champion: rank === 1,
        promoted: state.nextDivision < state.division,
        relegated: state.nextDivision > state.division,
        nextDivision: state.nextDivision,
        relegatedTeams: state.relegatedClubNames,
        promotedTeams: state.promotedClubNames,
      };
    }
    return { state, summary, reward, finished };
  },

  overview(state, status) {
    const title = state.leagueTitle || `${state.division}부 리그`;
    const tierBadge = (state.tierLevel || 1) > 1 ? ` [Lv.${state.tierLevel}]` : '';
    if (status === 'FINISHED') return `시즌 ${state.season}${tierBadge} 종료 · ${title} ${state.finalRank}위`;
    const me = rankRows(Object.values(state.table || {})).find((r) => r.id === 'USER');
    const currentRound = Math.min(state.round || 1, state.totalRounds || 38);
    const clinchTag = state.earlyTitleClinched ? ' · 🏆 조기 우승 확정' : '';
    return `${title}${tierBadge} · 시즌 ${state.season} · ${currentRound}/${state.totalRounds}R · ${me ? me.rank : 1}위${clinchTag}`;
  },
};

/* ------------------------------------------------------------------ */
/* 2. 챔피언스 컵 핸들러                                                */
/* ------------------------------------------------------------------ */

const cupHandler = {
  create({ userId, club, prev }) {
    const tierLevel = prev?.champion === 'USER' ? (prev.tierLevel || 1) + 1 : prev?.tierLevel || 1;
    const titlesWon = (prev?.titlesWon || 0) + (prev?.champion === 'USER' ? 1 : 0);
    const difficultyBoost = (tierLevel - 1) * 3;
    const rng = createRng(`cup:${userId}:${Date.now()}`);
    const names = rng.shuffle(AI_CLUB_NAMES.CHAMPIONS_CUP).slice(0, 15);
    const teams = {
      USER: { id: 'USER', name: club.name, emblem: club.emblemIcon, strength: null },
    };
    names.forEach((name, i) => {
      const id = `T${i + 1}`;
      teams[id] = {
        id,
        name,
        emblem: emblemFor(name),
        strength: clamp(rng.int(CUP.STRENGTH_RANGE[0], CUP.STRENGTH_RANGE[1]) + difficultyBoost, 72, 97),
      };
    });
    const order = ['USER', ...rng.shuffle(Object.keys(teams).filter((id) => id !== 'USER'))];
    return {
      tierLevel,
      titlesWon,
      userTeamId: 'USER',
      teams,
      roundNames: CUP.ROUND_NAMES,
      rounds: [{ name: CUP.ROUND_NAMES[0], matches: pairUp(order) }],
      roundIndex: 0,
      eliminatedAt: null,
      champion: null,
    };
  },

  next(userId, state) {
    return knockoutNext(userId, state, 'C', '챔피언스 컵');
  },

  apply({ userId, state, userGoals, oppGoals, userStrength }) {
    const rng = createRng(`cup-sim:${userId}:${state.roundIndex}:${userGoals}-${oppGoals}`);
    const before = state.roundIndex;
    const r = playKnockoutRound(state, userGoals, oppGoals, userStrength, rng);
    const summary = {
      type: 'CUP',
      tierLevel: state.tierLevel || 1,
      ...knockoutSummary(r.userMatch, r.roundName),
      advanced: r.userWon,
      champion: r.champion,
      eliminated: r.eliminated,
      rounds: state.rounds,
    };
    const baseReward = r.userWon ? CUP.ROUND_WIN_REWARD[before] : CUP.ELIMINATED_REWARD;
    return { state, summary, reward: scaleReward(baseReward, state.tierLevel || 1), finished: r.champion || r.eliminated };
  },

  overview(state, status) {
    const tierBadge = (state.tierLevel || 1) > 1 ? ` [Lv.${state.tierLevel}]` : '';
    if (status === 'FINISHED') {
      return state.champion === 'USER' ? `🏆 챔피언스 컵 우승${tierBadge}` : `${state.eliminatedAt}에서 탈락${tierBadge}`;
    }
    return `${state.rounds[state.roundIndex].name} 진행 중${tierBadge}`;
  },
};

/* ------------------------------------------------------------------ */
/* 3. 2026 월드컵 48개국 핸들러 (백트래킹 대륙 배정 + 조편성 후 국가 선택) */
/* ------------------------------------------------------------------ */

function drawWorldCupGroupsStrict(teamsMap, rng) {
  const groupKeys = WORLD_CUP.GROUPS;
  const groups = Object.fromEntries(groupKeys.map((g) => [g, []]));

  const allTeams = Object.values(teamsMap);
  const pot1 = allTeams.filter((t) => t.pot === 1);
  const pot2 = rng.shuffle(allTeams.filter((t) => t.pot === 2));
  const pot3 = rng.shuffle(allTeams.filter((t) => t.pot === 3));
  const pot4 = rng.shuffle(allTeams.filter((t) => t.pot === 4));

  const hostPlaced = new Set();
  for (const t of pot1) {
    if (t.hostGroup && groups[t.hostGroup].length === 0) {
      groups[t.hostGroup].push(t.id);
      hostPlaced.add(t.id);
    }
  }
  const remPot1 = rng.shuffle(pot1.filter((t) => !hostPlaced.has(t.id)));
  let p1Idx = 0;
  for (const g of groupKeys) {
    if (groups[g].length === 0 && remPot1[p1Idx]) {
      groups[g].push(remPot1[p1Idx].id);
      p1Idx++;
    }
  }

  const canPlace = (groupArr, candidateTeam) => {
    const confed = candidateTeam.confed;
    let sameConfedCount = 0;
    for (const tid of groupArr) {
      if (teamsMap[tid]?.confed === confed) sameConfedCount++;
    }
    if (confed === 'UEFA') return sameConfedCount < 2;
    return sameConfedCount < 1;
  };

  const assignPotWithBacktracking = (potTeams) => {
    const usedTeamIndices = new Array(potTeams.length).fill(false);

    const backtrack = (groupIdx) => {
      if (groupIdx >= groupKeys.length) return true;
      const gKey = groupKeys[groupIdx];

      for (let ti = 0; ti < potTeams.length; ti++) {
        if (usedTeamIndices[ti]) continue;
        const candidate = potTeams[ti];
        if (!canPlace(groups[gKey], candidate)) continue;

        usedTeamIndices[ti] = true;
        groups[gKey].push(candidate.id);

        if (backtrack(groupIdx + 1)) return true;

        groups[gKey].pop();
        usedTeamIndices[ti] = false;
      }
      return false;
    };

    backtrack(0);
  };

  assignPotWithBacktracking(pot2);
  assignPotWithBacktracking(pot3);
  assignPotWithBacktracking(pot4);

  return groups;
}

function buildWorldCupRoundOf32Matches(groupStandings) {
  const winners = [];
  const runnersUp = [];
  const thirdPlaces = [];

  for (const g of WORLD_CUP.GROUPS) {
    const rows = groupStandings[g] || [];
    if (rows[0]) winners.push({ id: rows[0].id, group: g });
    if (rows[1]) runnersUp.push({ id: rows[1].id, group: g });
    if (rows[2]) thirdPlaces.push({ ...rows[2], group: g });
  }

  const bestEightThirds = rankRows(thirdPlaces)
    .slice(0, 8)
    .map((r) => ({ id: r.id, group: r.group }));

  const poolA = [...winners, ...runnersUp.slice(0, 4)];
  const poolB = [...runnersUp.slice(4), ...bestEightThirds];

  const usedB = new Array(poolB.length).fill(false);
  const pairedB = new Array(poolA.length).fill(null);

  const solvePairing = (idxA) => {
    if (idxA >= poolA.length) return true;
    const teamA = poolA[idxA];
    for (let bi = 0; bi < poolB.length; bi++) {
      if (usedB[bi]) continue;
      if (poolB[bi].group === teamA.group) continue;
      usedB[bi] = true;
      pairedB[idxA] = poolB[bi];
      if (solvePairing(idxA + 1)) return true;
      pairedB[idxA] = null;
      usedB[bi] = false;
    }
    return false;
  };

  if (!solvePairing(0)) {
    for (let i = 0; i < poolA.length; i++) pairedB[i] = poolB[i];
  }

  const matches = poolA.map((teamA, i) => ({
    a: teamA.id,
    b: pairedB[i].id,
    ga: null,
    gb: null,
    winner: null,
    penaltyNote: null,
  }));

  return {
    matches,
    qualifiers: [...poolA.map((x) => x.id), ...poolB.map((x) => x.id)],
  };
}

const worldCupHandler = {
  create({ userId, prev, selectedNationCode }) {
    const tierLevel = prev?.champion && prev?.champion === prev?.userTeamId ? (prev.tierLevel || 1) + 1 : prev?.tierLevel || 1;
    const titlesWon = (prev?.titlesWon || 0) + (prev?.champion && prev?.champion === prev?.userTeamId ? 1 : 0);
    const difficultyBoost = (tierLevel - 1) * 3;
    const rng = createRng(`wc48-strict:${userId}:${Date.now()}`);

    const teams = {};
    for (const meta of WORLD_CUP_NATIONS_META) {
      const codeKey = meta.code || meta.name;
      teams[codeKey] = {
        id: codeKey,
        code: codeKey,
        name: meta.name,
        emblem: emblemFor(meta.name),
        confed: meta.confed,
        pot: meta.pot,
        hostGroup: meta.hostGroup || null,
        strength: clamp(meta.strength + difficultyBoost + rng.int(-1, 2), 70, 97),
      };
    }

    const groups = drawWorldCupGroupsStrict(teams, rng);
    const userTeamId = teams[selectedNationCode] ? selectedNationCode : 'KOR';
    const userGroup = WORLD_CUP.GROUPS.find((g) => groups[g]?.includes(userTeamId)) || 'A';

    return {
      tierLevel,
      titlesWon,
      userTeamId,
      userGroup,
      nationLocked: false,
      teams,
      groups,
      table: Object.fromEntries(Object.keys(teams).map((id) => [id, newRow(teams[id])])),
      phase: 'GROUP',
      matchday: 1,
      roundNames: WORLD_CUP.KNOCKOUT_NAMES,
      rounds: [],
      roundIndex: 0,
      eliminatedAt: null,
      champion: null,
    };
  },

  next(userId, state) {
    if (state.phase === 'KNOCKOUT') return knockoutNext(userId, state, 'WK', '2026 월드컵');
    const userIdKey = state.userTeamId && state.teams?.[state.userTeamId] ? state.userTeamId : Object.keys(state.teams)[0];
    const uGroup = state.userGroup || WORLD_CUP.GROUPS.find((g) => state.groups[g]?.includes(userIdKey)) || 'A';
    const groupArr = state.groups[uGroup] || state.groups.A;
    const mdIdx = Math.max(0, Math.min(2, (state.matchday || 1) - 1));
    const mdPairs = GROUP_MATCHDAYS[mdIdx];
    const myPair = mdPairs.find(([i, j]) => groupArr[i] === userIdKey || groupArr[j] === userIdKey) || mdPairs[0];
    const oppId = groupArr[myPair[0]] === userIdKey ? groupArr[myPair[1]] : groupArr[myPair[0]];
    const opp = state.teams[oppId] || Object.values(state.teams).find((t) => t.id !== userIdKey);
    const tierNote = (state.tierLevel || 1) > 1 ? ` [난이도 Lv.${state.tierLevel}]` : '';

    return {
      ref: `WG:${state.matchday}`,
      label: `2026 월드컵 ${uGroup}조${tierNote} 조별리그 ${state.matchday}차전 (${state.teams[userIdKey]?.name || '대표팀'} vs ${opp.name})`,
      opponentSpec: { seed: `wg:${userId}:${state.matchday}:${opp.id}`, name: opp.name, strength: opp.strength, isNationalTeam: true },
    };
  },

  apply({ userId, state, userGoals, oppGoals, userStrength }) {
    const userIdKey = state.userTeamId || 'KOR';
    state.nationLocked = true;

    if (state.phase === 'KNOCKOUT') {
      const rng = createRng(`wk-sim:${userId}:${state.roundIndex}:${userGoals}-${oppGoals}`);
      const before = state.roundIndex;
      const r = playKnockoutRound(state, userGoals, oppGoals, userStrength, rng);
      const summary = {
        type: 'WORLD_CUP',
        phase: 'KNOCKOUT',
        tierLevel: state.tierLevel || 1,
        ...knockoutSummary(r.userMatch, r.roundName),
        advanced: r.userWon,
        champion: r.champion,
        eliminated: r.eliminated,
        rounds: state.rounds,
      };
      const baseKoReward = r.champion
        ? { gold: 50000, cashFree: 500 }
        : r.userWon
        ? WORLD_CUP.KNOCKOUT_REWARD[before] || { gold: 7000, cashFree: 60 }
        : WORLD_CUP.ELIMINATED_REWARD;
      return {
        state,
        summary,
        reward: scaleReward(baseKoReward, state.tierLevel || 1),
        finished: r.champion || r.eliminated,
      };
    }

    const md = state.matchday;
    const rng = createRng(`wg-sim:${userId}:${md}`);
    const results = [];
    for (const g of WORLD_CUP.GROUPS) {
      if (!Array.isArray(state.groups[g])) continue;
      for (const [i, j] of GROUP_MATCHDAYS[md - 1]) {
        const a = state.groups[g][i];
        const b = state.groups[g][j];
        if (!a || !b) continue;
        let ga;
        let gb;
        if (a === userIdKey) [ga, gb] = [userGoals, oppGoals];
        else if (b === userIdKey) [ga, gb] = [oppGoals, userGoals];
        else [ga, gb] = simulateScore(state.teams[a].strength, state.teams[b].strength, rng);
        recordResult(state.table, a, b, ga, gb);
        results.push({ group: g, a, b, ga, gb });
      }
    }
    state.matchday += 1;

    const groupStandings = Object.fromEntries(
      WORLD_CUP.GROUPS.filter((g) => Array.isArray(state.groups[g])).map((g) => [
        g,
        rankRows(state.groups[g].map((id) => state.table[id]).filter(Boolean)),
      ])
    );
    const uGroup = state.userGroup || WORLD_CUP.GROUPS.find((g) => state.groups[g]?.includes(userIdKey)) || 'A';
    const userGroupRank = groupStandings[uGroup]?.find((r) => r.id === userIdKey)?.rank || 1;

    const summary = {
      type: 'WORLD_CUP',
      phase: 'GROUP',
      tierLevel: state.tierLevel || 1,
      matchday: md,
      userGroup: uGroup,
      userTeamId: userIdKey,
      results,
      groupStandings,
      userGroupRank,
    };
    if (md < 3) return { state, summary, reward: { gold: 0, cashFree: 0 }, finished: false };

    const { matches, qualifiers } = buildWorldCupRoundOf32Matches(groupStandings);
    summary.advanced = qualifiers.includes(userIdKey);

    if (!summary.advanced) {
      state.eliminatedAt = `48개국 조별리그 (${uGroup}조 ${userGroupRank}위)`;
      state.champion = qualifiers[0];
      return { state, summary, reward: scaleReward(WORLD_CUP.ELIMINATED_REWARD, state.tierLevel || 1), finished: true };
    }

    state.phase = 'KNOCKOUT';
    state.rounds = [{ name: WORLD_CUP.KNOCKOUT_NAMES[0], matches }];
    state.roundIndex = 0;
    return { state, summary, reward: scaleReward(WORLD_CUP.GROUP_ADVANCE_REWARD, state.tierLevel || 1), finished: false };
  },

  overview(state, status) {
    const userIdKey = state.userTeamId || 'KOR';
    const uName = state.teams?.[userIdKey]?.name || '대한민국';
    const uGroup = state.userGroup || 'A';
    const tierBadge = (state.tierLevel || 1) > 1 ? ` [난이도 Lv.${state.tierLevel}]` : '';
    if (status === 'FINISHED') {
      return state.champion === userIdKey
        ? `🏆 2026 월드컵 우승 (${uName})${tierBadge}`
        : `${state.eliminatedAt}에서 탈락 (${uName})${tierBadge}`;
    }
    return state.phase === 'GROUP'
      ? `48개국 ${uGroup}조 (${uName}) · ${state.matchday}/3차전${tierBadge}`
      : `${state.rounds[state.roundIndex].name} 진행 중 (${uName})${tierBadge}`;
  },
};

/* ------------------------------------------------------------------ */
/* 4. 챌린지 타워 & 랭크 매치 핸들러                                    */
/* ------------------------------------------------------------------ */

const towerHandler = {
  create() {
    return { cleared: [], attempts: 0 };
  },

  next(userId, state, stageId) {
    const targetId = stageId || Math.min(TOWER_STAGES.length, state.cleared.length + 1);
    const stage = TOWER_STAGES.find((s) => s.id === Number(targetId));
    if (!stage) throw new ValidationError('존재하지 않는 스테이지입니다.');
    if (stage.id > state.cleared.length + 1) throw new ValidationError('이전 스테이지를 먼저 클리어해야 합니다.');
    return {
      ref: `T:${stage.id}`,
      stageId: stage.id,
      label: `챌린지 타워 Stage ${stage.id} · ${stage.title}`,
      opponentSpec: {
        seed: `tower:${userId}:${stage.id}`,
        name: stage.opponent.name,
        strength: stage.opponent.strength,
        tactics: stage.opponent.tactics,
      },
      scenario: {
        stageId: stage.id,
        title: stage.title,
        description: stage.description,
        startMinute: stage.startMinute,
        scoreHome: stage.scoreHome,
        scoreAway: stage.scoreAway,
        homeRedCard: stage.homeRedCard,
        objective: stage.objective,
      },
    };
  },

  apply({ state, userGoals, oppGoals, context }) {
    const stage = TOWER_STAGES.find((s) => s.id === Number(context.stageId));
    state.attempts += 1;
    let cleared = false;
    const obj = stage.objective;
    if (obj.type === 'WIN') cleared = userGoals > oppGoals;
    else if (obj.type === 'NOT_LOSE') cleared = userGoals >= oppGoals;
    else if (obj.type === 'WIN_MARGIN') cleared = userGoals - oppGoals >= obj.margin;
    else if (obj.type === 'CLEAN_SHEET') cleared = oppGoals === stage.scoreAway && userGoals >= oppGoals;

    const firstClear = cleared && !state.cleared.includes(stage.id);
    if (firstClear) state.cleared.push(stage.id);
    const reward = !cleared ? { gold: 0, cashFree: 0 } : firstClear ? stage.reward : TOWER_REPEAT_REWARD;
    const summary = {
      type: 'TOWER',
      stageId: stage.id,
      totalStages: TOWER_STAGES.length,
      title: stage.title,
      objective: stage.objective.text,
      cleared,
      firstClear,
    };
    return { state, summary, reward, finished: false };
  },

  overview(state) {
    return `${state.cleared.length}/${TOWER_STAGES.length} 스테이지 클리어`;
  },
};

function tierForRp(rp) {
  return RANK_TIERS.reduce((acc, t) => (rp >= t.minRp ? t : acc), RANK_TIERS[0]);
}

const rankedHandler = {
  create() {
    return { rp: RANKED.START_RP, wins: 0, draws: 0, losses: 0, streak: 0, history: [] };
  },

  next(userId, state) {
    const rng = createRng(`rk:${userId}:${state.wins + state.draws + state.losses}`);
    const tier = tierForRp(state.rp);
    const oppName = rng.pick(AI_CLUB_NAMES.RANKED);
    const oppStrength = tier.strength + rng.int(-2, 3);
    return {
      ref: `R:${state.wins + state.draws + state.losses + 1}`,
      label: `랭크 매치 · ${tier.label} (${state.rp} RP)`,
      opponentSpec: { seed: `ranked:${userId}:${Date.now()}`, name: oppName, strength: oppStrength },
    };
  },

  apply({ state, userGoals, oppGoals, context }) {
    const before = state.rp;
    const tierBefore = tierForRp(before);
    let delta = 0;
    let reward = { gold: 0, cashFree: 0 };
    if (userGoals > oppGoals) {
      state.wins += 1;
      state.streak += 1;
      delta = RANKED.WIN_RP + (state.streak >= 3 ? RANKED.HIGHER_TIER_BONUS : 0);
      reward = RANKED.WIN_REWARD;
    } else if (userGoals === oppGoals) {
      state.draws += 1;
      state.streak = 0;
      delta = RANKED.DRAW_RP;
    } else {
      state.losses += 1;
      state.streak = 0;
      delta = RANKED.LOSE_RP;
    }
    state.rp = Math.max(0, state.rp + delta);
    const tierAfter = tierForRp(state.rp);
    state.history = [
      { opponent: context.opponentName, score: `${userGoals}:${oppGoals}`, delta, rp: state.rp },
      ...state.history.slice(0, 9),
    ];
    const summary = {
      type: 'RANKED',
      rpBefore: before,
      rp: state.rp,
      delta,
      tierBefore: tierBefore.label,
      tier: tierAfter.label,
      promoted: tierAfter.minRp > tierBefore.minRp,
      streak: state.streak,
    };
    return { state, summary, reward, finished: false };
  },

  overview(state) {
    const tier = tierForRp(state.rp);
    return `${tier.label} · ${state.rp} RP (${state.wins}승 ${state.draws}무 ${state.losses}패)`;
  },
};

const HANDLERS = {
  LEAGUE: leagueHandler,
  CHAMPIONS_CUP: cupHandler,
  WORLD_CUP: worldCupHandler,
  CHALLENGE_TOWER: towerHandler,
  RANKED: rankedHandler,
};

function handlerFor(mode) {
  if (!MODES.includes(mode)) throw new ValidationError('지원하지 않는 대회 모드입니다.');
  return HANDLERS[mode];
}

export default class CompetitionService {
  static async getOverview(userId) {
    return await CompetitionService.listAll(userId);
  }

  static async listAll(userId) {
    const rows = await ClubRepository.getAllCompetitions(null, userId);
    const byMode = new Map(rows.map((r) => [r.mode, r]));
    return MODES.map((mode) => {
      const row = byMode.get(mode);
      if (!row) return { mode, label: MODE_LABELS[mode], status: 'NONE', summary: '아직 시작하지 않았습니다.' };
      return {
        mode,
        label: MODE_LABELS[mode],
        status: row.status,
        summary: handlerFor(mode).overview(row.state, row.status),
      };
    });
  }

  static async getState(userId, mode) {
    const handler = handlerFor(mode);
    const row = await ClubRepository.getCompetition(null, userId, mode);
    if (!row || !row.state) {
      return { mode, label: MODE_LABELS[mode], status: 'NONE', summary: '아직 시작하지 않았습니다.', state: null };
    }
    const view = {
      mode,
      label: MODE_LABELS[mode],
      status: row.status,
      summary: handler.overview(row.state, row.status),
      state: row.state,
    };
    if (mode === 'LEAGUE' && row.state.table) {
      view.standings = rankRows(Object.values(row.state.table));
    }
    if (mode === 'WORLD_CUP') {
      const rawGroups = row.state.groups || {};
      const validGroupKeys = Object.keys(rawGroups).filter((g) => Array.isArray(rawGroups[g]));
      view.groupStandings = Object.fromEntries(
        validGroupKeys.map((g) => [
          g,
          rankRows(
            rawGroups[g]
              .map((id) => row.state.table?.[id])
              .filter(Boolean)
          ),
        ])
      );
    }
    if (mode === 'RANKED') view.tiers = RANK_TIERS;
    if (mode === 'CHALLENGE_TOWER') view.stages = TOWER_STAGES;
    return view;
  }

  /**
   * 대회 시작 및 월드컵 참가 국가 변경 처리
   * - restart 인자가 boolean이든 { restart, nationCode } 객체든 모두 호환 처리함
   */
  static async start(userId, mode, optionsOrRestart = false) {
    let restart = false;
    let nationCode = null;

    if (typeof optionsOrRestart === 'boolean') {
      restart = optionsOrRestart;
    } else if (typeof optionsOrRestart === 'string') {
      if (optionsOrRestart.startsWith('NATION:')) {
        nationCode = optionsOrRestart.split(':')[1] || 'KOR';
        restart = false;
      } else if (optionsOrRestart.startsWith('RESTART:')) {
        nationCode = optionsOrRestart.split(':')[1] || 'KOR';
        restart = true;
      } else {
        restart = Boolean(optionsOrRestart);
      }
    } else if (optionsOrRestart && typeof optionsOrRestart === 'object') {
      if (typeof optionsOrRestart.restart === 'string' && optionsOrRestart.restart.startsWith('NATION:')) {
        nationCode = optionsOrRestart.restart.split(':')[1] || 'KOR';
        restart = false;
      } else if (typeof optionsOrRestart.restart === 'string' && optionsOrRestart.restart.startsWith('RESTART:')) {
        nationCode = optionsOrRestart.restart.split(':')[1] || 'KOR';
        restart = true;
      } else {
        restart = Boolean(optionsOrRestart.restart);
        nationCode = optionsOrRestart.nationCode || null;
      }
    }

    const handler = handlerFor(mode);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const club = await ClubRepository.findClub(conn, userId);
      if (!club) throw new NotFoundError('구단 정보를 찾을 수 없습니다.');
      const existing = await ClubRepository.getCompetition(conn, userId, mode, true);

      // 월드컵 모드에서 1차전 시작 전에 편성된 조를 유지한 채 국가만 변경하는 경우
      if (
        mode === 'WORLD_CUP' &&
        existing &&
        existing.status === 'ACTIVE' &&
        !restart &&
        nationCode &&
        existing.state?.teams?.[nationCode] &&
        existing.state?.matchday === 1 &&
        existing.state?.phase === 'GROUP'
      ) {
        const nextState = { ...existing.state };
        nextState.userTeamId = nationCode;
        nextState.userGroup =
          WORLD_CUP.GROUPS.find((g) => nextState.groups?.[g]?.includes(nationCode)) || 'A';
        await ClubRepository.saveCompetition(conn, userId, mode, 'ACTIVE', nextState);
        await conn.commit();
        return await CompetitionService.getState(userId, mode);
      }

      const isLegacyWorldCup = mode === 'WORLD_CUP' && existing && !existing.state?.userTeamId;

      if (existing && existing.status === 'ACTIVE' && !restart && !isLegacyWorldCup && mode !== 'CHALLENGE_TOWER' && mode !== 'RANKED') {
        await conn.commit();
        return await CompetitionService.getState(userId, mode);
      }

      const prev = existing?.state || null;
      const state = handler.create({ userId, club, prev, selectedNationCode: nationCode || 'KOR' });
      await ClubRepository.saveCompetition(conn, userId, mode, 'ACTIVE', state);
      await conn.commit();
      return await CompetitionService.getState(userId, mode);
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    } finally {
      conn.release();
    }
  }

  static async nextMatch(userId, mode, stageId = null, nationCode = null) {
    const handler = handlerFor(mode);
    let row = await ClubRepository.getCompetition(null, userId, mode);
    if (!row || row.status !== 'ACTIVE' || (mode === 'WORLD_CUP' && !row.state?.userTeamId)) {
      await CompetitionService.start(userId, mode, { restart: true, nationCode });
      row = await ClubRepository.getCompetition(null, userId, mode);
    }

    const spec = handler.next(userId, row.state, stageId);
    const opponent = buildOpponent(spec.opponentSpec);
    const scenario = spec.scenario || null;
    return {
      mode,
      stageId: spec.stageId ?? null,
      ref: spec.ref,
      label: spec.label,
      opponent,
      scenario,
      userTeamId: row.state.userTeamId || 'USER',
      userGroup: row.state.userGroup || null,
      next: {
        ref: spec.ref,
        stageId: spec.stageId ?? null,
        label: spec.label,
        opponent,
        scenario,
      },
      baseline: scenario ? { home: scenario.scoreHome, away: scenario.scoreAway } : { home: 0, away: 0 },
    };
  }

  static async getNextMatch(userId, mode, stageId = null, nationCode = null) {
    return await CompetitionService.nextMatch(userId, mode, stageId, nationCode);
  }

  static async applyResult(conn, userId, context, scoreHome, scoreAway) {
    const { mode } = context;
    const handler = handlerFor(mode);
    const row = await ClubRepository.getCompetition(conn, userId, mode, true);
    if (!row) throw new NotFoundError('진행 중인 대회를 찾을 수 없습니다.');

    const allPlayers = await ClubRepository.getFullPlayers(conn, userId);
    const starters = allPlayers.filter((p) => p.isStarter);
    const userStrength =
      starters.length > 0
        ? Math.round(starters.reduce((s, p) => s + computeOverall(p.baseStats, p.level, p.mainPosition), 0) / starters.length)
        : 78;

    const result = handler.apply({
      userId,
      state: row.state,
      userGoals: scoreHome,
      oppGoals: scoreAway,
      userStrength,
      context,
    });
    const nextStatus = result.finished ? 'FINISHED' : 'ACTIVE';
    await ClubRepository.saveCompetition(conn, userId, mode, nextStatus, result.state);
    return result;
  }
}