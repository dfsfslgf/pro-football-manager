import { request } from './client.js';

/**
 * 내 구단의 포메이션/팀 전술/선발/벤치/예비 선수단을 조회합니다.
 * @returns {Promise<{formation:string, teamTactics:Object, starters:Object[], bench:Object[], reserve:Object[]}>}
 */
export function fetchLineup() {
  return request('get', '/v1/squad/lineup');
}

/**
 * 포메이션, 팀 전술, 선발 11명(슬롯 순서)/벤치, 선수별 개인 지침을 저장합니다.
 * @param {{formation:string, teamTactics:Object, starterIds:number[], benchIds:number[], instructions:Object<string,string>}} lineup
 * @returns {Promise<{formation:string}>}
 */
export function saveLineup(lineup) {
  return request('put', '/v1/squad/lineup', { data: lineup });
}
