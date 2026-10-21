/**
 * 게임 밸런스 상수 모음. 시뮬레이션/가챠 로직의 매직 넘버를 한곳에서 튜닝할 수 있도록 분리합니다.
 */
export const GAME_RULES = Object.freeze({
  GACHA_DEFAULT_COST: 100,
  MAX_PLAYER_INVENTORY: 200,
  STAMINA_DEBUFF_THRESHOLD: 30,
  PLAN_B_ROTATION_STAMINA: 25,
  TACTIC_MODIFIERS: Object.freeze({
    ATTACK: Object.freeze({ atk: 1.4, def: 0.6, staminaDrain: 1.2 }),
    BALANCE: Object.freeze({ atk: 1.0, def: 1.0, staminaDrain: 1.0 }),
    DEFENSE: Object.freeze({ atk: 0.7, def: 1.3, staminaDrain: 0.85 }),
  }),

  MATCH_MINUTES: 90,
  SQUAD_SIZE: 18,
  MIN_SQUAD_SIZE: 11,
  BENCH_SIZE: 7,
  FORMATION: Object.freeze({ GK: 1, DF: 4, MF: 3, FW: 3 }),
  MAX_SUBSTITUTIONS: 3,
  MIN_STAMINA: 5,
  PLAN_B_ROTATION_MINUTE: 65,
  ALL_IN_MINUTE: 80,
  HOME_ADVANTAGE: 1.05,
  SCENE_CHANCE: 0.26,
  FOUL_SCENE_CHANCE: 0.06,
  CARD_CHANCE: 0.45,
  GOAL_THRESHOLD: 1.08,

  LIVE_MATCH_MIN_DURATION_MS: 10000,
  LIVE_SESSION_TTL_MS: 3 * 60 * 60 * 1000,

  HALF_TIME_MINUTE: 45,
  BASE_TICK_DRAIN_MIN: 0.52,
  BASE_TICK_DRAIN_RANGE: 0.16,
  HALF_TIME_RECOVERY: Object.freeze({ RATIO: 0.25, MIN: 5, MAX: 12 }),

  /** 슬롯 세부 포지션별 분당 체력 소모 계수 (클라이언트 tacticsConfig.js 와 동일) */
  DEFAULT_POSITION_DRAIN: 0.75,
  POSITION_STAMINA_DRAIN_MULTIPLIER: Object.freeze({
    GK: 0.06,
    CB: 0.38,
    LCB: 0.38,
    RCB: 0.38,
    ST: 0.65,
    LST: 0.65,
    RST: 0.65,
    CDM: 0.68,
    LDM: 0.68,
    RDM: 0.68,
    CAM: 0.78,
    CM: 0.88,
    LCM: 0.88,
    RCM: 0.88,
    LW: 0.92,
    RW: 0.92,
    LAM: 0.92,
    RAM: 0.92,
    LB: 1.05,
    RB: 1.05,
    LWB: 1.18,
    RWB: 1.18,
    LM: 1.18,
    RM: 1.18,
  }),

  /** 포지션 적합도 능력치 배율 */
  POSITION_FAMILIARITY_MULTIPLIER: Object.freeze({ NATURAL: 1.0, ADEQUATE: 0.9, UNFAMILIAR: 0.75, SEVERE: 0.4 }),

  /** 팀 세부 전술 허용 값 및 체력 소모 배율 (템포 x 압박) */
  TEAM_TACTIC_OPTIONS: Object.freeze({
    mentality: Object.freeze(['PARK_THE_BUS', 'DEFENSIVE', 'BALANCED', 'ATTACKING', 'ALL_OUT_ATTACK']),
    passingStyle: Object.freeze(['SHORT', 'MIXED', 'DIRECT_LONG']),
    tempo: Object.freeze(['SLOW', 'NORMAL', 'FAST']),
    defensiveLine: Object.freeze(['DEEP', 'NORMAL', 'HIGH']),
    pressing: Object.freeze(['LOW', 'MEDIUM', 'HIGH']),
  }),
  TEAM_TACTIC_STAMINA_MULTIPLIER: Object.freeze({
    tempo: Object.freeze({ SLOW: 0.85, NORMAL: 1.0, FAST: 1.15 }),
    pressing: Object.freeze({ LOW: 0.8, MEDIUM: 1.0, HIGH: 1.2 }),
  }),

  /** 선수 개인 지침별 체력 소모 배율 */
  INSTRUCTION_STAMINA_MULTIPLIER: Object.freeze({
    BALANCED: 1.0,
    STAY_BACK: 0.75,
    OVERLAP: 1.22,
    HOLD_POSITION: 0.8,
    STEP_UP: 1.1,
    BOX_TO_BOX: 1.0,
    HOLD_MIDFIELD: 0.82,
    PLAYMAKER: 1.0,
    GET_FORWARD: 1.12,
    POACHER: 0.85,
    CUT_INSIDE: 1.0,
    STAY_WIDE: 1.0,
    PRESS_FORWARD: 1.25,
  }),

  LOCKER_TALK_OPTIONS: Object.freeze(['PASSIONATE', 'STERN', 'CALM']),
});
