/** 라인업(슬롯) 저장 및 체력 조회 SQL */

/** 요청한 선수 ID 중 해당 유저 소유인 행을 잠금 조회 */
export const SELECT_OWNED_PLAYER_IDS_FOR_UPDATE = 'SELECT id FROM user_players WHERE user_id = ? AND id IN (?) FOR UPDATE';

/** 라인업 슬롯 초기화 (전원 후보 해제) */
export const RESET_LINEUP_SLOTS = 'UPDATE user_players SET is_starter = FALSE, lineup_slot = NULL WHERE user_id = ?';

/** 선수 1명의 라인업 슬롯 지정 (0~10: 선발, 11~17: 벤치) */
export const UPDATE_LINEUP_SLOT = 'UPDATE user_players SET is_starter = ?, lineup_slot = ? WHERE id = ? AND user_id = ?';

/** 요청한 선수 ID 중 해당 유저 소유인 선수의 현재 체력 조회 */
export const SELECT_PLAYER_STAMINA_BY_IDS = 'SELECT id, stamina FROM user_players WHERE user_id = ? AND id IN (?)';
