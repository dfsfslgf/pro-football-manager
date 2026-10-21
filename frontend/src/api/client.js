import axios from 'axios';

const TOKEN_KEY = 'pfm.token';

/** 인증이 만료(401)되었을 때 호출되는 핸들러. useAuthStore 가 등록합니다. */
let unauthorizedHandler = null;

/**
 * 저장된 인증 토큰을 읽습니다.
 * @returns {string|null}
 */
export function getToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * 인증 토큰을 저장하거나(null 이면) 삭제합니다.
 * @param {string|null} token
 * @returns {void}
 */
export function setToken(token) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* 저장소를 사용할 수 없는 환경에서는 메모리 상태만 유지됩니다. */
  }
}

/**
 * 401 응답 시 실행할 콜백을 등록합니다.
 * @param {(() => void)|null} handler
 * @returns {void}
 */
export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

client.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    const isAuthCall = String(err?.config?.url || '').includes('/auth/login') || String(err?.config?.url || '').includes('/auth/register');
    if (err?.response?.status === 401 && !isAuthCall && unauthorizedHandler) unauthorizedHandler();
    return Promise.reject(err);
  }
);

/**
 * 서버 에러 응답에서 사용자에게 보여줄 메시지를 추출합니다.
 * @param {unknown} err axios 에러
 * @param {string} [fallback] 메시지가 없을 때 대체 문구
 * @returns {string}
 */
export function errorMessage(err, fallback = '요청을 처리하지 못했습니다.') {
  if (err?.response?.data?.message) return err.response.data.message;
  if (err?.code === 'ECONNABORTED') return '서버 응답 시간이 초과되었습니다.';
  if (err?.message === 'Network Error') return '서버에 연결할 수 없습니다. 백엔드가 실행 중인지 확인해주세요.';
  return err?.message || fallback;
}

/**
 * 요청을 보내고 `{ success, data }` 응답에서 data 만 반환합니다.
 * @param {'get'|'post'|'put'|'delete'} method
 * @param {string} url
 * @param {Object} [options] { data, params }
 * @returns {Promise<any>}
 */
export async function request(method, url, options = {}) {
  const res = await client.request({ method, url, data: options.data, params: options.params });
  return res.data.data;
}

export default client;
