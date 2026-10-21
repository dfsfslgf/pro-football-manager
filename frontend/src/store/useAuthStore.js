import { create } from 'zustand';
import { fetchMe, login as loginApi, register as registerApi } from '../api/gameApi.js';
import { errorMessage, getToken, setToken, setUnauthorizedHandler } from '../api/client.js';
import useNavStore from './useNavStore.js';

/**
 * 인증/구단 기본 정보 스토어. 토큰은 localStorage 에 보관하며 서버가 항상 userId 의 기준입니다.
 */
export const useAuthStore = create((set, get) => ({
  status: 'checking',
  user: null,
  club: null,
  error: null,
  isSubmitting: false,

  /**
   * 앱 시작 시 저장된 토큰으로 로그인 상태를 복원합니다.
   * @returns {Promise<void>}
   */
  init: async () => {
    setUnauthorizedHandler(() => get().logout());
    if (!getToken()) {
      set({ status: 'anon' });
      return;
    }
    try {
      const me = await fetchMe();
      set({ status: 'authed', user: me.user, club: me.club });
    } catch (err) {
      if (err?.response?.status === 401 || err?.response?.status === 404) setToken(null);
      set({ status: 'anon', error: err?.response ? null : errorMessage(err) });
    }
  },

  /**
   * 로그인합니다.
   * @param {{nickname:string, password:string}} credentials
   * @returns {Promise<boolean>} 성공 여부
   */
  login: async (credentials) => {
    set({ isSubmitting: true, error: null });
    try {
      const data = await loginApi(credentials);
      setToken(data.token);
      useNavStore.getState().go('lobby');
      set({ status: 'authed', user: data.user, club: data.club, isSubmitting: false });
      return true;
    } catch (err) {
      set({ error: errorMessage(err, '로그인에 실패했습니다.'), isSubmitting: false });
      return false;
    }
  },

  /**
   * 회원가입과 함께 구단을 창단합니다. (가입 즉시 로그인)
   * @param {{nickname:string, password:string, clubName:string, emblemIcon:string, emblemColor:string}} payload
   * @returns {Promise<boolean>} 성공 여부
   */
  register: async (payload) => {
    set({ isSubmitting: true, error: null });
    try {
      const data = await registerApi(payload);
      setToken(data.token);
      useNavStore.getState().go('lobby');
      set({ status: 'authed', user: data.user, club: data.club, isSubmitting: false });
      return true;
    } catch (err) {
      set({ error: errorMessage(err, '회원가입에 실패했습니다.'), isSubmitting: false });
      return false;
    }
  },

  /**
   * 구단 정보(후원사 등)를 갱신합니다.
   * @param {Object} patch
   * @returns {void}
   */
  patchClub: (patch) => set((s) => ({ club: s.club ? { ...s.club, ...patch } : s.club })),

  /**
   * 로그아웃하고 모든 로컬 인증 정보를 지웁니다.
   * @returns {void}
   */
  logout: () => {
    setToken(null);
    set({ status: 'anon', user: null, club: null, error: null });
  },
}));

export default useAuthStore;
