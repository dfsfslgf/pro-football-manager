import pool from '../config/database.js';
import {
  SELECT_WALLET,
  SELECT_WALLET_FOR_UPDATE,
  UPDATE_WALLET_BALANCE,
  INSERT_TRANSACTION,
} from '../queries/walletQueries.js';

/**
 * 지갑/재화 로그 데이터 접근 계층. 모든 메서드는 트랜잭션 커넥션(conn)을 첫 인자로 받으며,
 * conn 이 없으면 기본 pool 을 사용.
 */
export default class WalletRepository {
  /**
   * 지갑을 잠금 없이 조회. (읽기 전용 화면용)
   * @param {import('mysql2/promise').PoolConnection|null} conn
   * @param {number} userId
   * @returns {Promise<{userId:number, cashPaid:number, cashFree:number, gold:number}|null>}
   */
  static async findWallet(conn, userId) {
    const [rows] = await (conn || pool).query(SELECT_WALLET, [userId]);
    if (!rows[0]) return null;
    return { userId: Number(rows[0].userId), cashPaid: Number(rows[0].cashPaid), cashFree: Number(rows[0].cashFree), gold: Number(rows[0].gold) };
  }

  /**
   * 지갑 조회
   * @param {import('mysql2/promise').PoolConnection|null} conn
   * @param {number} userId
   * @returns {Promise<{userId:number, cashPaid:number, cashFree:number, gold:number}|null>}
   */
  static async findWalletWithLock(conn, userId) {
    const executor = conn || pool;
    const [rows] = await executor.query(SELECT_WALLET_FOR_UPDATE, [userId]);
    if (!rows[0]) return null;
    return {
      userId: Number(rows[0].userId),
      cashPaid: Number(rows[0].cashPaid),
      cashFree: Number(rows[0].cashFree),
      gold: Number(rows[0].gold),
    };
  }

  /**
   * 지갑 잔액을 갱신.
   * @param {import('mysql2/promise').PoolConnection|null} conn
   * @param {{userId:number, cashPaid:number, cashFree:number, gold:number}} wallet
   * @returns {Promise<number>} 영향받은 행 수
   */
  static async updateWallet(conn, { userId, cashPaid, cashFree, gold }) {
    const executor = conn || pool;
    const [result] = await executor.query(UPDATE_WALLET_BALANCE, [cashPaid, cashFree, gold, userId]);
    return result.affectedRows;
  }

  /**
   * 재화 변동 영수증(transactions)을 기록.
   * @param {import('mysql2/promise').PoolConnection|null} conn
   * @param {{userId:number, type:'EARN'|'SPEND'|'REFUND', currencyType:string, amount:number, balanceAfterPaid:number, balanceAfterFree:number, reason:string}} txData
   * @returns {Promise<number>} 생성된 transaction id
   */
  static async insertTransaction(conn, txData) {
    const executor = conn || pool;
    const [result] = await executor.query(INSERT_TRANSACTION, [
      txData.userId,
      txData.type,
      txData.currencyType,
      txData.amount,
      txData.balanceAfterPaid,
      txData.balanceAfterFree,
      txData.reason,
    ]);
    return result.insertId;
  }
}
