import ClubService from '../services/ClubService.js';
import TrainingService from '../services/TrainingService.js';
import { ValidationError } from '../constants/errorCodes.js';

/**
 * 값이 양의 안전한 정수인지 검사하고 반환합니다.
 * @param {unknown} value
 * @param {string} name
 * @returns {number}
 * @throws {ValidationError}
 */
function requireId(value, name) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new ValidationError(`${name} 는 1 이상의 정수여야 합니다.`);
  return n;
}

/**
 * 구단 운영(대시보드, 선수 기록, 훈련/의무실, 이적 시장, 스폰서/퀘스트) HTTP 컨트롤러.
 * 대상 유저는 인증 토큰(req.userId)으로만 결정됩니다.
 */
export default class ClubManagementController {
  /**
   * @param {(req: import('express').Request) => Promise<Object>} fn 서비스 호출 함수
   * @param {number} [status=200]
   * @returns {import('express').RequestHandler}
   */
  static handle(fn, status = 200) {
    return async (req, res, next) => {
      try {
        res.status(status).json({ success: true, data: await fn(req) });
      } catch (err) {
        next(err);
      }
    };
  }

  static overview = ClubManagementController.handle((req) => ClubService.getOverview(req.userId));

  static players = ClubManagementController.handle((req) => ClubService.getPlayers(req.userId));

  static levelUp = ClubManagementController.handle((req) => TrainingService.levelUp(req.userId, requireId(req.body?.userPlayerId, 'userPlayerId')));

  static trainPosition = ClubManagementController.handle((req) => {
    if (typeof req.body?.roleCode !== 'string') throw new ValidationError('roleCode 가 필요합니다.');
    return TrainingService.trainPosition(req.userId, requireId(req.body.userPlayerId, 'userPlayerId'), req.body.roleCode);
  });

  static recover = ClubManagementController.handle((req) =>
    TrainingService.recoverStamina(req.userId, req.body?.userPlayerId ? requireId(req.body.userPlayerId, 'userPlayerId') : null)
  );

  static market = ClubManagementController.handle((req) => ClubService.getMarket(req.userId));

  static buy = ClubManagementController.handle((req) => {
    if (typeof req.body?.listingKey !== 'string') throw new ValidationError('listingKey 가 필요합니다.');
    return ClubService.buyListing(req.userId, req.body.listingKey);
  }, 201);

  static release = ClubManagementController.handle((req) => ClubService.releasePlayer(req.userId, requireId(req.body?.userPlayerId, 'userPlayerId')));

  static finance = ClubManagementController.handle((req) => ClubService.getFinance(req.userId));

  static sponsor = ClubManagementController.handle((req) => ClubService.selectSponsor(req.userId, String(req.body?.sponsorKey || '')));

  static claimQuest = ClubManagementController.handle((req) => ClubService.claimQuest(req.userId, String(req.body?.questKey || '')));
}
