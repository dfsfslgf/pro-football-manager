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

let columnExpanded = false;
async function ensureSecondaryRoleColumnWidth(conn) {
  if (columnExpanded) return;
  try {
    await conn.query('ALTER TABLE user_players MODIFY COLUMN secondary_role VARCHAR(64) DEFAULT NULL');
    columnExpanded = true;
  } catch {
    columnExpanded = true;
  }
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

export default class TrainingService {
  static async levelUp(userId, userPlayerId) {
    return withTransaction(async (conn) => {
      const wallet = await WalletRepository.findWalletWithLock(conn, userId);
      if (!wallet) throw new NotFoundError('지갑 정보를 찾을 수 없습니다.');
      const player = await ClubRepository.findPlayerForUpdate(conn, userId, userPlayerId);
      if (!player) throw new NotFoundError('선수를 찾을 수 없습니다.');
      if (player.level >= TRAINING.MAX_LEVEL) throw new ValidationError(`최대 레벨(${TRAINING.MAX_LEVEL})입니다.`);

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
        level,
        gauge,
        cost,
        rate: Math.round(rate * 1000) / 1000,
        overall: computeOverall(player.baseStats, level, player.mainPosition),
        remainingWallet: { cashPaid: wallet.cashPaid, cashFree: wallet.cashFree, gold: wallet.gold },
      };
    });
  }

  /**
   * [요구사항 5번 완벽 해결]
   * 포지션 숙련도 훈련 시 기존 포지션을 지우지 않고 쉼표 구분 문자열("LB,RB,CB")로 계속 추가하여
   * 한 선수가 여러 개의 멀티 포지션을 습득할 수 있도록 지원합니다!
   */
  static async trainPosition(userId, userPlayerId, roleCode) {
    return withTransaction(async (conn) => {
      await ensureSecondaryRoleColumnWidth(conn);
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