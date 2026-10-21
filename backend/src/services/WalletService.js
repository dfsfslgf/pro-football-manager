import { InsufficientFundsError } from '../constants/errorCodes.js';
import WalletRepository from '../repositories/WalletRepository.js';

/**
 * 지갑 변동 + 재화 로그 기록 헬퍼. 호출자가 연 트랜잭션(conn)과 FOR UPDATE 로 잠근 wallet 객체를 전달해야 합니다.
 */
export default class WalletService {
  /**
   * 골드를 차감하고 SPEND 로그를 남깁니다.
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {{userId:number, cashPaid:number, cashFree:number, gold:number}} wallet
   * @param {number} amount
   * @param {string} reason
   * @returns {Promise<void>}
   * @throws {InsufficientFundsError}
   */
  static async spendGold(conn, wallet, amount, reason) {
    if (wallet.gold < amount) throw new InsufficientFundsError('골드가 부족합니다.');
    wallet.gold -= amount;
    await WalletRepository.updateWallet(conn, wallet);
    await WalletService.log(conn, wallet, 'SPEND', 'GOLD', amount, reason);
  }

  /**
   * 골드/무상 캐시를 지급하고 EARN 로그를 남깁니다.
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {{userId:number, cashPaid:number, cashFree:number, gold:number}} wallet
   * @param {{gold?:number, cashFree?:number}} reward
   * @param {string} reason
   * @returns {Promise<void>}
   */
  static async earn(conn, wallet, reward, reason) {
    const gold = reward.gold || 0;
    const cashFree = reward.cashFree || 0;
    if (gold <= 0 && cashFree <= 0) return;
    wallet.gold += gold;
    wallet.cashFree += cashFree;
    await WalletRepository.updateWallet(conn, wallet);
    if (gold > 0) await WalletService.log(conn, wallet, 'EARN', 'GOLD', gold, reason);
    if (cashFree > 0) await WalletService.log(conn, wallet, 'EARN', 'CASH_FREE', cashFree, reason);
  }

  /**
   * 현재 잔액 스냅샷과 함께 transactions 행을 기록합니다.
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {{userId:number, cashPaid:number, cashFree:number}} wallet
   * @param {'EARN'|'SPEND'|'REFUND'} type
   * @param {'GOLD'|'CASH_FREE'|'CASH_PAID'} currencyType
   * @param {number} amount
   * @param {string} reason
   * @returns {Promise<void>}
   */
  static async log(conn, wallet, type, currencyType, amount, reason) {
    await WalletRepository.insertTransaction(conn, {
      userId: wallet.userId,
      type,
      currencyType,
      amount,
      balanceAfterPaid: wallet.cashPaid,
      balanceAfterFree: wallet.cashFree,
      reason: reason.slice(0, 50),
    });
  }
}
