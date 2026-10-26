/**
 * 전술/체력/포지션 적합도 설정 모음. 서버(backend/src/constants/gameRules.js)의 상수와 동일한 값을 사용합니다.
 */

/* ------------------------------------------------------------------ */
/* 1. 세부 포지션 코드 & 포지션별 체력 소모 계수                          */
/* ------------------------------------------------------------------ */

/** 포메이션 슬롯 라벨(LCB, RDM ...)을 대표 세부 포지션 코드로 변환하기 위한 별칭 */
const ROLE_ALIASES = {
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

/**
 * 슬롯 라벨/선수 선호 포지션 코드를 대표 세부 포지션 코드로 정규화합니다.
 * @param {string|null|undefined} code 예: 'LCB', 'RDM', 'LW'
 * @returns {string} 예: 'CB', 'CDM', 'LW' (값이 없으면 'CM')
 */
export function normalizeRoleCode(code) {
  if (!code) return 'CM';
  return ROLE_ALIASES[code] || code;
}

export const POSITION_STAMINA_DRAIN_MULTIPLIER = Object.freeze({
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
});

export const DEFAULT_POSITION_DRAIN = 0.75;

/**
 * 슬롯 세부 포지션 코드에 해당하는 체력 소모 계수를 반환합니다.
 * @param {string} slotRoleCode
 * @returns {number}
 */
export function getPositionDrainMultiplier(slotRoleCode) {
  return POSITION_STAMINA_DRAIN_MULTIPLIER[slotRoleCode] || DEFAULT_POSITION_DRAIN;
}

/* ------------------------------------------------------------------ */
/* 2. 포지션 적합도                                                      */
/* ------------------------------------------------------------------ */

export const FAMILIARITY_META = Object.freeze({
  NATURAL: {
    key: 'NATURAL',
    multiplier: 1.0,
    label: '100% 적합',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/60',
    textClass: 'text-emerald-300',
    color: '#34d399',
  },
  ADEQUATE: {
    key: 'ADEQUATE',
    multiplier: 0.9,
    label: '-10% 타포지션',
    badgeClass: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/60',
    textClass: 'text-yellow-300',
    color: '#facc15',
  },
  UNFAMILIAR: {
    key: 'UNFAMILIAR',
    multiplier: 0.75,
    label: '-25% 부적합',
    badgeClass: 'bg-orange-500/20 text-orange-300 border-orange-500/60',
    textClass: 'text-orange-300',
    color: '#fb923c',
  },
  SEVERE: {
    key: 'SEVERE',
    multiplier: 0.4,
    label: '-60% 위험',
    badgeClass: 'bg-red-500/20 text-red-300 border-red-500/60',
    textClass: 'text-red-300',
    color: '#f87171',
  },
});

/** 세부 포지션 -> 같은 계열(자연스럽게 소화 가능한 그룹) */
const CLASS_OF = {
  GK: 'GK',
  CB: 'CB',
  LB: 'FB',
  RB: 'FB',
  LWB: 'FB',
  RWB: 'FB',
  CDM: 'DM',
  CM: 'CM',
  CAM: 'AM',
  LM: 'WIDE',
  RM: 'WIDE',
  LW: 'WIDE',
  RW: 'WIDE',
  ST: 'ST',
};

/** 인접(타포지션이지만 비교적 무리 없는) 계열 쌍 */
const ADJACENT_CLASS_PAIRS = new Set(['CB|FB', 'CB|DM', 'DM|FB', 'FB|WIDE', 'CM|DM', 'AM|CM', 'CM|WIDE', 'AM|WIDE', 'AM|ST', 'ST|WIDE']);

/** 세부 포지션이 없는 선수(DB 의 주 포지션만 있는 선수)가 자연스럽게 뛸 수 있는 세부 포지션 */
const GENERIC_NATURAL_CODES = {
  GK: ['GK'],
  DF: ['CB', 'LB', 'RB', 'LWB', 'RWB'],
  MF: ['CDM', 'CM', 'CAM', 'LM', 'RM'],
  FW: ['ST', 'LW', 'RW'],
};

/**
 * 두 계열이 인접한지 확인합니다.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function isAdjacentClass(a, b) {
  return ADJACENT_CLASS_PAIRS.has([a, b].sort().join('|'));
}

/**
 * 선수의 주 포지션과 배치된 슬롯 포지션의 적합도를 계산합니다.
 * - NATURAL(1.00): 같은 계열(예: LW 선수를 LW/RW/LM, CB 를 LCB/RCB 에 배치)
 * - ADEQUATE(0.90): 인접 계열(FW->CAM/LW, 풀백<->센터백, 중미 간 이동 등)
 * - UNFAMILIAR(0.75): 그 외 필드 포지션 간 이동 (FW->DF, DF->FW 등)
 * - SEVERE(0.40): 골키퍼와 필드 플레이어 간 교차 배치
 * @param {'GK'|'DF'|'MF'|'FW'} naturalPos 선수의 주 포지션(역할군)
 * @param {string} assignedSlotRole 배치된 슬롯의 세부 포지션 코드 (예: 'LCB', 'CAM')
 * @param {string|string[]|null} [preferredRoleCode=null] 선수의 자연스러운 세부 포지션(들) - 선호 포지션 + 훈련으로 습득한 보조 포지션 (없으면 역할군 기준)
 * @returns {{familiarity:'NATURAL'|'ADEQUATE'|'UNFAMILIAR'|'SEVERE', familiarityMultiplier:number}}
 */
export function calculatePositionFamiliarity(naturalPos, assignedSlotRole, preferredRoleCode = null) {
  const slotClass = CLASS_OF[normalizeRoleCode(assignedSlotRole)] || 'CM';
  const rawCodes = (Array.isArray(preferredRoleCode) ? preferredRoleCode : [preferredRoleCode]).filter(Boolean);
  const preferredCodes = rawCodes.map(normalizeRoleCode);
  const isGoalkeeper = naturalPos === 'GK' || preferredCodes.includes('GK');

  let level;
  if (isGoalkeeper !== (slotClass === 'GK')) {
    level = 'SEVERE';
  } else if (isGoalkeeper) {
    level = 'NATURAL';
  } else {
    const codes = preferredCodes.length ? preferredCodes : GENERIC_NATURAL_CODES[naturalPos] || ['CM'];
    const naturalClasses = [...new Set(codes.map((c) => CLASS_OF[c]))];
    if (naturalClasses.includes(slotClass)) level = 'NATURAL';
    else if (naturalClasses.some((c) => isAdjacentClass(c, slotClass))) level = 'ADEQUATE';
    else level = 'UNFAMILIAR';
  }
  return { familiarity: level, familiarityMultiplier: FAMILIARITY_META[level].multiplier };
}

/* ------------------------------------------------------------------ */
/* 3. 팀 세부 전술 5종                                                   */
/* ------------------------------------------------------------------ */

export const TEAM_TACTIC_GROUPS = [
  {
    key: 'mentality',
    label: '전술 성향',
    options: [
      { value: 'PARK_THE_BUS', label: '극단적 수비' },
      { value: 'DEFENSIVE', label: '수비형' },
      { value: 'BALANCED', label: '밸런스' },
      { value: 'ATTACKING', label: '공격형' },
      { value: 'ALL_OUT_ATTACK', label: '총공세' },
    ],
  },
  {
    key: 'passingStyle',
    label: '패스 & 빌드업',
    options: [
      { value: 'SHORT', label: '짧은 패스' },
      { value: 'MIXED', label: '혼합' },
      { value: 'DIRECT_LONG', label: '다이렉트 롱볼' },
    ],
  },
  {
    key: 'tempo',
    label: '경기 템포',
    options: [
      { value: 'SLOW', label: '느리게' },
      { value: 'NORMAL', label: '보통' },
      { value: 'FAST', label: '빠르게' },
    ],
  },
  {
    key: 'defensiveLine',
    label: '수비 라인',
    options: [
      { value: 'DEEP', label: '깊게' },
      { value: 'NORMAL', label: '보통' },
      { value: 'HIGH', label: '높게' },
    ],
  },
  {
    key: 'pressing',
    label: '압박 강도',
    options: [
      { value: 'LOW', label: '낮음' },
      { value: 'MEDIUM', label: '중간' },
      { value: 'HIGH', label: '게겐프레싱' },
    ],
  },
  {
      key: 'offsideTrap',
      label: '오프사이드 트랩',
      options: [
        { value: 'OFF', label: '사용 안 함 (안전 커버)' },
        { value: 'ON', label: '트랩 가동 (일제 전진)' },
      ],
    },  
];

export const DEFAULT_TEAM_TACTICS = {
  mentality: 'BALANCED',
  passingStyle: 'MIXED',
  tempo: 'NORMAL',
  defensiveLine: 'NORMAL',
  pressing: 'MEDIUM',
  offsideTrap: 'OFF',
};

/**
 * 팀 전술 옵션별 수치 효과.
 * atk/def: TAP/TDP 배율, lineOffset: 캔버스 라인 이동(공격 방향 +), possMul: 중원 장악력 배율,
 * counterMul: 롱볼 역습 찬스 배율, staminaMul: 체력 소모 배율, canvasSpeed: 이동 속도 배율,
 * shotFreq: 공격 장면 빈도 배율, pressers: 동시 압박 인원, foulMul: 파울 확률 배율, opponentAtkMul: 상대 공격력 배율
 */
export const TEAM_TACTIC_EFFECTS = Object.freeze({
  mentality: {
    PARK_THE_BUS: { atk: 0.6, def: 1.4, lineOffset: -10 },
    DEFENSIVE: { atk: 0.8, def: 1.2, lineOffset: -5 },
    BALANCED: { atk: 1.0, def: 1.0, lineOffset: 0 },
    ATTACKING: { atk: 1.2, def: 0.85, lineOffset: 5 },
    ALL_OUT_ATTACK: { atk: 1.45, def: 0.6, lineOffset: 10 },
  },
  passingStyle: {
    SHORT: { possMul: 1.15, counterMul: 1.0 },
    MIXED: { possMul: 1.0, counterMul: 1.0 },
    DIRECT_LONG: { possMul: 0.9, counterMul: 1.2 },
  },
  tempo: {
    SLOW: { staminaMul: 0.85, canvasSpeed: 0.9, shotFreq: 0.9 },
    NORMAL: { staminaMul: 1.0, canvasSpeed: 1.0, shotFreq: 1.0 },
    FAST: { staminaMul: 1.15, canvasSpeed: 1.25, shotFreq: 1.15 },
  },
  defensiveLine: {
    DEEP: { lineOffset: -10, possMul: 0.95, opponentAtkMul: 0.93 },
    NORMAL: { lineOffset: 0, possMul: 1.0, opponentAtkMul: 1.0 },
    HIGH: { lineOffset: 12, possMul: 1.04, opponentAtkMul: 1.08 },
  },
  pressing: {
    LOW: { staminaMul: 0.8, pressers: 0, foulMul: 0.8, opponentAtkMul: 1.05, possMul: 0.97 },
    MEDIUM: { staminaMul: 1.0, pressers: 1, foulMul: 1.0, opponentAtkMul: 1.0, possMul: 1.0 },
    HIGH: { staminaMul: 1.2, pressers: 3, foulMul: 1.5, opponentAtkMul: 0.92, possMul: 1.04 },
  },
});

export const TEAM_TACTIC_LABELS = {
  mentality: {
    PARK_THE_BUS: '극단적 수비',
    DEFENSIVE: '수비적',
    BALANCED: '균형',
    ATTACKING: '공격적',
    ALL_OUT_ATTACK: '총공세',
  },
  passingStyle: { SHORT: '짧은 패스', MIXED: '혼합', DIRECT_LONG: '직선적 롱패스' },
  tempo: { SLOW: '느림', NORMAL: '보통', FAST: '빠름' },
  defensiveLine: { DEEP: '깊숙이 내림', NORMAL: '보통', HIGH: '높게 올림' },
  pressing: { LOW: '낮음', MEDIUM: '보통', HIGH: '강한 압박' },
  offsideTrap: { OFF: '사용 안 함 (뒷공간 커버)', ON: '활성화 (라인 일제 전진)' }, 
};

/**
 * 팀 전술 객체에서 그룹별 효과 테이블 항목을 조회합니다. (알 수 없는 값은 기본값으로 대체)
 * @param {Object} tactics 팀 전술 { mentality, passingStyle, tempo, defensiveLine, pressing }
 * @param {'mentality'|'passingStyle'|'tempo'|'defensiveLine'|'pressing'} group
 * @returns {Object}
 */
export function getTacticEffect(tactics, group) {
  const table = TEAM_TACTIC_EFFECTS[group];
  return table[tactics?.[group]] || table[DEFAULT_TEAM_TACTICS[group]];
}

/**
 * 팀 전술에 의한 체력 소모 배율(템포 x 압박)을 반환합니다.
 * @param {Object} tactics
 * @returns {number}
 */
export function getTeamStaminaMod(tactics) {
  return getTacticEffect(tactics, 'tempo').staminaMul * getTacticEffect(tactics, 'pressing').staminaMul;
}

/**
 * 팀 전술 요약(UI 용 효과 목록)을 만듭니다.
 * @param {Object} tactics
 * @returns {Array<{label:string, value:string, tone:'good'|'bad'|'neutral'}>}
 */
export function summarizeTacticEffects(tactics) {
  const mentality = getTacticEffect(tactics, 'mentality');
  const passing = getTacticEffect(tactics, 'passingStyle');
  const tempo = getTacticEffect(tactics, 'tempo');
  const line = getTacticEffect(tactics, 'defensiveLine');
  const pressing = getTacticEffect(tactics, 'pressing');
  const stamina = getTeamStaminaMod(tactics);
  const possession = passing.possMul * line.possMul * pressing.possMul;
  const tone = (v, goodWhenHigh = true) => (Math.abs(v - 1) < 0.005 ? 'neutral' : (v > 1) === goodWhenHigh ? 'good' : 'bad');
  const x = (v) => `x${v.toFixed(2)}`;
  return [
    { label: '공격 득점 기회', value: x(mentality.atk), tone: tone(mentality.atk) },
    { label: '수비 안정성', value: x(mentality.def), tone: tone(mentality.def) },
    { label: '점유 경합', value: x(possession), tone: tone(possession) },
    { label: '롱볼 역습 찬스', value: x(passing.counterMul), tone: tone(passing.counterMul) },
    { label: '공격 장면 빈도', value: x(tempo.shotFreq), tone: tone(tempo.shotFreq) },
    { label: '캔버스 이동 속도', value: x(tempo.canvasSpeed), tone: 'neutral' },
    { label: '체력 소모(템포x압박)', value: x(stamina), tone: tone(stamina, false) },
    { label: '동시 압박 인원', value: `${pressing.pressers}명`, tone: 'neutral' },
    { label: '파울 확률', value: x(pressing.foulMul), tone: tone(pressing.foulMul, false) },
    { label: '상대 공격력(압박/라인)', value: x(pressing.opponentAtkMul * line.opponentAtkMul), tone: tone(pressing.opponentAtkMul * line.opponentAtkMul, false) },
  ];
}

/* ------------------------------------------------------------------ */
/* 4. 선수 개인 지침                                                     */
/* ------------------------------------------------------------------ */

const NEUTRAL_INSTRUCTION = {
  staminaMul: 1,
  atkMul: 1,
  defMul: 1,
  assistMul: 1,
  shootWeight: 1,
};

/**
 * 개인 지침별 효과.
 * advanceX: 팀 공격 시 전진 거리, retreatX: 팀 수비 시 후퇴 거리, maxHomeX: 자기 진영 기준 최대 전진 한계,
 * ballShift: 공 위치 쏠림 계수(기본 0.25), yPull: 중앙으로 y 를 당기는 비율, yPush: 터치라인 쪽으로 미는 비율,
 * pressForward/stepUp: 압박 가담 여부
 */
export const INSTRUCTION_DEFS = Object.freeze({
  BALANCED: { ...NEUTRAL_INSTRUCTION, label: '기본', desc: '팀 전술에 맞춰 기본 움직임을 유지합니다.' },
  STAY_BACK: { ...NEUTRAL_INSTRUCTION, label: '후방 대기', desc: 'X 45 이하 유지, 수비 +5%', staminaMul: 0.75, defMul: 1.05, maxHomeX: 45 },
  OVERLAP: { ...NEUTRAL_INSTRUCTION, label: '적극 오버래핑', desc: '공격 시 +25 전진, 공격력 +10%', staminaMul: 1.22, atkMul: 1.1, advanceX: 25 },
  HOLD_POSITION: { ...NEUTRAL_INSTRUCTION, label: '자리 지키기', desc: '라인을 유지하며 수비 +5%', staminaMul: 0.8, defMul: 1.05, ballShift: 0.08 },
  STEP_UP: { ...NEUTRAL_INSTRUCTION, label: '스토퍼 압박', desc: '공 근처로 올라가 압박, 수비 +4%', staminaMul: 1.1, defMul: 1.04, stepUp: true },
  BOX_TO_BOX: { ...NEUTRAL_INSTRUCTION, label: '공수 왕복', desc: '공수 모두 가담합니다.', advanceX: 8, retreatX: 5 },
  HOLD_MIDFIELD: { ...NEUTRAL_INSTRUCTION, label: '포백 보호', desc: '수비 +12%, 라인 후퇴', staminaMul: 0.82, defMul: 1.12, retreatX: 6, advanceX: -4 },
  PLAYMAKER: { ...NEUTRAL_INSTRUCTION, label: '플레이메이커', desc: '어시스트 확률 +20%, 중앙 유지', assistMul: 1.2, yPull: 0.4 },
  GET_FORWARD: { ...NEUTRAL_INSTRUCTION, label: '박스 침투', desc: '공격 시 +14 전진, 공격 +8%', staminaMul: 1.12, atkMul: 1.08, shootWeight: 1.25, advanceX: 14 },
  POACHER: { ...NEUTRAL_INSTRUCTION, label: '뒷공간 침투', desc: '라인 브레이커, 슈팅 비중 +35%', staminaMul: 0.85, shootWeight: 1.35, advanceX: 18 },
  CUT_INSIDE: { ...NEUTRAL_INSTRUCTION, label: '안쪽 파고들기', desc: '공격 시 중앙으로 이동, 공격 +4%', atkMul: 1.04, yPull: 0.45 },
  STAY_WIDE: { ...NEUTRAL_INSTRUCTION, label: '측면 넓게', desc: '터치라인 쪽으로 넓게 벌립니다.', yPush: 0.4 },
  PRESS_FORWARD: { ...NEUTRAL_INSTRUCTION, label: '전방 압박', desc: '수비 시 전방 압박 가담, 체력 소모 큼', staminaMul: 1.25, pressForward: true },
});

export const INSTRUCTIONS_BY_CATEGORY = Object.freeze({
  GOALKEEPER: ['BALANCED'],
  CENTER_BACK: ['BALANCED', 'HOLD_POSITION', 'STEP_UP'],
  FULLBACK: ['BALANCED', 'STAY_BACK', 'OVERLAP'],
  MIDFIELDER: ['BOX_TO_BOX', 'HOLD_MIDFIELD', 'PLAYMAKER', 'GET_FORWARD'],
  FORWARD: ['BALANCED', 'POACHER', 'CUT_INSIDE', 'STAY_WIDE', 'PRESS_FORWARD'],
});

export const CATEGORY_LABELS = Object.freeze({
  GOALKEEPER: '골키퍼',
  CENTER_BACK: '센터백',
  FULLBACK: '풀백/윙백',
  MIDFIELDER: '미드필더',
  FORWARD: '윙어/공격수',
});

/**
 * 슬롯 세부 포지션이 속한 개인 지침 카테고리를 반환합니다.
 * @param {string} slotRoleCode
 * @returns {'GOALKEEPER'|'CENTER_BACK'|'FULLBACK'|'MIDFIELDER'|'FORWARD'}
 */
export function getInstructionCategory(slotRoleCode) {
  const code = normalizeRoleCode(slotRoleCode);
  if (code === 'GK') return 'GOALKEEPER';
  if (code === 'CB') return 'CENTER_BACK';
  if (['LB', 'RB', 'LWB', 'RWB'].includes(code)) return 'FULLBACK';
  if (['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(code)) return 'MIDFIELDER';
  return 'FORWARD';
}

/**
 * 슬롯에 맞는 기본 개인 지침을 반환합니다. (미드필더는 BOX_TO_BOX, 그 외 BALANCED)
 * @param {string} slotRoleCode
 * @returns {string}
 */
export function getDefaultInstruction(slotRoleCode) {
  return getInstructionCategory(slotRoleCode) === 'MIDFIELDER' ? 'BOX_TO_BOX' : 'BALANCED';
}

/**
 * 해당 슬롯에서 선택 가능한 지침인지 검사합니다.
 * @param {string} slotRoleCode
 * @param {string} instruction
 * @returns {boolean}
 */
export function isValidInstruction(slotRoleCode, instruction) {
  return INSTRUCTIONS_BY_CATEGORY[getInstructionCategory(slotRoleCode)].includes(instruction);
}

/**
 * 개인 지침 효과 객체를 반환합니다.
 * @param {string} instruction
 * @returns {Object}
 */
export function getInstructionDef(instruction) {
  return INSTRUCTION_DEFS[instruction] || INSTRUCTION_DEFS.BALANCED;
}

/**
 * 선수 한 명의 1분당 예상 체력 소모량(기본 소모 평균 0.60 기준)을 계산합니다.
 * @param {{slotRoleCode:string, instruction:string}} player
 * @param {Object} tactics 팀 전술
 * @returns {number}
 */
export function estimateDrainPerMinute(player, tactics) {
  const teamMod = player.slotRoleCode === 'GK' ? 1.0 : getTeamStaminaMod(tactics);
  return 0.6 * getPositionDrainMultiplier(player.slotRoleCode) * teamMod * getInstructionDef(player.instruction).staminaMul;
}

/* ------------------------------------------------------------------ */
/* 5. 슬롯 배치 헬퍼                                                     */
/* ------------------------------------------------------------------ */

/**
 * 선수가 자연스럽게 뛸 수 있는 세부 포지션 코드 목록(선호 + 보조)을 반환합니다.
 * @param {{roleCodes?:string[], preferredRoleCode?:string|null}} player
 * @returns {string[]|null} 정보가 없으면 null (역할군 기준으로 판정)
 */
export function getRoleCodes(player) {
  if (player.roleCodes && player.roleCodes.length > 0) return player.roleCodes;
  return player.preferredRoleCode ? [player.preferredRoleCode] : null;
}

/**
 * 선수를 전술 슬롯에 배치한 새 객체를 만듭니다. 슬롯 메타데이터(slotIndex, slotRoleGroup, slotRoleCode, baseX, baseY)를
 * 설정하고 포지션 적합도를 재계산하며, 새 슬롯에 맞지 않는 개인 지침은 기본값으로 리셋합니다.
 * `role`, `label` 은 각각 slotRoleGroup, slotRoleCode 의 별칭입니다.
 * @param {Object} player 선수 객체 (mainPosition, preferredRoleCode, instruction ...)
 * @param {{slotIndex:number, role:string, label:string, baseX:number, baseY:number}} slotDef 포메이션 슬롯 정의
 * @returns {Object}
 */
export function applySlotToPlayer(player, slotDef) {
  const { familiarity, familiarityMultiplier } = calculatePositionFamiliarity(player.mainPosition, slotDef.label, getRoleCodes(player));
  const instruction = player.instruction && isValidInstruction(slotDef.label, player.instruction) ? player.instruction : getDefaultInstruction(slotDef.label);
  return {
    ...player,
    slotIndex: slotDef.slotIndex,
    slotRoleGroup: slotDef.role,
    slotRoleCode: slotDef.label,
    role: slotDef.role,
    label: slotDef.label,
    baseX: slotDef.baseX,
    baseY: slotDef.baseY,
    naturalPosition: player.mainPosition,
    familiarity,
    familiarityMultiplier,
    instruction,
  };
}

/**
 * 선수의 슬롯 메타데이터만 추출합니다.
 * @param {Object} player
 * @returns {{slotIndex:number, role:string, label:string, baseX:number, baseY:number}}
 */
export function getSlotOf(player) {
  return { slotIndex: player.slotIndex, role: player.slotRoleGroup, label: player.slotRoleCode, baseX: player.baseX, baseY: player.baseY };
}

/**
 * 선수 목록을 슬롯 목록에 포지션 적합도 기준으로 자동 배치합니다. (적합도가 높은 (선수, 슬롯) 쌍부터 그리디 배정)
 * @template T
 * @param {Array<T & {mainPosition:string, preferredRoleCode?:string}>} players
 * @param {Array<{label:string}>} slots
 * @returns {Array<T|null>} slots 와 같은 길이 (선수가 부족하면 null)
 */
export function assignPlayersByFamiliarity(players, slots) {
  const result = new Array(slots.length).fill(null);
  const pairs = [];
  players.forEach((p, pi) => {
    slots.forEach((s, si) => {
      pairs.push({ pi, si, m: calculatePositionFamiliarity(p.mainPosition, s.label, getRoleCodes(p)).familiarityMultiplier });
    });
  });
  pairs.sort((a, b) => b.m - a.m || a.si - b.si || a.pi - b.pi);
  const usedPlayers = new Set();
  const usedSlots = new Set();
  for (const { pi, si } of pairs) {
    if (usedPlayers.has(pi) || usedSlots.has(si)) continue;
    result[si] = players[pi];
    usedPlayers.add(pi);
    usedSlots.add(si);
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* 6. 하프타임 라커룸 토크                                               */
/* ------------------------------------------------------------------ */

export const NEUTRAL_TALK_EFFECT = Object.freeze({ atkMul: 1, defMul: 1, possMul: 1, cardMul: 1, speedMul: 1 });

export const LOCKER_TALKS = Object.freeze({
  PASSIONATE: { label: '🔥 열정적 격려', desc: '공격력/이동 속도 +5%' },
  STERN: { label: '⚡ 강하게 질책', desc: '지고 있을 때 집중력 +8% (공/수)' },
  CALM: { label: '🧊 침착함 강조', desc: '패스/수비 +6%, 카드 확률 -30%' },
});

/**
 * 라커룸 토크의 후반전 효과를 계산합니다.
 * @param {'PASSIONATE'|'STERN'|'CALM'} type
 * @param {boolean} isLosing 하프타임 현재 지고 있는지 여부
 * @returns {{atkMul:number, defMul:number, possMul:number, cardMul:number, speedMul:number}}
 */
export function getTalkEffect(type, isLosing) {
  switch (type) {
    case 'PASSIONATE':
      return { ...NEUTRAL_TALK_EFFECT, atkMul: 1.05, speedMul: 1.05 };
    case 'STERN':
      return isLosing ? { ...NEUTRAL_TALK_EFFECT, atkMul: 1.08, defMul: 1.08 } : { ...NEUTRAL_TALK_EFFECT };
    case 'CALM':
      return { ...NEUTRAL_TALK_EFFECT, possMul: 1.06, defMul: 1.06, cardMul: 0.7 };
    default:
      return { ...NEUTRAL_TALK_EFFECT };
  }
}
