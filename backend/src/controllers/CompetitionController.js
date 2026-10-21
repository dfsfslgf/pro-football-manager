import CompetitionService from '../services/CompetitionService.js';

/**
 * 대회(리그/챔피언스컵/월드컵/챌린지 타워/랭크) 진행 HTTP 컨트롤러.
 */
export default class CompetitionController {
  /**
   * GET /api/v1/competitions
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   * @returns {Promise<void>}
   */
  static async overview(req, res, next) {
    try {
      res.json({ success: true, data: await CompetitionService.getOverview(req.userId) });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/competitions/:mode
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   * @returns {Promise<void>}
   */
  static async getState(req, res, next) {
    try {
      res.json({ success: true, data: await CompetitionService.getState(req.userId, req.params.mode) });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/competitions/:mode/start  body: { restart?: boolean }
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   * @returns {Promise<void>}
   */
  static async start(req, res, next) {
    try {
      res.status(201).json({ success: true, data: await CompetitionService.start(req.userId, req.params.mode, req.body?.restart === true) });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/competitions/:mode/next-match?stageId=
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   * @returns {Promise<void>}
   */
  static async nextMatch(req, res, next) {
    try {
      res.json({ success: true, data: await CompetitionService.getNextMatch(req.userId, req.params.mode, req.query.stageId ?? null) });
    } catch (err) {
      next(err);
    }
  }
}
