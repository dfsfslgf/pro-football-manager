import { create } from 'zustand';
import { fetchOverview, fetchPlayers } from '../api/gameApi.js';
import { errorMessage } from '../api/client.js';

/**
 * 구단 운영 데이터(지갑, 평균 체력, 팀 OVR, 전적, 후원, 보유 선수 목록) 스토어.
 */
export const useClubStore = create((set) => ({
  overview: null,
  players: [],
  record: null,
  isLoading: false,
  error: null,

  /**
   * 구단 개요(지갑 포함)를 새로 불러옴.
   * @returns {Promise<Object|null>}
   */
  refreshOverview: async () => {
    set({ isLoading: true, error: null });
    try {
      const overview = await fetchOverview();
      set({ overview, isLoading: false });
      return overview;
    } catch (err) {
      set({ error: errorMessage(err), isLoading: false });
      return null;
    }
  },

  /**
   * 보유 선수 목록과 구단 전적을 새로 불러옴.
   * @returns {Promise<Object[]>}
   */
  refreshPlayers: async () => {
    try {
      const data = await fetchPlayers();
      set({ players: data.players, record: data.record });
      return data.players;
    } catch (err) {
      set({ error: errorMessage(err) });
      return [];
    }
  },

  /**
   * 서버 응답의 remainingWallet 로 지갑만 즉시 갱신함.
   * @param {{cashPaid:number, cashFree:number, gold:number}} wallet
   * @returns {void}
   */
  setWallet: (wallet) => set((s) => (s.overview ? { overview: { ...s.overview, wallet: { ...s.overview.wallet, ...wallet } } } : {})),

  /**
   * 보유 선수 한 명의 정보를 로컬에서 갱신함.
   * @param {number} userPlayerId
   * @param {Object} patch
   * @returns {void}
   */
  patchPlayer: (userPlayerId, patch) =>
    set((s) => ({ players: s.players.map((p) => (p.userPlayerId === userPlayerId ? { ...p, ...patch } : p)) })),

  /**
   * 모든 구단 데이터를 초기화함. (로그아웃)
   * @returns {void}
   */
  reset: () => set({ overview: null, players: [], record: null, error: null }),
}));

export default useClubStore;
