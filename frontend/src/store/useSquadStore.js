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
import { buildNationalSquad } from '../constants/nationalSquads.js';
const BENCH_STORAGE_KEY = 'pfm_saved_bench_ids_v1';

// 포지션 대분류 및 세부 포지션 정렬 가중치 (GK -> DF -> MF -> FW 순서)
const BENCH_POS_WEIGHT = { GK: 1, DF: 2, MF: 3, FW: 4 };
const ROLE_SUB_WEIGHT = {
  GK: 1,
  LB: 10,
  LWB: 11,
  CB: 12,
  LCB: 12,
  RCB: 12,
  RB: 13,
  RWB: 14,
  CDM: 20,
  LDM: 20,
  RDM: 20,
  CM: 21,
  LCM: 21,
  RCM: 21,
  LM: 22,
  RM: 23,
  CAM: 24,
  LAM: 24,
  RAM: 24,
  LW: 30,
  RW: 31,
  ST: 32,
  LST: 32,
  RST: 32,
  CF: 33,
  FW: 34,
};

/**
 * 선수 배열을 능력치가 아닌 포지션 순서(GK -> DF -> MF -> FW) 기준으로 정렬함
 * 동일 포지션 내에서는 OVR 높은 순으로 정렬함
 */
export function sortPlayersByPosition(list) {
  return [...(list || [])].sort((a, b) => {
    const posA = BENCH_POS_WEIGHT[a.mainPosition] || 99;
    const posB = BENCH_POS_WEIGHT[b.mainPosition] || 99;
    if (posA !== posB) return posA - posB;

    const roleA = ROLE_SUB_WEIGHT[a.preferredRoleCode || a.mainPosition] || 50;
    const roleB = ROLE_SUB_WEIGHT[b.preferredRoleCode || b.mainPosition] || 50;
    if (roleA !== roleB) return roleA - roleB;

    return (b.overall || 0) - (a.overall || 0);
  });
}

function saveBenchBackup(benchIds) {
  try {
    if (Array.isArray(benchIds) && benchIds.length > 0) {
      localStorage.setItem(BENCH_STORAGE_KEY, JSON.stringify(benchIds));
    }
  } catch {
    // 스토리지 접근 불가 환경 예외 무시
  }
}

function loadBenchBackup() {
  try {
    const raw = localStorage.getItem(BENCH_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.map(Number).filter((n) => n > 0) : null;
  } catch {
    return null;
  }
}

/**
 * 서버 응답 또는 원시 선수 데이터를 프론트엔드 표준 선수 객체로 정규화함
 * 다중 보조 포지션(쉼표 구분 문자열) 및 징계/최대레벨 필드를 포함함
 */
export function normalizePlayer(raw, side, backNumber) {
  const extraRoles = String(raw.secondaryRoleCode || raw.secondaryRole || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const baseRoles = Array.isArray(raw.roleCodes)
    ? raw.roleCodes.flatMap((r) => String(r || '').split(',')).map((s) => s.trim()).filter(Boolean)
    : [];
  const mergedRoles = [...new Set([raw.preferredRoleCode, ...baseRoles, ...extraRoles].filter(Boolean))];

  const staminaVal = Number(raw.stamina ?? raw.currentStamina ?? 100);
  const levelVal = Number(raw.level || 1);
  const maxLevelVal = Number(raw.maxLevel || raw.baseStats?.maxLevel || 20);
  const suspendedVal = Number(raw.suspendedMatches ?? raw.baseStats?.suspendedMatches ?? 0);

  return {
    id: `${side}-${raw.userPlayerId}`,
    side,
    userPlayerId: raw.userPlayerId,
    playerId: raw.playerId,
    name: raw.name,
    mainPosition: raw.mainPosition,
    preferredRoleCode: raw.preferredRoleCode || mergedRoles[0] || raw.mainPosition,
    secondaryRoleCode: extraRoles.join(',') || null,
    roleCodes: mergedRoles,
    level: levelVal,
    maxLevel: maxLevelVal,
    suspendedMatches: suspendedVal,
    exp: Number(raw.exp || 0),
    stamina: staminaVal,
    currentStamina: staminaVal,
    baseStats: raw.baseStats || {},
    tags: raw.tags || [],
    rarity: raw.rarity || 'COMMON',
    overall: Number(raw.overall ?? 0),
    instruction: raw.instruction || null,
    stats: raw.stats || null,
    backNumber,
    effectiveStats: computeEffectiveStats(raw.baseStats, levelVal),
  };
}

function toStarter(player, slotDef) {
  const staminaVal = player.stamina ?? player.currentStamina ?? 100;
  return applySlotToPlayer({ ...player, stamina: staminaVal, currentStamina: staminaVal }, slotDef);
}

function toBenchPlayer(player) {
  const staminaVal = player.stamina ?? player.currentStamina ?? 100;
  return {
    ...player,
    slotIndex: null,
    slotRoleGroup: player.mainPosition,
    slotRoleCode: player.preferredRoleCode || player.mainPosition,
    role: player.mainPosition,
    label: player.preferredRoleCode || player.mainPosition,
    baseX: 50,
    baseY: 50,
    naturalPosition: player.mainPosition,
    familiarity: 'NATURAL',
    familiarityMultiplier: 1,
    stamina: staminaVal,
    currentStamina: staminaVal,
  };
}

/**
 * 남은 선수 풀에서 포지션별 밸런스(GK 1, 풀백 2, CB 2, 윙어 2, 중미 2, 공격수 2)에 맞춰
 * OVR이 가장 높은 후보 11명을 선발하고 포지션 순으로 정렬하여 반환함
 */
export function pickBalancedBench11(pool) {
  const remaining = [...pool].sort((a, b) => (b.overall || 0) - (a.overall || 0));
  const picked = [];

  const takeMatching = (predicate, count) => {
    for (let c = 0; c < count; c++) {
      const idx = remaining.findIndex(predicate);
      if (idx >= 0) {
        picked.push(remaining.splice(idx, 1)[0]);
      }
    }
  };

  const hasRole = (p, roles) =>
    roles.includes(p.preferredRoleCode) ||
    (Array.isArray(p.roleCodes) && p.roleCodes.some((r) => roles.includes(r)));

  // 1. GK 1명
  takeMatching((p) => p.mainPosition === 'GK', 1);
  // 2. 좌측 풀백 1명, 우측 풀백 1명
  takeMatching((p) => p.mainPosition === 'DF' && hasRole(p, ['LB', 'LWB']), 1);
  takeMatching((p) => p.mainPosition === 'DF' && hasRole(p, ['RB', 'RWB']), 1);
  // 3. 센터백 2명
  takeMatching((p) => p.mainPosition === 'DF' && hasRole(p, ['CB', 'LCB', 'RCB']), 2);
  const currentDfCount = picked.filter((p) => p.mainPosition === 'DF').length;
  if (currentDfCount < 4) {
    takeMatching((p) => p.mainPosition === 'DF', 4 - currentDfCount);
  }
  // 4. 좌측 윙어 1명, 우측 윙어 1명
  takeMatching((p) => hasRole(p, ['LW', 'LM']), 1);
  takeMatching((p) => hasRole(p, ['RW', 'RM']), 1);
  // 5. 중앙 미드필더(CM/CDM/CAM) 2명
  takeMatching((p) => p.mainPosition === 'MF' && hasRole(p, ['CM', 'CDM', 'CAM', 'LCM', 'RCM']), 2);
  const currentMfCount = picked.filter((p) => p.mainPosition === 'MF').length;
  if (currentMfCount < 3) {
    takeMatching((p) => p.mainPosition === 'MF', 3 - currentMfCount);
  }
  // 6. 공격수(ST/CF) 2명
  takeMatching((p) => p.mainPosition === 'FW' && hasRole(p, ['ST', 'LST', 'RST', 'CF']), 2);
  // 7. 11명 미달 시 남은 선수 중 OVR 순으로 보충
  while (picked.length < 11 && remaining.length > 0) {
    picked.push(remaining.shift());
  }

  return {
    bench: sortPlayersByPosition(picked.slice(0, 11).map(toBenchPlayer)),
    reserve: sortPlayersByPosition(remaining.map(toBenchPlayer)),
  };
}

function buildSquadState(data) {
  const formation = FORMATIONS[data.formation] ? data.formation : DEFAULT_FORMATION;
  const slots = getFormationSlots(formation);
  let number = 0;
  const normalize = (raw) => normalizePlayer(raw, 'HOME', ++number);
  const starterPlayers = (data.starters || []).slice(0, 11).map(normalize);

  const rawBench = (data.bench || []).map(normalize).map(toBenchPlayer);
  const rawReserve = (data.reserve || []).map(normalize).map(toBenchPlayer);
  const allNonStarters = [...rawBench, ...rawReserve];

  // 저장된 후보 백업 ID 목록이 있으면 해당 선수들로 벤치를 복원함
  const backupIds = loadBenchBackup();
  let finalBench = rawBench;
  let finalReserve = rawReserve;

  if (backupIds && backupIds.length > 0) {
    const byId = new Map(allNonStarters.map((p) => [Number(p.userPlayerId), p]));
    const restoredBench = [];
    for (const id of backupIds) {
      if (byId.has(id)) {
        restoredBench.push(byId.get(id));
        byId.delete(id);
      }
    }
    if (restoredBench.length > 0) {
      finalBench = restoredBench;
      finalReserve = [...byId.values()];
    }
  }

  const arranged =
    starterPlayers.length === 11
      ? starterPlayers
      : assignPlayersByFamiliarity(starterPlayers, slots).filter(Boolean);

  return {
    formation,
    teamTactics: { ...DEFAULT_TEAM_TACTICS, ...(data.teamTactics || {}) },
    starters: arranged.map((p, i) => toStarter(p, slots[i])),
    bench: sortPlayersByPosition(finalBench),
    reserve: sortPlayersByPosition(finalReserve),
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

  loadSquad: async (force = false) => {
    const state = get();
    if (state.loaded && state.starters.length === 11 && !force) {
      return true;
    }
    set({ isLoading: true, error: null });
    try {
      const data = await fetchLineup();
      const nextState = buildSquadState(data);
      saveBenchBackup(nextState.bench.map((p) => p.userPlayerId));
      set({ ...nextState, loaded: true, isLoading: false, dirty: false });
      return true;
    } catch (err) {
      set({ isLoading: false, error: errorMessage(err) });
      return false;
    }
  },

  isNationalMode: false,
  nationalCode: null,

  /**
   * 2026 월드컵 모드 진입 시 선택한 국가의 실제 월드컵 대표팀 22인 명단으로 라인업을 구성함
   */
  /**
   * 2026 월드컵 모드 진입 시 선택한 국가의 실제 월드컵 26인 최종 엔트리(선발 11 + 벤치 11 + 예비 4 = 26명)로 구성함
   */
  loadNationalSquad: (nationObjOrCode) => {
    const code = typeof nationObjOrCode === 'string' ? nationObjOrCode : nationObjOrCode?.code || 'KOR';
    const natData = buildNationalSquad(code);
    const formation = FORMATIONS[natData.formation] ? natData.formation : DEFAULT_FORMATION;
    const slots = getFormationSlots(formation);
    const assignedStarters = assignPlayersByFamiliarity(natData.starters, slots).filter(Boolean);

    set({
      isNationalMode: true,
      nationalCode: code,
      formation,
      starters: assignedStarters.map((p, i) => toStarter(p, slots[i])),
      bench: sortPlayersByPosition([...natData.bench, ...(natData.reserve || [])].map(toBenchPlayer)),
      reserve: [],
      loaded: true,
      isLoading: false,
      dirty: false,
    });
    return true;
  },

  saveSquad: async () => {
    const { formation, teamTactics, starters, bench } = get();
    if (starters.length !== 11) return { success: false, message: '선발 선수는 정확히 11명이어야 합니다.' };
    set({ isSaving: true });
    try {
      const instructions = {};
      for (const p of starters) {
        if (p.instruction) instructions[p.userPlayerId] = p.instruction;
      }
      const sortedBench = sortPlayersByPosition(bench);
      const benchIds = sortedBench.map((p) => p.userPlayerId);
      saveBenchBackup(benchIds);

      await saveLineup({
        formation,
        teamTactics,
        starterIds: starters.map((p) => p.userPlayerId),
        benchIds,
        instructions,
      });
      set({ bench: sortedBench, isSaving: false, dirty: false });
      return { success: true, message: '라인업과 후보 명단(벤치)을 저장했습니다.' };
    } catch (err) {
      set({ isSaving: false });
      return { success: false, message: errorMessage(err, '라인업 저장에 실패했습니다.') };
    }
  },

  /**
   * 후보 11명을 포지션별 최고 OVR 선수로 자동 구성하고 포지션 순으로 정렬함
   */
  autoFillBench: () => {
    const { bench, reserve } = get();
    const result = pickBalancedBench11([...bench, ...reserve]);
    saveBenchBackup(result.bench.map((p) => p.userPlayerId));
    set({ bench: result.bench, reserve: result.reserve, dirty: true });
    return {
      success: true,
      message: '후보 11명 자동완성 완료 (GK 1 · 풀백 2 · 센터백 2 · 윙어 2 · 중미 2 · 공격수 2)',
    };
  },

  /**
   * 선발 11명과 후보 11명(총 22명)을 한 번에 자동 구성함 (출전 정지 선수는 선발에서 제외)
   */
  autoFillAll: () => {
    const { formation, starters, bench, reserve } = get();
    const slots = getFormationSlots(formation);
    const allPlayers = [...starters, ...bench, ...reserve].sort((a, b) => (b.overall || 0) - (a.overall || 0));

    // 출전 정지(suspendedMatches > 0)가 아닌 선수들로 선발 11명 우선 구성
    const eligibleForStarter = allPlayers.filter((p) => !(p.suspendedMatches > 0));
    const starterPool = eligibleForStarter.length >= 11 ? eligibleForStarter : allPlayers;

    const pickedStarters = assignPlayersByFamiliarity(starterPool, slots).filter(Boolean);
    const starterIdsSet = new Set(pickedStarters.map((p) => p.userPlayerId));
    const remainingPool = allPlayers.filter((p) => !starterIdsSet.has(p.userPlayerId));
    const { bench: nextBench, reserve: nextReserve } = pickBalancedBench11(remainingPool);

    saveBenchBackup(nextBench.map((p) => p.userPlayerId));
    set({
      starters: pickedStarters.map((p, i) => toStarter(p, slots[i])),
      bench: nextBench,
      reserve: nextReserve,
      dirty: true,
    });
    return {
      success: true,
      message: '선발 11명 및 포지션별 후보 11명(총 22명) 자동 편성이 완료되었습니다.',
    };
  },

  changeFormation: (code) => {
    const { starters, formation } = get();
    if (!FORMATIONS[code]) return { success: false, message: '지원하지 않는 포메이션입니다.' };
    if (code === formation) return { success: false, message: '이미 적용된 포메이션입니다.' };
    const slots = getFormationSlots(code);
    const assigned = assignPlayersByFamiliarity(starters, slots).filter(Boolean);
    set({ formation: code, starters: assigned.map((p, i) => applySlotToPlayer(p, slots[i])), dirty: true });
    return { success: true, message: `포메이션을 ${code}로 변경했습니다. 선수들이 새 슬롯으로 재배치되었습니다.` };
  },

  updateTeamTactics: (partial) => {
    const tactics = { ...get().teamTactics };
    const changes = [];
    for (const group of TEAM_TACTIC_GROUPS) {
      const next = partial[group.key];
      if (next === undefined || next === tactics[group.key]) continue;
      if (!group.options.some((o) => o.value === next)) {
        return { success: false, message: `${group.label} 값이 올바르지 않습니다.` };
      }
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
      patch.bench = sortPlayersByPosition(nextBench);
      saveBenchBackup(patch.bench.map((p) => p.userPlayerId));
    } else {
      const nextReserve = [...reserve];
      nextReserve[reserveIndex] = toBenchPlayer(out);
      patch.reserve = sortPlayersByPosition(nextReserve);
    }
    set(patch);
    return {
      success: true,
      message: `🔄 선수 교체: IN ${placed.name}(${placed.slotRoleCode}, ${FAMILIARITY_META[placed.familiarity].label}) / OUT ${out.name}`,
    };
  },

  swapBenchReserve: (benchId, reserveId) => {
    const { bench, reserve } = get();
    const bi = bench.findIndex((p) => p.id === benchId);
    const ri = reserve.findIndex((p) => p.id === reserveId);
    if (bi < 0 || ri < 0) return { success: false, message: '선수를 찾을 수 없습니다.' };
    const nextBench = [...bench];
    const nextReserve = [...reserve];
    const addedPlayerName = nextReserve[ri].name;
    [nextBench[bi], nextReserve[ri]] = [nextReserve[ri], nextBench[bi]];
    const sortedBench = sortPlayersByPosition(nextBench);
    const sortedReserve = sortPlayersByPosition(nextReserve);
    saveBenchBackup(sortedBench.map((p) => p.userPlayerId));
    set({ bench: sortedBench, reserve: sortedReserve, dirty: true });
    return { success: true, message: `🔄 벤치 변경: ${addedPlayerName} 선수가 벤치에 합류했습니다.` };
  },

  reset: () =>
    set({
      formation: DEFAULT_FORMATION,
      teamTactics: { ...DEFAULT_TEAM_TACTICS },
      starters: [],
      bench: [],
      reserve: [],
      loaded: false,
      dirty: false,
      error: null,
    }),
}));

export default useSquadStore;