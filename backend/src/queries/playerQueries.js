/** 포지션 목록별 가챠 후보군 조회 */
export const SELECT_GACHA_POOL_BY_POSITIONS =
  'SELECT id, name, main_position AS mainPosition, preferred_role AS preferredRole, drop_weight AS dropWeight, base_stats AS baseStats, tags FROM player_master WHERE main_position IN (?) AND drop_weight > 0';

/** 가챠 후보군 전체 조회 */
export const SELECT_ALL_GACHA_POOL =
  'SELECT id, name, main_position AS mainPosition, preferred_role AS preferredRole, drop_weight AS dropWeight, base_stats AS baseStats, tags FROM player_master WHERE drop_weight > 0';

/** 포지션별 가챠 후보군 조회 */
export const SELECT_GACHA_POOL_BY_POSITION =
  'SELECT id, name, main_position AS mainPosition, preferred_role AS preferredRole, drop_weight AS dropWeight, base_stats AS baseStats, tags FROM player_master WHERE main_position = ? AND drop_weight > 0';

/** 유저 보유 선수 수 */
export const COUNT_USER_PLAYERS = 'SELECT COUNT(*) AS totalCount FROM user_players WHERE user_id = ?';

/** 유저 선수 지급 */
export const INSERT_USER_PLAYER =
  'INSERT INTO user_players (user_id, player_id, level, exp, stamina, is_starter) VALUES (?, ?, 1, 0, 100, FALSE)';

/** 구단 라인업(마스터 JOIN) 조회 */
export const SELECT_CLUB_LINEUP_WITH_MASTER = `
  SELECT
    up.id AS userPlayerId, up.user_id AS userId, up.player_id AS playerId,
    up.level, up.stamina, up.is_starter AS isStarter,
    pm.name, pm.main_position AS mainPosition, pm.base_stats AS baseStats, pm.tags
  FROM user_players up
  INNER JOIN player_master pm ON up.player_id = pm.id
  WHERE up.user_id = ?
  ORDER BY up.is_starter DESC, up.level DESC
  LIMIT 18
`;
