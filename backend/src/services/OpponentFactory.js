import { getFormationSlots, FORMATION_CODES } from '../constants/formationCoords.js';
import { GAME_RULES } from '../constants/gameRules.js';
import { EMBLEM_ICONS } from '../constants/clubRules.js';
import { buildBaseStats } from '../models/seedData.js';
import { createRng } from '../utils/seededRandom.js';

/** 슬롯 라벨 -> 선호 세부 포지션 */
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
  ['DF', 'CB'],
  ['DF', 'RB'],
  ['MF', 'CM'],
  ['MF', 'CDM'],
  ['MF', 'CAM'],
  ['FW', 'ST'],
];

/**
 * 구단/국가별 실제 선수 로스터 매핑 (포지션별 실제 선수 배정)
 */
const CLUB_REAL_SQUADS = {
  '맨체스터 블루': {
    GK: ['에데르송', '슈테판 오르테가'],
    DF: ['후벵 디아스', '요슈코 그바르디올', '카일 워커', '마누엘 아칸지', '네이선 아케', '리코 루이스'],
    MF: ['로드리', '케빈 더 브라위너', '베르나르두 실바', '일카이 귄도안', '마테오 코바치치', '마테우스 누네스'],
    FW: ['엘링 홀란드', '필 포든', '제레미 도쿠', '사비뉴', '잭 그릴리시'],
  },
  '노스 런던 레드': {
    GK: ['다비드 라야', '네투'],
    DF: ['윌리엄 살리바', '가브리에우 마갈량이스', '벤 화이트', '율리엔 팀버', '리카르도 칼라피오리', '도미야스 다케히로'],
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
  '웨스트 런던 블루': {
    GK: ['로베르트 산체스', '필립 요르겐센'],
    DF: ['리바이 콜윌', '웨슬리 포파나', '리스 제임스', '마르크 쿠쿠렐라', '말로 귀스토', '토신 아다라비오요'],
    MF: ['콜 파머', '모이세스 카이세도', '엔소 페르난데스', '로메오 라비아', '키어넌 듀스버리홀'],
    FW: ['니콜라스 잭슨', '페드로 네투', '노니 마두에케', '크리스토퍼 은쿤쿠', '제이든 산초'],
  },
  '맨체스터 레드': {
    GK: ['안드레 오나나', '알타이 바인드르'],
    DF: ['리산드로 마르티네스', '마테이스 더 리흐트', '디오구 달로트', '누사이르 마즈라위', '해리 매과이어', '레니 요로'],
    MF: ['브루노 페르난데스', '코비 마이누', '마누엘 우가르테', '카세미루', '메이슨 마운트'],
    FW: ['라스무스 호일룬', '알레한드로 가르나초', '아마드 디알로', '마커스 래시포드', '조슈아 지르크지'],
  },
  '마드리드 화이트': {
    GK: ['티보 쿠르투아', '안드리 루닌'],
    DF: ['안토니오 뤼디거', '에데르 밀리탕', '다니 카르바할', '페를랑 멘디', '데이비드 알라바', '프란 가르시아'],
    MF: ['주드 벨링엄', '페데리코 발베르데', '오렐리앙 추아메니', '에두아르도 카마빙가', '루카 모드리치'],
    FW: ['킬리안 음바페', '비니시우스 주니오르', '호드리구', '브라힘 디아스', '엔드릭'],
  },
  '카탈루냐 블루레드': {
    GK: ['마르크안드레 테어 슈테겐', '이냐키 페냐'],
    DF: ['쥘 쿤데', '파우 쿠바르시', '이니고 마르티네스', '알레한드로 발데', '로날드 아라우호', '에릭 가르시아'],
    MF: ['페드리', '다니 올모', '마르크 카사도', '가비', '프렝키 더 용', '페르민 로페스'],
    FW: ['로베르트 레반도프스키', '라민 야말', '하피냐', '페란 토레스', '안수 파티'],
  },
  '뮌헨 레드': {
    GK: ['마누엘 노이어', '다니엘 페레츠'],
    DF: ['김민재', '다요 우파메카노', '알폰소 데이비스', '하파엘 게헤이루', '이토 히로키', '에릭 다이어'],
    MF: ['자말 무시알라', '조슈아 키미히', '알렉산다르 파블로비치', '레온 고레츠카', '콘라트 라이머'],
    FW: ['해리 케인', '마이클 올리세', '세르주 그나브리', '킹슬리 코망', '르로이 사네'],
  },
  '파리 블루레드': {
    GK: ['잔루이지 돈나룸마', '마트베이 사포노프'],
    DF: ['아슈라프 하키미', '마르키뉴스', '윌리안 파초', '누누 멘데스', '뤼카 에르난데스', '밀란 슈크리니아르'],
    MF: ['이강인', '비티냐', '주앙 네베스', '워렌 자이르에메리', '파비안 루이스'],
    FW: ['우스만 뎀벨레', '브래들리 바르콜라', '곤살루 하무스', '데지레 두에', '마르코 아센시오'],
  },
  '울산 블루타이거즈': {
    GK: ['조현우', '문정인'],
    DF: ['김영권', '황석호', '이명재', '강상우', '김기희', '심상민'],
    MF: ['고승범', '보야니치', '이청용', '김민혁', '아타루'],
    FW: ['주민규', '엄원상', '루빅손', '야고', '김지현'],
  },
};

/**
 * 포지션별 글로벌 실제 선수 풀 (특정 구단 매칭이 없을 때 중복 없이 추출)
 */
const GLOBAL_REAL_POOL_BY_POS = {
  GK: [
    '얀 오블라크', '얀 조머', '그레고르 코벨', '우나이 시몬', '조던 픽포드', '베른트 레노',
    '알렉스 메레트', '미케일 디그레고리오', '마르코 카르네세키', '루카스 슈발리에', '김승규', '이창근',
  ],
  DF: [
    '요나탄 타', '알레한드로 그리말도', '제레미 프림퐁', '니코 슐로터베크', '뱅자맹 파바르', '페데리코 디마르코',
    '테오 에르난데스', '피카요 토모리', '글레이송 브레메르', '알레산드로 부온조르노', '키어런 트리피어', '파우 토레스',
    '마크 게히', '안토니 로빈슨', '설영우', '이한범', '권경원', '조유민', '박진섭', '김문환', '김진수', '황재원',
  ],
  MF: [
    '플로리안 비르츠', '그라니트 자카', '사비 시몬스', '율리안 브란트', '니콜로 바렐라', '하칸 찰하노글루',
    '퇸 코프메이너르스', '스콧 맥토미니', '브루노 기마랑이스', '산드로 토날리', '유리 틸레만스', '에베레치 에제',
    '루카스 파케타', '모건 기브스화이트', '미토마 가오루', '이재성', '황인범', '배준호', '백승호', '홍현석',
    '정호연', '세징야', '제시 린가드', '이동경',
  ],
  FW: [
    '알렉산데르 이삭', '앤서니 고든', '올리 왓킨스', '자로드 보웬', '브라이언 음뵈모', '마테우스 쿠냐',
    '황희찬', '앙투안 그리에즈만', '훌리안 알바레스', '니코 윌리엄스', '쿠보 다케후사', '세르후 기라시',
    '빅토르 보니페이스', '로이스 오펜다', '마르쿠스 튀랑', '하파엘 레앙', '크리스티안 풀리식', '두산 블라호비치',
    '흐비차 크바라츠헬리아', '로멜루 루카쿠', '아데몰라 루크먼', '조나단 데이비드', '메이슨 그린우드', '리오넬 메시',
    '루이스 수아레스', '엄지성', '오현규', '조규성', '정상빈',
  ],
};

/**
 * 이름 문자열 해시로 구단 엠블럼 아이콘을 고릅니다.
 * @param {string} name
 * @returns {string}
 */
export function emblemFor(name) {
  let h = 0;
  for (const ch of String(name || 'FC')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return EMBLEM_ICONS[h % EMBLEM_ICONS.length];
}

/**
 * 시드 기반으로 AI 구단(선발 11 + 벤치 7, 포메이션, 팀 전술)을 실제 선수 이름으로 중복 없이 생성합니다.
 * @param {Object} params
 * @param {string} params.seed 결정론적 시드
 * @param {string} params.name 구단 이름
 * @param {number} params.strength 팀 종합 능력(대략 55~92)
 * @param {string} [params.formation] 지정하지 않으면 시드로 선택
 * @param {Object} [params.tactics] 팀 전술 덮어쓰기
 * @returns {{name:string, emblem:string, strength:number, formation:string, tactics:Object, starters:Object[], bench:Object[]}}
 */
export function buildOpponent({ seed, name, strength, formation, tactics }) {
  const rng = createRng(`opp:${seed}`);
  const chosenFormation = formation || rng.pick(FORMATION_CODES);
  const slots = getFormationSlots(chosenFormation, 'HOME');

  const matchedClubKey = Object.keys(CLUB_REAL_SQUADS).find((k) => String(name || '').includes(k));
  const customSquad = matchedClubKey ? CLUB_REAL_SQUADS[matchedClubKey] : null;
  const usedNames = new Set();

  const pickUniqueRealName = (position) => {
    const primaryPool = customSquad?.[position] || [];
    for (const candidate of primaryPool) {
      if (!usedNames.has(candidate)) {
        usedNames.add(candidate);
        return candidate;
      }
    }
    const globalPool = rng.shuffle(GLOBAL_REAL_POOL_BY_POS[position] || GLOBAL_REAL_POOL_BY_POS.MF);
    for (const candidate of globalPool) {
      if (!usedNames.has(candidate)) {
        usedNames.add(candidate);
        return candidate;
      }
    }
    const fallbackName = `${globalPool[0] || '알렉스'} #${usedNames.size + 1}`;
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