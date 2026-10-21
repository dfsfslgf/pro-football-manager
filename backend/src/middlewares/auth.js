import { createHmac, timingSafeEqual } from 'node:crypto';
import { UnauthorizedError } from '../constants/errorCodes.js';

const SECRET = process.env.AUTH_SECRET || 'dev-only-secret-change-me';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

if (!process.env.AUTH_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('[auth] AUTH_SECRET 이 설정되지 않았습니다. 운영 환경에서는 반드시 설정하세요.');
}

/**
 * @param {string} payload
 * @returns {string} base64url HMAC-SHA256 서명
 */
function sign(payload) {
  return createHmac('sha256', SECRET).update(payload).digest('base64url');
}

/**
 * 유저 ID 를 담은 서명 토큰을 발급합니다. (형식: base64url(payload).signature)
 * @param {number} userId
 * @returns {string}
 */
export function issueToken(userId) {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + TOKEN_TTL_MS })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

/**
 * 토큰을 검증하고 유저 ID 를 반환합니다.
 * @param {string} token
 * @returns {number}
 * @throws {UnauthorizedError}
 */
export function verifyToken(token) {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature) throw new UnauthorizedError('유효하지 않은 토큰입니다.');
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new UnauthorizedError('유효하지 않은 토큰입니다.');
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new UnauthorizedError('유효하지 않은 토큰입니다.');
  }
  if (!Number.isSafeInteger(data.uid) || data.exp < Date.now()) throw new UnauthorizedError('세션이 만료되었습니다. 다시 로그인해주세요.');
  return data.uid;
}

/**
 * Authorization: Bearer 토큰을 검증해 req.userId 를 설정하는 미들웨어.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {void}
 */
export function authRequired(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) throw new UnauthorizedError();
    req.userId = verifyToken(header.slice(7));
    next();
  } catch (err) {
    next(err);
  }
}
