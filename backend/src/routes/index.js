import { Router } from 'express';
import AuthController from '../controllers/AuthController.js';
import ClubManagementController from '../controllers/ClubManagementController.js';
import CompetitionController from '../controllers/CompetitionController.js';
import GachaController from '../controllers/GachaController.js';
import MatchController from '../controllers/MatchController.js';
import SquadController from '../controllers/SquadController.js';
import { authRequired } from '../middlewares/auth.js';

const router = Router();

router.get('/health', (req, res) => res.json({ success: true, status: 'ok' }));

// 인증
router.post('/v1/auth/register', AuthController.register);
router.post('/v1/auth/login', AuthController.login);
router.get('/v1/auth/me', authRequired, AuthController.me);

// 이후 모든 /v1 엔드포인트는 로그인 필요
router.use('/v1', authRequired);

// 구단 운영
router.get('/v1/club/overview', ClubManagementController.overview);
router.get('/v1/club/players', ClubManagementController.players);
router.post('/v1/club/training/level-up', ClubManagementController.levelUp);
router.post('/v1/club/training/position', ClubManagementController.trainPosition);
router.post('/v1/club/medical/recover', ClubManagementController.recover);
router.get('/v1/club/market', ClubManagementController.market);
router.post('/v1/club/market/buy', ClubManagementController.buy);
router.post('/v1/club/market/release', ClubManagementController.release);
router.get('/v1/club/finance', ClubManagementController.finance);
router.post('/v1/club/sponsor', ClubManagementController.sponsor);
router.post('/v1/club/quests/claim', ClubManagementController.claimQuest);

// 스쿼드/전술
router.get('/v1/squad/lineup', SquadController.getLineup);
router.put('/v1/squad/lineup', SquadController.saveLineup);

// 스카우트
router.get('/v1/scout/packages', GachaController.packages);
router.post('/v1/scout', GachaController.scout);

// 대회
router.get('/v1/competitions', CompetitionController.overview);
router.get('/v1/competitions/:mode', CompetitionController.getState);
router.post('/v1/competitions/:mode/start', CompetitionController.start);
router.get('/v1/competitions/:mode/next-match', CompetitionController.nextMatch);
router.get('/v1/competitions/:mode/next', CompetitionController.nextMatch);

// 라이브 경기
router.post('/v1/matches/start', MatchController.startLive);
router.post('/v1/matches/finish', MatchController.finish);
router.get('/v1/matches/:matchId', MatchController.getResult);

export default router;