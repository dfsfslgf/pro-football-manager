import pool from '../config/database.js';
import { SCOUT_PACKAGES, MARKET } from '../constants/clubRules.js';
import { InsufficientFundsError, InventoryFullError, NotFoundError, ValidationError } from '../constants/errorCodes.js';
import WalletRepository from '../repositories/WalletRepository.js';
import PlayerRepository from '../repositories/PlayerRepository.js';
import ClubRepository from '../repositories/ClubRepository.js';
import { computeOverall, rarityFromWeight } from '../utils/playerMath.js';
import { trackDailyQuest } from './QuestTracker.js';

/**
 * 일반 캐시 패키지용 가중치 기반 난수 추첨.
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
 * 골드 기본 스카우트(GOLD_BASIC) 전용 추첨기:
 * - LEGEND: 0% 
 * - EPIC: 0.4% (0.004)
 * - RARE: 19.6% (0.196)
 * - COMMON: 80.0% (0.800)
 */
const GOLD_BASIC_FIXED_ODDS = [
  { rarity: 'LEGEND', percent: 0 },
  { rarity: 'EPIC', percent: 0.4 },
  { rarity: 'RARE', percent: 19.6 },
  { rarity: 'COMMON', percent: 80.0 },
];

function pickGoldBasicCandidate(candidates) {
  // 등급별로 후보군 분리 (LEGEND는 완전 제외)
  const buckets = {
    EPIC: [],
    RARE: [],
    COMMON: [],
  };
  for (const c of candidates) {
    const r = rarityFromWeight(c.dropWeight);
    if (r === 'EPIC') buckets.EPIC.push(c);
    else if (r === 'RARE') buckets.RARE.push(c);
    else if (r === 'COMMON') buckets.COMMON.push(c);
  }

  const roll = Math.random() * 100; // 0.0 ~ 100.0
  let targetRarity = 'COMMON';
  if (roll < 0.4) {
    targetRarity = 'EPIC'; // 0.4% 확률
  } else if (roll < 20.0) {
    targetRarity = 'RARE'; // 19.6% 확률
  } else {
    targetRarity = 'COMMON'; // 80.0% 확률
  }

  let poolForRarity = buckets[targetRarity];
  if (!poolForRarity || poolForRarity.length === 0) {
    poolForRarity = buckets.COMMON.length > 0 ? buckets.COMMON : buckets.RARE.length > 0 ? buckets.RARE : candidates;
  }
  return poolForRarity[Math.floor(Math.random() * poolForRarity.length)];
}

export default class GachaService {
  /**
   * 스카우트 패키지 목록과 등급별 확률표를 반환.
   */
  static async getPackages() {
    const masters = await ClubRepository.getAllMasters(null);
    return Object.values(SCOUT_PACKAGES).map((pkg) => {
      // 골드 기본 스카우트는 고정 확률표(LEGEND 0%, EPIC 0.4%, RARE 19.6%, COMMON 80%) 반환
      if (pkg.key === 'GOLD_BASIC' || pkg.currency === 'GOLD') {
        return {
          key: pkg.key,
          label: pkg.label,
          currency: pkg.currency,
          costs: pkg.costs,
          positions: pkg.positions,
          odds: GOLD_BASIC_FIXED_ODDS,
        };
      }

      const pool_ = pkg.positions ? masters.filter((m) => pkg.positions.includes(m.mainPosition)) : masters;
      const total = pool_.reduce((sum, m) => sum + m.dropWeight, 0) || 1;
      const byRarity = {};
      for (const m of pool_) {
        const r = rarityFromWeight(m.dropWeight);
        byRarity[r] = (byRarity[r] || 0) + m.dropWeight;
      }
      const odds = ['LEGEND', 'EPIC', 'RARE', 'COMMON'].map((rarity) => ({
        rarity,
        percent: Math.round(((byRarity[rarity] || 0) / total) * 1000) / 10,
      }));
      return { key: pkg.key, label: pkg.label, currency: pkg.currency, costs: pkg.costs, positions: pkg.positions, odds };
    });
  }

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
      if (owned + count > MARKET.MAX_ROSTER) {
        throw new InventoryFullError(`선수 보유 한도(${MARKET.MAX_ROSTER}명)를 초과합니다.`);
      }

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

      const isGoldGacha = pkg.key === 'GOLD_BASIC' || pkg.currency === 'GOLD';
      const results = [];

      for (let i = 0; i < count; i++) {
        const picked = isGoldGacha ? pickGoldBasicCandidate(candidates) : pickWeighted(candidates);
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
        consumption: {
          packageKey: pkg.key,
          count,
          totalCost: cost,
          currency: pkg.currency,
          deductedFree,
          deductedPaid,
          currencyType,
        },
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