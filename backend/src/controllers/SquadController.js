import SquadService from '../services/SquadService.js';

/**
 * 포메이션 및 선발/벤치/후보 라인업 HTTP 컨트롤러. 대상 유저는 인증 토큰(req.userId)에서만 결정됩니다.
 */
export default class SquadController {
  /**
   * GET /api/v1/squad/lineup
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   * @returns {Promise<void>}
   */
  static async getLineup(req, res, next) {
    try {
      res.json({ success: true, data: await SquadService.getSquad(req.userId) });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /api/v1/squad/lineup
   * body: { formation, teamTactics, starterIds: number[11], benchIds: number[<=7], instructions: {userPlayerId: instruction} }
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   * @returns {Promise<void>}
   */
  static async saveLineup(req, res, next) {
    try {
      res.json({ success: true, data: await SquadService.saveSquad(req.userId, req.body) });
    } catch (err) {
      next(err);
    }
  }
}
