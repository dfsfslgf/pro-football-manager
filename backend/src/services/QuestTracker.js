import ClubRepository from '../repositories/ClubRepository.js';
import { DAILY_QUESTS } from '../constants/clubRules.js';

/**
 * 서버 로컬 기준 오늘 날짜 키(YYYY-MM-DD).
 * @param {Date} [date=new Date()]
 * @returns {string}
 */
export function todayKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * 일일 퀘스트 진행도 가산. (정의되지 않은 키는 무시)
 * @param {import('mysql2/promise').PoolConnection} conn 트랜잭션 커넥션
 * @param {number} userId
 * @param {keyof typeof DAILY_QUESTS} questKey
 * @param {number} [amount=1]
 * @returns {Promise<void>}
 */
export async function trackDailyQuest(conn, userId, questKey, amount = 1) {
  if (!DAILY_QUESTS[questKey] || amount <= 0) return;
  await ClubRepository.addQuestProgress(conn, userId, questKey, todayKey(), amount);
}
