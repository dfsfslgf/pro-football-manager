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
} from '../constants/competitionRules.js';
import { ConflictError, NotFoundError, ValidationError } from '../constants/errorCodes.js';
import ClubRepository from '../repositories/ClubRepository.js';
import { createRng } from '../utils/seededRandom.js';
import { computeOverall } from '../utils/playerMath.js';
import { buildOpponent, emblemFor } from './OpponentFactory.js';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export const REAL_LEAGUE_CONFIGS = {
  EPL_1: {
    code: 'EPL_1',
    title: '프리미어리그 (1부 · 20팀)',
    teamCount: 20,
    promoteCount: 0,
    relegateCount: 3,
    clubs: [
      { name: '맨체스터 블루', emblem: '⛵', strength: 91 },
      { name: '노스 런던 레드', emblem: '💣', strength: 90 },
      { name: '머지사이드 레드', emblem: '🦅', strength: 90 },
      { name: '노스이스트 런던', emblem: '🐓', strength: 86 },
      { name: '웨스트 런던 블루', emblem: '🦁', strength: 86 },
      { name: '맨체스터 레드', emblem: '🔱', strength: 85 },
      { name: '타인사이드 블랙화이트', emblem: '🦅', strength: 85 },
      { name: '버밍엄 클라렛', emblem: '🦁', strength: 85 },
      { name: '서식스 시걸스', emblem: '🕊️', strength: 82 },
      { name: '이스트 런던 해머스', emblem: '⚒️', strength: 81 },
      { name: '사우스 런던 이글스', emblem: '🦅', strength: 80 },
      { name: '템스 화이트', emblem: '🛡️', strength: 80 },
      { name: '미들랜즈 골드울브스', emblem: '🐺', strength: 79 },
      { name: '웨스트 런던 비즈', emblem: '🐝', strength: 79 },
      { name: '도싯 체리레드', emblem: '🍒', strength: 79 },
      { name: '머지사이드 블루', emblem: '🗼', strength: 78 },
      { name: '노팅엄 포레스트 레드', emblem: '🌲', strength: 79 },
      { name: '레스터 폭스 블루', emblem: '🦊', strength: 77 },
      { name: '서퍽 트랙터 블루', emblem: '🐎', strength: 75 },
      { name: '사우스코스트 세인츠', emblem: '😇', strength: 76 },
    ],
  },
  EFL_2: {
    code: 'EFL_2',
    title: '챔피언십 (2부 · 24팀)',
    teamCount: 24,
    promoteCount: 3,
    relegateCount: 3,
    clubs: [
      { name: '리즈 요크셔 화이트', emblem: '⚡', strength: 79 },
      { name: '랭커셔 클라렛', emblem: '🛡️', strength: 78 },
      { name: '셰필드 블레이즈', emblem: '⚔️', strength: 78 },
      { name: '베드퍼드셔 해터스', emblem: '🎩', strength: 76 },
      { name: '티사이드 레드', emblem: '🦁', strength: 76 },
      { name: '노퍽 카나리아', emblem: '🐤', strength: 76 },
      { name: '웨스트브롬 스로슬스', emblem: '🐦', strength: 76 },
      { name: '웨어사이드 블랙캣츠', emblem: '🐈', strength: 76 },
      { name: '코번트리 스카이블루', emblem: '🐘', strength: 75 },
      { name: '스토크 포터스 레드', emblem: '🔥', strength: 75 },
      { name: '스완지 스완즈 화이트', emblem: '🦢', strength: 75 },
      { name: '런던 호프스 블루', emblem: '👑', strength: 75 },
      { name: '하트퍼드셔 호넷츠', emblem: '🐝', strength: 74 },
      { name: '험버사이드 타이거즈', emblem: '🐯', strength: 74 },
      { name: '랭커셔 로버스', emblem: '🌹', strength: 74 },
      { name: '브리스톨 로빈스', emblem: '🐦', strength: 74 },
      { name: '프레스턴 릴리화이트', emblem: '🛡️', strength: 73 },
      { name: '사우스웨일스 블루버즈', emblem: '🐦', strength: 73 },
      { name: '사우스런던 라이온스', emblem: '🦁', strength: 73 },
      { name: '셰필드 아울스', emblem: '🦉', strength: 73 },
      { name: '데본 필그림스 그린', emblem: '⛵', strength: 72 },
      { name: '더비 램스 화이트', emblem: '🐏', strength: 72 },
      { name: '포츠머스 폼피 블루', emblem: '⚓', strength: 72 },
      { name: '옥스퍼드 옐로우즈', emblem: '🐂', strength: 71 },
    ],
  },
  BUNDES_1: {
    code: 'BUNDES_1',
    title: '분데스리가 (1부 · 18팀)',
    teamCount: 18,
    promoteCount: 0,
    relegateCount: 2,
    clubs: [
      { name: '뮌헨 레드', emblem: '🏆', strength: 91 },
      { name: '라인 레드블랙', emblem: '🦁', strength: 89 },
      { name: '베스트팔렌 옐로우', emblem: '🐝', strength: 87 },
      { name: '작센 레드불스', emblem: '🐂', strength: 86 },
      { name: '슈투트가르트 화이트레드', emblem: '🏎️', strength: 84 },
      { name: '프랑크푸르트 이글스', emblem: '🦅', strength: 83 },
      { name: '크라이히가우 블루', emblem: '🛡️', strength: 80 },
      { name: '브라이스가우 그리핀', emblem: '🦅', strength: 81 },
      { name: '하이덴하임 레드블루', emblem: '🏰', strength: 77 },
      { name: '베저 그린화이트', emblem: '🍀', strength: 79 },
      { name: '아우크스부르크 트리컬러', emblem: '🌲', strength: 78 },
      { name: '니더작센 그린울브스', emblem: '🐺', strength: 80 },
      { name: '마인츠 카니발 레드', emblem: '🎭', strength: 79 },
      { name: '보루시아 포얼스', emblem: '🐎', strength: 79 },
      { name: '쾨페니크 아이언레드', emblem: '🔨', strength: 78 },
      { name: '보훔 블루화이트', emblem: '🛡️', strength: 76 },
      { name: '함부르크 해적 브라운', emblem: '🏴‍☠️', strength: 75 },
      { name: '홀슈타인 스톡스 블루', emblem: '⚓', strength: 75 },
    ],
  },
  LALIGA_1: {
    code: 'LALIGA_1',
    title: '라리가 (1부 · 20팀)',
    teamCount: 20,
    promoteCount: 0,
    relegateCount: 3,
    clubs: [
      { name: '마드리드 화이트', emblem: '👑', strength: 92 },
      { name: '카탈루냐 블루레드', emblem: '🔥', strength: 90 },
      { name: '마드리드 로히블랑코', emblem: '⭐', strength: 88 },
      { name: '히로나 레드화이트', emblem: '🦁', strength: 83 },
      { name: '바스크 라이온스', emblem: '🦁', strength: 84 },
      { name: '산세바스티안 블루화이트', emblem: '👑', strength: 83 },
      { name: '안달루시아 그린화이트', emblem: '🍀', strength: 82 },
      { name: '발렌시아 옐로우서브마린', emblem: '🚢', strength: 82 },
      { name: '발렌시아 배츠 화이트', emblem: '🦇', strength: 80 },
      { name: '세비야 레드화이트', emblem: '🏆', strength: 80 },
      { name: '팜플로나 레드', emblem: '🦁', strength: 79 },
      { name: '마드리드 사우스 블루', emblem: '✈️', strength: 78 },
      { name: '갈리시아 스카이블루', emblem: '⚔️', strength: 79 },
      { name: '발레아레스 아일랜드 레드', emblem: '👹', strength: 79 },
      { name: '비토리아 블루화이트', emblem: '🛡️', strength: 77 },
      { name: '카나리아 옐로우블루', emblem: '🌴', strength: 77 },
      { name: '바예카스 라이트닝', emblem: '⚡', strength: 78 },
      { name: '레가네스 오이블루', emblem: '🛡️', strength: 76 },
      { name: '카스티야 바이올렛', emblem: '🟣', strength: 76 },
      { name: '바르셀로나 블루화이트', emblem: '🦜', strength: 76 },
    ],
  },
  SERIE_A: {
    code: 'SERIE_A',
    title: '세리에 A (1부 · 20팀)',
    teamCount: 20,
    promoteCount: 0,
    relegateCount: 3,
    clubs: [
      { name: '롬바르디아 블루블랙', emblem: '🐍', strength: 90 },
      { name: '밀라노 레드블랙', emblem: '🔱', strength: 87 },
      { name: '피에몬테 블랙화이트', emblem: '🦓', strength: 87 },
      { name: '나폴리 아주리', emblem: '🌋', strength: 87 },
      { name: '베르가모 블루블랙', emblem: '⚡', strength: 86 },
      { name: '로마 잘로로시', emblem: '🐺', strength: 84 },
      { name: '라치오 스카이이글스', emblem: '🦅', strength: 83 },
      { name: '피렌체 비올라', emblem: '⚜️', strength: 82 },
      { name: '볼로냐 레드블루', emblem: '🛡️', strength: 81 },
      { name: '토리노 마룬불스', emblem: '🐂', strength: 79 },
      { name: '제노바 그리폰', emblem: '🦅', strength: 78 },
      { name: '몬차 레드스피드', emblem: '🏎️', strength: 77 },
      { name: '베로나 옐로우블루', emblem: '🐕', strength: 76 },
      { name: '살렌토 울브스', emblem: '🐺', strength: 76 },
      { name: '프리울리 제브레테', emblem: '🦓', strength: 77 },
      { name: '사르데냐 아일랜더스', emblem: '🏝️', strength: 76 },
      { name: '엠폴리 블루즈', emblem: '💙', strength: 75 },
      { name: '파르마 크루세이더스', emblem: '✝️', strength: 76 },
      { name: '코모 레이크블루', emblem: '🌊', strength: 76 },
      { name: '베네치아 윙드라이온', emblem: '🦁', strength: 74 },
    ],
  },
  LIGUE_1: {
    code: 'LIGUE_1',
    title: '리그 1 (1부 · 18팀)',
    teamCount: 18,
    promoteCount: 0,
    relegateCount: 2,
    clubs: [
      { name: '파리 블루레드', emblem: '🗼', strength: 89 },
      { name: '모나코 레드화이트', emblem: '👑', strength: 84 },
      { name: '마르세유 올림피크 블루', emblem: '⭐', strength: 84 },
      { name: '릴 마스티프 레드', emblem: '🐕', strength: 83 },
      { name: '리옹 라이온스', emblem: '🦁', strength: 82 },
      { name: '니스 이글스 레드블랙', emblem: '🦅', strength: 81 },
      { name: '랑스 골드블러드', emblem: '⛏️', strength: 81 },
      { name: '렌 브르타뉴 레드', emblem: '🦊', strength: 80 },
      { name: '브레스트 파이러츠', emblem: '⚓', strength: 80 },
      { name: '랭스 샴페인 레드', emblem: '🥂', strength: 78 },
      { name: '툴루즈 바이올렛', emblem: '🟣', strength: 77 },
      { name: '스트라스부르 블루', emblem: '🦢', strength: 77 },
      { name: '몽펠리에 오렌지블루', emblem: '🔥', strength: 77 },
      { name: '낭트 카나리아 그린옐로', emblem: '🐤', strength: 76 },
      { name: '르아브르 스카이네이비', emblem: '⛵', strength: 75 },
      { name: '오세르 화이트블루', emblem: '✝️', strength: 75 },
      { name: '앙제 스쿱 블랙화이트', emblem: '🛡️', strength: 74 },
      { name: '생테티엔 그린스타즈', emblem: '⭐', strength: 75 },
    ],
  },
  KLEAGUE_1: {
    code: 'KLEAGUE_1',
    title: 'K리그 1 (1부 · 12팀)',
    teamCount: 12,
    promoteCount: 0,
    relegateCount: 2,
    clubs: [
      { name: '울산 블루타이거즈', emblem: '🐯', strength: 81 },
      { name: '김천 피닉스 레드', emblem: '🦅', strength: 79 },
      { name: '강원 오렌지베어스', emblem: '🐻', strength: 79 },
      { name: '포항 스틸레드', emblem: '🔥', strength: 79 },
      { name: '서울 블랙레드', emblem: '👑', strength: 80 },
      { name: '수원 캐슬블루레드', emblem: '🏰', strength: 78 },
      { name: '제주 아일랜드 오렌지', emblem: '🍊', strength: 77 },
      { name: '대전 퍼플시티즌', emblem: '🟣', strength: 78 },
      { name: '광주 그리핀 옐로우', emblem: '🦅', strength: 78 },
      { name: '전북 그린워리어스', emblem: '🛡️', strength: 79 },
      { name: '대구 스카이솔라', emblem: '☀️', strength: 77 },
      { name: '안양 바이올렛', emblem: '🍇', strength: 76 },
    ],
  },
  KLEAGUE_2: {
    code: 'KLEAGUE_2',
    title: 'K리그 2 (2부 · 14팀)',
    teamCount: 14,
    promoteCount: 2,
    relegateCount: 0,
    clubs: [
      { name: '인천 블루블랙 마린', emblem: '⚓', strength: 77 },
      { name: '수원 블루윙즈', emblem: '🦅', strength: 77 },
      { name: '부산 로열실드', emblem: '🛡️', strength: 75 },
      { name: '서울 레오파즈 네이비', emblem: '🐆', strength: 76 },
      { name: '전남 옐로우드래곤즈', emblem: '🐉', strength: 75 },
      { name: '부천 헤르메스 레드', emblem: '🏹', strength: 74 },
      { name: '김포 골든윙즈', emblem: '🦅', strength: 74 },
      { name: '충남 아산 아울스', emblem: '🦉', strength: 75 },
      { name: '성남 블랙까치', emblem: '🐦‍⬛', strength: 74 },
      { name: '경남 로즈레드', emblem: '🌹', strength: 74 },
      { name: '충북 청주 라이온스', emblem: '🦁', strength: 73 },
      { name: '안산 그린울브스', emblem: '🐺', strength: 72 },
      { name: '천안 스카이블루', emblem: '🏛️', strength: 73 },
      { name: '화성 오렌지포트리스', emblem: '🔥', strength: 72 },
    ],
  },
  MLS_1: {
    code: 'MLS_1',
    title: '메이저리그 사커 (MLS · 20팀)',
    teamCount: 20,
    promoteCount: 0,
    relegateCount: 0,
    clubs: [
      { name: '마이애미 핑크헤론즈', emblem: '🦩', strength: 83 },
      { name: '로스앤젤레스 골드블랙', emblem: '🦅', strength: 82 },
      { name: 'LA 갤럭시 스타즈', emblem: '⭐', strength: 82 },
      { name: '콜럼버스 골드크루', emblem: '👷', strength: 81 },
      { name: '신시내티 오렌지라이온', emblem: '🦁', strength: 80 },
      { name: '시애틀 에메랄드 사운더스', emblem: '🌲', strength: 79 },
      { name: '뉴욕 시티 스카이블루', emblem: '🗽', strength: 79 },
      { name: '뉴욕 메트로 레드불스', emblem: '🐂', strength: 79 },
      { name: '올랜도 퍼플라이온스', emblem: '🦁', strength: 78 },
      { name: '휴스턴 오렌지다이나모', emblem: '⚡', strength: 78 },
      { name: '애틀랜타 파이브스트라이프', emblem: '🚂', strength: 78 },
      { name: '샬럿 크라운 블루', emblem: '👑', strength: 77 },
      { name: '밴쿠버 화이트캡스', emblem: '🏔️', strength: 77 },
      { name: '포틀랜드 팀버스 그린', emblem: '🪓', strength: 77 },
      { name: '솔트레이크 로열클라렛', emblem: '👑', strength: 77 },
      { name: '미네소타 노스룬즈', emblem: '🦆', strength: 77 },
      { name: '콜로라도 버건디래피즈', emblem: '🌊', strength: 76 },
      { name: '댈러스 텍사스 불스', emblem: '🐂', strength: 76 },
      { name: '세인트루이스 아치 레드', emblem: '🌉', strength: 76 },
      { name: '토론토 메이플 레즈', emblem: '🍁', strength: 75 },
    ],
  },
};

function detectLeagueConfigForClub(clubName = '', division = 1) {
  const clean = String(clubName).trim();
  for (const cfg of Object.values(REAL_LEAGUE_CONFIGS)) {
    if (cfg.clubs.some((c) => clean.includes(c.name) || c.name.includes(clean))) {
      if (cfg.code === 'EPL_1' && division >= 2) return REAL_LEAGUE_CONFIGS.EFL_2;
      if (cfg.code === 'EFL_2' && division === 1) return REAL_LEAGUE_CONFIGS.EPL_1;
      if (cfg.code === 'KLEAGUE_1' && division >= 2) return REAL_LEAGUE_CONFIGS.KLEAGUE_2;
      if (cfg.code === 'KLEAGUE_2' && division === 1) return REAL_LEAGUE_CONFIGS.KLEAGUE_1;
      return cfg;
    }
  }
  if (division === 1) return REAL_LEAGUE_CONFIGS.EPL_1;
  if (division === 2) return REAL_LEAGUE_CONFIGS.EFL_2;
  return REAL_LEAGUE_CONFIGS.BUNDES_1;
}

function simulateOpponentFatigueAndRotation(oppObj, currentRound = 1) {
  if (!oppObj || !Array.isArray(oppObj.starters)) return oppObj;
  const starters = oppObj.starters.map((p) => ({ ...p }));
  const bench = Array.isArray(oppObj.bench) ? oppObj.bench.map((p) => ({ ...p })) : [];

  for (let i = 0; i < starters.length; i++) {
    const starter = starters[i];
    const isGk = starter.mainPosition === 'GK' || starter.preferredRoleCode === 'GK';
    const hash = Math.abs((starter.name?.charCodeAt(0) || 10) * 17 + currentRound * 23 + i * 13);
    const simulatedStamina = isGk
      ? 82 + (hash % 18)
      : Math.max(22, 100 - ((hash % 68) + (currentRound > 1 ? 10 : 0)));

    starter.stamina = simulatedStamina;
    starter.currentStamina = simulatedStamina;

    if (simulatedStamina <= 30 && bench.length > 0) {
      const benchIdx = bench.findIndex(
        (b) => b.mainPosition === starter.mainPosition && (b.stamina ?? 100) > 70
      );
      if (benchIdx >= 0) {
        const subIn = {
          ...bench[benchIdx],
          preferredRoleCode: starter.preferredRoleCode,
          roleCodes: starter.roleCodes,
          stamina: 92 + (hash % 8),
          currentStamina: 92 + (hash % 8),
        };
        bench[benchIdx] = { ...starter };
        starters[i] = subIn;
      } else {
        starter.stamina = 58;
        starter.currentStamina = 58;
      }
    }
  }
  return { ...oppObj, starters, bench };
}

function simulateScore(sA, sB, rng) {
  const ratio = clamp(sA / Math.max(40, sB), 0.55, 1.85);
  return [
    rng.poisson(clamp(1.25 * 1.05 * ratio ** 2, 0.2, 3.8)),
    rng.poisson(clamp(1.25 / ratio ** 2, 0.2, 3.8)),
  ];
}

function resolveTie(sA, sB, rng) {
  const ratio = clamp(sA / Math.max(40, sB), 0.6, 1.7);
  const et = [rng.poisson(clamp(0.4 * ratio ** 2, 0.1, 1.5)), rng.poisson(clamp(0.4 / ratio ** 2, 0.1, 1.5))];
  if (et[0] !== et[1]) return { et, pens: null, winner: et[0] > et[1] ? 'A' : 'B' };
  const pA = clamp(0.74 + (ratio - 1) * 0.2, 0.55, 0.9);
  const pB = clamp(0.74 + (1 / ratio - 1) * 0.2, 0.55, 0.9);
  let a = 0;
  let b = 0;
  for (let i = 0; i < 5; i++) {
    if (rng.next() < pA) a++;
    if (rng.next() < pB) b++;
  }
  let round = 0;
  while (a === b && round < 10) {
    if (rng.next() < pA) a++;
    if (rng.next() < pB) b++;
    round++;
  }
  if (a === b) {
    if (rng.next() < 0.5) a++;
    else b++;
  }
  return { et, pens: [a, b], winner: a > b ? 'A' : 'B' };
}

function newRow(team) {
  return { id: team.id, name: team.name, emblem: team.emblem, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
}

function recordResult(table, aId, bId, ga, gb) {
  const a = table[aId];
  const b = table[bId];
  if (!a || !b) return;
  a.p++;
  b.p++;
  a.gf += ga;
  a.ga += gb;
  b.gf += gb;
  b.ga += ga;
  if (ga > gb) {
    a.w++;
    b.l++;
    a.pts += LEAGUE.POINTS.WIN;
  } else if (ga < gb) {
    b.w++;
    a.l++;
    b.pts += LEAGUE.POINTS.WIN;
  } else {
    a.d++;
    b.d++;
    a.pts += LEAGUE.POINTS.DRAW;
    b.pts += LEAGUE.POINTS.DRAW;
  }
}

function rankRows(rows) {
  return [...rows]
    .sort((x, y) => y.pts - x.pts || y.gf - y.ga - (x.gf - x.ga) || y.gf - x.gf || x.name.localeCompare(y.name))
    .map((row, i) => ({ ...row, rank: i + 1, gd: row.gf - row.ga }));
}

function scaleReward(baseReward, tierLevel = 1) {
  const mult = Math.pow(1.35, Math.max(0, tierLevel - 1));
  return {
    gold: Math.round((baseReward?.gold || 0) * mult),
    cashFree: Math.round((baseReward?.cashFree || 0) * mult),
  };
}

const leagueHandler = {
  create({ userId, club, prev }) {
    const season = prev ? prev.season + 1 : 1;
    const division = prev?.nextDivision ?? LEAGUE.START_DIVISION;
    const prevTitles = prev?.titlesWon || 0;
    const tierLevel = prev?.finalRank === 1 ? (prev.tierLevel || 1) + 1 : prev?.tierLevel || 1;
    // 난이도 단계(tierLevel)에 비례해 상대 구단 능력치(+3씩) 상승
    const difficultyBoost = (tierLevel - 1) * 3;
    const rng = createRng(`league:${userId}:${season}:${division}`);

    const leagueCfg = detectLeagueConfigForClub(club.name, division);
    const totalTeams = leagueCfg.teamCount;

    // 이전 시즌 강등된 팀을 제외하고 2부에서 승격한 팀을 합류시킴
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

      // 강등된 구단과 2부에서 승격할 구단을 계산하여 다음 시즌 로스터에 반영함
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
    const me = rankRows(Object.values(state.table)).find((r) => r.id === 'USER');
    const currentRound = Math.min(state.round, state.totalRounds);
    return `${title}${tierBadge} · 시즌 ${state.season} · ${currentRound}/${state.totalRounds}R · ${me ? me.rank : 1}위`;
  },
};

function pairUp(ids) {
  const matches = [];
  for (let i = 0; i < ids.length; i += 2) {
    matches.push({ a: ids[i], b: ids[i + 1], ga: null, gb: null, et: null, pens: null, winner: null });
  }
  return matches;
}

function strengthOf(state, id, userStrength) {
  return id === 'USER' ? userStrength : state.teams[id].strength;
}

function settleMatch(match, state, userStrength, rng) {
  if (match.ga === match.gb) {
    const tie = resolveTie(strengthOf(state, match.a, userStrength), strengthOf(state, match.b, userStrength), rng);
    match.et = tie.et;
    match.pens = tie.pens;
    match.winner = tie.winner === 'A' ? match.a : match.b;
  } else {
    match.winner = match.ga > match.gb ? match.a : match.b;
  }
}

function playKnockoutRound(state, userGoals, oppGoals, userStrength, rng) {
  const round = state.rounds[state.roundIndex];
  const userMatch = round.matches.find((m) => m.winner === null && (m.a === 'USER' || m.b === 'USER'));
  [userMatch.ga, userMatch.gb] = userMatch.a === 'USER' ? [userGoals, oppGoals] : [oppGoals, userGoals];
  settleMatch(userMatch, state, userStrength, rng);

  for (const m of round.matches) {
    if (m.winner !== null) continue;
    [m.ga, m.gb] = simulateScore(strengthOf(state, m.a, userStrength), strengthOf(state, m.b, userStrength), rng);
    settleMatch(m, state, userStrength, rng);
  }

  const userWon = userMatch.winner === 'USER';
  const isFinal = round.matches.length === 1;
  let champion = false;
  if (userWon && isFinal) {
    champion = true;
    state.champion = 'USER';
  } else if (userWon) {
    state.rounds.push({ name: state.roundNames[state.roundIndex + 1], matches: pairUp(round.matches.map((m) => m.winner)) });
    state.roundIndex += 1;
  } else {
    state.eliminatedAt = round.name;
    let current = round;
    while (current.matches.length > 1) {
      const next = { name: state.roundNames[state.rounds.length], matches: pairUp(current.matches.map((m) => m.winner)) };
      for (const m of next.matches) {
        [m.ga, m.gb] = simulateScore(strengthOf(state, m.a, userStrength), strengthOf(state, m.b, userStrength), rng);
        settleMatch(m, state, userStrength, rng);
      }
      state.rounds.push(next);
      current = next;
    }
    state.champion = current.matches[0].winner;
  }
  return { userMatch, roundName: round.name, userWon, champion, eliminated: !userWon };
}

function knockoutSummary(match, roundName) {
  return { roundName, match, pens: match.pens, extraTime: match.et };
}

function knockoutNext(userId, state, refPrefix, label) {
  const round = state.rounds[state.roundIndex];
  const match = round.matches.find((m) => m.winner === null && (m.a === 'USER' || m.b === 'USER'));
  const oppId = match.a === 'USER' ? match.b : match.a;
  const opp = state.teams[oppId];
  const tierNote = (state.tierLevel || 1) > 1 ? ` [난이도 Lv.${state.tierLevel}]` : '';
  return {
    ref: `${refPrefix}:${state.roundIndex}`,
    label: `${label}${tierNote} ${round.name}`,
    opponentSpec: { seed: `${refPrefix}:${userId}:${state.roundIndex}:${oppId}`, name: opp.name, strength: opp.strength },
  };
}

const cupHandler = {
  create({ userId, club, prev }) {
    const tierLevel = prev?.champion === 'USER' ? (prev.tierLevel || 1) + 1 : prev?.tierLevel || 1;
    const titlesWon = (prev?.titlesWon || 0) + (prev?.champion === 'USER' ? 1 : 0);
    const difficultyBoost = (tierLevel - 1) * 2;
    const rng = createRng(`cup:${userId}:${Math.floor(Date.now() / 4096)}`);
    const names = rng.shuffle(AI_CLUB_NAMES.CHAMPIONS_CUP);
    const teams = { USER: { id: 'USER', name: club.name, emblem: club.emblemIcon, strength: null } };
    names.forEach((name, i) => {
      const id = `T${i + 1}`;
      teams[id] = {
        id,
        name,
        emblem: emblemFor(name),
        strength: clamp(rng.int(CUP.STRENGTH_RANGE[0], CUP.STRENGTH_RANGE[1]) + difficultyBoost, 65, 97),
      };
    });
    const order = rng.shuffle(Object.keys(teams));
    return {
      tierLevel,
      titlesWon,
      teams,
      roundNames: CUP.ROUND_NAMES,
      rounds: [{ name: CUP.ROUND_NAMES[0], matches: pairUp(order) }],
      roundIndex: 0,
      eliminatedAt: null,
      champion: null,
    };
  },

  next: (userId, state) => knockoutNext(userId, state, 'C', '챔피언스 컵'),

  apply({ userId, state, userGoals, oppGoals, userStrength }) {
    const rng = createRng(`cup-sim:${userId}:${state.roundIndex}:${userGoals}-${oppGoals}`);
    const roundIndexBefore = state.roundIndex;
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
    // 우승 시 대규모 챔피언 보너스 + 난이도 단계(tierLevel) 배율 적용
    const baseRoundReward = r.champion
      ? { gold: 25000, cashFree: 400 }
      : r.userWon
      ? CUP.ROUND_WIN_REWARD[roundIndexBefore] || { gold: 4000, cashFree: 50 }
      : CUP.ELIMINATED_REWARD;
    const reward = scaleReward(baseRoundReward, state.tierLevel || 1);
    return { state, summary, reward, finished: r.champion || r.eliminated };
  },

  overview(state, status) {
    const tierBadge = (state.tierLevel || 1) > 1 ? ` [난이도 Lv.${state.tierLevel}]` : '';
    if (status === 'FINISHED') {
      return state.champion === 'USER'
        ? `🏆 챔피언스 컵 우승!${tierBadge} (다음 도전 시 난이도·보상 상승)`
        : `${state.eliminatedAt}에서 탈락${tierBadge}`;
    }
    return `${state.rounds[state.roundIndex].name} 진행 중${tierBadge}`;
  },
};

const GROUP_MATCHDAYS = [
  [[0, 1], [2, 3]],
  [[0, 2], [1, 3]],
  [[0, 3], [1, 2]],
];

const worldCupHandler = {
  create({ userId, club, prev }) {
    const tierLevel = prev?.champion === 'USER' ? (prev.tierLevel || 1) + 1 : prev?.tierLevel || 1;
    const titlesWon = (prev?.titlesWon || 0) + (prev?.champion === 'USER' ? 1 : 0);
    const difficultyBoost = (tierLevel - 1) * 3;
    const rng = createRng(`wc48:${userId}:${Math.floor(Date.now() / 4096)}`);

    // 48개국 구성 (유저 팀 1개 + AI 47개국)
    const allNations = rng.shuffle(AI_CLUB_NAMES.WORLD_CUP).slice(0, 47);
    const teams = {
      USER: { id: 'USER', name: `${club.name}`, emblem: club.emblemIcon, strength: null },
    };
    allNations.forEach((name, i) => {
      const id = `T${i + 1}`;
      teams[id] = {
        id,
        name,
        emblem: emblemFor(name),
        strength: clamp(rng.int(WORLD_CUP.STRENGTH_RANGE[0], WORLD_CUP.STRENGTH_RANGE[1]) + difficultyBoost, 70, 97),
      };
    });

    const aiIds = rng.shuffle(Object.keys(teams).filter((id) => id !== 'USER'));
    const groups = {};
    // 12개 조(A~L)에 4개국씩 총 48개국 배정
    WORLD_CUP.GROUPS.forEach((g, gi) => {
      groups[g] = gi === 0 ? ['USER', ...aiIds.slice(0, 3)] : aiIds.slice(3 + (gi - 1) * 4, 3 + gi * 4);
    });

    return {
      tierLevel,
      titlesWon,
      teams,
      groups,
      table: Object.fromEntries(Object.keys(teams).map((id) => [id, newRow(teams[id])])),
      phase: 'GROUP',
      matchday: 1,
      roundNames: WORLD_CUP.KNOCKOUT_NAMES, // ['32강', '16강', '8강', '4강', '결승']
      rounds: [],
      roundIndex: 0,
      eliminatedAt: null,
      champion: null,
    };
  },

  next(userId, state) {
    if (state.phase === 'KNOCKOUT') return knockoutNext(userId, state, 'WK', '2026 월드컵');
    const oppId = state.groups.A[state.matchday];
    const opp = state.teams[oppId];
    const tierNote = (state.tierLevel || 1) > 1 ? ` [난이도 Lv.${state.tierLevel}]` : '';
    return {
      ref: `WG:${state.matchday}`,
      label: `2026 월드컵 (48개국)${tierNote} 조별리그 ${state.matchday}차전`,
      opponentSpec: { seed: `wg:${userId}:${state.matchday}`, name: opp.name, strength: opp.strength, isNationalTeam: true },
    };
  },

  apply({ userId, state, userGoals, oppGoals, userStrength }) {
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
      for (const [i, j] of GROUP_MATCHDAYS[md - 1]) {
        const a = state.groups[g][i];
        const b = state.groups[g][j];
        let ga;
        let gb;
        if (a === 'USER') [ga, gb] = [userGoals, oppGoals];
        else if (b === 'USER') [ga, gb] = [oppGoals, userGoals];
        else [ga, gb] = simulateScore(state.teams[a].strength, state.teams[b].strength, rng);
        recordResult(state.table, a, b, ga, gb);
        results.push({ group: g, a, b, ga, gb });
      }
    }
    state.matchday += 1;

    const groupStandings = Object.fromEntries(
      WORLD_CUP.GROUPS.map((g) => [g, rankRows(state.groups[g].map((id) => state.table[id]))])
    );
    const summary = {
      type: 'WORLD_CUP',
      phase: 'GROUP',
      tierLevel: state.tierLevel || 1,
      matchday: md,
      results,
      groupStandings,
      userGroupRank: groupStandings.A.find((r) => r.id === 'USER').rank,
    };
    if (md < 3) return { state, summary, reward: { gold: 0, cashFree: 0 }, finished: false };

    // 2026 월드컵 48개국 32강 진출 방식:
    // 각 조 1, 2위(24개국) + 조 3위 중 성적 상위 8개국 = 총 32개국 토너먼트 진출!
    const topTwoIds = [];
    const thirdPlaceRows = [];
    for (const g of WORLD_CUP.GROUPS) {
      const rows = groupStandings[g];
      topTwoIds.push(rows[0].id, rows[1].id);
      if (rows[2]) thirdPlaceRows.push(rows[2]);
    }
    const bestEightThirds = rankRows(thirdPlaceRows)
      .slice(0, 8)
      .map((r) => r.id);

    const all32Qualifiers = [...topTwoIds, ...bestEightThirds];
    summary.advanced = all32Qualifiers.includes('USER');

    if (!summary.advanced) {
      state.eliminatedAt = '48개국 조별리그';
      state.champion = topTwoIds[0];
      return { state, summary, reward: scaleReward(WORLD_CUP.ELIMINATED_REWARD, state.tierLevel || 1), finished: true };
    }

    state.phase = 'KNOCKOUT';
    state.rounds = [{ name: WORLD_CUP.KNOCKOUT_NAMES[0], matches: pairUp(all32Qualifiers) }];
    state.roundIndex = 0;
    return { state, summary, reward: scaleReward(WORLD_CUP.GROUP_ADVANCE_REWARD, state.tierLevel || 1), finished: false };
  },

  overview(state, status) {
    const tierBadge = (state.tierLevel || 1) > 1 ? ` [난이도 Lv.${state.tierLevel}]` : '';
    if (status === 'FINISHED') {
      return state.champion === 'USER'
        ? `🏆 2026 월드컵 우승!${tierBadge}`
        : `${state.eliminatedAt}에서 탈락${tierBadge}`;
    }
    return state.phase === 'GROUP'
      ? `48개국 조별리그 ${state.matchday}/3차전${tierBadge}`
      : `${state.rounds[state.roundIndex].name} 진행 중${tierBadge}`;
  },
};

function objectiveMet(objective, home, away) {
  switch (objective.type) {
    case 'NOT_LOSE':
      return home >= away;
    case 'WIN':
      return home > away;
    case 'WIN_MARGIN':
      return home - away >= objective.margin;
    case 'CLEAN_SHEET':
      return away === 0 && home >= away;
    default:
      return false;
  }
}

const towerHandler = {
  create() {
    return { cleared: [], attempts: 0 };
  },
  next(userId, state, stageId) {
    const stage = TOWER_STAGES.find((s) => s.id === Number(stageId));
    if (!stage) throw new ValidationError('존재하지 않는 스테이지입니다.');
    if (stage.id > state.cleared.length + 1) throw new ValidationError('이전 스테이지를 먼저 클리어해야 합니다.');
    return {
      ref: `T:${stage.id}`,
      stageId: stage.id,
      label: `챌린지 타워 Stage ${stage.id} · ${stage.title}`,
      opponentSpec: { seed: `tower:${stage.id}`, name: stage.opponent.name, strength: stage.opponent.strength, tactics: stage.opponent.tactics },
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
  apply({ state, stageId, userGoals, oppGoals }) {
    const stage = TOWER_STAGES.find((s) => s.id === Number(stageId));
    const met = objectiveMet(stage.objective, userGoals, oppGoals);
    const firstClear = met && !state.cleared.includes(stage.id);
    if (firstClear) state.cleared.push(stage.id);
    state.attempts += 1;
    const reward = !met ? { gold: 0, cashFree: 0 } : firstClear ? stage.reward : TOWER_REPEAT_REWARD;
    return {
      state,
      summary: {
        type: 'TOWER',
        stageId: stage.id,
        title: stage.title,
        objective: stage.objective,
        cleared: met,
        firstClear,
        clearedCount: state.cleared.length,
        totalStages: TOWER_STAGES.length,
      },
      reward,
      finished: false,
    };
  },
  overview(state) {
    return `${state.cleared.length}/${TOWER_STAGES.length} 스테이지 클리어`;
  },
};

function tierOf(rp) {
  let index = 0;
  RANK_TIERS.forEach((t, i) => {
    if (rp >= t.minRp) index = i;
  });
  return { tier: RANK_TIERS[index], index };
}

const rankedHandler = {
  create() {
    return { rp: RANKED.START_RP, wins: 0, draws: 0, losses: 0, matches: 0, streak: 0, history: [] };
  },
  next(userId, state) {
    const rng = createRng(`ranked:${userId}:${state.matches}`);
    const { index } = tierOf(state.rp);
    const oppIndex = clamp(index + rng.pick([-1, 0, 0, 1]), 0, RANK_TIERS.length - 1);
    const tier = RANK_TIERS[oppIndex];
    const name = `${rng.pick(AI_CLUB_NAMES.RANKED)} [${tier.label}]`;
    return {
      ref: `R:${state.matches}`,
      label: `랭크 매치 #${state.matches + 1} (${tier.label} 상대)`,
      opponentSpec: { seed: `ranked:${userId}:${state.matches}`, name, strength: tier.strength + rng.int(-2, 2) },
      oppTierIndex: oppIndex,
    };
  },
  apply({ userId, state, userGoals, oppGoals }) {
    const info = rankedHandler.next(userId, state);
    const before = tierOf(state.rp);
    let delta;
    if (userGoals > oppGoals) {
      delta = RANKED.WIN_RP + (info.oppTierIndex > before.index ? RANKED.HIGHER_TIER_BONUS : 0);
      state.wins += 1;
      state.streak = Math.max(0, state.streak) + 1;
    } else if (userGoals === oppGoals) {
      delta = RANKED.DRAW_RP;
      state.draws += 1;
      state.streak = 0;
    } else {
      delta = RANKED.LOSE_RP;
      state.losses += 1;
      state.streak = Math.min(0, state.streak) - 1;
    }
    const rpBefore = state.rp;
    state.rp = Math.max(0, state.rp + delta);
    state.matches += 1;
    state.history = [{ opponent: info.opponentSpec.name, score: `${userGoals}:${oppGoals}`, delta }, ...state.history].slice(0, 10);
    const after = tierOf(state.rp);
    return {
      state,
      summary: {
        type: 'RANKED',
        rpBefore,
        rpAfter: state.rp,
        delta,
        tierBefore: before.tier.label,
        tierAfter: after.tier.label,
        tierChanged: after.index !== before.index,
        streak: state.streak,
      },
      reward: userGoals > oppGoals ? RANKED.WIN_REWARD : { gold: 0, cashFree: 0 },
      finished: false,
    };
  },
  overview(state) {
    const { tier } = tierOf(state.rp);
    return `${tier.label} · ${state.rp} RP · ${state.wins}승 ${state.draws}무 ${state.losses}패`;
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
  if (!MODES.includes(mode)) throw new ValidationError('지원하지 않는 게임 모드입니다.');
  return HANDLERS[mode];
}

async function userTeamStrength(conn, userId) {
  const players = await ClubRepository.getFullPlayers(conn, userId);
  const starters = players.filter((p) => p.isStarter).slice(0, 11);
  const pool_ = starters.length ? starters : players.slice(0, 11);
  if (pool_.length === 0) return 60;
  return pool_.reduce((sum, p) => sum + computeOverall(p.baseStats, p.level, p.mainPosition), 0) / pool_.length;
}

export default class CompetitionService {
  static async getOverview(userId) {
    const rows = await ClubRepository.getAllCompetitions(null, userId);
    return MODES.map((mode) => {
      const row = rows.find((r) => r.mode === mode);
      return {
        mode,
        label: MODE_LABELS[mode],
        status: row ? row.status : 'NONE',
        summary: row ? HANDLERS[mode].overview(row.state, row.status) : '아직 시작하지 않았습니다.',
      };
    });
  }

  static async getState(userId, mode) {
    const handler = handlerFor(mode);
    const row = await ClubRepository.getCompetition(null, userId, mode);
    if (!row) return { mode, label: MODE_LABELS[mode], status: 'NONE', summary: '아직 시작하지 않았습니다.', state: null };
    const view = { mode, label: MODE_LABELS[mode], status: row.status, summary: handler.overview(row.state, row.status), state: row.state };
    if (mode === 'LEAGUE') view.standings = rankRows(Object.values(row.state.table));
    if (mode === 'WORLD_CUP') {
      view.groupStandings = Object.fromEntries(
        WORLD_CUP.GROUPS.map((g) => [g, rankRows(row.state.groups[g].map((id) => row.state.table[id]))])
      );
    }
    if (mode === 'RANKED') view.tiers = RANK_TIERS;
    if (mode === 'CHALLENGE_TOWER') view.stages = TOWER_STAGES;
    return view;
  }

  static async start(userId, mode, restart = false) {
    const handler = handlerFor(mode);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const existing = await ClubRepository.getCompetition(conn, userId, mode, true);
      const persistent = mode === 'CHALLENGE_TOWER' || mode === 'RANKED';
      if (existing && persistent) {
        await conn.commit();
        return CompetitionService.getState(userId, mode);
      }
      if (existing && existing.status === 'ACTIVE' && !restart) {
        throw new ConflictError('진행 중인 대회가 있습니다. 새로 시작하려면 기존 진행을 포기해야 합니다.');
      }
      const club = await ClubRepository.findClub(conn, userId);
      // 리그뿐만 아니라 챔피언스컵, 월드컵도 이전 상태(prev)를 전달하여 우승 후 재시작 시 난이도,보상 단계가 상승하도록 연결
      const prev = existing ? existing.state : null;
      const state = handler.create({ userId, club, prev });
      await ClubRepository.saveCompetition(conn, userId, mode, 'ACTIVE', state);
      await conn.commit();
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    } finally {
      conn.release();
    }
    return CompetitionService.getState(userId, mode);
  }

  static async getNextMatch(userId, mode, stageId = null) {
    const handler = handlerFor(mode);
    const row = await ClubRepository.getCompetition(null, userId, mode);
    if (!row || row.status !== 'ACTIVE') throw new NotFoundError('진행 중인 대회가 없습니다. 먼저 대회를 시작하세요.');
    const info = handler.next(userId, row.state, stageId);
    const spec = info.opponentSpec;
    const strength = spec.strength ?? (await userTeamStrength(null, userId));
    const rawOpponent = buildOpponent({ ...spec, strength });
    const currentRound = row.state?.round || row.state?.matchday || 1;
    const readyOpponent = simulateOpponentFatigueAndRotation(rawOpponent, currentRound);
    return {
      mode,
      ref: info.ref,
      label: info.label,
      stageId: info.stageId ?? null,
      opponent: readyOpponent,
      scenario: info.scenario || null,
    };
  }

  static async applyResult(conn, userId, context, userGoals, oppGoals) {
    const handler = handlerFor(context.mode);
    const row = await ClubRepository.getCompetition(conn, userId, context.mode, true);
    if (!row || row.status !== 'ACTIVE') throw new ValidationError('진행 중인 대회가 아닙니다.');
    const info = handler.next(userId, row.state, context.stageId);
    if (info.ref !== context.ref) throw new ValidationError('대회 일정이 변경되어 결과를 반영할 수 없습니다.');

    const userStrength = await userTeamStrength(conn, userId);
    const { state, summary, reward, finished } = handler.apply({
      userId,
      state: row.state,
      stageId: context.stageId,
      userGoals,
      oppGoals,
      userStrength,
    });
    await ClubRepository.saveCompetition(conn, userId, context.mode, finished ? 'FINISHED' : 'ACTIVE', state);
    summary.mode = context.mode;
    summary.label = MODE_LABELS[context.mode];
    summary.finished = finished;
    return { summary, reward: { gold: reward.gold || 0, cashFree: reward.cashFree || 0 } };
  }
}