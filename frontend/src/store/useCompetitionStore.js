import { create } from 'zustand';
import { fetchCompetition, fetchCompetitions, fetchNextMatch, startCompetition } from '../api/gameApi.js';
import { errorMessage } from '../api/client.js';
import { WORLD_CUP_48_NATIONS } from '../constants/nationalSquads.js';

const NATION_META_BY_CODE = Object.fromEntries(WORLD_CUP_48_NATIONS.map((n) => [n.code, n]));

export const useCompetitionStore = create((set, get) => ({
  list: [],
  details: {},
  pending: null,
  selectedWorldCupNation: NATION_META_BY_CODE.KOR || WORLD_CUP_48_NATIONS[0],
  isLoading: false,
  error: null,

  setSelectedWorldCupNation: (nation) => set({ selectedWorldCupNation: nation }),

  loadList: async () => {
    set({ isLoading: true, error: null });
    try {
      set({ list: await fetchCompetitions(), isLoading: false });
    } catch (err) {
      set({ error: errorMessage(err), isLoading: false });
    }
  },

  loadDetail: async (mode) => {
    try {
      const detail = await fetchCompetition(mode);
      const patch = { details: { ...get().details, [mode]: detail }, error: null };

      if (mode === 'WORLD_CUP' && detail?.state?.userTeamId) {
        const savedCode = detail.state.userTeamId;
        const teamInState = detail.state.teams?.[savedCode];
        if (NATION_META_BY_CODE[savedCode]) {
          patch.selectedWorldCupNation = NATION_META_BY_CODE[savedCode];
        } else if (teamInState) {
          patch.selectedWorldCupNation = {
            code: savedCode,
            name: teamInState.name,
            emblem: teamInState.emblem || '🌍',
            ovr: teamInState.strength || 80,
          };
        }
      }

      set(patch);
      return detail;
    } catch (err) {
      set({ error: errorMessage(err) });
      return null;
    }
  },

  startMode: async (mode, restart = false, nationCode = null) => {
    try {
      const code = nationCode || get().selectedWorldCupNation?.code || 'KOR';
      let restartPayload = restart;
      if (mode === 'WORLD_CUP') {
        restartPayload = restart ? `RESTART:${code}` : `NATION:${code}`;
      }
      const detail = await startCompetition(mode, restartPayload, mode === 'WORLD_CUP' ? code : null);

      const patch = { details: { ...get().details, [mode]: detail } };
      if (mode === 'WORLD_CUP' && NATION_META_BY_CODE[code]) {
        patch.selectedWorldCupNation = NATION_META_BY_CODE[code];
      }
      set(patch);
      await get().loadList();
      return { ok: true };
    } catch (err) {
      return { ok: false, message: errorMessage(err), conflict: err?.response?.status === 409 };
    }
  },

  prepareNextMatch: async (mode, stageId = null, nationCode = null) => {
    try {
      const code =
        mode === 'WORLD_CUP' ? nationCode || get().selectedWorldCupNation?.code || 'KOR' : null;
      const raw = await fetchNextMatch(mode, stageId, code);
      const normalizedNext = raw?.next?.opponent ? raw.next : raw;
      if (!normalizedNext || !normalizedNext.opponent) {
        return { ok: false, message: '다음 경기 상대 정보를 불러오지 못했습니다.' };
      }
      set({
        pending: {
          mode,
          stageId: normalizedNext.stageId ?? raw?.stageId ?? stageId ?? null,
          next: normalizedNext,
        },
      });
      return { ok: true };
    } catch (err) {
      set({ pending: null });
      return { ok: false, message: errorMessage(err) };
    }
  },

  clearPending: () => set({ pending: null }),

  reset: () => set({ list: [], details: {}, pending: null, error: null }),
}));

export default useCompetitionStore;