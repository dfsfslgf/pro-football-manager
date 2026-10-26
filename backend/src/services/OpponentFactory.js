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

/**
 * 2026 월드컵 주요 국가별 국적 일치 대표팀 선수 명단
 */
const NATIONAL_TEAM_SQUADS = {
  대한민국: {
    GK: ['조현우', '김승규', '송범근'],
    DF: ['김민재', '설영우', '김영권', '조유민', '이한범', '김문환', '이명재', '권경원'],
    MF: ['이강인', '황인범', '이재성', '박용우', '백승호', '홍현석', '배준호', '정호연'],
    FW: ['손흥민', '황희찬', '오현규', '주민규', '엄지성', '양민혁'],
  },
  프랑스: {
    GK: ['마이크 메냥', '알퐁스 아레올라', '브리스 삼바'],
    DF: ['윌리엄 살리바', '다요 우파메카노', '이브라히마 코나테', '테오 에르난데스', '쥘 쿤데', '뱅자맹 파바르', '페를랑 멘디'],
    MF: ['오렐리앙 추아메니', '에두아르도 카마빙가', '워렌 자이르에메리', '은골로 캉테', '아드리앙 라비오', '유수프 포파나'],
    FW: ['킬리안 음바페', '앙투안 그리에즈만', '우스만 뎀벨레', '마르쿠스 튀랑', '브래들리 바르콜라', '마이클 올리세'],
  },
  아르헨티나: {
    GK: ['에밀리아노 마르티네스', '헤로니모 루이', '프랑코 아르마니'],
    DF: ['크리스티안 로메로', '리산드로 마르티네스', '니콜라스 오타멘디', '나우엘 몰리나', '니콜라스 탈리아피코', '곤살로 몬티엘'],
    MF: ['엔소 페르난데스', '알렉시스 맥 알리스터', '로드리고 데 파울', '레안드로 파레데스', '지오바니 로 셀소', '에세키엘 팔라시오스'],
    FW: ['리오넬 메시', '라우타로 마르티네스', '훌리안 알바레스', '알레한드로 가르나초', '니콜라스 곤살레스'],
  },
  잉글랜드: {
    GK: ['조던 픽포드', '딘 헨더슨', '아론 램스데일'],
    DF: ['존 스톤스', '마크 게히', '카일 워커', '트렌트 알렉산더아놀드', '루크 쇼', '에즈리 콘사', '리코 루이스'],
    MF: ['주드 벨링엄', '데클란 라이스', '콜 파머', '코비 마이누', '코너 갤러거', '커티스 존스'],
    FW: ['해리 케인', '부카요 사카', '필 포든', '올리 왓킨스', '앤서니 고든', '재러드 보언'],
  },
  브라질: {
    GK: ['알리송 베케르', '에데르송', '벤투'],
    DF: ['마르키뉴스', '가브리에우 마갈량이스', '에데르 밀리탕', '다닐루', '기예르미 아라나', '반데르송'],
    MF: ['브루노 기마랑이스', '루카스 파케타', '더글라스 루이스', '안드레', '주앙 고메스', '제르송'],
    FW: ['비니시우스 주니오르', '호드리구', '하피냐', '사비뉴', '엔드릭', '가브리엘 마르티넬리'],
  },
  스페인: {
    GK: ['우나이 시몬', '다비드 라야', '알렉스 레미로'],
    DF: ['다니 카르바할', '에므리크 라포르트', '로뱅 르 노르망', '마르크 쿠쿠렐라', '알레한드로 그리말도', '파우 쿠바르시'],
    MF: ['로드리', '페드리', '파비안 루이스', '다니 올모', '미켈 메리노', '가비', '마르틴 수비멘디'],
    FW: ['라민 야말', '니코 윌리엄스', '알바로 모라타', '미켈 오야르사발', '페란 토레스'],
  },
  독일: {
    GK: ['마르크안드레 테어 슈테겐', '올리버 바우만', '알렉산더 뉘벨'],
    DF: ['안토니오 뤼디거', '요나탄 타', '요주아 키미히', '막시밀리안 미텔슈테트', '니코 슐로터베크', '발데마르 안톤'],
    MF: ['자말 무시알라', '플로리안 비르츠', '로베르트 안드리히', '파스칼 그로스', '알렉산다르 파블로비치'],
    FW: ['카이 하베르츠', '니클라스 푱크루크', '데니즈 운다프', '세르주 그나브리', '르로이 사네'],
  },
  포르투갈: {
    GK: ['디오구 코스타', '조제 사', '후이 실바'],
    DF: ['후벵 디아스', '주앙 칸셀루', '누누 멘데스', '디오구 달로', '안토니우 실바', '곤살루 이나시우'],
    MF: ['브루노 페르난데스', '베르나르두 실바', '비티냐', '주앙 팔리냐', '주앙 네베스', '오타비우'],
    FW: ['크리스티아누 호날두', '하파엘 레앙', '디오구 조타', '페드루 네투', '곤살루 하무스'],
  },
  우루과이: {
    GK: ['세르히오 로체트', '프랑코 이스라엘'],
    DF: ['로날드 아라우호', '호세 히메네스', '마티아스 올리베라', '나이탄 난데스', '기예르모 바렐라'],
    MF: ['페데리코 발베르데', '마누엘 우가르테', '로드리고 벤탄쿠르', '니콜라스 데 라 크루스'],
    FW: ['다르윈 누녜스', '파쿤도 펠리스트리', '막시밀리아노 아라우호', '브라이언 로드리게스'],
  },
  네덜란드: {
    GK: ['바르트 페르브뤼헌', '마르크 플레컨'],
    DF: ['버질 판 데이크', '네이선 아케', '미키 판 더 펜', '덴젤 뒴프리스', '제레미 프림퐁', '스테판 더 프레이'],
    MF: ['프렝키 더 용', '티야니 라인더르스', '라이언 흐라번베르흐', '사비 시몬스', '퇸 코프메이너르스'],
    FW: ['코디 학포', ' 도니얼 말런', '브라이언 브로비', '바우트 베호르스트'],
  },
  이탈리아: {
    GK: ['잔루이지 돈나룸마', '굴리엘모 비카리오', '알렉스 메레트'],
    DF: ['알레산드로 바스토니', '리카르도 칼라피오리', '페데리코 디마르코', '조반니 디 로렌초', '안드레아 캄비아소'],
    MF: ['니콜로 바렐라', '산드로 토날리', '다비데 프라테시', '로렌초 펠레그리니', '마누엘 로카텔리'],
    FW: ['마테오 레테기', '모이스 킨', '페데리코 키에사', '자코모 라스파도리'],
  },
  일본: {
    GK: ['스즈키 자이온', '오사코 게이스케'],
    DF: ['도미야스 다케히로', '이타쿠라 고', '스가와라 유키나리', '마치다 고키', '다니구치 쇼고'],
    MF: ['엔도 와타루', '모리타 히데마사', '가마다 다이치', '미나미노 다쿠미', '도안 리츠'],
    FW: ['미토마 가오루', '쿠보 다케후사', '우에다 아야세', '이토 준야', '마에다 다이젠'],
  },
  미국: {
    GK: ['매트 터너', '에단 호바스'],
    DF: ['안토니 로빈슨', '크리스 리처즈', '팀 림', '세르지뇨 데스트', '조 스컬리'],
    MF: ['웨스턴 맥케니', '유누스 무사', '타일러 아담스', '조반니 레이나', '조니 카르도소'],
    FW: ['크리스티안 풀리식', '플로리안 발로군', '티모시 웨아', '리카르도 페피'],
  },
};

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

export function buildOpponent({ seed, name, strength, formation, tactics, isNationalTeam = false }) {
  const rng = createRng(`opp:${seed}`);
  const chosenFormation = formation || rng.pick(FORMATION_CODES);
  const slots = getFormationSlots(chosenFormation, 'HOME');

  const clubStr = String(name || '').trim();
  const nationalMatchKey = Object.keys(NATIONAL_TEAM_SQUADS).find((k) => clubStr.includes(k) || k.includes(clubStr));
  const crawledMatchKey = Object.keys(CRAWLED_TEAM_ROSTERS).find((k) => clubStr.includes(k) || k.includes(clubStr));
  const builtinMatchKey = Object.keys(BUILTIN_CLUB_SQUADS).find((k) => clubStr.includes(k) || k.includes(clubStr));

  const customSquad =
    (nationalMatchKey && NATIONAL_TEAM_SQUADS[nationalMatchKey]) ||
    (crawledMatchKey && CRAWLED_TEAM_ROSTERS[crawledMatchKey]) ||
    (builtinMatchKey && BUILTIN_CLUB_SQUADS[builtinMatchKey]) ||
    null;

  const isWorldCupNation = Boolean(nationalMatchKey || isNationalTeam || String(seed).startsWith('wg:') || String(seed).startsWith('WK:'));
  const usedNames = new Set();

  const pickUniqueRealName = (position, role) => {
    const strictPos = ['GK', 'DF', 'MF', 'FW'].includes(position) ? position : 'MF';
    const primaryPool = customSquad?.[strictPos] || [];
    for (const candidate of primaryPool) {
      if (!usedNames.has(candidate)) {
        usedNames.add(candidate);
        return candidate;
      }
    }
    // 국가대표팀인데 사전에 없는 신흥 국가일 경우 다른 나라 선수가 섞이지 않도록 국가명 소속 선수로 표기
    if (isWorldCupNation) {
      const natMemberName = `${clubStr} ${role || strictPos} 대표 #${usedNames.size + 1}`;
      usedNames.add(natMemberName);
      return natMemberName;
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
    const ovr = Math.max(45, Math.min(97, (strength || 75) + rng.int(-2, 2)));
    const playerName = pickUniqueRealName(position, role);
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
    offsideTrap: rng.next() < 0.35 ? 'ON' : 'OFF',
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