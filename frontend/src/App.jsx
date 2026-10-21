import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import useAuthStore from './store/useAuthStore.js';
import useClubStore from './store/useClubStore.js';
import useCompetitionStore from './store/useCompetitionStore.js';
import useLiveMatchStore from './store/useLiveMatchStore.js';
import useNavStore from './store/useNavStore.js';
import useSquadStore from './store/useSquadStore.js';
import MainGameLayout from './layouts/MainGameLayout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import LobbyDashboardPage from './pages/LobbyDashboardPage.jsx';
import SquadAndTacticsPage from './pages/SquadAndTacticsPage.jsx';
import PlayerStatsRecordPage from './pages/PlayerStatsRecordPage.jsx';
import ScoutGachaPage from './pages/ScoutGachaPage.jsx';
import TrainingCenterPage from './pages/TrainingCenterPage.jsx';
import TransferMarketPage from './pages/TransferMarketPage.jsx';
import ClubFinanceSponsorPage from './pages/ClubFinanceSponsorPage.jsx';
import GameModeSelectPage from './pages/GameModeSelectPage.jsx';
import PreMatchLobbyPage from './pages/PreMatchLobbyPage.jsx';
import LiveMatchContainer from './components/domain/liveMatch/LiveMatchContainer.jsx';

const PAGES = {
  lobby: LobbyDashboardPage,
  squad: SquadAndTacticsPage,
  records: PlayerStatsRecordPage,
  scout: ScoutGachaPage,
  training: TrainingCenterPage,
  market: TransferMarketPage,
  finance: ClubFinanceSponsorPage,
  modes: GameModeSelectPage,
  prematch: PreMatchLobbyPage,
};

/**
 * 애플리케이션 루트. 인증 상태에 따라 로그인 화면 / 관리 화면(공통 레이아웃) / 라이브 경기 화면을 전환합니다.
 * 라이브 경기 화면은 몰입감을 위해 사이드바 없이 전체 폭으로 표시됩니다.
 * @returns {JSX.Element}
 */
export default function App() {
  const status = useAuthStore((s) => s.status);
  const page = useNavStore((s) => s.page);

  useEffect(() => {
    useAuthStore.getState().init();
  }, []);

  useEffect(() => {
    if (status === 'authed') {
      useClubStore.getState().refreshOverview();
      useSquadStore.getState().loadSquad();
    } else if (status === 'anon') {
      useClubStore.getState().reset();
      useSquadStore.getState().reset();
      useCompetitionStore.getState().reset();
      useLiveMatchStore.getState().resetMatch();
      useNavStore.getState().go('lobby');
    }
  }, [status]);

  if (status === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 불러오는 중...
      </div>
    );
  }
  if (status === 'anon') return <LoginPage />;

  if (page === 'match') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <main className="mx-auto max-w-6xl px-4 py-4">
          <LiveMatchContainer />
        </main>
      </div>
    );
  }

  const Page = PAGES[page] || LobbyDashboardPage;
  return (
    <MainGameLayout>
      <Page />
    </MainGameLayout>
  );
}
