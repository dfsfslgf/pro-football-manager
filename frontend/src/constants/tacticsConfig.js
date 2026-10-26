/**
 * 전술, 체력, 포지션 적합도, 터치라인 지시 설정 모음
 */

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

export function normalizeRoleCode(code) {
  if (!code) return 'CM';
  return ROLE_ALIASES[code] || code;
}

/**
 * 포지션별 분당 체력 소모 계수 (풀백 및 윙백의 과도한 체력 소모 완화)
 */
export const POSITION_STAMINA_DRAIN_MULTIPLIER = Object.freeze({
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
  CAM: 0.68,
  CM: 0.72,
  LCM: 0.72,
  RCM: 0.72,
  LW: 0.72,
  RW: 0.72,
  LAM: 0.72,
  RAM: 0.72,
  LB: 0.66,
  RB: 0.66,
  LWB: 0.70,
  RWB: 0.70,
  LM: 0.70,
  RM: 0.70,
});

export const DEFAULT_POSITION_DRAIN = 0.66;

export function getPositionDrainMultiplier(slotRoleCode) {
  return POSITION_STAMINA_DRAIN_MULTIPLIER[slotRoleCode] || DEFAULT_POSITION_DRAIN;
}

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

const ADJACENT_CLASS_PAIRS = new Set([
  'CB|FB',
  'CB|DM',
  'DM|FB',
  'FB|WIDE',
  'CM|DM',
  'AM|CM',
  'CM|WIDE',
  'AM|WIDE',
  'AM|ST',
  'ST|WIDE',
]);

const GENERIC_NATURAL_CODES = {
  GK: ['GK'],
  DF: ['CB', 'LB', 'RB', 'LWB', 'RWB'],
  MF: ['CDM', 'CM', 'CAM', 'LM', 'RM'],
  FW: ['ST', 'LW', 'RW'],
};

function isAdjacentClass(a, b) {
  return ADJACENT_CLASS_PAIRS.has([a, b].sort().join('|'));
}

export function calculatePositionFamiliarity(naturalPos, assignedSlotRole, preferredRoleCode = null) {
  const slotClass = CLASS_OF[normalizeRoleCode(assignedSlotRole)] || 'CM';
  const rawCodes = (Array.isArray(preferredRoleCode) ? preferredRoleCode : [preferredRoleCode])
    .flatMap((c) => String(c || '').split(','))
    .map((s) => s.trim())
    .filter(Boolean);
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
  offsideTrap: {
    OFF: { lineOffset: 0, staminaMul: 1.0, trapBonus: 0 },
    ON: { lineOffset: 6, staminaMul: 1.04, trapBonus: 1 },
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
  offsideTrap: { OFF: '사용 안 함 (안전 커버)', ON: '트랩 가동 (일제 전진)' },
};

export function getTacticEffect(tactics, group) {
  const table = TEAM_TACTIC_EFFECTS[group];
  if (!table) return {};
  return table[tactics?.[group]] || table[DEFAULT_TEAM_TACTICS[group]] || {};
}

export function getTeamStaminaMod(tactics) {
  return (
    (getTacticEffect(tactics, 'tempo').staminaMul || 1) *
    (getTacticEffect(tactics, 'pressing').staminaMul || 1) *
    (getTacticEffect(tactics, 'offsideTrap').staminaMul || 1)
  );
}

export function summarizeTacticEffects(tactics) {
  const mentality = getTacticEffect(tactics, 'mentality');
  const passing = getTacticEffect(tactics, 'passingStyle');
  const tempo = getTacticEffect(tactics, 'tempo');
  const line = getTacticEffect(tactics, 'defensiveLine');
  const pressing = getTacticEffect(tactics, 'pressing');
  const stamina = getTeamStaminaMod(tactics);
  const possession = passing.possMul * line.possMul * pressing.possMul;
  const tone = (v, goodWhenHigh = true) =>
    Math.abs(v - 1) < 0.005 ? 'neutral' : (v > 1) === goodWhenHigh ? 'good' : 'bad';
  const x = (v) => `x${v.toFixed(2)}`;
  return [
    { label: '공격 득점 기회', value: x(mentality.atk), tone: tone(mentality.atk) },
    { label: '수비 안정성', value: x(mentality.def), tone: tone(mentality.def) },
    { label: '점유 경합', value: x(possession), tone: tone(possession) },
    { label: '롱볼 역습 찬스', value: x(passing.counterMul), tone: tone(passing.counterMul) },
    { label: '공격 장면 빈도', value: x(tempo.shotFreq), tone: tone(tempo.shotFreq) },
    { label: '캔버스 이동 속도', value: x(tempo.canvasSpeed), tone: 'neutral' },
    { label: '체력 소모', value: x(stamina), tone: tone(stamina, false) },
    { label: '오프사이드 트랩', value: tactics?.offsideTrap === 'ON' ? 'ON' : 'OFF', tone: 'neutral' },
  ];
}

const NEUTRAL_INSTRUCTION = {
  staminaMul: 1,
  atkMul: 1,
  defMul: 1,
  assistMul: 1,
  shootWeight: 1,
};

export const INSTRUCTION_DEFS = Object.freeze({
  BALANCED: { ...NEUTRAL_INSTRUCTION, label: '기본', desc: '팀 전술에 맞춰 기본 움직임을 유지함' },
  STAY_BACK: { ...NEUTRAL_INSTRUCTION, label: '후방 대기', desc: '수비 라인 유지, 수비 +5%', staminaMul: 0.78, defMul: 1.05, maxHomeX: 45 },
  OVERLAP: { ...NEUTRAL_INSTRUCTION, label: '적극 오버래핑', desc: '공격 시 측면 전진 및 크로스, 공격력 +10%', staminaMul: 1.04, atkMul: 1.1, advanceX: 22 },
  HOLD_POSITION: { ...NEUTRAL_INSTRUCTION, label: '자리 지키기', desc: '라인을 유지하며 수비 +5%', staminaMul: 0.82, defMul: 1.05, ballShift: 0.08 },
  STEP_UP: { ...NEUTRAL_INSTRUCTION, label: '스토퍼 압박', desc: '공 근처로 올라가 압박, 수비 +4%', staminaMul: 1.05, defMul: 1.04, stepUp: true },
  BOX_TO_BOX: { ...NEUTRAL_INSTRUCTION, label: '공수 왕복', desc: '공수 모두 가담함', staminaMul: 0.95, advanceX: 8, retreatX: 5 },
  HOLD_MIDFIELD: { ...NEUTRAL_INSTRUCTION, label: '포백 보호', desc: '수비 +12%, 라인 후퇴', staminaMul: 0.82, defMul: 1.12, retreatX: 6, advanceX: -4 },
  PLAYMAKER: { ...NEUTRAL_INSTRUCTION, label: '플레이메이커', desc: '어시스트 확률 +20%, 중앙 조율', staminaMul: 0.95, assistMul: 1.2, yPull: 0.4 },
  GET_FORWARD: { ...NEUTRAL_INSTRUCTION, label: '박스 침투', desc: '공격 시 박스 침투, 공격 +8%', staminaMul: 1.05, atkMul: 1.08, shootWeight: 1.25, advanceX: 14 },
  POACHER: { ...NEUTRAL_INSTRUCTION, label: '뒷공간 침투', desc: '라인 브레이커, 슈팅 비중 +35%', staminaMul: 0.88, shootWeight: 1.35, advanceX: 18 },
  CUT_INSIDE: { ...NEUTRAL_INSTRUCTION, label: '안쪽 파고들기', desc: '공격 시 중앙으로 이동, 공격 +4%', staminaMul: 0.96, atkMul: 1.04, yPull: 0.45 },
  STAY_WIDE: { ...NEUTRAL_INSTRUCTION, label: '측면 넓게', desc: '터치라인 쪽으로 넓게 벌림', staminaMul: 0.95, yPush: 0.4 },
  PRESS_FORWARD: { ...NEUTRAL_INSTRUCTION, label: '전방 압박', desc: '수비 시 전방 압박 가담', staminaMul: 1.1, pressForward: true },
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

export function getInstructionCategory(slotRoleCode) {
  const code = normalizeRoleCode(slotRoleCode);
  if (code === 'GK') return 'GOALKEEPER';
  if (code === 'CB') return 'CENTER_BACK';
  if (['LB', 'RB', 'LWB', 'RWB'].includes(code)) return 'FULLBACK';
  if (['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(code)) return 'MIDFIELDER';
  return 'FORWARD';
}

export function getDefaultInstruction(slotRoleCode) {
  return getInstructionCategory(slotRoleCode) === 'MIDFIELDER' ? 'BOX_TO_BOX' : 'BALANCED';
}

export function isValidInstruction(slotRoleCode, instruction) {
  return INSTRUCTIONS_BY_CATEGORY[getInstructionCategory(slotRoleCode)].includes(instruction);
}

export function getInstructionDef(instruction) {
  return INSTRUCTION_DEFS[instruction] || INSTRUCTION_DEFS.BALANCED;
}

export function estimateDrainPerMinute(player, tactics) {
  const teamMod = player.slotRoleCode === 'GK' ? 1.0 : getTeamStaminaMod(tactics);
  return 0.55 * getPositionDrainMultiplier(player.slotRoleCode) * teamMod * getInstructionDef(player.instruction).staminaMul;
}

export function getRoleCodes(player) {
  if (player.roleCodes && player.roleCodes.length > 0) return player.roleCodes;
  return player.preferredRoleCode ? [player.preferredRoleCode] : null;
}

export function applySlotToPlayer(player, slotDef) {
  const { familiarity, familiarityMultiplier } = calculatePositionFamiliarity(
    player.mainPosition,
    slotDef.label,
    getRoleCodes(player)
  );
  const instruction =
    player.instruction && isValidInstruction(slotDef.label, player.instruction)
      ? player.instruction
      : getDefaultInstruction(slotDef.label);
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

export function getSlotOf(player) {
  return {
    slotIndex: player.slotIndex,
    role: player.slotRoleGroup,
    label: player.slotRoleCode,
    baseX: player.baseX,
    baseY: player.baseY,
  };
}

export function assignPlayersByFamiliarity(players, slots) {
  const result = new Array(slots.length).fill(null);
  const pairs = [];
  players.forEach((p, pi) => {
    slots.forEach((s, si) => {
      pairs.push({
        pi,
        si,
        m: calculatePositionFamiliarity(p.mainPosition, s.label, getRoleCodes(p)).familiarityMultiplier,
      });
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

export const NEUTRAL_TALK_EFFECT = Object.freeze({ atkMul: 1, defMul: 1, possMul: 1, cardMul: 1, speedMul: 1 });

export const LOCKER_TALKS = Object.freeze({
  PASSIONATE: { label: '열정적 격려', desc: '공격력 및 이동 속도 +5% 상승' },
  STERN: { label: '강하게 질책', desc: '선수단 정신 무장, 공/수 집중력 +8% 상승' },
  CALM: { label: '침착함 강조', desc: '패스 및 수비 안정감 +6%, 반칙 확률 감소' },
});

/**
 * 경기 중 실시간 터치라인 감독 지시 옵션
 */
export const TOUCHLINE_SHOUTS = Object.freeze({
  ENCOURAGE: { key: 'ENCOURAGE', label: '격려하기', desc: '팀 사기 상승 및 전 포지션 평점/집중력 보너스', moraleBoost: 8, atkMul: 1.05, defMul: 1.05 },
  DEMAND_MORE: { key: 'DEMAND_MORE', label: '더 뛰어라', desc: '이동 속도 및 압박 강도 상승 (체력 소모 소폭 증가)', moraleBoost: 6, atkMul: 1.08, defMul: 1.06 },
  SHOOT_ON_SIGHT: { key: 'SHOOT_ON_SIGHT', label: '과감한 슈팅 지시', desc: '중거리 및 문전 슈팅 빈도 증가', moraleBoost: 5, atkMul: 1.12, defMul: 0.98 },
  TIGHTEN_UP: { key: 'TIGHTEN_UP', label: '수비 집중력 강화', desc: '수비 간격 유지 및 태클/헤딩 커팅 성공률 상승', moraleBoost: 5, atkMul: 0.96, defMul: 1.12 },
});

export function getTalkEffect(type, isEffective = true) {
  switch (type) {
    case 'PASSIONATE':
      return { ...NEUTRAL_TALK_EFFECT, atkMul: 1.05, speedMul: 1.05 };
    case 'STERN':
      return isEffective ? { ...NEUTRAL_TALK_EFFECT, atkMul: 1.08, defMul: 1.08 } : { ...NEUTRAL_TALK_EFFECT, atkMul: 1.03, defMul: 1.03 };
    case 'CALM':
      return { ...NEUTRAL_TALK_EFFECT, possMul: 1.06, defMul: 1.06, cardMul: 0.7 };
    default:
      return { ...NEUTRAL_TALK_EFFECT };
  }
}