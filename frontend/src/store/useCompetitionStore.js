import { create } from 'zustand';
import { fetchCompetition, fetchCompetitions, fetchNextMatch, startCompetition } from '../api/gameApi.js';
import { errorMessage } from '../api/client.js';

/**
 * 게임 모드(리그/챔피언스 컵/월드컵/챌린지 타워/랭크) 진행 상태 스토어.
 * 서버가 대진/순위/보상을 모두 관리하며, 이 스토어는 조회 결과와 "다음 경기" 브리핑을 보관합니다.
 */
export const useCompetitionStore = create((set, get) => ({
  list: [],
  details: {},
  pending: null,
  isLoading: false,
  error: null,

  /**
   * 5개 모드의 진행 요약 목록을 불러옵니다.
   * @returns {Promise<void>}
   */
  loadList: async () => {
    set({ isLoading: true, error: null });
    try {
      set({ list: await fetchCompetitions(), isLoading: false });
    } catch (err) {
      set({ error: errorMessage(err), isLoading: false });
    }
  },

  /**
   * 한 모드의 상세 상태(순위표/대진표/스테이지 등)를 불러옵니다.
   * @param {string} mode
   * @returns {Promise<Object|null>}
   */
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

  /**
   * 모드를 시작합니다. 진행 중인 리그/컵/월드컵은 restart=true 일 때 포기하고 새로 시작합니다.
   * @param {string} mode
   * @param {boolean} [restart=false]
   * @returns {Promise<{ok:boolean, message?:string, conflict?:boolean}>}
   */
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

  /**
   * 다음 경기 브리핑(상대 스쿼드/전술/시나리오)을 불러와 pending 에 저장합니다.
   * @param {string} mode
   * @param {number|null} [stageId=null] 챌린지 타워 스테이지
   * @returns {Promise<{ok:boolean, message?:string}>}
   */
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

  /**
   * 준비된 다음 경기 정보를 비웁니다.
   * @returns {void}
   */
  clearPending: () => set({ pending: null }),

  /**
   * 모든 대회 데이터를 초기화합니다. (로그아웃)
   * @returns {void}
   */
  reset: () => set({ list: [], details: {}, pending: null, error: null }),
}));

export default useCompetitionStore;
