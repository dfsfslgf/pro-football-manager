/**
 * 포메이션별 11개 슬롯의 기본 좌표 (프론트엔드 formations.js 와 100% 동일하게 10종 지원)
 */

const slot = (role, label, baseX, baseY) => ({ role, label, baseX, baseY });
const withIndex = (slots) => Object.freeze(slots.map((s, slotIndex) => Object.freeze({ slotIndex, ...s })));

const GOALKEEPER = slot('GK', 'GK', 8, 50);
const BACK_FOUR = [
  slot('DF', 'LB', 25, 14),
  slot('DF', 'LCB', 22, 38),
  slot('DF', 'RCB', 22, 62),
  slot('DF', 'RB', 25, 86),
];

export const FORMATIONS = Object.freeze({
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
  '4-1-4-1': withIndex([
    GOALKEEPER,
    ...BACK_FOUR,
    slot('MF', 'CDM', 36, 50),
    slot('MF', 'LM', 55, 14),
    slot('MF', 'LCM', 54, 38),
    slot('MF', 'RCM', 54, 62),
    slot('MF', 'RM', 55, 86),
    slot('FW', 'ST', 81, 50),
  ]),
  '4-1-2-1-2': withIndex([
    GOALKEEPER,
    ...BACK_FOUR,
    slot('MF', 'CDM', 36, 50),
    slot('MF', 'LCM', 50, 28),
    slot('MF', 'RCM', 50, 72),
    slot('MF', 'CAM', 64, 50),
    slot('FW', 'LST', 80, 36),
    slot('FW', 'RST', 80, 64),
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
  '3-4-3': withIndex([
    GOALKEEPER,
    slot('DF', 'LCB', 22, 25),
    slot('DF', 'CB', 20, 50),
    slot('DF', 'RCB', 22, 75),
    slot('MF', 'LM', 48, 12),
    slot('MF', 'LCM', 46, 38),
    slot('MF', 'RCM', 46, 62),
    slot('MF', 'RM', 48, 88),
    slot('FW', 'LW', 76, 20),
    slot('FW', 'ST', 81, 50),
    slot('FW', 'RW', 76, 80),
  ]),
  '5-3-2': withIndex([
    GOALKEEPER,
    slot('DF', 'LWB', 28, 10),
    slot('DF', 'LCB', 21, 30),
    slot('DF', 'CB', 19, 50),
    slot('DF', 'RCB', 21, 70),
    slot('DF', 'RWB', 28, 90),
    slot('MF', 'LCM', 48, 30),
    slot('MF', 'CM', 45, 50),
    slot('MF', 'RCM', 48, 70),
    slot('FW', 'LST', 78, 36),
    slot('FW', 'RST', 78, 64),
  ]),
  '5-4-1': withIndex([
    GOALKEEPER,
    slot('DF', 'LWB', 27, 10),
    slot('DF', 'LCB', 21, 30),
    slot('DF', 'CB', 19, 50),
    slot('DF', 'RCB', 21, 70),
    slot('DF', 'RWB', 27, 90),
    slot('MF', 'LM', 50, 15),
    slot('MF', 'LCM', 47, 38),
    slot('MF', 'RCM', 47, 62),
    slot('MF', 'RM', 50, 85),
    slot('FW', 'ST', 80, 50),
  ]),
  '4-2-4': withIndex([
    GOALKEEPER,
    ...BACK_FOUR,
    slot('MF', 'LCM', 46, 36),
    slot('MF', 'RCM', 46, 64),
    slot('FW', 'LW', 74, 14),
    slot('FW', 'LST', 80, 38),
    slot('FW', 'RST', 80, 62),
    slot('FW', 'RW', 74, 86),
  ]),
});

export const FORMATION_CODES = Object.freeze(Object.keys(FORMATIONS));
export const DEFAULT_FORMATION = '4-3-3';

export function isValidFormation(code) {
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(FORMATIONS, code);
}

export function getFormationSlots(code, side = 'HOME') {
  const slots = FORMATIONS[isValidFormation(code) ? code : DEFAULT_FORMATION];
  return slots.map((s) => ({ ...s, baseX: side === 'AWAY' ? 100 - s.baseX : s.baseX }));
}