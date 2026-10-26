import { create } from 'zustand';

/**
 * 화면(페이지) 전환 상태. 라우터 라이브러리 없이 page 키로 화면을 전환
 */
export const useNavStore = create((set) => ({
  page: 'lobby',
  params: {},

  /**
   * 화면을 이동합니다.
   * @param {string} page
   * @param {Object} [params] 화면에 전달할 값 (예: { mode })
   * @returns {void}
   */
  go: (page, params = {}) => set({ page, params }),
}));

export default useNavStore;
