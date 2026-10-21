import { request } from './client.js';

/**
 * 대회의 다음 경기에 묶인 1회용 라이브 경기 세션을 발급받습니다.
 * @param {{mode:string, stageId?:number|null}} params
 * @returns {Promise<{sessionId:string, startedAt:number}>}
 */
export function startLiveSession({ mode, stageId = null }) {
  return request('post', '/v1/matches/start', { data: { mode, stageId } });
}

/**
 * 90분 경기 결과를 서버에 확정 저장하고 정산 리포트(MOM/평점/보상/대회 결과)를 받습니다.
 * @param {Object} payload { sessionId, scoreHome, scoreAway, homeStats, awayStats, timelineEvents, playerStamina, finalTactics, lockerTalk }
 * @returns {Promise<Object>} 정산 리포트
 */
export function finishLiveMatch(payload) {
  return request('post', '/v1/matches/finish', { data: payload });
}

/**
 * 저장된 경기 결과를 조회합니다.
 * @param {number} matchId
 * @returns {Promise<Object>}
 */
export function fetchMatchResult(matchId) {
  return request('get', `/v1/matches/${matchId}`);
}
