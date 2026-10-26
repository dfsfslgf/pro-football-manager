import GachaService from '../services/GachaService.js';
import { ValidationError } from '../constants/errorCodes.js';

/**
 * 스카우트(가챠) HTTP 컨트롤러.
 */
export default class GachaController {
  /**
   * GET /api/v1/scout/packages
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   * @returns {Promise<void>}
   */
  static async packages(req, res, next) {
    try {
      res.json({ success: true, data: await GachaService.getPackages() });
    } catch (err) {
      next(err);
    }
  }

  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   * @returns {Promise<void>}
   */
  static async scout(req, res, next) {
    try {
      const { packageKey } = req.body || {};
      const count = Number(req.body?.count ?? 1);
      if (typeof packageKey !== 'string' || !Number.isInteger(count)) throw new ValidationError('packageKey, count 가 올바르지 않습니다.');
      res.status(201).json({ success: true, data: await GachaService.scout(req.userId, packageKey, count) });
    } catch (err) {
      next(err);
    }
  }
}
