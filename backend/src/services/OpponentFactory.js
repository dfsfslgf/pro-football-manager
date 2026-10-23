import fs from 'node:fs';
import path from 'node:path';
import { getFormationSlots, FORMATION_CODES } from '../constants/formationCoords.js';
import { GAME_RULES } from '../constants/gameRules.js';
import { EMBLEM_ICONS } from '../constants/clubRules.js';
import { buildBaseStats } from '../models/seedData.js';
import { createRng } from '../utils/seededRandom.js';

const SLOT_TO_ROLE = {
  LCB: 'CB',
  RCB: 'CB',
  LST: 'ST',
  RST: 'ST',
  LDM: 'CDM',
  RDM: 'CDM',
  LCM: 'CM',
  RCM: 'CM',
  LAM: 'LW',
  RAM: 'RW',
};

// [요구사항 14번 반영] 상대 팀 후보(벤치)도 11명 풀 엔트리(GK 1, DF 4, MF 4, FW 2)로 구성
const BENCH_PLAN = [
  ['GK', 'GK'],
  ['DF', 'LB'],
  ['DF', 'CB'],
  ['DF', 'CB'],
  ['DF', 'RB'],
  ['MF', 'CDM'],
  ['MF', 'CM'],
  ['MF', 'CAM'],
  ['MF', 'LM'],
  ['FW', 'LW'],
  ['FW', 'ST'],
];

/**
 * crawlRealPlayers.js 가 생성한 real_players_by_team.json 이 있으면 메모리에 로드하여
 * 146개 전 구단의 실제 포지션별 선수 로스터로 즉시 활용합니다!
 */
let CRAWLED_TEAM_ROSTERS = {};
try {
  const jsonPath = path.resolve(process.cwd(), 'real_players_by_team.json');
  if (fs.existsSync(jsonPath)) {
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    for (const [clubName, playerList] of Object.entries(raw)) {
      const grouped = { GK: [], DF: [], MF: [], FW: [] };
      for (const p of playerList) {
        if (grouped[p.mainPosition]) grouped[p.mainPosition].push(p.name);
      }
      CRAWLED_TEAM_ROSTERS[clubName] = grouped;
    }
  }
} catch {
  CRAWLED_TEAM_ROSTERS = {};
}

const BUILTIN_CLUB_SQUADS = {
  '맨체스터 블루': {
    GK: ['에데르송', '슈테판 오르테가'],
    DF: ['후벵 디아스', '요슈코 그바르디올', '카일 워커', '마누엘 아칸지', '네이선 아케', '리코 루이스', '존 스톤스'],
    MF: ['로드리', '케빈 더 브라위너', '베르나르두 실바', '일카이 귄도안', '마테오 코바치치', '마테우스 누네스'],
    FW: ['엘링 홀란드', '필 포든', '제레미 도쿠', '사비뉴', '잭 그릴리시'],
  },
  '노스 런던 레드': {
    GK: ['다비드 라야', '네투'],
    DF: ['윌리엄 살리바', '가브리에우 마갈량이스', '벤 화이트', '율리엔 팀버', '리카르도 칼라피오리', '도미야스 다케히로', '키어런 티어니'],
    MF: ['데클란 라이스', '마르틴 외데고르', '토마스 파티', '미켈 메리노', '조르지뉴'],
    FW: ['부카요 사카', '카이 하베르츠', '가브리엘 마르티넬리', '레안드로 트로사르', '가브리엘 제주스'],
  },
  '머지사이드 레드': {
    GK: ['알리송 베케르', '퀴빈 켈러허'],
    DF: ['버질 판 데이크', '이브라히마 코나테', '트렌트 알렉산더아놀드', '앤디 로버트슨', '조 고메즈', '코스타스 치미카스'],
    MF: ['알렉시스 맥 알리스터', '도미니크 소보슬라이', '라이언 흐라번베르흐', '커티스 존스', '엔도 와타루'],
    FW: ['모하메드 살라', '루이스 디아스', '다르윈 누녜스', '코디 학포', '디오구 조타'],
  },
  '노스이스트 런던': {
    GK: ['굴리엘모 비카리오', '프레이저 포스터'],
    DF: ['크리스티안 로메로', '미키 판 더 펜', '페드로 포로', '데스티니 우도기', '라두 드라구신', '벤 데이비스'],
    MF: ['제임스 매디슨', '로드리고 벤탄쿠르', '파페 사르', '이브 비수마', '루카스 베리발'],
    FW: ['손흥민', '도미닉 솔란케', '데얀 쿨루셉스키', '브레넌 존슨', '양민혁'],
  },
  '뮌헨 레드': {
    GK: ['마누엘 노이어', '다니엘 페레츠'],
    DF: ['김민재', '다요 우파메카노', '알폰소 데이비스', '하파엘 게헤이루', '이토 히로키', '에릭 다이어'],
    MF: ['자말 무시알라', '조슈아 키미히', '알렉산다르 파블로비치', '레온 고레츠카', '콘라트 라이머'],
    FW: ['해리 케인', '마이클 올리세', '세르주 그나브리', '킹슬리 코망', '르로이 사네'],
  },
  '마드리드 화이트': {
    GK: ['티보 쿠르투아', '안드리 루닌'],
    DF: ['안토니오 뤼디거', '에데르 밀리탕', '다니 카르바할', '페를랑 멘디', '데이비드 알라바', '프란 가르시아'],
    MF: ['주드 벨링엄', '페데리코 발베르데', '오렐리앙 추아메니', '에두아르도 카마빙가', '루카 모드리치'],
    FW: ['킬리안 음바페', '비니시우스 주니오르', '호드리구', '브라힘 디아스', '엔드릭'],
  },
};

/**
 * [요구사항 3번 완벽 보장] 포지션별 글로벌 실제 선수 풀 (GK 풀에는 오직 실제 골키퍼만 존재!)
 */
const GLOBAL_REAL_POOL_BY_POS = {
  GK: [
    '티보 쿠르투아', '알리송 베케르', '에데르송', '마누엘 노이어', '다비드 라야', '굴리엘모 비카리오',
    '마이크 메냥', '에밀리아노 마르티네스', '잔루이지 돈나룸마', '얀 오블라크', '얀 조머', '그레고르 코벨',
    '우나이 시몬', '조던 픽포드', '베른트 레노', '안드레 오나나', '로베르트 산체스', '조현우', '김승규', '이창근',
  ],
  DF: [
    '버질 판 데이크', '후벵 디아스', '윌리엄 살리바', '안토니오 뤼디거', '김민재', '요슈코 그바르디올',
    '크리스티안 로메로', '미키 판 더 펜', '트렌트 알렉산더아놀드', '아슈라프 하키미', '테오 에르난데스',
    '알레산드로 바스토니', '요나탄 타', '알레한드로 그리말도', '제레미 프림퐁', '뱅자맹 파바르', '마크 게히',
    '안토니 로빈슨', '설영우', '김영권', '이한범', '권경원', '조유민', '박진섭', '김진수', '황재원',
  ],
  MF: [
    '로드리', '케빈 더 브라위너', '주드 벨링엄', '마르틴 외데고르', '페데리코 발베르데', '자말 무시알라',
    '플로리안 비르츠', '데클란 라이스', '콜 파머', '브루노 페르난데스', '페드리', '니콜로 바렐라',
    '알렉시스 맥 알리스터', '이강인', '제임스 매디슨', '비티냐', '모이세스 카이세도', '브루노 기마랑이스',
    '유리 틸레만스', '미토마 가오루', '이재성', '황인범', '배준호', '백승호', '정호연', '세징야', '제시 린가드',
  ],
  FW: [
    '킬리안 음바페', '엘링 홀란드', '해리 케인', '비니시우스 주니오르', '손흥민', '모하메드 살라',
    '리오넬 메시', '라우타로 마르티네스', '부카요 사카', '라민 야말', '필 포든', '알렉산데르 이삭',
    '호드리구', '하파엘 레앙', '데얀 쿨루셉스키', '니코 윌리엄스', '흐비차 크바라츠헬리아', '황희찬',
    '올리 왓킨스', '마테우스 쿠냐', '브라이언 음뵈모', '쿠보 다케후사', '엄지성', '양민혁', '주민규', '오현규',
  ],
};

export function emblemFor(name) {
  let h = 0;
  for (const ch of String(name || 'FC')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return EMBLEM_ICONS[h % EMBLEM_ICONS.length];
}

export function buildOpponent({ seed, name, strength, formation, tactics }) {
  const rng = createRng(`opp:${seed}`);
  const chosenFormation = formation || rng.pick(FORMATION_CODES);
  const slots = getFormationSlots(chosenFormation, 'HOME');

  const clubStr = String(name || '');
  const crawledMatchKey = Object.keys(CRAWLED_TEAM_ROSTERS).find((k) => clubStr.includes(k) || k.includes(clubStr));
  const builtinMatchKey = Object.keys(BUILTIN_CLUB_SQUADS).find((k) => clubStr.includes(k) || k.includes(clubStr));

  const customSquad =
    (crawledMatchKey && CRAWLED_TEAM_ROSTERS[crawledMatchKey]) ||
    (builtinMatchKey && BUILTIN_CLUB_SQUADS[builtinMatchKey]) ||
    null;

  const usedNames = new Set();

  // 포지션(GK / DF / MF / FW)에 100% 일치하는 선수만 선택 (GK에 필드 플레이어가 배정되는 현상 원천 차단!)
  const pickUniqueRealName = (position) => {
    const strictPos = ['GK', 'DF', 'MF', 'FW'].includes(position) ? position : 'MF';
    const primaryPool = customSquad?.[strictPos] || [];
    for (const candidate of primaryPool) {
      if (!usedNames.has(candidate)) {
        usedNames.add(candidate);
        return candidate;
      }
    }
    const globalPool = rng.shuffle(GLOBAL_REAL_POOL_BY_POS[strictPos]);
    for (const candidate of globalPool) {
      if (!usedNames.has(candidate)) {
        usedNames.add(candidate);
        return candidate;
      }
    }
    const fallbackName = `${globalPool[0]} #${usedNames.size + 1}`;
    usedNames.add(fallbackName);
    return fallbackName;
  };

  let counter = 0;
  const makePlayer = (position, role) => {
    counter++;
    const ovr = Math.max(45, Math.min(95, (strength || 75) + rng.int(-3, 3)));
    const playerName = pickUniqueRealName(position);
    return {
      userPlayerId: -counter,
      playerId: -counter,
      name: playerName,
      safeName: playerName,
      mainPosition: position,
      preferredRoleCode: role,
      roleCodes: [role],
      level: 1,
      stamina: 100,
      overall: ovr,
      baseStats: buildBaseStats(position, ovr, counter + rng.int(0, 9)),
      tags: [],
      instruction: null,
    };
  };

  const starters = slots.map((slot) => makePlayer(slot.role, SLOT_TO_ROLE[slot.label] || slot.label));
  const bench = BENCH_PLAN.map(([position, role]) => makePlayer(position, role));

  const mentalityPool = ['BALANCED', 'BALANCED', 'ATTACKING', 'DEFENSIVE'];
  const options = GAME_RULES.TEAM_TACTIC_OPTIONS;
  const resolvedTactics = {
    mentality: rng.pick(mentalityPool),
    passingStyle: rng.pick(options.passingStyle),
    tempo: rng.pick(options.tempo),
    defensiveLine: rng.pick(options.defensiveLine),
    pressing: rng.pick(options.pressing),
    ...(tactics || {}),
  };

  return {
    name,
    emblem: emblemFor(name),
    strength,
    formation: chosenFormation,
    tactics: resolvedTactics,
    starters,
    bench,
  };
}