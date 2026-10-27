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
      const userId = req.user?.id || req.userId;
      const { mode } = req.params;
      const restart = req.body?.restart ?? false;
      const nationCode = req.body?.nationCode || null;
      const data = await CompetitionService.start(userId, mode, { restart, nationCode });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async nextMatch(req, res, next) {
    try {
      const userId = req.user?.id || req.userId;
      const { mode } = req.params;
      const stageId = req.query?.stageId ? Number(req.query.stageId) : null;
      const nationCode = req.query?.nationCode || null;
      const data = await CompetitionService.nextMatch(userId, mode, stageId, nationCode);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
}
