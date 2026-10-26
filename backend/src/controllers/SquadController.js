import SquadService from '../services/SquadService.js';


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
