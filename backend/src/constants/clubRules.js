/** 구단 운영(경제/훈련/이적/스폰서/퀘스트/스카우트) 규칙 상수 */

export const INITIAL_GRANT = Object.freeze({ gold: 10000, cashFree: 500, cashPaid: 0 });

/** 창단 시 지급하는 18명의 (주 포지션, 세부 포지션) 구성. 앞 11명은 4-3-3 선발, 뒤 7명은 벤치. */
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
    ['MF', 'CM'],
    ['FW', 'LW'],
    ['FW', 'ST'],
    ['FW', 'RW'],
  ],
  bench: [
    ['GK', 'GK'],
    ['DF', 'CB'],
    ['DF', 'RB'],
    ['MF', 'CAM'],
    ['MF', 'CDM'],
    ['MF', 'LM'],
    ['FW', 'ST'],
  ],
});

export const EMBLEM_ICONS = Object.freeze(['🦁', '🐺', '🦅', '🐉', '⚡', '🔥', '🛡️', '⭐', '👑', '🐯', '🦈', '🌊']);

export const SCOUT_PACKAGES = Object.freeze({
  PREMIUM_ALL: { key: 'PREMIUM_ALL', label: '전체 포지션 프리미엄 스카우트', positions: null, currency: 'CASH', costs: { 1: 100, 10: 900 } },
  ATK_MID: { key: 'ATK_MID', label: '공격수/미드필더 저격 스카우트', positions: ['FW', 'MF'], currency: 'CASH', costs: { 1: 150 } },
  DEF_GK: { key: 'DEF_GK', label: '수비수/골키퍼 저격 스카우트', positions: ['DF', 'GK'], currency: 'CASH', costs: { 1: 150 } },
  GOLD_BASIC: { key: 'GOLD_BASIC', label: '골드 기본 스카우트', positions: null, currency: 'GOLD', costs: { 1: 2000 } },
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
  REST_RECOVERY_RATIO: 0.6,
});

export const MARKET = Object.freeze({
  LISTING_COUNT: 8,
  price: (ovr) => Math.round((Math.max(ovr, 41) - 40) ** 2 * 12),
  releaseRefund: (price, level) => Math.round(price * 0.35 * (1 + (level - 1) * 0.1)),
  MAX_ROSTER: 200,
  MIN_ROSTER: 18,
});

export const SPONSORS = Object.freeze({
  BASIC: { key: 'BASIC', label: '동네 상점 연합', matchFee: 500, winBonus: 1000, requirement: { wins: 0 } },
  REGIONAL: { key: 'REGIONAL', label: '지역 기업 파트너십', matchFee: 800, winBonus: 1500, requirement: { wins: 5 } },
  GLOBAL: { key: 'GLOBAL', label: '글로벌 스포츠 브랜드', matchFee: 1200, winBonus: 2500, requirement: { wins: 20 } },
});

export const MATCH_REWARDS = Object.freeze({
  gold: { WIN: 1500, DRAW: 700, LOSE: 300 },
  expAppearance: 20,
  expGoal: 15,
  expAssist: 10,
  expWin: 10,
});

export const DAILY_QUESTS = Object.freeze({
  PLAY_MATCH: { key: 'PLAY_MATCH', label: '오늘 경기 1회 플레이', target: 1, reward: { gold: 500 } },
  WIN_MATCH: { key: 'WIN_MATCH', label: '오늘 경기 1회 승리', target: 1, reward: { gold: 800 } },
  SCORE_GOALS: { key: 'SCORE_GOALS', label: '오늘 3골 득점', target: 3, reward: { gold: 700 } },
  TRAIN_PLAYER: { key: 'TRAIN_PLAYER', label: '선수 강화 1회 시도', target: 1, reward: { gold: 500 } },
  SCOUT_ONCE: { key: 'SCOUT_ONCE', label: '스카우트 1회 진행', target: 1, reward: { cashFree: 10 } },
});

export const ACHIEVEMENTS = Object.freeze({
  WINS_10: { key: 'WINS_10', label: '통산 10승 달성', target: 10, metric: 'wins', reward: { gold: 5000 } },
  GOALS_50: { key: 'GOALS_50', label: '구단 통산 50골', target: 50, metric: 'goals', reward: { gold: 5000, cashFree: 50 } },
  PLAYERS_25: { key: 'PLAYERS_25', label: '선수 25명 보유', target: 25, metric: 'players', reward: { gold: 3000 } },
});
