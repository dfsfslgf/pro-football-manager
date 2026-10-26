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

const BENCH_STORAGE_KEY = 'pfm_saved_bench_ids_v1';

function saveBenchBackup(benchIds) {
  try {
    if (Array.isArray(benchIds) && benchIds.length > 0) {
      localStorage.setItem(BENCH_STORAGE_KEY, JSON.stringify(benchIds));
    }
  } catch {
    // ignore storage errors
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

export function normalizePlayer(raw, side, backNumber) {
  // [요구사항 5번 반영] secondaryRole 에 쉼표로 여러 포지션("CM,CAM,RM")이 저장되어 있어도 모두 파싱하여 roleCodes 에 포함!
  const extraRoles = String(raw.secondaryRoleCode || raw.secondaryRole || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const baseRoles = Array.isArray(raw.roleCodes) ? raw.roleCodes : [];
  const mergedRoles = [...new Set([raw.preferredRoleCode, ...baseRoles, ...extraRoles].filter(Boolean))];

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
    slotRoleCode: player.preferredRoleCode || player.mainPosition,
    role: player.mainPosition,
    label: player.preferredRoleCode || player.mainPosition,
    baseX: 50,
    baseY: 50,
    naturalPosition: player.mainPosition,
    familiarity: 'NATURAL',
    familiarityMultiplier: 1,
    currentStamina: player.stamina,
  };
}

/**
 * 남은 선수 풀(pool)에서 다음 11명의 후보 구성을 OVR 높은 순으로 자동 선발
 * - GK 1명
 * - 풀백 2명 (LB/LWB 1명, RB/RWB 1명)
 * - 센터백 2명 (CB/LCB/RCB 2명)
 * - 윙어 2명 (LW/LM 1명, RW/RM 1명)
 * - 중앙 미드필더 2명 (CM/CDM/CAM 2명)
 * - 공격수 2명 (ST/CF/LST/RST 2명)
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
    roles.includes(p.preferredRoleCode) || (Array.isArray(p.roleCodes) && p.roleCodes.some((r) => roles.includes(r)));

  // 1. GK 1명
  takeMatching((p) => p.mainPosition === 'GK', 1);
  // 2. 좌측 풀백 1명, 우측 풀백 1명 (부족 시 일반 DF로 대체)
  takeMatching((p) => p.mainPosition === 'DF' && hasRole(p, ['LB', 'LWB']), 1);
  takeMatching((p) => p.mainPosition === 'DF' && hasRole(p, ['RB', 'RWB']), 1);
  // 3. 센터백 2명
  takeMatching((p) => p.mainPosition === 'DF' && hasRole(p, ['CB', 'LCB', 'RCB']), 2);
  // 만약 DF가 아직 4명 미만이면 남은 DF 중에서 채움
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
  // 6. 최전방 스트라이커(ST) 2명
  takeMatching((p) => p.mainPosition === 'FW' && hasRole(p, ['ST', 'LST', 'RST', 'CF']), 2);
  // 7. 11명이 안 찼다면 남은 선수 중 OVR 최고 순으로 11명까지 채움
  while (picked.length < 11 && remaining.length > 0) {
    picked.push(remaining.shift());
  }

  return {
    bench: picked.slice(0, 11).map(toBenchPlayer),
    reserve: remaining.map(toBenchPlayer),
  };
}

function buildSquadState(data) {
  const formation = FORMATIONS[data.formation] ? data.formation : DEFAULT_FORMATION;
  const slots = getFormationSlots(formation);
  let number = 0;
  const normalize = (raw) => normalizePlayer(raw, 'HOME', ++number);
  const starterPlayers = data.starters.slice(0, 11).map(normalize);

  const rawBench = (data.bench || []).map(normalize).map(toBenchPlayer);
  const rawReserve = (data.reserve || []).map(normalize).map(toBenchPlayer);
  const allNonStarters = [...rawBench, ...rawReserve];

  // [요구사항 2번 해결] 사용자가 저장해둔 후보 백업(localStorage)이 있으면 최우선 복원하여 절대 초기화되지 않도록 보장!
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
    bench: finalBench,
    reserve: finalReserve,
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
    // 이미 로드되어 있고 강제 새로고침이 아니면 현재 메모리의 스쿼드+후보 명단을 그대로 유지! (페이지 이동 시 후보 초기화 원천 차단)
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

  saveSquad: async () => {
    const { formation, teamTactics, starters, bench } = get();
    if (starters.length !== 11) return { success: false, message: '선발 선수는 정확히 11명이어야 합니다.' };
    set({ isSaving: true });
    try {
      const instructions = {};
      for (const p of starters) if (p.instruction) instructions[p.userPlayerId] = p.instruction;
      const benchIds = bench.map((p) => p.userPlayerId);
      saveBenchBackup(benchIds);
      await saveLineup({
        formation,
        teamTactics,
        starterIds: starters.map((p) => p.userPlayerId),
        benchIds,
        instructions,
      });
      set({ isSaving: false, dirty: false });
      return { success: true, message: '라인업과 후보 명단(벤치)을 저장했습니다.' };
    } catch (err) {
      set({ isSaving: false });
      return { success: false, message: errorMessage(err, '라인업 저장에 실패했습니다.') };
    }
  },

  /**
   * 후보 11명만 포지션별 최고 OVR(GK 1, 풀백 2, CB 2, 윙어 2, 중미 2, 공격수 2)로 자동 완성
   */
  autoFillBench: () => {
    const { bench, reserve } = get();
    const result = pickBalancedBench11([...bench, ...reserve]);
    saveBenchBackup(result.bench.map((p) => p.userPlayerId));
    set({ bench: result.bench, reserve: result.reserve, dirty: true });
    return {
      success: true,
      message: '⚡ 후보 11명 자동완성 완료! (GK 1 · 좌우 풀백 2 · 센터백 2 · 좌우 윙어 2 · 중미 2 · 공격수 2 최고 OVR 선발)',
    };
  },

  /**
   * 선발 11명 + 후보 11명(총 22명)을 한 번에 포지션별 최고 능력치 선수로 자동 완성
   */
  autoFillAll: () => {
    const { formation, starters, bench, reserve } = get();
    const slots = getFormationSlots(formation);
    const allPlayers = [...starters, ...bench, ...reserve].sort((a, b) => (b.overall || 0) - (a.overall || 0));

    const pickedStarters = assignPlayersByFamiliarity(allPlayers, slots).filter(Boolean);
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
      message: '✨ 선발 베스트 11 + 포지션별 맞춤 후보 11명(총 22명) 자동 라인업 편성이 완료되었습니다!',
    };
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
      saveBenchBackup(nextBench.map((p) => p.userPlayerId));
    } else {
      const nextReserve = [...reserve];
      nextReserve[reserveIndex] = toBenchPlayer(out);
      patch.reserve = nextReserve;
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
    [nextBench[bi], nextReserve[ri]] = [nextReserve[ri], nextBench[bi]];
    saveBenchBackup(nextBench.map((p) => p.userPlayerId));
    set({ bench: nextBench, reserve: nextReserve, dirty: true });
    return { success: true, message: `🔄 벤치 변경: ${nextBench[bi].name} 이(가) 벤치에 합류했습니다.` };
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