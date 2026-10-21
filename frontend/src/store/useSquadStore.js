import { create } from 'zustand';
import { fetchLineup, saveLineup } from '../api/squadApi.js';
import { errorMessage } from '../api/client.js';
import { DEFAULT_FORMATION, FORMATIONS, getFormationSlots } from '../constants/formations.js';
import {
  DEFAULT_TEAM_TACTICS,
  FAMILIARITY_META,
  INSTRUCTION_DEFS,
  TEAM_TACTIC_GROUPS,
  TEAM_TACTIC_LABELS,
  applySlotToPlayer,
  assignPlayersByFamiliarity,
  getInstructionCategory,
  getSlotOf,
  isValidInstruction,
} from '../constants/tacticsConfig.js';
import { computeEffectiveStats } from '../utils/playerStats.js';

export function normalizePlayer(raw, side, backNumber) {
  const roleCodes = raw.roleCodes && raw.roleCodes.length ? raw.roleCodes : [raw.preferredRoleCode, raw.secondaryRoleCode].filter(Boolean);
  return {
    id: `${side}-${raw.userPlayerId}`,
    side,
    userPlayerId: raw.userPlayerId,
    playerId: raw.playerId,
    name: raw.name,
    mainPosition: raw.mainPosition,
    preferredRoleCode: raw.preferredRoleCode || null,
    secondaryRoleCode: raw.secondaryRoleCode || null,
    roleCodes,
    level: Number(raw.level || 1),
    exp: Number(raw.exp || 0),
    stamina: Number(raw.stamina ?? 100),
    baseStats: raw.baseStats || {},
    tags: raw.tags || [],
    rarity: raw.rarity || 'COMMON',
    overall: Number(raw.overall ?? 0),
    instruction: raw.instruction || null,
    stats: raw.stats || null,
    backNumber,
    effectiveStats: computeEffectiveStats(raw.baseStats, raw.level),
  };
}

function toStarter(player, slotDef) {
  return applySlotToPlayer({ ...player, currentStamina: player.stamina }, slotDef);
}

function toBenchPlayer(player) {
  return {
    ...player,
    slotIndex: null,
    slotRoleGroup: player.mainPosition,
    slotRoleCode: player.mainPosition,
    role: player.mainPosition,
    label: player.mainPosition,
    baseX: 50,
    baseY: 50,
    naturalPosition: player.mainPosition,
    familiarity: 'NATURAL',
    familiarityMultiplier: 1,
    currentStamina: player.stamina,
  };
}

function buildSquadState(data) {
  const formation = FORMATIONS[data.formation] ? data.formation : DEFAULT_FORMATION;
  const slots = getFormationSlots(formation);
  let number = 0;
  const normalize = (raw) => normalizePlayer(raw, 'HOME', ++number);
  const starterPlayers = data.starters.slice(0, 11).map(normalize);
  const bench = data.bench.map(normalize).map(toBenchPlayer);
  const reserve = data.reserve.map(normalize).map(toBenchPlayer);
  const arranged = starterPlayers.length === 11 ? starterPlayers : assignPlayersByFamiliarity(starterPlayers, slots).filter(Boolean);
  return {
    formation,
    teamTactics: { ...DEFAULT_TEAM_TACTICS, ...(data.teamTactics || {}) },
    starters: arranged.map((p, i) => toStarter(p, slots[i])),
    bench,
    reserve,
  };
}

export const useSquadStore = create((set, get) => ({
  formation: DEFAULT_FORMATION,
  teamTactics: { ...DEFAULT_TEAM_TACTICS },
  starters: [],
  bench: [],
  reserve: [],
  loaded: false,
  isLoading: false,
  isSaving: false,
  dirty: false,
  error: null,

  loadSquad: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await fetchLineup();
      set({ ...buildSquadState(data), loaded: true, isLoading: false, dirty: false });
      return true;
    } catch (err) {
      set({ isLoading: false, error: errorMessage(err) });
      return false;
    }
  },

  saveSquad: async () => {
    const { formation, teamTactics, starters, bench } = get();
    if (starters.length !== 11) return { success: false, message: '선발 선수는 정확히 11명이어야 합니다.' };
    set({ isSaving: true });
    try {
      const instructions = {};
      for (const p of starters) if (p.instruction) instructions[p.userPlayerId] = p.instruction;
      await saveLineup({
        formation,
        teamTactics,
        starterIds: starters.map((p) => p.userPlayerId),
        benchIds: bench.map((p) => p.userPlayerId),
        instructions,
      });
      set({ isSaving: false, dirty: false });
      return { success: true, message: '라인업과 전술을 저장했습니다.' };
    } catch (err) {
      set({ isSaving: false });
      return { success: false, message: errorMessage(err, '라인업 저장에 실패했습니다.') };
    }
  },

  changeFormation: (code) => {
    const { starters, formation } = get();
    if (!FORMATIONS[code]) return { success: false, message: '지원하지 않는 포메이션입니다.' };
    if (code === formation) return { success: false, message: '이미 적용된 포메이션입니다.' };
    const slots = getFormationSlots(code);
    const assigned = assignPlayersByFamiliarity(starters, slots).filter(Boolean);
    set({ formation: code, starters: assigned.map((p, i) => applySlotToPlayer(p, slots[i])), dirty: true });
    return { success: true, message: `포메이션을 ${code} 로 변경했습니다. 선수들이 새 슬롯으로 재배치되었습니다.` };
  },

  updateTeamTactics: (partial) => {
    const tactics = { ...get().teamTactics };
    const changes = [];
    for (const group of TEAM_TACTIC_GROUPS) {
      const next = partial[group.key];
      if (next === undefined || next === tactics[group.key]) continue;
      if (!group.options.some((o) => o.value === next)) return { success: false, message: `${group.label} 값이 올바르지 않습니다.` };
      changes.push(`${group.label} ${TEAM_TACTIC_LABELS[group.key][tactics[group.key]]} → ${TEAM_TACTIC_LABELS[group.key][next]}`);
      tactics[group.key] = next;
    }
    if (changes.length === 0) return { success: false, message: '변경된 내용이 없습니다.' };
    set({ teamTactics: tactics, dirty: true });
    return { success: true, message: `팀 전술 변경: ${changes.join(' / ')}` };
  },

  setPlayerInstruction: (slotIndex, instruction) => {
    const starters = [...get().starters];
    const player = starters[slotIndex];
    if (!player) return { success: false, message: '유효하지 않은 슬롯입니다.' };
    if (!isValidInstruction(player.slotRoleCode, instruction)) {
      return { success: false, message: `${getInstructionCategory(player.slotRoleCode)} 포지션에서 사용할 수 없는 지침입니다.` };
    }
    if (player.instruction === instruction) return { success: false, message: '이미 적용된 지침입니다.' };
    starters[slotIndex] = { ...player, instruction };
    set({ starters, dirty: true });
    return { success: true, message: `🎯 ${player.name}(${player.slotRoleCode}): ${INSTRUCTION_DEFS[instruction].label}` };
  },

  swapFieldPositions: (slotIndexA, slotIndexB) => {
    if (slotIndexA === slotIndexB) return { success: false, message: '서로 다른 두 슬롯을 선택해주세요.' };
    const starters = [...get().starters];
    const a = starters[slotIndexA];
    const b = starters[slotIndexB];
    if (!a || !b) return { success: false, message: '유효하지 않은 슬롯입니다.' };
    starters[slotIndexA] = applySlotToPlayer(b, getSlotOf(a));
    starters[slotIndexB] = applySlotToPlayer(a, getSlotOf(b));
    set({ starters, dirty: true });
    return {
      success: true,
      message: `🔁 포지션 맞교환 완료: ${a.name}(${starters[slotIndexB].slotRoleCode}) ↔ ${b.name}(${starters[slotIndexA].slotRoleCode})`,
    };
  },

  substitute: (slotIndex, playerId) => {
    const { starters, bench, reserve } = get();
    const out = starters[slotIndex];
    if (!out) return { success: false, message: '교체할 슬롯을 찾을 수 없습니다.' };
    const benchIndex = bench.findIndex((p) => p.id === playerId);
    const reserveIndex = reserve.findIndex((p) => p.id === playerId);
    if (benchIndex < 0 && reserveIndex < 0) return { success: false, message: '교체 투입할 선수를 찾을 수 없습니다.' };
    const nextStarters = [...starters];
    const incoming = benchIndex >= 0 ? bench[benchIndex] : reserve[reserveIndex];
    const placed = applySlotToPlayer({ ...incoming, instruction: out.instruction }, getSlotOf(out));
    nextStarters[slotIndex] = placed;
    const patch = { starters: nextStarters, dirty: true };
    if (benchIndex >= 0) {
      const nextBench = [...bench];
      nextBench[benchIndex] = toBenchPlayer(out);
      patch.bench = nextBench;
    } else {
      const nextReserve = [...reserve];
      nextReserve[reserveIndex] = toBenchPlayer(out);
      patch.reserve = nextReserve;
    }
    set(patch);
    return {
      success: true,
      message: `🔄 선수 교체: IN ${placed.name}(${placed.slotRoleCode}, ${FAMILIARITY_META[placed.familiarity].label}) / OUT ${out.name} (경기 전에는 교체 횟수가 차감되지 않습니다)`,
    };
  },

  swapBenchReserve: (benchId, reserveId) => {
    const { bench, reserve } = get();
    const bi = bench.findIndex((p) => p.id === benchId);
    const ri = reserve.findIndex((p) => p.id === reserveId);
    if (bi < 0 || ri < 0) return { success: false, message: '선수를 찾을 수 없습니다.' };
    const nextBench = [...bench];
    const nextReserve = [...reserve];
    [nextBench[bi], nextReserve[ri]] = [nextReserve[ri], nextBench[bi]];
    set({ bench: nextBench, reserve: nextReserve, dirty: true });
    return { success: true, message: `🔄 벤치 변경: ${nextBench[bi].name} 이(가) 벤치에 합류했습니다.` };
  },

  reset: () =>
    set({ formation: DEFAULT_FORMATION, teamTactics: { ...DEFAULT_TEAM_TACTICS }, starters: [], bench: [], reserve: [], loaded: false, dirty: false, error: null }),
}));

export default useSquadStore;