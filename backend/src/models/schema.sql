-- Pro Football Manager : MySQL 8.0+ DDL (InnoDB / utf8mb4)
-- 이전 버전 스키마로 만든 개발용 DB 는 DROP DATABASE 후 다시 생성하는 것을 권장합니다. (npm run db:init)

CREATE TABLE IF NOT EXISTS `users` (
  `id`            BIGINT NOT NULL AUTO_INCREMENT,
  `nickname`      VARCHAR(20) NOT NULL,
  `password_hash` VARCHAR(200) NOT NULL,
  `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_nickname` (`nickname`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `clubs` (
  `user_id`      BIGINT NOT NULL,
  `name`         VARCHAR(30) NOT NULL,
  `emblem_icon`  VARCHAR(16) NOT NULL,
  `emblem_color` VARCHAR(9) NOT NULL,
  `sponsor_key`  VARCHAR(20) NOT NULL DEFAULT 'BASIC',
  `created_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_wallets` (
  `user_id`    BIGINT NOT NULL,
  `cash_paid`  INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '유료 결제 캐시',
  `cash_free`  INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '이벤트/보상 무상 캐시',
  `gold`       BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '인게임 골드',
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `player_master` (
  `id`             BIGINT NOT NULL AUTO_INCREMENT,
  `name`           VARCHAR(100) NOT NULL,
  `main_position`  VARCHAR(10) NOT NULL COMMENT 'GK, DF, MF, FW',
  `preferred_role` VARCHAR(4) NULL COMMENT '세부 포지션: GK, CB, LB, RB, CDM, CM, CAM, LM, RM, LW, RW, ST',
  `drop_weight`    INT UNSIGNED NOT NULL DEFAULT 100 COMMENT '가챠 추첨 가중치(희귀할수록 낮음)',
  `base_stats`     JSON NOT NULL COMMENT '{"speed":85,"shooting":80,"passing":75,"dribbling":82,"defense":40,"physical":70,"gkReflexes":10,"staminaMax":90}',
  `tags`           JSON NOT NULL COMMENT '["SON_ZONE", "SPEEDSTER"]',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_players` (
  `id`              BIGINT NOT NULL AUTO_INCREMENT,
  `user_id`         BIGINT NOT NULL,
  `player_id`       BIGINT NOT NULL,
  `level`           INT UNSIGNED NOT NULL DEFAULT 1,
  `exp`             INT UNSIGNED NOT NULL DEFAULT 0,
  `stamina`         INT UNSIGNED NOT NULL DEFAULT 100,
  `is_starter`      BOOLEAN NOT NULL DEFAULT FALSE,
  `lineup_slot`     TINYINT UNSIGNED NULL COMMENT '라인업 슬롯: 0~10 선발(포메이션 slotIndex), 11~17 벤치, NULL 후보',
  `instruction`     VARCHAR(20) NULL COMMENT '개인 지침',
  `secondary_role`  VARCHAR(4) NULL COMMENT '포지션 숙련도 훈련으로 얻은 보조 세부 포지션',
  `bonus_gauge`     INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '강화 보너스 게이지(0~100)',
  `matches_played`  INT UNSIGNED NOT NULL DEFAULT 0,
  `goals`           INT UNSIGNED NOT NULL DEFAULT 0,
  `assists`         INT UNSIGNED NOT NULL DEFAULT 0,
  `clean_sheets`    INT UNSIGNED NOT NULL DEFAULT 0,
  `goals_conceded`  INT UNSIGNED NOT NULL DEFAULT 0,
  `saves`           INT UNSIGNED NOT NULL DEFAULT 0,
  `shots_on_target` INT UNSIGNED NOT NULL DEFAULT 0,
  `yellow_cards`    INT UNSIGNED NOT NULL DEFAULT 0,
  `red_cards`       INT UNSIGNED NOT NULL DEFAULT 0,
  `rating_sum`      DECIMAL(10,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  INDEX `idx_user_players_user_id` (`user_id`),
  CONSTRAINT `fk_user_players_player_master` FOREIGN KEY (`player_id`) REFERENCES `player_master` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_squads` (
  `user_id`      BIGINT NOT NULL,
  `formation`    VARCHAR(10) NOT NULL DEFAULT '4-3-3' COMMENT '4-3-3 | 4-4-2 | 4-2-3-1 | 3-5-2',
  `team_tactics` JSON NULL COMMENT '{"mentality":"BALANCED","passingStyle":"MIXED","tempo":"NORMAL","defensiveLine":"NORMAL","pressing":"MEDIUM"}',
  `updated_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `transactions` (
  `id`                 BIGINT NOT NULL AUTO_INCREMENT,
  `user_id`            BIGINT NOT NULL,
  `type`               ENUM('EARN', 'SPEND', 'REFUND') NOT NULL,
  `currency_type`      ENUM('CASH_PAID', 'CASH_FREE', 'CASH_MIXED', 'GOLD') NOT NULL,
  `amount`             INT NOT NULL,
  `balance_after_paid` INT UNSIGNED NOT NULL COMMENT '차감/획득 후 유상 캐시 잔액',
  `balance_after_free` INT UNSIGNED NOT NULL COMMENT '차감/획득 후 무상 캐시 잔액',
  `reason`             VARCHAR(50) NOT NULL,
  `created_at`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_transactions_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `match_histories` (
  `id`               BIGINT NOT NULL AUTO_INCREMENT,
  `home_club_id`     BIGINT NOT NULL,
  `away_club_id`     BIGINT NOT NULL,
  `score_home`       INT UNSIGNED NOT NULL DEFAULT 0,
  `score_away`       INT UNSIGNED NOT NULL DEFAULT 0,
  `home_stats`       JSON NOT NULL,
  `away_stats`       JSON NOT NULL,
  `timeline_events`  JSON NOT NULL,
  `competition_mode` VARCHAR(20) NULL,
  `report`           JSON NULL COMMENT '선수별 평점/MOM/보상 정산 리포트',
  `played_at`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_match_histories_home` (`home_club_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_competitions` (
  `user_id`    BIGINT NOT NULL,
  `mode`       VARCHAR(20) NOT NULL COMMENT 'LEAGUE | CHAMPIONS_CUP | WORLD_CUP | CHALLENGE_TOWER | RANKED',
  `status`     VARCHAR(10) NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE | FINISHED',
  `state`      JSON NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `mode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_quests` (
  `user_id`    BIGINT NOT NULL,
  `quest_key`  VARCHAR(30) NOT NULL,
  `period_key` VARCHAR(10) NOT NULL COMMENT '일일 퀘스트는 YYYY-MM-DD, 업적은 ALL',
  `progress`   INT UNSIGNED NOT NULL DEFAULT 0,
  `claimed`    BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (`user_id`, `quest_key`, `period_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `transfer_purchases` (
  `user_id`     BIGINT NOT NULL,
  `market_date` DATE NOT NULL,
  `listing_key` VARCHAR(40) NOT NULL,
  PRIMARY KEY (`user_id`, `market_date`, `listing_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
