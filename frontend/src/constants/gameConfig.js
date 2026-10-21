/**
 * 프론트엔드 전용 게임 표시/규칙 상수. 서버(backend/src/constants/clubRules.js, competitionRules.js)와 값이 일치해야 합니다.
 */

export const EMBLEM_ICONS = ['🦁', '🐺', '🦅', '🐉', '⚡', '🔥', '🛡️', '⭐', '👑', '🐯', '🦈', '🌊'];
export const EMBLEM_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#ca8a04', '#9333ea', '#0891b2', '#ea580c', '#475569'];

export const RARITY_META = Object.freeze({
  LEGEND: { key: 'LEGEND', label: 'LEGEND', badge: 'border-amber-300 bg-amber-400/20 text-amber-200', card: 'border-amber-400/70 bg-gradient-to-br from-amber-900/40 to-slate-900', glow: 'shadow-amber-500/30' },
  EPIC: { key: 'EPIC', label: 'EPIC', badge: 'border-purple-400 bg-purple-500/20 text-purple-200', card: 'border-purple-400/60 bg-gradient-to-br from-purple-900/40 to-slate-900', glow: 'shadow-purple-500/30' },
  RARE: { key: 'RARE', label: 'RARE', badge: 'border-sky-400 bg-sky-500/20 text-sky-200', card: 'border-sky-400/60 bg-gradient-to-br from-sky-900/40 to-slate-900', glow: 'shadow-sky-500/20' },
  COMMON: { key: 'COMMON', label: 'COMMON', badge: 'border-slate-500 bg-slate-600/20 text-slate-300', card: 'border-slate-600 bg-slate-800/70', glow: 'shadow-slate-500/10' },
});

export const POSITION_LABELS = Object.freeze({ GK: '골키퍼', DF: '수비수', MF: '미드필더', FW: '공격수' });

/** 포지션 훈련으로 습득할 수 있는 세부 포지션 (골키퍼 불가) */
export const ROLE_OPTIONS = Object.freeze({
  DF: ['CB', 'LB', 'RB', 'LWB', 'RWB'],
  MF: ['CDM', 'CM', 'CAM', 'LM', 'RM'],
  FW: ['ST', 'LW', 'RW'],
});

export const TRAINING_RULES = Object.freeze({
  MAX_LEVEL: 20,
  FAIL_GAUGE: 12,
  POSITION_TRAIN_COST: 2500,
  MEDICAL_COST_PER_POINT: 6,
  ALL_DISCOUNT: 0.9,
  /**
   * 레벨업 비용(골드)
   * @param {number} level 현재 레벨
   * @returns {number}
   */
  levelUpCost: (level) => 500 + level * 400,
  /**
   * 레벨업 성공 확률(0~1)
   * @param {number} level 현재 레벨
   * @param {number} gauge 보너스 게이지(0~100)
   * @returns {number}
   */
  successRate: (level, gauge) => (gauge >= 100 ? 1 : Math.min(1, Math.max(0.2, 0.95 - level * 0.05) + gauge * 0.005)),
});

export const MODE_META = Object.freeze({
  LEAGUE: { key: 'LEAGUE', icon: '🏟️', title: '프로 리그 커리어 모드', desc: '10팀 더블 라운드로빈 18라운드. 시즌 종료 후 상위 2팀은 승격, 하위 2팀은 강등됩니다.', accent: 'from-emerald-600/30 to-emerald-900/20 border-emerald-500/50' },
  CHAMPIONS_CUP: { key: 'CHAMPIONS_CUP', icon: '🏆', title: '챔피언스 컵 토너먼트', desc: '16강부터 시작하는 단판 녹아웃. 무승부 시 연장전과 승부차기로 승자를 가립니다.', accent: 'from-amber-600/30 to-amber-900/20 border-amber-500/50' },
  WORLD_CUP: { key: 'WORLD_CUP', icon: '🌍', title: '월드컵 (조별리그 + 토너먼트)', desc: '4개 조 조별리그 3경기 후 각 조 상위 2팀이 8강 토너먼트로 진출합니다.', accent: 'from-sky-600/30 to-sky-900/20 border-sky-500/50' },
  CHALLENGE_TOWER: { key: 'CHALLENGE_TOWER', icon: '🗼', title: '시나리오 챌린지 타워', desc: '위기 상황에서 시작하는 5개 스테이지. 목표를 달성하면 큰 보상을 받습니다.', accent: 'from-purple-600/30 to-purple-900/20 border-purple-500/50' },
  RANKED: { key: 'RANKED', icon: '⚔️', title: '시뮬레이션 랭크 매치', desc: '브론즈부터 챌린저까지. 승리하면 RP 를 얻고 티어가 올라갑니다.', accent: 'from-rose-600/30 to-rose-900/20 border-rose-500/50' },
});

export const MODE_ORDER = ['LEAGUE', 'CHAMPIONS_CUP', 'WORLD_CUP', 'CHALLENGE_TOWER', 'RANKED'];

export const OUTCOME_META = Object.freeze({
  WIN: { label: '승리', className: 'text-yellow-300', bg: 'from-yellow-600/30 to-slate-900 border-yellow-500/60' },
  DRAW: { label: '무승부', className: 'text-slate-200', bg: 'from-slate-600/30 to-slate-900 border-slate-500/60' },
  LOSE: { label: '패배', className: 'text-rose-300', bg: 'from-rose-700/30 to-slate-900 border-rose-500/60' },
});

/**
 * 숫자를 천 단위 구분 문자열로 변환합니다.
 * @param {number|null|undefined} value
 * @returns {string}
 */
export function formatNumber(value) {
  return Number(value || 0).toLocaleString('ko-KR');
}
