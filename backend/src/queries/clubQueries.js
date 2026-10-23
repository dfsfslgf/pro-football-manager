/** 구단 운영 관련 SQL 상수 */

export const INSERT_USER = 'INSERT INTO users (nickname, password_hash) VALUES (?, ?)';
export const SELECT_USER_BY_NICKNAME = 'SELECT id, nickname, password_hash AS passwordHash FROM users WHERE nickname = ?';
export const SELECT_USER_BY_ID = 'SELECT id, nickname FROM users WHERE id = ?';

export const INSERT_CLUB = 'INSERT INTO clubs (user_id, name, emblem_icon, emblem_color, sponsor_key) VALUES (?, ?, ?, ?, ?)';
export const SELECT_CLUB =
  'SELECT c.user_id AS userId, c.name, c.emblem_icon AS emblemIcon, c.emblem_color AS emblemColor, c.sponsor_key AS sponsorKey, u.nickname FROM clubs c INNER JOIN users u ON u.id = c.user_id WHERE c.user_id = ?';
export const UPDATE_CLUB_SPONSOR = 'UPDATE clubs SET sponsor_key = ? WHERE user_id = ?';

export const INSERT_WALLET = 'INSERT INTO user_wallets (user_id, cash_paid, cash_free, gold) VALUES (?, ?, ?, ?)';

/** 구성 조건(포지션 + 세부 포지션)에 맞는 일반 등급 마스터 선수 조회 */
export const SELECT_COMMON_MASTER_BY_ROLE =
  'SELECT id, main_position AS mainPosition, preferred_role AS preferredRole FROM player_master WHERE main_position = ? AND preferred_role = ? AND drop_weight >= 100 ORDER BY id LIMIT 15';
export const SELECT_COMMON_MASTER_BY_POSITION =
  'SELECT id, main_position AS mainPosition, preferred_role AS preferredRole FROM player_master WHERE main_position = ? AND drop_weight >= 100 ORDER BY id LIMIT 15';

export const INSERT_STARTER_PLAYER =
  'INSERT INTO user_players (user_id, player_id, level, exp, stamina, is_starter, lineup_slot) VALUES (?, ?, 1, 0, 100, ?, ?)';

/** 보유 선수 전체(마스터 JOIN + 누적 기록, 유효슈팅 >= 득점 DB 레벨 보정 포함) */
export const SELECT_FULL_PLAYERS = `
  SELECT
    up.id AS userPlayerId, up.player_id AS playerId, up.level, up.exp, up.stamina,
    up.is_starter AS isStarter, up.lineup_slot AS lineupSlot, up.instruction, up.secondary_role AS secondaryRole,
    up.bonus_gauge AS bonusGauge, up.matches_played AS matchesPlayed, up.goals, up.assists,
    up.clean_sheets AS cleanSheets, up.goals_conceded AS goalsConceded, up.saves,
    GREATEST(up.goals, up.shots_on_target) AS shotsOnTarget,
    up.yellow_cards AS yellowCards, up.red_cards AS redCards,
    up.rating_sum AS ratingSum,
    pm.name, pm.main_position AS mainPosition, pm.preferred_role AS preferredRole,
    pm.drop_weight AS dropWeight, pm.base_stats AS baseStats, pm.tags
  FROM user_players up
  INNER JOIN player_master pm ON up.player_id = pm.id
  WHERE up.user_id = ?
  ORDER BY up.is_starter DESC, (up.lineup_slot IS NULL) ASC, up.lineup_slot ASC, up.level DESC, up.id ASC
`;

export const SELECT_PLAYER_FOR_UPDATE = `
  SELECT up.id AS userPlayerId, up.player_id AS playerId, up.level, up.stamina, up.is_starter AS isStarter,
         up.lineup_slot AS lineupSlot, up.bonus_gauge AS bonusGauge, up.secondary_role AS secondaryRole,
         pm.name, pm.main_position AS mainPosition, pm.preferred_role AS preferredRole, pm.base_stats AS baseStats, pm.drop_weight AS dropWeight
  FROM user_players up INNER JOIN player_master pm ON up.player_id = pm.id
  WHERE up.id = ? AND up.user_id = ? FOR UPDATE
`;

export const UPDATE_PLAYER_LEVEL = 'UPDATE user_players SET level = ?, bonus_gauge = ? WHERE id = ? AND user_id = ?';
export const UPDATE_PLAYER_GAUGE = 'UPDATE user_players SET bonus_gauge = ? WHERE id = ? AND user_id = ?';
export const UPDATE_PLAYER_SECONDARY_ROLE = 'UPDATE user_players SET secondary_role = ? WHERE id = ? AND user_id = ?';
export const UPDATE_PLAYER_STAMINA_ONE = 'UPDATE user_players SET stamina = 100 WHERE id = ? AND user_id = ?';
export const UPDATE_PLAYER_STAMINA_ALL = 'UPDATE user_players SET stamina = 100 WHERE user_id = ?';
export const UPDATE_PLAYER_STAMINA_REST = 'UPDATE user_players SET stamina = LEAST(100, stamina + CEIL((100 - stamina) * ?)) WHERE user_id = ? AND stamina < 100';
export const DELETE_USER_PLAYER = 'DELETE FROM user_players WHERE id = ? AND user_id = ?';
export const SELECT_LOW_STAMINA = 'SELECT id, stamina FROM user_players WHERE user_id = ? AND stamina < 100 FOR UPDATE';
export const UPDATE_PLAYER_INSTRUCTION = 'UPDATE user_players SET instruction = ? WHERE id = ? AND user_id = ?';
export const RESET_ALL_INSTRUCTIONS = 'UPDATE user_players SET instruction = NULL WHERE user_id = ?';


export const UPDATE_PLAYER_MATCH_STATS = `
  UPDATE user_players SET
    matches_played = matches_played + ?,
    goals = goals + ?,
    assists = assists + ?,
    clean_sheets = clean_sheets + ?,
    goals_conceded = goals_conceded + ?,
    saves = saves + ?,
    shots_on_target = shots_on_target + ?,
    yellow_cards = yellow_cards + ?,
    red_cards = red_cards + ?,
    rating_sum = rating_sum + ?,
    exp = exp + ?,
    bonus_gauge = LEAST(100, bonus_gauge + ?),
    stamina = ?
  WHERE id = ? AND user_id = ?
`;
export const SELECT_PLAYER_POSITIONS =
  'SELECT up.id AS userPlayerId, up.stamina, pm.name, pm.main_position AS mainPosition FROM user_players up INNER JOIN player_master pm ON up.player_id = pm.id WHERE up.user_id = ? AND up.id IN (?)';

export const SELECT_SQUAD_SETTINGS = 'SELECT formation, team_tactics AS teamTactics FROM user_squads WHERE user_id = ?';
export const UPSERT_SQUAD_SETTINGS = `
  INSERT INTO user_squads (user_id, formation, team_tactics) VALUES (?, ?, ?) AS new_row
  ON DUPLICATE KEY UPDATE formation = new_row.formation, team_tactics = new_row.team_tactics
`;

export const SELECT_COMPETITION = 'SELECT mode, status, state FROM user_competitions WHERE user_id = ? AND mode = ?';
export const SELECT_COMPETITION_FOR_UPDATE = 'SELECT mode, status, state FROM user_competitions WHERE user_id = ? AND mode = ? FOR UPDATE';
export const SELECT_ALL_COMPETITIONS = 'SELECT mode, status, state FROM user_competitions WHERE user_id = ?';
export const UPSERT_COMPETITION = `
  INSERT INTO user_competitions (user_id, mode, status, state) VALUES (?, ?, ?, ?) AS new_row
  ON DUPLICATE KEY UPDATE status = new_row.status, state = new_row.state
`;

export const SELECT_QUESTS = 'SELECT quest_key AS questKey, period_key AS periodKey, progress, claimed FROM user_quests WHERE user_id = ? AND period_key IN (?, ?)';
export const UPSERT_QUEST_PROGRESS = `
  INSERT INTO user_quests (user_id, quest_key, period_key, progress) VALUES (?, ?, ?, ?)
  ON DUPLICATE KEY UPDATE progress = progress + VALUES(progress)
`;
export const SELECT_QUEST_FOR_UPDATE = 'SELECT progress, claimed FROM user_quests WHERE user_id = ? AND quest_key = ? AND period_key = ? FOR UPDATE';
export const UPSERT_QUEST_CLAIM = `
  INSERT INTO user_quests (user_id, quest_key, period_key, progress, claimed) VALUES (?, ?, ?, 0, TRUE)
  ON DUPLICATE KEY UPDATE claimed = TRUE
`;

export const SELECT_PURCHASES = 'SELECT listing_key AS listingKey FROM transfer_purchases WHERE user_id = ? AND market_date = ?';
export const INSERT_PURCHASE = 'INSERT INTO transfer_purchases (user_id, market_date, listing_key) VALUES (?, ?, ?)';

export const SELECT_CLUB_RECORD = `
  SELECT
    COUNT(*) AS matches,
    COALESCE(SUM(score_home > score_away), 0) AS wins,
    COALESCE(SUM(score_home = score_away), 0) AS draws,
    COALESCE(SUM(score_home < score_away), 0) AS losses,
    COALESCE(SUM(score_home), 0) AS goalsFor,
    COALESCE(SUM(score_away), 0) AS goalsAgainst
  FROM match_histories WHERE home_club_id = ? AND competition_mode IS NOT NULL
`;

export const SELECT_MASTER_ALL = 'SELECT id, name, main_position AS mainPosition, preferred_role AS preferredRole, drop_weight AS dropWeight, base_stats AS baseStats, tags FROM player_master ORDER BY id';
export const SELECT_MASTER_BY_ID = 'SELECT id, name, main_position AS mainPosition, preferred_role AS preferredRole, drop_weight AS dropWeight, base_stats AS baseStats, tags FROM player_master WHERE id = ?';
export const INSERT_PLAYER_PLAIN = 'INSERT INTO user_players (user_id, player_id, level, exp, stamina, is_starter) VALUES (?, ?, 1, 0, 100, FALSE)';