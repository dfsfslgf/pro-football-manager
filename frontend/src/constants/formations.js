/**
 * 구장 좌표계: 가로 0~100, 세로 0~100 (%). 홈팀은 좌->우 공격 기준이며
 * 원정팀은 getFormationSlots(code, 'AWAY') 로 baseX 를 100 - x 로 대칭 변환합니다.
 */

/**
 * @param {'GK'|'DF'|'MF'|'FW'} role
 * @param {string} label
 * @param {number} baseX
 * @param {number} baseY
 * @returns {{role:string, label:string, baseX:number, baseY:number}}
 */
const slot = (role, label, baseX, baseY) => ({ role, label, baseX, baseY });

/**
 * 슬롯 배열에 slotIndex(0~10)를 부여합니다.
 * @param {Array<{role:string, label:string, baseX:number, baseY:number}>} slots
 * @returns {Array<{slotIndex:number, role:string, label:string, baseX:number, baseY:number}>}
 */
const withIndex = (slots) => slots.map((s, slotIndex) => ({ slotIndex, ...s }));

const GOALKEEPER = slot('GK', 'GK', 8, 50);
const BACK_FOUR = [
  slot('DF', 'LB', 25, 15),
  slot('DF', 'LCB', 22, 38),
  slot('DF', 'RCB', 22, 62),
  slot('DF', 'RB', 25, 85),
];

export const FORMATIONS = {
  '4-3-3': withIndex([
    GOALKEEPER,
    ...BACK_FOUR,
    slot('MF', 'LCM', 48, 25),
    slot('MF', 'CM', 45, 50),
    slot('MF', 'RCM', 48, 75),
    slot('FW', 'LW', 75, 18),
    slot('FW', 'ST', 80, 50),
    slot('FW', 'RW', 75, 82),
  ]),
  '4-4-2': withIndex([
    GOALKEEPER,
    ...BACK_FOUR,
    slot('MF', 'LM', 50, 15),
    slot('MF', 'LCM', 48, 38),
    slot('MF', 'RCM', 48, 62),
    slot('MF', 'RM', 50, 85),
    slot('FW', 'LST', 78, 35),
    slot('FW', 'RST', 78, 65),
  ]),
  '4-2-3-1': withIndex([
    GOALKEEPER,
    ...BACK_FOUR,
    slot('MF', 'LDM', 38, 35),
    slot('MF', 'RDM', 38, 65),
    slot('MF', 'LAM', 62, 20),
    slot('MF', 'CAM', 60, 50),
    slot('MF', 'RAM', 62, 80),
    slot('FW', 'ST', 82, 50),
  ]),
  '3-5-2': withIndex([
    GOALKEEPER,
    slot('DF', 'LCB', 22, 25),
    slot('DF', 'CB', 20, 50),
    slot('DF', 'RCB', 22, 75),
    slot('MF', 'LWB', 50, 10),
    slot('MF', 'LCM', 46, 32),
    slot('MF', 'CM', 42, 50),
    slot('MF', 'RCM', 46, 68),
    slot('MF', 'RWB', 50, 90),
    slot('FW', 'LST', 78, 35),
    slot('FW', 'RST', 78, 65),
  ]),
};

export const FORMATION_CODES = Object.keys(FORMATIONS);
export const DEFAULT_FORMATION = '4-3-3';

/**
 * 포메이션의 11개 슬롯을 팀 방향에 맞춰 반환합니다.
 * @param {string} code 포메이션 코드
 * @param {'HOME'|'AWAY'} [side='HOME'] 원정팀이면 baseX 를 100 - x 로 대칭
 * @returns {Array<{slotIndex:number, role:string, label:string, baseX:number, baseY:number}>}
 */
export function getFormationSlots(code, side = 'HOME') {
  const slots = FORMATIONS[code] || FORMATIONS[DEFAULT_FORMATION];
  return slots.map((s) => ({ ...s, baseX: side === 'AWAY' ? 100 - s.baseX : s.baseX }));
}

/**
 * 선수들을 슬롯에 자동 배치합니다. 1차로 주 포지션이 슬롯 역할과 같은 선수를 먼저 채우고,
 * 남는 슬롯은 남은 선수 순서대로 채웁니다. 선수가 부족하면 해당 슬롯은 null 입니다.
 * @template T
 * @param {Array<T & {mainPosition:string}>} players 배치할 선수 목록
 * @param {Array<{role:string}>} slots 대상 슬롯 목록
 * @returns {Array<T|null>} slots 와 같은 길이의 배열 (index = slotIndex)
 */
export function assignPlayersToSlots(players, slots) {
  const remaining = [...players];
  const result = new Array(slots.length).fill(null);
  slots.forEach((slotDef, i) => {
    const idx = remaining.findIndex((p) => p.mainPosition === slotDef.role);
    if (idx >= 0) result[i] = remaining.splice(idx, 1)[0];
  });
  slots.forEach((slotDef, i) => {
    if (!result[i] && remaining.length > 0) result[i] = remaining.shift();
  });
  return result;
}
