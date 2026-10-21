import AuthService from '../services/AuthService.js';

/**
 * 로그인 및 초기 구단/지갑 생성 HTTP 컨트롤러.
 */
export default class AuthController {
  /**
   * POST /api/v1/auth/register
   * body: { nickname, password, clubName, emblemIcon, emblemColor }
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   * @returns {Promise<void>}
   */
  static async register(req, res, next) {
    try {
      const data = await AuthService.register(req.body || {});
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/auth/login
   * body: { nickname, password }
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   * @returns {Promise<void>}
   */
  static async login(req, res, next) {
    try {
      const data = await AuthService.login(req.body || {});
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/auth/me
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   * @returns {Promise<void>}
   */
  static async me(req, res, next) {
    try {
      res.json({ success: true, data: await AuthService.getMe(req.userId) });
    } catch (err) {
      next(err);
    }
  }
}
