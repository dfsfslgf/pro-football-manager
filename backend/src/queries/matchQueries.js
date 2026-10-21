/** 경기 결과 저장 (대회 모드/정산 리포트 포함) */
export const INSERT_MATCH_HISTORY = `
  INSERT INTO match_histories
  (home_club_id, away_club_id, score_home, score_away, home_stats, away_stats, timeline_events, competition_mode, report)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

/** 경기 결과 단건 조회 */
export const SELECT_MATCH_BY_ID =
  'SELECT id AS matchId, home_club_id AS homeClubId, away_club_id AS awayClubId, score_home AS scoreHome, score_away AS scoreAway, home_stats AS homeStats, away_stats AS awayStats, timeline_events AS timelineEvents, competition_mode AS competitionMode, report, played_at AS playedAt FROM match_histories WHERE id = ?';
