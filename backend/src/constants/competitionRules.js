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

export const WORLD_CUP_NATIONS_META = Object.freeze([
  { code: 'MEX', name: '멕시코', confed: 'CONCACAF', pot: 1, strength: 82, hostGroup: 'A' },
  { code: 'CAN', name: '캐나다', confed: 'CONCACAF', pot: 1, strength: 80, hostGroup: 'B' },
  { code: 'USA', name: '미국', confed: 'CONCACAF', pot: 1, strength: 83, hostGroup: 'D' },
  { code: 'ESP', name: '스페인', confed: 'UEFA', pot: 1, strength: 91 },
  { code: 'FRA', name: '프랑스', confed: 'UEFA', pot: 1, strength: 92 },
  { code: 'ARG', name: '아르헨티나', confed: 'CONMEBOL', pot: 1, strength: 91 },
  { code: 'ENG', name: '잉글랜드', confed: 'UEFA', pot: 1, strength: 91 },
  { code: 'BRA', name: '브라질', confed: 'CONMEBOL', pot: 1, strength: 90 },
  { code: 'GER', name: '독일', confed: 'UEFA', pot: 1, strength: 89 },
  { code: 'POR', name: '포르투갈', confed: 'UEFA', pot: 1, strength: 89 },
  { code: 'NED', name: '네덜란드', confed: 'UEFA', pot: 1, strength: 87 },
  { code: 'ITA', name: '이탈리아', confed: 'UEFA', pot: 1, strength: 87 },

  { code: 'BEL', name: '벨기에', confed: 'UEFA', pot: 2, strength: 86 },
  { code: 'CRO', name: '크로아티아', confed: 'UEFA', pot: 2, strength: 85 },
  { code: 'SUI', name: '스위스', confed: 'UEFA', pot: 2, strength: 84 },
  { code: 'DEN', name: '덴마크', confed: 'UEFA', pot: 2, strength: 83 },
  { code: 'AUT', name: '오스트리아', confed: 'UEFA', pot: 2, strength: 83 },
  { code: 'TUR', name: '튀르키예', confed: 'UEFA', pot: 2, strength: 82 },
  { code: 'URU', name: '우루과이', confed: 'CONMEBOL', pot: 2, strength: 86 },
  { code: 'COL', name: '콜롬비아', confed: 'CONMEBOL', pot: 2, strength: 85 },
  { code: 'KOR', name: '대한민국', confed: 'AFC', pot: 2, strength: 84 },
  { code: 'JPN', name: '일본', confed: 'AFC', pot: 2, strength: 84 },
  { code: 'MAR', name: '모로코', confed: 'CAF', pot: 2, strength: 84 },
  { code: 'SEN', name: '세네갈', confed: 'CAF', pot: 2, strength: 83 },

  { code: 'UKR', name: '우크라이나', confed: 'UEFA', pot: 3, strength: 81 },
  { code: 'SWE', name: '스웨덴', confed: 'UEFA', pot: 3, strength: 81 },
  { code: 'POL', name: '폴란드', confed: 'UEFA', pot: 3, strength: 81 },
  { code: 'ECU', name: '에콰도르', confed: 'CONMEBOL', pot: 3, strength: 81 },
  { code: 'PAR', name: '파라과이', confed: 'CONMEBOL', pot: 3, strength: 80 },
  { code: 'CHI', name: '칠레', confed: 'CONMEBOL', pot: 3, strength: 79 },
  { code: 'NGA', name: '나이지리아', confed: 'CAF', pot: 3, strength: 82 },
  { code: 'EGY', name: '이집트', confed: 'CAF', pot: 3, strength: 81 },
  { code: 'CIV', name: '코트디부아르', confed: 'CAF', pot: 3, strength: 81 },
  { code: 'ALG', name: '알제리', confed: 'CAF', pot: 3, strength: 80 },
  { code: 'IRN', name: '이란', confed: 'AFC', pot: 3, strength: 80 },
  { code: 'AUS', name: '호주', confed: 'AFC', pot: 3, strength: 80 },

  { code: 'CMR', name: '카메룬', confed: 'CAF', pot: 4, strength: 79 },
  { code: 'GHA', name: '가나', confed: 'CAF', pot: 4, strength: 78 },
  { code: 'TUN', name: '튀니지', confed: 'CAF', pot: 4, strength: 78 },
  { code: 'KSA', name: '사우디아라비아', confed: 'AFC', pot: 4, strength: 78 },
  { code: 'QAT', name: '카타르', confed: 'AFC', pot: 4, strength: 77 },
  { code: 'UZB', name: '우즈베키스탄', confed: 'AFC', pot: 4, strength: 77 },
  { code: 'IRQ', name: '이라크', confed: 'AFC', pot: 4, strength: 76 },
  { code: 'CRC', name: '코스타리카', confed: 'CONCACAF', pot: 4, strength: 78 },
  { code: 'PAN', name: '파나마', confed: 'CONCACAF', pot: 4, strength: 77 },
  { code: 'JAM', name: '자메이카', confed: 'CONCACAF', pot: 4, strength: 76 },
  { code: 'HON', name: '온두라스', confed: 'CONCACAF', pot: 4, strength: 75 },
  { code: 'NZL', name: '뉴질랜드', confed: 'OFC', pot: 4, strength: 75 },
]);

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
  WORLD_CUP: WORLD_CUP_NATIONS_META.map((n) => n.name),
  RANKED: [
    '마드리드 화이트 AI', '맨체스터 블루 AI', '뮌헨 레드 AI', '노스이스트 런던 AI', '파리 블루레드 AI',
    '카탈루냐 블루레드 AI', '머지사이드 레드 AI', '롬바르디아 AI', '울산 타이거즈 AI', '마이애미 헤론즈 AI',
  ],
});