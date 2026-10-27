import pool from '../config/database.js';
import { TRAINING } from '../constants/clubRules.js';
import { NotFoundError, ValidationError } from '../constants/errorCodes.js';
import ClubRepository from '../repositories/ClubRepository.js';
import WalletRepository from '../repositories/WalletRepository.js';
import WalletService from './WalletService.js';
import { trackDailyQuest } from './QuestTracker.js';
import { computeOverall } from '../utils/playerMath.js';

const ROLE_OPTIONS = {
  DF: ['CB', 'LB', 'RB', 'LWB', 'RWB'],
  MF: ['CDM', 'CM', 'CAM', 'LM', 'RM'],
  FW: ['LW', 'RW', 'ST'],
};

let schemaChecked = false;
async function ensureTrainingColumns(conn) {
  if (schemaChecked) return;
  try {
    await conn.query('ALTER TABLE user_players MODIFY COLUMN secondary_role VARCHAR(64) DEFAULT NULL');
  } catch {
    // ignore
  }
  try {
    await conn.query('ALTER TABLE user_players ADD COLUMN max_level INT NOT NULL DEFAULT 20');
  } catch {
    // ignore
  }
  schemaChecked = true;
}

async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

function getBreakthroughRate(currentMaxLevel) {
  if (currentMaxLevel <= 20) return 0.70;
  if (currentMaxLevel <= 25) return 0.50;
  if (currentMaxLevel <= 30) return 0.35;
  return 0.20;
}

export default class TrainingService {
  /**
   * 일반 레벨업 특훈 및 중복 보유 선수를 활용한 한계돌파(+5 최대레벨 확장) 처리
   */
  static async levelUp(userId, userPlayerId) {
    return withTransaction(async (conn) => {
      await ensureTrainingColumns(conn);
      const wallet = await WalletRepository.findWalletWithLock(conn, userId);
      if (!wallet) throw new NotFoundError('지갑 정보를 찾을 수 없습니다.');
      const player = await ClubRepository.findPlayerForUpdate(conn, userId, userPlayerId);
      if (!player) throw new NotFoundError('선수를 찾을 수 없습니다.');

      const [maxRows] = await conn.query('SELECT max_level AS maxLevel FROM user_players WHERE id = ? AND user_id = ?', [
        userPlayerId,
        userId,
      ]);
      const currentMaxLevel = Number(maxRows?.[0]?.maxLevel || TRAINING.MAX_LEVEL || 20);

      // 현재 레벨이 최대 레벨에 도달한 경우 중복 보유 선수를 찾아 한계돌파 진행
      if (player.level >= currentMaxLevel) {
        if (currentMaxLevel >= 40) {
          throw new ValidationError('최종 한계돌파 레벨(Lv.40)에 도달했습니다.');
        }

        // ClubRepository.getFullPlayers를 사용하여 DB 컬럼명 차이와 무관하게 동일 마스터(playerId) 또는 동명 중복 선수 조회
        const allOwned = await ClubRepository.getFullPlayers(conn, userId);
        const dupCandidates = allOwned
          .filter(
            (p) =>
              p.userPlayerId !== Number(userPlayerId) &&
              (p.playerId === player.playerId || p.name === player.name) &&
              !p.isStarter &&
              p.lineupSlot === null
          )
          .sort((a, b) => a.level - b.level);

        if (dupCandidates.length === 0) {
          throw new ValidationError(
            `현재 최대 레벨(Lv.${currentMaxLevel})입니다. 한계돌파(+5레벨 확장)를 하려면 동일한 중복 선수(선발/후보에 배치되지 않은 예비 상태)가 필요합니다.`
          );
        }

        const dupCardId = Number(dupCandidates[0].userPlayerId);
        const breakthroughCost = TRAINING.levelUpCost(player.level) * 2;
        await WalletService.spendGold(conn, wallet, breakthroughCost, 'TRAINING_BREAKTHROUGH');

        // 재료로 사용된 중복 선수 카드 삭제
        await ClubRepository.deletePlayer(conn, userId, dupCardId);

        const btRate = player.bonusGauge >= 100 ? 1.0 : getBreakthroughRate(currentMaxLevel);
        const btSuccess = Math.random() < btRate;
        let nextLevel = player.level;
        let nextMaxLevel = currentMaxLevel;
        let nextGauge = player.bonusGauge;

        if (btSuccess) {
          nextMaxLevel = currentMaxLevel + 5;
          nextLevel = player.level + 1;
          nextGauge = 0;
          await conn.query('UPDATE user_players SET level = ?, max_level = ?, bonus_gauge = 0 WHERE id = ? AND user_id = ?', [
            nextLevel,
            nextMaxLevel,
            userPlayerId,
            userId,
          ]);
        } else {
          nextGauge = Math.min(100, player.bonusGauge + 25);
          await ClubRepository.updatePlayerGauge(conn, userId, userPlayerId, nextGauge);
        }

        await trackDailyQuest(conn, userId, 'TRAIN_PLAYER', 1);
        return {
          success: btSuccess,
          isBreakthrough: true,
          level: nextLevel,
          maxLevel: nextMaxLevel,
          gauge: nextGauge,
          cost: breakthroughCost,
          rate: btRate,
          overall: computeOverall(player.baseStats, nextLevel, player.mainPosition),
          remainingWallet: { cashPaid: wallet.cashPaid, cashFree: wallet.cashFree, gold: wallet.gold },
        };
      }

      const cost = TRAINING.levelUpCost(player.level);
      await WalletService.spendGold(conn, wallet, cost, 'TRAINING_LEVEL_UP');

      const rate = player.bonusGauge >= 100 ? 1 : TRAINING.successRate(player.level, player.bonusGauge);
      const success = Math.random() < rate;
      let level = player.level;
      let gauge = player.bonusGauge;
      if (success) {
        level += 1;
        gauge = 0;
        await ClubRepository.updatePlayerLevel(conn, userId, userPlayerId, level, gauge);
      } else {
        gauge = Math.min(100, gauge + TRAINING.FAIL_GAUGE);
        await ClubRepository.updatePlayerGauge(conn, userId, userPlayerId, gauge);
      }
      await trackDailyQuest(conn, userId, 'TRAIN_PLAYER', 1);
      return {
        success,
        isBreakthrough: false,
        level,
        maxLevel: currentMaxLevel,
        gauge,
        cost,
        rate: Math.round(rate * 1000) / 1000,
        overall: computeOverall(player.baseStats, level, player.mainPosition),
        remainingWallet: { cashPaid: wallet.cashPaid, cashFree: wallet.cashFree, gold: wallet.gold },
      };
    });
  }

  static async trainPosition(userId, userPlayerId, roleCode) {
    return withTransaction(async (conn) => {
      await ensureTrainingColumns(conn);
      const wallet = await WalletRepository.findWalletWithLock(conn, userId);
      if (!wallet) throw new NotFoundError('지갑 정보를 찾을 수 없습니다.');
      const player = await ClubRepository.findPlayerForUpdate(conn, userId, userPlayerId);
      if (!player) throw new NotFoundError('선수를 찾을 수 없습니다.');
      const options = ROLE_OPTIONS[player.mainPosition];
      if (!options) throw new ValidationError('골키퍼는 포지션 훈련을 할 수 없습니다.');
      if (!options.includes(roleCode)) throw new ValidationError('이 선수가 습득할 수 없는 세부 포지션입니다.');

      const existingSecondary = String(player.secondaryRole || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const allKnown = new Set([player.preferredRole, ...existingSecondary].filter(Boolean));

      if (allKnown.has(roleCode)) {
        throw new ValidationError('이미 숙련된 포지션입니다.');
      }

      const updatedSecondaryList = [...new Set([...existingSecondary, roleCode])];
      const updatedSecondaryStr = updatedSecondaryList.join(',');

      await WalletService.spendGold(conn, wallet, TRAINING.POSITION_TRAIN_COST, 'TRAINING_POSITION');
      await ClubRepository.updateSecondaryRole(conn, userId, userPlayerId, updatedSecondaryStr);

      return {
        learnedRoleCode: roleCode,
        secondaryRoleCode: updatedSecondaryStr,
        roleCodes: [player.preferredRole, ...updatedSecondaryList].filter(Boolean),
        cost: TRAINING.POSITION_TRAIN_COST,
        remainingWallet: { cashPaid: wallet.cashPaid, cashFree: wallet.cashFree, gold: wallet.gold },
      };
    });
  }

  static async recoverStamina(userId, userPlayerId = null) {
    return withTransaction(async (conn) => {
      const wallet = await WalletRepository.findWalletWithLock(conn, userId);
      if (!wallet) throw new NotFoundError('지갑 정보를 찾을 수 없습니다.');
      let targets = await ClubRepository.findLowStamina(conn, userId);
      if (userPlayerId) targets = targets.filter((t) => t.id === userPlayerId);
      if (targets.length === 0) throw new ValidationError('회복할 선수가 없습니다. (이미 체력이 가득 찼습니다)');

      const missing = targets.reduce((sum, t) => sum + (100 - t.stamina), 0);
      const base = missing * TRAINING.MEDICAL_COST_PER_POINT;
      const cost = Math.ceil(userPlayerId ? base : base * TRAINING.ALL_DISCOUNT);
      await WalletService.spendGold(conn, wallet, cost, userPlayerId ? 'MEDICAL_ONE' : 'MEDICAL_ALL');
      await ClubRepository.restoreStamina(conn, userId, userPlayerId || null);
      return {
        recovered: targets.length,
        cost,
        remainingWallet: { cashPaid: wallet.cashPaid, cashFree: wallet.cashFree, gold: wallet.gold },
      };
    });
  }
}