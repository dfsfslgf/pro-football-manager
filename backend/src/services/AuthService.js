import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import pool from '../config/database.js';
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '../constants/errorCodes.js';
import { EMBLEM_ICONS, INITIAL_GRANT, STARTER_PLAN } from '../constants/clubRules.js';
import { DEFAULT_FORMATION } from '../constants/formationCoords.js';
import ClubRepository from '../repositories/ClubRepository.js';
import { issueToken } from '../middlewares/auth.js';

const scrypt = promisify(scryptCb);
const DEFAULT_TEAM_TACTICS = { mentality: 'BALANCED', passingStyle: 'MIXED', tempo: 'NORMAL', defensiveLine: 'NORMAL', pressing: 'MEDIUM' };

/**
 * scrypt 로 비밀번호 해시를 만듭니다. (형식: salt:hash)
 * @param {string} password
 * @returns {Promise<string>}
 */
async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64);
  return `${salt}:${derived.toString('hex')}`;
}

/**
 * @param {string} password
 * @param {string} stored salt:hash
 * @returns {Promise<boolean>}
 */
async function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const derived = await scrypt(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

/**
 * 로그인/구단 창단 비즈니스 로직.
 */
export default class AuthService {
  /**
   * 회원가입 + 구단 창단: 유저/구단/지갑/시작 선수 18명/기본 전술을 한 트랜잭션으로 생성합니다.
   * @param {{nickname:string, password:string, clubName:string, emblemIcon:string, emblemColor:string}} input
   * @returns {Promise<{token:string, user:Object, club:Object}>}
   * @throws {ValidationError|ConflictError}
   */
  static async register({ nickname, password, clubName, emblemIcon, emblemColor }) {
    if (typeof nickname !== 'string' || !/^[\p{L}\p{N}_]{2,16}$/u.test(nickname)) {
      throw new ValidationError('닉네임은 2~16자의 문자/숫자/밑줄만 사용할 수 있습니다.');
    }
    if (typeof password !== 'string' || password.length < 6 || password.length > 64) {
      throw new ValidationError('비밀번호는 6~64자여야 합니다.');
    }
    if (typeof clubName !== 'string' || clubName.trim().length < 2 || clubName.trim().length > 20) {
      throw new ValidationError('구단 이름은 2~20자여야 합니다.');
    }
    const icon = EMBLEM_ICONS.includes(emblemIcon) ? emblemIcon : EMBLEM_ICONS[0];
    const color = /^#[0-9a-fA-F]{6}$/.test(emblemColor || '') ? emblemColor : '#2563eb';

    const passwordHash = await hashPassword(password);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      if (await ClubRepository.findUserByNickname(conn, nickname)) throw new ConflictError('이미 사용 중인 닉네임입니다.');

      const userId = await ClubRepository.insertUser(conn, nickname, passwordHash);
      await ClubRepository.insertClub(conn, { userId, name: clubName.trim(), emblemIcon: icon, emblemColor: color, sponsorKey: 'BASIC' });
      await ClubRepository.insertWallet(conn, userId, INITIAL_GRANT);
      await AuthService.grantStarterSquad(conn, userId);
      await ClubRepository.saveSquadSettings(conn, userId, DEFAULT_FORMATION, DEFAULT_TEAM_TACTICS);
      await conn.commit();
      return { token: issueToken(userId), ...(await AuthService.getMe(userId)) };
    } catch (err) {
      await conn.rollback().catch(() => {});
      if (err?.code === 'ER_DUP_ENTRY') throw new ConflictError('이미 사용 중인 닉네임입니다.');
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * 시작 선수 18명(선발 11 + 벤치 7)을 지급하고 라인업 슬롯을 배정합니다.
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {number} userId
   * @returns {Promise<void>}
   */
  static async grantStarterSquad(conn, userId) {
    const used = new Set();
    const pickMaster = async (position, role) => {
      let candidates = (await ClubRepository.findCommonMasters(conn, position, role)).filter((m) => !used.has(m.id));
      if (candidates.length === 0) candidates = (await ClubRepository.findCommonMasters(conn, position, null)).filter((m) => !used.has(m.id));
      if (candidates.length === 0) throw new NotFoundError('선수 마스터 데이터가 없습니다. 서버 시드 데이터를 확인하세요.');
      used.add(candidates[0].id);
      return candidates[0].id;
    };

    let slot = 0;
    for (const [position, role] of STARTER_PLAN.starters) {
      await ClubRepository.insertSlottedPlayer(conn, userId, await pickMaster(position, role), true, slot++);
    }
    for (const [position, role] of STARTER_PLAN.bench) {
      await ClubRepository.insertSlottedPlayer(conn, userId, await pickMaster(position, role), false, slot++);
    }
  }

  /**
   * 로그인.
   * @param {{nickname:string, password:string}} input
   * @returns {Promise<{token:string, user:Object, club:Object}>}
   * @throws {UnauthorizedError}
   */
  static async login({ nickname, password }) {
    const user = typeof nickname === 'string' ? await ClubRepository.findUserByNickname(null, nickname) : null;
    const ok = user && typeof password === 'string' && (await verifyPassword(password, user.passwordHash));
    if (!ok) throw new UnauthorizedError('닉네임 또는 비밀번호가 올바르지 않습니다.');
    return { token: issueToken(user.id), ...(await AuthService.getMe(user.id)) };
  }

  /**
   * 현재 유저와 구단 정보를 반환합니다.
   * @param {number} userId
   * @returns {Promise<{user:{id:number, nickname:string}, club:Object}>}
   * @throws {UnauthorizedError}
   */
  static async getMe(userId) {
    const club = await ClubRepository.findClub(null, userId);
    if (!club) throw new UnauthorizedError('계정 정보를 찾을 수 없습니다.');
    return { user: { id: userId, nickname: club.nickname }, club };
  }
}
