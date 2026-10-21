import pool from '../config/database.js';
import { ACHIEVEMENTS, DAILY_QUESTS, MARKET, SPONSORS } from '../constants/clubRules.js';
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

/**
 * 오늘의 이적시장 명단을 (유저, 날짜) 시드로 결정론적으로 생성합니다.
 * @param {number} userId
 * @param {string} date YYYY-MM-DD
 * @param {Object[]} masters player_master 전체
 * @returns {Array<{listingKey:string, playerMasterId:number, name:string, mainPosition:string, preferredRoleCode:string, baseStats:Object, overall:number, rarity:string, price:number}>}
 */
function generateListings(userId, date, masters) {
  const rng = createRng(`market:${userId}:${date}`);
  return rng
    .shuffle(masters)
    .slice(0, MARKET.LISTING_COUNT)
    .map((m, index) => {
      const overall = computeOverall(m.baseStats, 1, m.mainPosition);
      return {
        listingKey: `${date}:${index}:${m.id}`,
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
 * 구단 대시보드, 선수 기록, 이적 시장, 스폰서/퀘스트 비즈니스 로직.
 */
export default class ClubService {
  /**
   * 로비 대시보드용 요약 정보를 반환합니다.
   * @param {number} userId
   * @returns {Promise<Object>}
   */
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
      sponsor: finance.sponsors.find((s) => s.selected),
      competitions,
      claimableQuests: finance.quests.filter((q) => q.progress >= q.target && !q.claimed).length,
      topPlayers: [...squad.starters].sort((a, b) => b.overall - a.overall).slice(0, 5),
    };
  }

  /**
   * 보유 선수 전체(누적 기록 포함)와 구단 통산 기록을 반환합니다.
   * @param {number} userId
   * @returns {Promise<{players:Object[], record:Object}>}
   */
  static async getPlayers(userId) {
    const [players, record] = await Promise.all([ClubRepository.getFullPlayers(null, userId), ClubRepository.getClubRecord(null, userId)]);
    return { players: players.map(toPlayerDto), record };
  }

  /**
   * 오늘의 이적시장 명단(구매 여부 포함)을 반환합니다.
   * @param {number} userId
   * @returns {Promise<{date:string, listings:Object[]}>}
   */
  static async getMarket(userId) {
    const date = todayKey();
    const masters = await ClubRepository.getAllMasters(null);
    const purchased = new Set(await ClubRepository.getPurchases(null, userId, date));
    return { date, listings: generateListings(userId, date, masters).map((l) => ({ ...l, purchased: purchased.has(l.listingKey) })) };
  }

  /**
   * 이적 시장 영입: 골드를 지불하고 오늘 명단의 선수를 영입합니다. (같은 매물은 하루 1회)
   * @param {number} userId
   * @param {string} listingKey
   * @returns {Promise<{player:Object, price:number, remainingWallet:Object}>}
   */
  static async buyListing(userId, listingKey) {
    const date = todayKey();
    const masters = await ClubRepository.getAllMasters(null);
    const listing = generateListings(userId, date, masters).find((l) => l.listingKey === listingKey);
    if (!listing) throw new NotFoundError('오늘 이적 시장에 없는 매물입니다.');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const wallet = await WalletRepository.findWalletWithLock(conn, userId);
      if (!wallet) throw new NotFoundError('지갑 정보를 찾을 수 없습니다.');
      if ((await ClubRepository.getPurchases(conn, userId, date)).includes(listingKey)) throw new ConflictError('이미 영입한 매물입니다.');
      if ((await PlayerRepository.countUserPlayers(conn, userId)) >= MARKET.MAX_ROSTER) throw new InventoryFullError('선수 보유 한도를 초과합니다.');

      await WalletService.spendGold(conn, wallet, listing.price, `TRANSFER_BUY_${listing.playerMasterId}`);
      const userPlayerId = await ClubRepository.insertPlainPlayer(conn, userId, listing.playerMasterId);
      await ClubRepository.insertPurchase(conn, userId, date, listingKey);
      await conn.commit();
      return { userPlayerId, price: listing.price, player: listing, remainingWallet: { cashPaid: wallet.cashPaid, cashFree: wallet.cashFree, gold: wallet.gold } };
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * 잉여 선수 방출: 라인업(선발/벤치)에 없는 후보 선수만 방출할 수 있으며 골드로 환급받습니다.
   * @param {number} userId
   * @param {number} userPlayerId
   * @returns {Promise<{refund:number, remainingWallet:Object}>}
   */
  static async releasePlayer(userId, userPlayerId) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const wallet = await WalletRepository.findWalletWithLock(conn, userId);
      if (!wallet) throw new NotFoundError('지갑 정보를 찾을 수 없습니다.');
      const player = await ClubRepository.findPlayerForUpdate(conn, userId, userPlayerId);
      if (!player) throw new NotFoundError('선수를 찾을 수 없습니다.');
      if (player.isStarter || player.lineupSlot !== null) throw new ValidationError('선발/벤치 명단에 있는 선수는 방출할 수 없습니다. 후보로 내린 뒤 방출하세요.');
      if ((await PlayerRepository.countUserPlayers(conn, userId)) <= MARKET.MIN_ROSTER) throw new ValidationError(`최소 ${MARKET.MIN_ROSTER}명은 보유해야 합니다.`);

      const refund = MARKET.releaseRefund(MARKET.price(computeOverall(player.baseStats, 1, player.mainPosition)), player.level);
      await ClubRepository.deletePlayer(conn, userId, userPlayerId);
      await WalletService.earn(conn, wallet, { gold: refund }, 'TRANSFER_RELEASE');
      await conn.commit();
      return { refund, remainingWallet: { cashPaid: wallet.cashPaid, cashFree: wallet.cashFree, gold: wallet.gold } };
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * 스폰서 목록(해금/선택 상태)과 일일 퀘스트/업적 진행 상황을 반환합니다.
   * @param {number} userId
   * @returns {Promise<{sponsors:Object[], quests:Object[]}>}
   */
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
    const metrics = { wins: record.wins, goals: players.reduce((sum, p) => sum + p.goals, 0), players: players.length };
    const daily = Object.values(DAILY_QUESTS).map((q) => ({
      key: q.key,
      type: 'DAILY',
      label: q.label,
      target: q.target,
      reward: q.reward,
      progress: Math.min(q.target, row(q.key, todayKey())?.progress || 0),
      claimed: row(q.key, todayKey())?.claimed || false,
    }));
    const achievements = Object.values(ACHIEVEMENTS).map((a) => ({
      key: a.key,
      type: 'ACHIEVEMENT',
      label: a.label,
      target: a.target,
      reward: a.reward,
      progress: Math.min(a.target, metrics[a.metric]),
      claimed: row(a.key, 'ALL')?.claimed || false,
    }));
    return { sponsors, quests: [...daily, ...achievements] };
  }

  /**
   * 메인 스폰서를 교체합니다. (해금 조건: 통산 승수)
   * @param {number} userId
   * @param {string} sponsorKey
   * @returns {Promise<{sponsorKey:string}>}
   */
  static async selectSponsor(userId, sponsorKey) {
    const sponsor = SPONSORS[sponsorKey];
    if (!sponsor) throw new ValidationError('알 수 없는 스폰서입니다.');
    const record = await ClubRepository.getClubRecord(null, userId);
    if (record.wins < sponsor.requirement.wins) throw new ValidationError(`통산 ${sponsor.requirement.wins}승이 필요합니다.`);
    await ClubRepository.updateSponsor(null, userId, sponsorKey);
    return { sponsorKey };
  }

  /**
   * 퀘스트/업적 보상 수령.
   * @param {number} userId
   * @param {string} questKey
   * @returns {Promise<{reward:Object, remainingWallet:Object}>}
   */
  static async claimQuest(userId, questKey) {
    const finance = await ClubService.getFinance(userId);
    const quest = finance.quests.find((q) => q.key === questKey);
    if (!quest) throw new NotFoundError('알 수 없는 퀘스트입니다.');
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
      return { reward: quest.reward, remainingWallet: { cashPaid: wallet.cashPaid, cashFree: wallet.cashFree, gold: wallet.gold } };
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    } finally {
      conn.release();
    }
  }
}
