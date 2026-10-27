/**
 * 게임 밸런스 상수 모음 (교체 최대 5명, 벤치 후보 최대 11명 반영)
 */
export const GAME_RULES = Object.freeze({
  GACHA_DEFAULT_COST: 100,
  MAX_PLAYER_INVENTORY: 200,
  STAMINA_DEBUFF_THRESHOLD: 30,
  PLAN_B_ROTATION_STAMINA: 30,
  TACTIC_MODIFIERS: Object.freeze({
    ATTACK: Object.freeze({ atk: 1.4, def: 0.6, staminaDrain: 1.2 }),
    BALANCE: Object.freeze({ atk: 1.0, def: 1.0, staminaDrain: 1.0 }),
    DEFENSE: Object.freeze({ atk: 0.7, def: 1.3, staminaDrain: 0.85 }),
  }),

  MATCH_MINUTES: 90,
  SQUAD_SIZE: 22,
  MIN_SQUAD_SIZE: 11,
  BENCH_SIZE: 11,
  FORMATION: Object.freeze({ GK: 1, DF: 4, MF: 3, FW: 3 }),
  MAX_SUBSTITUTIONS: 5,
  MIN_STAMINA: 5,
  PLAN_B_ROTATION_MINUTE: 60,
  ALL_IN_MINUTE: 80,
  HOME_ADVANTAGE: 1.05,
  SCENE_CHANCE: 0.26,
  FOUL_SCENE_CHANCE: 0.04,
  CARD_CHANCE: 0.28,
  GOAL_THRESHOLD: 1.08,

  LIVE_MATCH_MIN_DURATION_MS: 3000,
  LIVE_SESSION_TTL_MS: 3 * 60 * 60 * 1000,

  HALF_TIME_MINUTE: 45,
  BASE_TICK_DRAIN_MIN: 0.52,
  BASE_TICK_DRAIN_RANGE: 0.16,
  HALF_TIME_RECOVERY: Object.freeze({ RATIO: 0.25, MIN: 5, MAX: 12 }),

  DEFAULT_POSITION_DRAIN: 0.68,
  POSITION_STAMINA_DRAIN_MULTIPLIER: Object.freeze({
    GK: 0.06,
    CB: 0.38,
    LCB: 0.38,
    RCB: 0.38,
    ST: 0.62,
    LST: 0.62,
    RST: 0.62,
    CDM: 0.64,
    LDM: 0.64,
    RDM: 0.64,
    CAM: 0.70,
    CM: 0.74,
    LCM: 0.74,
    RCM: 0.74,
    LW: 0.75,
    RW: 0.75,
    LAM: 0.75,
    RAM: 0.75,
    LB: 0.70,   
    RB: 0.70,  
    LWB: 0.76,  
    RWB: 0.76,  
    LM: 0.76,  
    RM: 0.76,  
  }),

  POSITION_FAMILIARITY_MULTIPLIER: Object.freeze({ NATURAL: 1.0, ADEQUATE: 0.9, UNFAMILIAR: 0.75, SEVERE: 0.4 }),
  
  TEAM_TACTIC_OPTIONS: Object.freeze({
    mentality: Object.freeze(['PARK_THE_BUS', 'DEFENSIVE', 'BALANCED', 'ATTACKING', 'ALL_OUT_ATTACK']),
    passingStyle: Object.freeze(['SHORT', 'MIXED', 'DIRECT_LONG']),
    tempo: Object.freeze(['SLOW', 'NORMAL', 'FAST']),
    defensiveLine: Object.freeze(['DEEP', 'NORMAL', 'HIGH']),
    pressing: Object.freeze(['LOW', 'MEDIUM', 'HIGH']),
    offsideTrap: Object.freeze(['OFF', 'ON']),
    cornerDefense: Object.freeze(['FULLBACKS', 'CDM_AND_FB', 'CENTERBACKS']),
    cornerKicker: Object.freeze(['BEST_PASSER', 'WINGER_CAM', 'FULLBACK']),
    freeKickKicker: Object.freeze(['BEST_SHOOTER', 'FORWARD', 'MIDFIELDER']),
  }),

  TEAM_TACTIC_STAMINA_MULTIPLIER: Object.freeze({
    tempo: Object.freeze({ SLOW: 0.85, NORMAL: 1.0, FAST: 1.15 }),
    pressing: Object.freeze({ LOW: 0.8, MEDIUM: 1.0, HIGH: 1.2 }),
  }),


  INSTRUCTION_STAMINA_MULTIPLIER: Object.freeze({
    BALANCED: 1.0,
    STAY_BACK: 0.75,
    OVERLAP: 1.06, 
    HOLD_POSITION: 0.8,
    STEP_UP: 1.05,
    BOX_TO_BOX: 0.95,
    HOLD_MIDFIELD: 0.82,
    PLAYMAKER: 0.95,
    GET_FORWARD: 1.05,
    POACHER: 0.85,
    CUT_INSIDE: 0.98,
    STAY_WIDE: 0.95,
    PRESS_FORWARD: 1.12,
  }),

  LOCKER_TALK_OPTIONS: Object.freeze(['PASSIONATE', 'STERN', 'CALM']),
});