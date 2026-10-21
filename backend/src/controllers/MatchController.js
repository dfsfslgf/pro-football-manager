import LiveMatchEngine from '../services/LiveMatchEngine.js';
import CompetitionService from '../services/CompetitionService.js';
import MatchRepository from '../repositories/MatchRepository.js';
import { NotFoundError, ValidationError } from '../constants/errorCodes.js';

export default class MatchController {
  static async startLive(req, res, next) {
    try {
      const { mode, stageId } = req.body || {};
      if (typeof mode !== 'string') throw new ValidationError('mode 가 필요합니다.');
      const nextMatch = await CompetitionService.getNextMatch(req.userId, mode, stageId ?? null);
      const session = LiveMatchEngine.startSession(req.userId, {
        mode,
        stageId: nextMatch.stageId,
        ref: nextMatch.ref,
        startMinute: nextMatch.scenario?.startMinute ?? 0,
        baseline: { home: nextMatch.scenario?.scoreHome ?? 0, away: nextMatch.scenario?.scoreAway ?? 0 },
        opponentName: nextMatch.opponent.name,
      });
      res.status(201).json({ success: true, data: session });
    } catch (err) {
      next(err);
    }
  }

  static async finish(req, res, next) {
    try {
      res.status(201).json({ success: true, data: await LiveMatchEngine.finishMatch(req.userId, req.body) });
    } catch (err) {
      next(err);
    }
  }

  static async getResult(req, res, next) {
    try {
      const matchId = Number(req.params.matchId);
      if (!Number.isSafeInteger(matchId) || matchId <= 0) throw new ValidationError('matchId 는 1 이상의 정수여야 합니다.');
      const match = await MatchRepository.getMatchById(null, matchId);
      if (!match || Number(match.homeClubId) !== req.userId) throw new NotFoundError('경기 결과를 찾을 수 없습니다.');
      res.json({ success: true, data: match });
    } catch (err) {
      next(err);
    }
  }
}