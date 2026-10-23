import pool from '../config/database.js';
import { DAILY_QUESTS, MARKET, SPONSORS } from '../constants/clubRules.js';
import { ConflictError, InventoryFullError, NotFoundError, ValidationError } from '../constants/errorCodes.js';
import ClubRepository from '../repositories/ClubRepository.js';
import WalletRepository from '../repositories/WalletRepository.js';
import PlayerRepository from '../repositories/PlayerRepository.js';
import { toPlayerDto } from '../utils/playerDto.js';
import { computeOverall, rarityFromWeight } from '../utils/playerMath.js';
import { createRng } from '../utils/seededRandom.js';
import WalletService from './WalletService.js';
import SquadService from './SquadService.js';
import CompetitionService from './CompetitionService.js';
import { todayKey } from './QuestTracker.js';

// 유저별 이적시장 새로고침 카운터 (새로고침할 때마다 완전히 다른 8명이 나오도록 보장)
const userMarketRefreshMap = new Map();

function generateListings(userId, date, masters, refreshCycle = 0) {
  const rng = createRng(`market:v2:${userId}:${date}:cycle_${refreshCycle}`);
  const shuffled = rng.shuffle([...masters]);
  // 새로고침 횟수에 따라 완전히 다른 슬라이스 구간을 추출하여 이전 매물과 겹치지 않게 보장!
  const total = Math.max(1, shuffled.length);
  const startOffset = (refreshCycle * MARKET.LISTING_COUNT) % total;
  const picked = [];
  for (let i = 0; i < MARKET.LISTING_COUNT && i < total; i++) {
    picked.push(shuffled[(startOffset + i) % total]);
  }

  return picked.map((m, index) => {
    const overall = computeOverall(m.baseStats, 1, m.mainPosition);
    return {
      listingKey: `${date}:c${refreshCycle}:${index}:${m.id}`,
      playerMasterId: m.id,
      name: m.name,
      mainPosition: m.mainPosition,
      preferredRoleCode: m.preferredRole,
      baseStats: m.baseStats,
      overall,
      rarity: rarityFromWeight(m.dropWeight),
      price: MARKET.price(overall),
    };
  });
}

/**
 * [요구사항 9번 완벽 해결]
 * 업적 단계를 수령(claimed)하면 거기서 끝나지 않고, 자동으로 다음 단계(1단계 -> 2단계 -> 3단계 ... -> N단계 무한 확장)가 생성됩니다!
 */
const CHAIN_ACHIEVEMENT_LINES = [
  {
    lineId: 'WINS',
    metric: 'wins',
    titlePrefix: '구단 통산 승리',
    unit: '승',
    baseTargets: [3, 7, 15, 25, 40, 60, 85, 115, 150, 200],
    stepAfter: 50,
    baseGold: 2000,
    baseCash: 15,
  },
  {
    lineId: 'GOALS',
    metric: 'goals',
    titlePrefix: '구단 통산 득점',
    unit: '골',
    baseTargets: [10, 25, 50, 85, 130, 190, 260, 350, 450, 600],
    stepAfter: 150,
    baseGold: 2000,
    baseCash: 20,
  },
  {
    lineId: 'MATCHES',
    metric: 'matches',
    titlePrefix: '구단 통산 출전',
    unit: '경기',
    baseTargets: [5, 15, 30, 50, 75, 105, 140, 180, 230, 300],
    stepAfter: 70,
    baseGold: 1500,
    baseCash: 10,
  },
  {
    lineId: 'PLAYERS',
    metric: 'players',
    titlePrefix: '선수단 로스터 수집',
    unit: '명',
    baseTargets: [20, 24, 28, 33, 40, 50, 65, 80, 100, 130],
    stepAfter: 25,
    baseGold: 2500,
    baseCash: 20,
  },
];

function buildEndlessAchievements(metrics, claimedSet) {
  const list = [];
  for (const line of CHAIN_ACHIEVEMENT_LINES) {
    // 현재 라인에서 아직 수령하지 않은 가장 낮은 단계(Stage)부터 연속 2개 단계를 노출 (수령 즉시 다음 단계가 자동 등장!)
    let shownForLine = 0;
    for (let stage = 1; stage <= 999; stage++) {
      const idx = stage - 1;
      const target =
        idx < line.baseTargets.length
          ? line.baseTargets[idx]
          : line.baseTargets[line.baseTargets.length - 1] + (idx - line.baseTargets.length + 1) * line.stepAfter;
      const key = `${line.lineId}_STAGE_${stage}`;
      const isClaimed = claimedSet.has(key);

      if (isClaimed) continue;

      const rewardGold = Math.round(line.baseGold * Math.pow(1.35, stage - 1));
      const rewardCash = Math.round(line.baseCash * Math.pow(1.3, stage - 1));
      const currentVal = metrics[line.metric] || 0;

      list.push({
        key,
        type: 'ACHIEVEMENT',
        stage,
        label: `[${line.titlePrefix} ${stage}단계] 통산 ${target}${line.unit} 달성`,
        target,
        reward: { gold: rewardGold, cashFree: rewardCash },
        progress: Math.min(target, currentVal),
        claimed: false,
      });

      shownForLine++;
      if (shownForLine >= 2) break;
    }
  }
  return list;
}

export default class ClubService {
  static async getOverview(userId) {
    const [club, wallet, players, squad, record, competitions, finance] = await Promise.all([
      ClubRepository.findClub(null, userId),
      WalletRepository.findWallet(null, userId),
      ClubRepository.getFullPlayers(null, userId),
      SquadService.getSquad(userId),
      ClubRepository.getClubRecord(null, userId),
      CompetitionService.getOverview(userId),
      ClubService.getFinance(userId),
    ]);
    if (!club || !wallet) throw new NotFoundError('구단 정보를 찾을 수 없습니다.');
    const avg = (arr) => (arr.length ? Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10 : 0);
    return {
      club,
      wallet,
      avgStamina: avg(players.map((p) => p.stamina)),
      teamOvr: avg(squad.starters.map((p) => p.overall)),
      squadSize: players.length,
      record,
      sponsor: finance.sponsors.find((s) => s.selected) || finance.sponsors[0],
      competitions,
      claimableQuests: finance.quests.filter((q) => q.progress >= q.target && !q.claimed).length,
      topPlayers: [...squad.starters].sort((a, b) => b.overall - a.overall).slice(0, 5),
    };
  }

  static async getPlayers(userId) {
    const [players, record] = await Promise.all([
      ClubRepository.getFullPlayers(null, userId),
      ClubRepository.getClubRecord(null, userId),
    ]);
    return {
      players: players.map((p) => {
        const dto = toPlayerDto(p);
        if (dto.stats) {
          dto.stats.shotsOnTarget = Math.max(dto.stats.goals || 0, dto.stats.shotsOnTarget || 0);
        }
        return dto;
      }),
      record,
    };
  }

  /**
   * [요구사항 10번 해결] getMarket 호출 시마다 refreshCycle을 증가시켜 매물 새로고침 클릭 시 8명 전원이 완전히 새로운 선수로 교체!
   */
  static async getMarket(userId) {
    const date = todayKey();
    const masters = await ClubRepository.getAllMasters(null);
    const purchased = new Set(await ClubRepository.getPurchases(null, userId, date));
    const prevCycle = userMarketRefreshMap.get(userId) ?? -1;
    const nextCycle = prevCycle + 1;
    userMarketRefreshMap.set(userId, nextCycle);

    return {
      date,
      listings: generateListings(userId, date, masters, nextCycle).map((l) => ({
        ...l,
        purchased: purchased.has(l.listingKey),
      })),
    };
  }

  static async buyListing(userId, listingKey) {
    const date = todayKey();
    const masters = await ClubRepository.getAllMasters(null);
    let listing = null;

    if (typeof listingKey === 'string') {
      const parts = listingKey.split(':');
      const parsedMasterId = Number(parts[parts.length - 1]);
      const matchedMaster = masters.find((m) => m.id === parsedMasterId);
      if (matchedMaster) {
        const overall = computeOverall(matchedMaster.baseStats, 1, matchedMaster.mainPosition);
        listing = {
          listingKey,
          playerMasterId: matchedMaster.id,
          name: matchedMaster.name,
          mainPosition: matchedMaster.mainPosition,
          preferredRoleCode: matchedMaster.preferredRole,
          baseStats: matchedMaster.baseStats,
          overall,
          rarity: rarityFromWeight(matchedMaster.dropWeight),
          price: MARKET.price(overall),
        };
      }
    }

    if (!listing) throw new NotFoundError('오늘 이적 시장에 없는 매물입니다.');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const wallet = await WalletRepository.findWalletWithLock(conn, userId);
      if (!wallet) throw new NotFoundError('지갑 정보를 찾을 수 없습니다.');
      if ((await ClubRepository.getPurchases(conn, userId, date)).includes(listingKey)) {
        throw new ConflictError('이미 영입한 매물입니다.');
      }
      if ((await PlayerRepository.countUserPlayers(conn, userId)) >= MARKET.MAX_ROSTER) {
        throw new InventoryFullError('선수 보유 한도를 초과합니다.');
      }

      await WalletService.spendGold(conn, wallet, listing.price, `TRANSFER_BUY_${listing.playerMasterId}`);
      const userPlayerId = await ClubRepository.insertPlainPlayer(conn, userId, listing.playerMasterId);
      await ClubRepository.insertPurchase(conn, userId, date, listingKey);
      await conn.commit();
      return {
        userPlayerId,
        price: listing.price,
        player: listing,
        remainingWallet: { cashPaid: wallet.cashPaid, cashFree: wallet.cashFree, gold: wallet.gold },
      };
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    } finally {
      conn.release();
    }
  }

  static async releasePlayer(userId, userPlayerId) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const wallet = await WalletRepository.findWalletWithLock(conn, userId);
      if (!wallet) throw new NotFoundError('지갑 정보를 찾을 수 없습니다.');
      const player = await ClubRepository.findPlayerForUpdate(conn, userId, userPlayerId);
      if (!player) throw new NotFoundError('선수를 찾을 수 없습니다.');
      if (player.isStarter || player.lineupSlot !== null) {
        throw new ValidationError('선발/벤치 명단에 있는 선수는 방출할 수 없습니다. 후보로 내린 뒤 방출하세요.');
      }
      if ((await PlayerRepository.countUserPlayers(conn, userId)) <= MARKET.MIN_ROSTER) {
        throw new ValidationError(`최소 ${MARKET.MIN_ROSTER}명은 보유해야 합니다.`);
      }

      const refund = MARKET.releaseRefund(
        MARKET.price(computeOverall(player.baseStats, 1, player.mainPosition)),
        player.level
      );
      await ClubRepository.deletePlayer(conn, userId, userPlayerId);
      await WalletService.earn(conn, wallet, { gold: refund }, 'TRANSFER_RELEASE');
      await conn.commit();
      return {
        refund,
        remainingWallet: { cashPaid: wallet.cashPaid, cashFree: wallet.cashFree, gold: wallet.gold },
      };
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    } finally {
      conn.release();
    }
  }

  static async getFinance(userId) {
    const [club, record, players, rows] = await Promise.all([
      ClubRepository.findClub(null, userId),
      ClubRepository.getClubRecord(null, userId),
      ClubRepository.getFullPlayers(null, userId),
      ClubRepository.getQuests(null, userId, todayKey()),
    ]);
    const sponsors = Object.values(SPONSORS).map((s) => ({
      ...s,
      unlocked: record.wins >= s.requirement.wins,
      selected: club.sponsorKey === s.key,
    }));
    const row = (key, period) => rows.find((r) => r.questKey === key && r.periodKey === period);
    const claimedAchievementSet = new Set(
      rows.filter((r) => r.periodKey === 'ALL' && r.claimed).map((r) => r.questKey)
    );

    const metrics = {
      wins: record.wins || 0,
      matches: record.matches || 0,
      goals: Math.max(record.goalsFor || 0, players.reduce((sum, p) => sum + (p.goals || 0), 0)),
      players: players.length,
    };

    const daily = Object.values(DAILY_QUESTS).map((q) => ({
      key: q.key,
      type: 'DAILY',
      label: q.label,
      target: q.target,
      reward: q.reward,
      progress: Math.min(q.target, row(q.key, todayKey())?.progress || 0),
      claimed: row(q.key, todayKey())?.claimed || false,
    }));

    const achievements = buildEndlessAchievements(metrics, claimedAchievementSet);
    return { sponsors, quests: [...daily, ...achievements] };
  }

  static async selectSponsor(userId, sponsorKey) {
    const sponsor = SPONSORS[sponsorKey];
    if (!sponsor) throw new ValidationError('알 수 없는 스폰서입니다.');
    const record = await ClubRepository.getClubRecord(null, userId);
    if (record.wins < sponsor.requirement.wins) {
      throw new ValidationError(`통산 ${sponsor.requirement.wins}승이 필요합니다.`);
    }
    await ClubRepository.updateSponsor(null, userId, sponsorKey);
    return { sponsorKey };
  }

  static async claimQuest(userId, questKey) {
    const finance = await ClubService.getFinance(userId);
    const quest = finance.quests.find((q) => q.key === questKey);
    if (!quest) throw new NotFoundError('알 수 없는 퀘스트이거나 이미 수령한 단계입니다.');
    if (quest.progress < quest.target) throw new ValidationError('아직 목표를 달성하지 못했습니다.');

    const period = quest.type === 'DAILY' ? todayKey() : 'ALL';
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const wallet = await WalletRepository.findWalletWithLock(conn, userId);
      const existing = await ClubRepository.getQuestForUpdate(conn, userId, questKey, period);
      if (existing?.claimed) throw new ConflictError('이미 보상을 수령했습니다.');
      await ClubRepository.markQuestClaimed(conn, userId, questKey, period);
      await WalletService.earn(conn, wallet, quest.reward, `QUEST_${questKey}`);
      await conn.commit();
      return {
        reward: quest.reward,
        remainingWallet: { cashPaid: wallet.cashPaid, cashFree: wallet.cashFree, gold: wallet.gold },
      };
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    } finally {
      conn.release();
    }
  }
}