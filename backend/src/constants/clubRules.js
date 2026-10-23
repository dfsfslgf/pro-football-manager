/** 구단 운영(경제/훈련/이적/스폰서/퀘스트/스카우트) 규칙 상수 */

export const INITIAL_GRANT = Object.freeze({ gold: 15000, cashFree: 500, cashPaid: 0 });

/**
 * [요구사항 14번 해결] 창단 시 지급하는 22명 (선발 11명 + 벤치 후보 최대 11명 지원)
 */
export const STARTER_PLAN = Object.freeze({
  formation: '4-3-3',
  starters: [
    ['GK', 'GK'],
    ['DF', 'LB'],
    ['DF', 'CB'],
    ['DF', 'CB'],
    ['DF', 'RB'],
    ['MF', 'CM'],
    ['MF', 'CM'],
    ['MF', 'CAM'],
    ['FW', 'LW'],
    ['FW', 'ST'],
    ['FW', 'RW'],
  ],
  bench: [
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
  ],
});

export const EMBLEM_ICONS = Object.freeze(['🦁', '🐺', '🦅', '🐉', '⚡', '🔥', '🛡️', '⭐', '👑', '🐯', '🦈', '🌊', '🐓', '⛵', '🔱', '💣']);

/**
 * [요구사항 9번 해결] 모든 스카우트 패키지(공격/미드 저격, 수비/골키퍼 저격, 골드 기본 스카우트)에 1회 및 10연차(10% 할인) 완벽 적용!
 */
export const SCOUT_PACKAGES = Object.freeze({
  PREMIUM_ALL: {
    key: 'PREMIUM_ALL',
    label: '전체 포지션 프리미엄 스카우트',
    positions: null,
    currency: 'CASH',
    costs: { 1: 100, 10: 900 },
  },
  ATK_MID: {
    key: 'ATK_MID',
    label: '공격수/미드필더 저격 스카우트',
    positions: ['FW', 'MF'],
    currency: 'CASH',
    costs: { 1: 150, 10: 1350 },
  },
  DEF_GK: {
    key: 'DEF_GK',
    label: '수비수/골키퍼 저격 스카우트',
    positions: ['DF', 'GK'],
    currency: 'CASH',
    costs: { 1: 150, 10: 1350 },
  },
  GOLD_BASIC: {
    key: 'GOLD_BASIC',
    label: '골드 기본 스카우트',
    positions: null,
    currency: 'GOLD',
    costs: { 1: 2000, 10: 18000 },
  },
});

export const RARITY_BY_WEIGHT = Object.freeze([
  { rarity: 'LEGEND', maxWeight: 3 },
  { rarity: 'EPIC', maxWeight: 12 },
  { rarity: 'RARE', maxWeight: 40 },
  { rarity: 'COMMON', maxWeight: Infinity },
]);

export const TRAINING = Object.freeze({
  MAX_LEVEL: 20,
  levelUpCost: (level) => 500 + level * 400,
  successRate: (level, gauge) => Math.min(1, Math.max(0.2, 0.95 - level * 0.05) + gauge * 0.005),
  FAIL_GAUGE: 12,
  POSITION_TRAIN_COST: 2500,
  MEDICAL_COST_PER_POINT: 6,
  ALL_DISCOUNT: 0.9,
  REST_RECOVERY_RATIO: 0.65,
});

export const MARKET = Object.freeze({
  LISTING_COUNT: 8,
  price: (ovr) => Math.round((Math.max(ovr, 41) - 40) ** 2 * 10),
  releaseRefund: (price, level) => Math.round(price * 0.4 * (1 + (level - 1) * 0.1)),
  MAX_ROSTER: 200,
  MIN_ROSTER: 18,
});

export const SPONSORS = Object.freeze({
  BASIC: {
    key: 'BASIC',
    tier: 'Tier 1 · 로컬',
    desc: '연고지 소상공인 연합 후원 (조건 없음)',
    label: '동네 상점 연합',
    matchFee: 600,
    winBonus: 1000,
    requirement: { wins: 0 },
  },
  REGIONAL: {
    key: 'REGIONAL',
    tier: 'Tier 2 · 지역 기업',
    desc: '수도권 중견 물류·유통 그룹 파트너십',
    label: '지역 기업 파트너십',
    matchFee: 900,
    winBonus: 1600,
    requirement: { wins: 3 },
  },
  FINTECH: {
    key: 'FINTECH',
    tier: 'Tier 3 · 금융/핀테크',
    desc: '디지털 인터넷 뱅킹 공식 스폰서십',
    label: '네오 핀테크 뱅크',
    matchFee: 1250,
    winBonus: 2200,
    requirement: { wins: 8 },
  },
  GLOBAL: {
    key: 'GLOBAL',
    tier: 'Tier 4 · 글로벌 브랜드',
    desc: '월드와이드 스포츠 용품 & 스트리밍 빅딜',
    label: '글로벌 스포츠 브랜드',
    matchFee: 1650,
    winBonus: 3000,
    requirement: { wins: 15 },
  },
  AIRLINES: {
    key: 'AIRLINES',
    tier: 'Tier 5 · 메가 항공사',
    desc: '유럽·중동 국영 항공사 유니폼 메인 스폰서',
    label: '콘티넨탈 항공 그룹',
    matchFee: 2200,
    winBonus: 4000,
    requirement: { wins: 25 },
  },
  MEGA_TECH: {
    key: 'MEGA_TECH',
    tier: 'Tier 6 · 글로벌 빅테크',
    desc: '실리콘밸리 AI 클라우드 엔터프라이즈 최상위 딜',
    label: '실리콘밸리 AI 빅테크',
    matchFee: 3000,
    winBonus: 5500,
    requirement: { wins: 40 },
  },
});

export const MATCH_REWARDS = Object.freeze({
  gold: { WIN: 1800, DRAW: 900, LOSE: 450 },
  expAppearance: 22,
  expGoal: 18,
  expAssist: 12,
  expWin: 12,
});

export const DAILY_QUESTS = Object.freeze({
  PLAY_MATCH: { key: 'PLAY_MATCH', label: '오늘 경기 1회 플레이', target: 1, reward: { gold: 600 } },
  WIN_MATCH: { key: 'WIN_MATCH', label: '오늘 경기 1회 승리', target: 1, reward: { gold: 1000 } },
  SCORE_GOALS: { key: 'SCORE_GOALS', label: '오늘 3골 득점', target: 3, reward: { gold: 800 } },
  TRAIN_PLAYER: { key: 'TRAIN_PLAYER', label: '선수 강화 1회 시도', target: 1, reward: { gold: 600 } },
  SCOUT_ONCE: { key: 'SCOUT_ONCE', label: '스카우트 1회 진행', target: 1, reward: { cashFree: 15 } },
});

/**
 * [요구사항 11번 해결] 단계별(Step-by-Step) 다각화 업적 시스템 (승리 / 득점 / 경기수 / 선수단 수집 단계별 보상)
 */
export const ACHIEVEMENTS = Object.freeze({
  WINS_5: { key: 'WINS_5', label: '[승리 1단계] 통산 5승 달성', target: 5, metric: 'wins', reward: { gold: 2500, cashFree: 15 } },
  WINS_10: { key: 'WINS_10', label: '[승리 2단계] 통산 10승 달성', target: 10, metric: 'wins', reward: { gold: 5000, cashFree: 30 } },
  WINS_25: { key: 'WINS_25', label: '[승리 3단계] 통산 25승 달성', target: 25, metric: 'wins', reward: { gold: 12000, cashFree: 80 } },
  WINS_50: { key: 'WINS_50', label: '[승리 4단계] 통산 50승 금자탑', target: 50, metric: 'wins', reward: { gold: 25000, cashFree: 200 } },
  WINS_100: { key: 'WINS_100', label: '[승리 5단계] 전설의 명장 100승', target: 100, metric: 'wins', reward: { gold: 60000, cashFree: 500 } },

  GOALS_20: { key: 'GOALS_20', label: '[득점 1단계] 구단 통산 20골 폭격', target: 20, metric: 'goals', reward: { gold: 2000, cashFree: 20 } },
  GOALS_50: { key: 'GOALS_50', label: '[득점 2단계] 구단 통산 50골 돌파', target: 50, metric: 'goals', reward: { gold: 6000, cashFree: 60 } },
  GOALS_100: { key: 'GOALS_100', label: '[득점 3단계] 구단 통산 100골 달성', target: 100, metric: 'goals', reward: { gold: 15000, cashFree: 150 } },
  GOALS_250: { key: 'GOALS_250', label: '[득점 4단계] 무적 함대 250골 달성', target: 250, metric: 'goals', reward: { gold: 40000, cashFree: 350 } },

  PLAYERS_22: { key: 'PLAYERS_22', label: '[스쿼드 1단계] 더블 스쿼드 22명 구축', target: 22, metric: 'players', reward: { gold: 2000, cashFree: 10 } },
  PLAYERS_25: { key: 'PLAYERS_25', label: '[스쿼드 2단계] 선수단 25명 보유', target: 25, metric: 'players', reward: { gold: 4000, cashFree: 30 } },
  PLAYERS_35: { key: 'PLAYERS_35', label: '[스쿼드 3단계] 메가 클럽 35명 보유', target: 35, metric: 'players', reward: { gold: 10000, cashFree: 80 } },
});