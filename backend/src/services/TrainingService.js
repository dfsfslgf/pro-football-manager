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

/**
 * 트랜잭션을 열고 콜백을 실행합니다. 실패 시 롤백합니다.
 * @template T
 * @param {(conn: import('mysql2/promise').PoolConnection) => Promise<T>} fn
 * @returns {Promise<T>}
 */
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

/**
 * 골드 소모 선수 강화(레벨업), 포지션 숙련도 훈련, 의무실(체력 회복) 비즈니스 로직.
 */
export default class TrainingService {
  /**
   * 레벨업 특훈. 성공 확률은 레벨이 높을수록 낮아지고, 실패하면 보너스 게이지가 쌓여 이후 확률이 올라갑니다.
   * 성공 시 레벨 +1 (모든 기본 스탯 +2% 영구 상승), 게이지 100 이면 확정 성공합니다.
   * @param {number} userId
   * @param {number} userPlayerId
   * @returns {Promise<{success:boolean, level:number, gauge:number, cost:number, rate:number, overall:number, remainingWallet:Object}>}
   */
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
   * 포지션 숙련도 훈련: 같은 포지션 그룹의 세부 포지션을 보조 포지션(자연스러운 포지션)으로 추가합니다.
   * @param {number} userId
   * @param {number} userPlayerId
   * @param {string} roleCode 예: 'LB', 'CAM'
   * @returns {Promise<{secondaryRoleCode:string, cost:number, remainingWallet:Object}>}
   */
  static async trainPosition(userId, userPlayerId, roleCode) {
    return withTransaction(async (conn) => {
      const wallet = await WalletRepository.findWalletWithLock(conn, userId);
      if (!wallet) throw new NotFoundError('지갑 정보를 찾을 수 없습니다.');
      const player = await ClubRepository.findPlayerForUpdate(conn, userId, userPlayerId);
      if (!player) throw new NotFoundError('선수를 찾을 수 없습니다.');
      const options = ROLE_OPTIONS[player.mainPosition];
      if (!options) throw new ValidationError('골키퍼는 포지션 훈련을 할 수 없습니다.');
      if (!options.includes(roleCode)) throw new ValidationError('이 선수가 습득할 수 없는 세부 포지션입니다.');
      if (roleCode === player.preferredRole || roleCode === player.secondaryRole) throw new ValidationError('이미 숙련된 포지션입니다.');

      await WalletService.spendGold(conn, wallet, TRAINING.POSITION_TRAIN_COST, 'TRAINING_POSITION');
      await ClubRepository.updateSecondaryRole(conn, userId, userPlayerId, roleCode);
      return {
        secondaryRoleCode: roleCode,
        cost: TRAINING.POSITION_TRAIN_COST,
        remainingWallet: { cashPaid: wallet.cashPaid, cashFree: wallet.cashFree, gold: wallet.gold },
      };
    });
  }

  /**
   * 스포츠 과학 의무실: 소모된 체력을 골드를 내고 100% 로 회복합니다. userPlayerId 가 없으면 전체 선수단(10% 할인).
   * @param {number} userId
   * @param {number|null} userPlayerId
   * @returns {Promise<{recovered:number, cost:number, remainingWallet:Object}>}
   */
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
      return { recovered: targets.length, cost, remainingWallet: { cashPaid: wallet.cashPaid, cashFree: wallet.cashFree, gold: wallet.gold } };
    });
  }
}
