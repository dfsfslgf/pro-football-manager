import { request } from './client.js';

/** 인증 */
export const register = (payload) => request('post', '/v1/auth/register', { data: payload });
export const login = (payload) => request('post', '/v1/auth/login', { data: payload });
export const fetchMe = () => request('get', '/v1/auth/me');

/** 구단 운영 */
export const fetchOverview = () => request('get', '/v1/club/overview');
export const fetchPlayers = () => request('get', '/v1/club/players');
export const levelUpPlayer = (userPlayerId) => request('post', '/v1/club/training/level-up', { data: { userPlayerId } });
export const trainPosition = (userPlayerId, roleCode) => request('post', '/v1/club/training/position', { data: { userPlayerId, roleCode } });
export const recoverStamina = (userPlayerId = null) => request('post', '/v1/club/medical/recover', { data: userPlayerId ? { userPlayerId } : {} });
export const fetchMarket = () => request('get', '/v1/club/market');
export const buyListing = (listingKey) => request('post', '/v1/club/market/buy', { data: { listingKey } });
export const releasePlayer = (userPlayerId) => request('post', '/v1/club/market/release', { data: { userPlayerId } });
export const fetchFinance = () => request('get', '/v1/club/finance');
export const selectSponsor = (sponsorKey) => request('post', '/v1/club/sponsor', { data: { sponsorKey } });
export const claimQuest = (questKey) => request('post', '/v1/club/quests/claim', { data: { questKey } });

/** 스카우트(가챠) */
export const fetchScoutPackages = () => request('get', '/v1/scout/packages');
export const scoutPlayers = (packageKey, count) => request('post', '/v1/scout', { data: { packageKey, count } });

/** 대회 */
export const fetchCompetitions = () => request('get', '/v1/competitions');
export const fetchCompetition = (mode) => request('get', `/v1/competitions/${mode}`);
export function startCompetition(mode, restart = false, nationCode = null) {
  return request('post', `/v1/competitions/${mode}/start`, {
    data: { restart, nationCode },
  });
}

export function fetchNextMatch(mode, stageId = null, nationCode = null) {
  const params = {};
  if (stageId !== null && stageId !== undefined) params.stageId = stageId;
  if (nationCode) params.nationCode = nationCode;
  return request('get', `/v1/competitions/${mode}/next-match`, { params });
}