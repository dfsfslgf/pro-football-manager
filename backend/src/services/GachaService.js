import pool from '../config/database.js';
import { SCOUT_PACKAGES, MARKET } from '../constants/clubRules.js';
import { InsufficientFundsError, InventoryFullError, NotFoundError, ValidationError } from '../constants/errorCodes.js';
import WalletRepository from '../repositories/WalletRepository.js';
import PlayerRepository from '../repositories/PlayerRepository.js';
import ClubRepository from '../repositories/ClubRepository.js';
import { computeOverall, rarityFromWeight } from '../utils/playerMath.js';
import { trackDailyQuest } from './QuestTracker.js';

/**
 * 가중치 기반 난수 추첨.
 * @param {Array<{dropWeight:number}>} candidates
 * @returns {Object}
 */
function pickWeighted(candidates) {
  const total = candidates.reduce((sum, c) => sum + c.dropWeight, 0);
  let point = Math.floor(Math.random() * total);
  for (const candidate of candidates) {
    if (point < candidate.dropWeight) return candidate;
    point -= candidate.dropWeight;
  }
  return candidates[candidates.length - 1];
}

/**
 * 스카우트(가챠) 비즈니스 로직. 단일 트랜잭션 안에서 재화 차감 + 추첨 + 지급을 원자적으로 처리합니다.
 */
export default class GachaService {
  /**
   * 스카우트 패키지 목록과 등급별 확률표를 반환합니다.
   * @returns {Promise<Array<{key:string, label:string, currency:string, costs:Object, positions:string[]|null, odds:Array<{rarity:string, percent:number}>}>>}
   */
  static async getPackages() {
    const masters = await ClubRepository.getAllMasters(null);
    return Object.values(SCOUT_PACKAGES).map((pkg) => {
      const pool_ = pkg.positions ? masters.filter((m) => pkg.positions.includes(m.mainPosition)) : masters;
      const total = pool_.reduce((sum, m) => sum + m.dropWeight, 0) || 1;
      const byRarity = {};
      for (const m of pool_) byRarity[rarityFromWeight(m.dropWeight)] = (byRarity[rarityFromWeight(m.dropWeight)] || 0) + m.dropWeight;
      const odds = ['LEGEND', 'EPIC', 'RARE', 'COMMON'].map((rarity) => ({ rarity, percent: Math.round(((byRarity[rarity] || 0) / total) * 1000) / 10 }));
      return { key: pkg.key, label: pkg.label, currency: pkg.currency, costs: pkg.costs, positions: pkg.positions, odds };
    });
  }

  /**
   * 스카우트 실행. 캐시 패키지는 무상 캐시를 먼저 차감하고 부족분만 유상 캐시에서 차감합니다.
   * 지갑을 FOR UPDATE 로 잠근 뒤 인벤토리 한도를 검사하므로 동시 요청에서도 한도/잔액이 깨지지 않습니다.
   * @param {number} userId
   * @param {string} packageKey SCOUT_PACKAGES 키
   * @param {number} count 뽑기 횟수 (패키지 costs 에 정의된 횟수만 허용)
   * @returns {Promise<{results:Array<Object>, consumption:Object, remainingWallet:{cashPaid:number, cashFree:number, gold:number}}>}
   */
  static async scout(userId, packageKey, count = 1) {
    const pkg = SCOUT_PACKAGES[packageKey];
    if (!pkg) throw new ValidationError('알 수 없는 스카우트 패키지입니다.');
    const cost = pkg.costs[count];
    if (!cost) throw new ValidationError('해당 패키지에서 지원하지 않는 뽑기 횟수입니다.');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const wallet = await WalletRepository.findWalletWithLock(conn, userId);
      if (!wallet) throw new NotFoundError('유저 지갑 정보를 찾을 수 없습니다.');

      const owned = await PlayerRepository.countUserPlayers(conn, userId);
      if (owned + count > MARKET.MAX_ROSTER) throw new InventoryFullError(`선수 보유 한도(${MARKET.MAX_ROSTER}명)를 초과합니다.`);

      let deductedFree = 0;
      let deductedPaid = 0;
      let currencyType;
      if (pkg.currency === 'GOLD') {
        if (wallet.gold < cost) throw new InsufficientFundsError('골드가 부족합니다.');
        wallet.gold -= cost;
        currencyType = 'GOLD';
      } else {
        if (wallet.cashFree + wallet.cashPaid < cost) throw new InsufficientFundsError('보유 캐시가 부족합니다.');
        if (wallet.cashFree >= cost) {
          deductedFree = cost;
          wallet.cashFree -= cost;
          currencyType = 'CASH_FREE';
        } else {
          deductedFree = wallet.cashFree;
          deductedPaid = cost - deductedFree;
          wallet.cashFree = 0;
          wallet.cashPaid -= deductedPaid;
          currencyType = deductedFree > 0 ? 'CASH_MIXED' : 'CASH_PAID';
        }
      }

      const candidates = await PlayerRepository.getGachaCandidatePool(conn, pkg.positions);
      if (candidates.length === 0) throw new NotFoundError('뽑을 수 있는 선수 후보군이 없습니다.');

      const results = [];
      for (let i = 0; i < count; i++) {
        const picked = pickWeighted(candidates);
        const userPlayerId = await ClubRepository.insertPlainPlayer(conn, userId, picked.id);
        results.push({
          userPlayerId,
          player: {
            playerId: picked.id,
            name: picked.name,
            mainPosition: picked.mainPosition,
            preferredRoleCode: picked.preferredRole,
            baseStats: picked.baseStats,
            overall: computeOverall(picked.baseStats, 1, picked.mainPosition),
            rarity: rarityFromWeight(picked.dropWeight),
            tags: picked.tags,
          },
        });
      }

      await WalletRepository.updateWallet(conn, wallet);
      await WalletRepository.insertTransaction(conn, {
        userId,
        type: 'SPEND',
        currencyType,
        amount: cost,
        balanceAfterPaid: wallet.cashPaid,
        balanceAfterFree: wallet.cashFree,
        reason: `SCOUT_${pkg.key}_${count}`.slice(0, 50),
      });
      await trackDailyQuest(conn, userId, 'SCOUT_ONCE', 1);
      await conn.commit();

      return {
        results,
        consumption: { packageKey: pkg.key, count, totalCost: cost, currency: pkg.currency, deductedFree, deductedPaid, currencyType },
        remainingWallet: { cashPaid: wallet.cashPaid, cashFree: wallet.cashFree, gold: wallet.gold },
      };
    } catch (err) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error('[GachaService] rollback 실패:', rollbackErr);
      }
      throw err;
    } finally {
      conn.release();
    }
  }
}
