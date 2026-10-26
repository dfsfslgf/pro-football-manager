/** 대회 모드 규칙 상수 (2026 월드컵 48개국 체제 반영) */

export const MODES = Object.freeze(['LEAGUE', 'CHAMPIONS_CUP', 'WORLD_CUP', 'CHALLENGE_TOWER', 'RANKED']);

export const MODE_LABELS = Object.freeze({
  LEAGUE: '프로 리그 커리어 모드',
  CHAMPIONS_CUP: '챔피언스 컵 토너먼트',
  WORLD_CUP: '2026 내셔널 월드컵 (48개국)',
  CHALLENGE_TOWER: '시나리오 챌린지 타워',
  RANKED: '시뮬레이션 랭크 매치',
});

export const LEAGUE = Object.freeze({
  TEAMS: 20,
  ROUNDS: 38,
  START_DIVISION: 1,
  STRENGTH_BASE: { 1: 80, 2: 74, 3: 68 },
  STRENGTH_SPREAD: 7,
  POINTS: { WIN: 3, DRAW: 1, LOSE: 0 },
  PROMOTE_RANK: 3,
  RELEGATE_RANK: 18,
  SEASON_REWARD: {
    1: { gold: 35000, cashFree: 350 },
    2: { gold: 18000, cashFree: 180 },
    3: { gold: 10000, cashFree: 100 },
    default: { gold: 3000, cashFree: 20 },
  },
});

export const CUP = Object.freeze({
  ROUND_NAMES: ['16강', '8강', '4강', '결승'],
  STRENGTH_RANGE: [74, 91],
  ROUND_WIN_REWARD: [
    { gold: 3000, cashFree: 15 },
    { gold: 6000, cashFree: 35 },
    { gold: 12000, cashFree: 80 },
    { gold: 35000, cashFree: 400 },
  ],
  ELIMINATED_REWARD: { gold: 1000, cashFree: 0 },
});

export const WORLD_CUP = Object.freeze({
  GROUPS: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'],
  STRENGTH_RANGE: [72, 92],
  KNOCKOUT_NAMES: ['32강', '16강', '8강', '4강', '결승'],
  GROUP_ADVANCE_REWARD: { gold: 4500, cashFree: 35 },
  KNOCKOUT_REWARD: [
    { gold: 5000, cashFree: 30 },
    { gold: 8000, cashFree: 50 },
    { gold: 14000, cashFree: 90 },
    { gold: 22000, cashFree: 150 },
    { gold: 50000, cashFree: 500 },
  ],
  ELIMINATED_REWARD: { gold: 1200, cashFree: 0 },
});

export const TOWER_STAGES = Object.freeze([
  {
    id: 1,
    title: '이스탄불의 기적',
    description: '후반 46분, 0:2로 지고 있는 상황에서 동점 또는 역전승을 거두세요.',
    startMinute: 45,
    scoreHome: 0,
    scoreAway: 2,
    homeRedCard: false,
    opponent: { name: '밀라노 레드블랙', strength: 72, tactics: { mentality: 'DEFENSIVE', defensiveLine: 'DEEP', pressing: 'LOW' } },
    objective: { type: 'NOT_LOSE', text: '무승부 이상' },
    reward: { gold: 4000, cashFree: 30 },
  },
  {
    id: 2,
    title: '수적 열세 극복',
    description: '센터백이 퇴장당해 10명인 채로 후반 60분부터 1:0 리드를 지키세요.',
    startMinute: 60,
    scoreHome: 1,
    scoreAway: 0,
    homeRedCard: true,
    opponent: { name: '마드리드 화이트', strength: 75, tactics: { mentality: 'ATTACKING', tempo: 'FAST', pressing: 'HIGH' } },
    objective: { type: 'WIN', text: '1:0 리드 지키기 (승리)' },
    reward: { gold: 6000, cashFree: 40 },
  },
  {
    id: 3,
    title: '골 가뭄 탈출',
    description: '후반 70분 0:0 상황에서 20분 안에 2골 차 이상으로 이기세요.',
    startMinute: 70,
    scoreHome: 0,
    scoreAway: 0,
    homeRedCard: false,
    opponent: { name: '마드리드 로히블랑코', strength: 76, tactics: { mentality: 'PARK_THE_BUS', defensiveLine: 'DEEP', pressing: 'LOW' } },
    objective: { type: 'WIN_MARGIN', margin: 2, text: '2골 차 이상 승리' },
    reward: { gold: 8000, cashFree: 60 },
  },
  {
    id: 4,
    title: '철벽 수비',
    description: '전반 30분, 강력한 총공세를 퍼붓는 상대를 무실점으로 막고 지지 마세요.',
    startMinute: 30,
    scoreHome: 0,
    scoreAway: 0,
    homeRedCard: false,
    opponent: { name: '뮌헨 레드', strength: 80, tactics: { mentality: 'ALL_OUT_ATTACK', tempo: 'FAST', pressing: 'HIGH' } },
    objective: { type: 'CLEAN_SHEET', text: '무실점 (패배 금지)' },
    reward: { gold: 10000, cashFree: 80 },
  },
  {
    id: 5,
    title: '챔피언의 품격',
    description: '90분 풀타임, 세계 최강 팀을 상대로 승리하세요.',
    startMinute: 0,
    scoreHome: 0,
    scoreAway: 0,
    homeRedCard: false,
    opponent: { name: '맨체스터 블루', strength: 86, tactics: { mentality: 'BALANCED', passingStyle: 'SHORT', pressing: 'HIGH' } },
    objective: { type: 'WIN', text: '승리' },
    reward: { gold: 20000, cashFree: 200 },
  },
]);

export const TOWER_REPEAT_REWARD = Object.freeze({ gold: 800, cashFree: 5 });

export const RANK_TIERS = Object.freeze([
  { key: 'BRONZE', label: '브론즈', minRp: 0, strength: 68 },
  { key: 'SILVER', label: '실버', minRp: 1000, strength: 73 },
  { key: 'GOLD', label: '골드', minRp: 1200, strength: 78 },
  { key: 'PLATINUM', label: '플래티넘', minRp: 1400, strength: 82 },
  { key: 'DIAMOND', label: '다이아', minRp: 1600, strength: 86 },
  { key: 'CHALLENGER', label: '챌린저', minRp: 1800, strength: 90 },
]);

export const RANKED = Object.freeze({
  START_RP: 1000,
  WIN_RP: 25,
  HIGHER_TIER_BONUS: 8,
  DRAW_RP: 3,
  LOSE_RP: -18,
  WIN_REWARD: { gold: 1000, cashFree: 10 },
});

/**
 * 2026 월드컵 본선 48개국 리스트 (유저 국가를 제외한 47개국 매칭 풀 포함)
 */
export const AI_CLUB_NAMES = Object.freeze({
  LEAGUE: [
    '맨체스터 블루', '노스 런던 레드', '머지사이드 레드', '노스이스트 런던', '웨스트 런던 블루',
    '맨체스터 레드', '타인사이드 블랙화이트', '버밍엄 클라렛', '서식스 시걸스', '이스트 런던 해머스',
    '사우스 런던 이글스', '템스 화이트', '미들랜즈 골드울브스', '웨스트 런던 비즈', '도싯 체리레드',
    '머지사이드 블루', '노팅엄 포레스트 레드', '레스터 폭스 블루', '서퍽 트랙터 블루', '사우스코스트 세인츠',
    '울산 블루타이거즈', '서울 블랙레드', '전북 그린워리어스', '포항 스틸레드', '수원 블루윙즈',
  ],
  CHAMPIONS_CUP: [
    '마드리드 화이트', '맨체스터 블루', '뮌헨 레드', '파리 블루레드', '롬바르디아 블루블랙',
    '카탈루냐 블루레드', '머지사이드 레드', '노스 런던 레드', '라인 레드블랙', '베스트팔렌 옐로우',
    '마드리드 로히블랑코', '밀라노 레드블랙', '피에몬테 블랙화이트', '노스이스트 런던', '나폴리 아주리',
  ],
  WORLD_CUP: [
    '대한민국', '아르헨티나', '프랑스', '잉글랜드', '브라질', '스페인', '독일', '포르투갈',
    '네덜란드', '이탈리아', '크로아티아', '벨기에', '우루과이', '콜롬비아', '일본', '모로코',
    '미국', '멕시코', '세네갈', '스위스', '덴마크', '오스트리아', '튀르키예', '우크라이나',
    '스웨덴', '폴란드', '세르비아', '나이지리아', '이집트', '코트디부아르', '알제리', '카메룬',
    '가나', '말리', '튀니지', '호주', '이란', '사우디아라비아', '카타르', '우즈베키스탄',
    '이라크', '캐나다', '코스타리카', '파나마', '자메이카', '에콰도르', '칠레', '파라과이',
  ],
  RANKED: [
    '마드리드 화이트 AI', '맨체스터 블루 AI', '뮌헨 레드 AI', '노스이스트 런던 AI', '파리 블루레드 AI',
    '카탈루냐 블루레드 AI', '머지사이드 레드 AI', '롬바르디아 AI', '울산 타이거즈 AI', '마이애미 헤론즈 AI',
  ],
});