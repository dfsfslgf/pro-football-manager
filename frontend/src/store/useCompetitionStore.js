import { create } from 'zustand';
import { fetchCompetition, fetchCompetitions, fetchNextMatch, startCompetition } from '../api/gameApi.js';
import { errorMessage } from '../api/client.js';

export const useCompetitionStore = create((set, get) => ({
  list: [],
  details: {},
  pending: null,
  selectedWorldCupNation: {
    code: 'KOR',
    name: '🇰🇷 대한민국',
    emblem: '🐯',
    ovr: 84,
  },
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
      set((s) => ({ details: { ...s.details, [mode]: detail }, error: null }));
      return detail;
    } catch (err) {
      set({ error: errorMessage(err) });
      return null;
    }
  },

  startMode: async (mode, restart = false) => {
    try {
      const detail = await startCompetition(mode, restart);
      set((s) => ({ details: { ...s.details, [mode]: detail } }));
      await get().loadList();
      return { ok: true };
    } catch (err) {
      return { ok: false, message: errorMessage(err), conflict: err?.response?.status === 409 };
    }
  },

  prepareNextMatch: async (mode, stageId = null) => {
    try {
      const next = await fetchNextMatch(mode, stageId);
      set({ pending: { mode, stageId: next.stageId ?? stageId ?? null, next } });
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