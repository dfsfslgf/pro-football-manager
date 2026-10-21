import { Activity, BarChart3, Coins, DollarSign, Dumbbell, Gift, LayoutDashboard, LogOut, Search, ShoppingCart, Users, Wallet } from 'lucide-react';
import useAuthStore from '../store/useAuthStore.js';
import useClubStore from '../store/useClubStore.js';
import useNavStore from '../store/useNavStore.js';
import { formatNumber } from '../constants/gameConfig.js';

const MENUS = [
  { page: 'lobby', label: '로비 대시보드', Icon: LayoutDashboard },
  { page: 'squad', label: '스쿼드 · 전술', Icon: Users },
  { page: 'records', label: '선수 기록실', Icon: BarChart3 },
  { page: 'scout', label: '스카우트', Icon: Search },
  { page: 'training', label: '훈련 · 의무실', Icon: Dumbbell },
  { page: 'market', label: '이적 시장', Icon: ShoppingCart },
  { page: 'finance', label: '재정 · 후원', Icon: DollarSign },
];

/**
 * 상단 헤더의 자원 표시 칩.
 * @param {Object} props
 * @param {import('react').ComponentType<{className?:string}>} props.Icon
 * @param {string} props.label
 * @param {string|number} props.value
 * @param {string} props.tone 텍스트 색상 클래스
 * @returns {JSX.Element}
 */
function ResourceChip({ Icon, label, value, tone }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1" title={label}>
      <Icon className={`h-3.5 w-3.5 ${tone}`} />
      <span className="text-[10px] text-slate-500">{label}</span>
      <span className={`text-xs font-black ${tone}`}>{value}</span>
    </div>
  );
}

/**
 * 인증 후 모든 관리 화면에 공통으로 적용되는 레이아웃.
 * 상단 헤더(구단 엠블럼/이름, 골드·무료 캐시·유료 캐시·평균 체력, [⚽ 게임 플레이] 버튼) + 좌측 7개 메뉴 사이드바 + 본문 영역.
 * @param {Object} props
 * @param {import('react').ReactNode} props.children 현재 페이지
 * @returns {JSX.Element}
 */
export default function MainGameLayout({ children }) {
  const club = useAuthStore((s) => s.club);
  const logout = useAuthStore((s) => s.logout);
  const overview = useClubStore((s) => s.overview);
  const page = useNavStore((s) => s.page);
  const go = useNavStore((s) => s.go);
  const wallet = overview?.wallet;

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-2">
          <button type="button" onClick={() => go('lobby')} className="flex items-center gap-2" data-testid="club-badge">
            <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 text-lg" style={{ borderColor: club?.emblemColor || '#2563eb', backgroundColor: `${club?.emblemColor || '#2563eb'}33` }}>
              {club?.emblemIcon}
            </span>
            <span className="text-left leading-tight">
              <span className="block text-sm font-black text-white">{club?.name}</span>
              <span className="block text-[10px] text-slate-500">감독 {club?.nickname}</span>
            </span>
          </button>

          <div className="ml-2 flex flex-wrap items-center gap-2" data-testid="resource-bar">
            <ResourceChip Icon={Coins} label="골드" value={formatNumber(wallet?.gold)} tone="text-amber-300" />
            <ResourceChip Icon={Gift} label="무료 캐시" value={formatNumber(wallet?.cashFree)} tone="text-sky-300" />
            <ResourceChip Icon={Wallet} label="유료 캐시" value={formatNumber(wallet?.cashPaid)} tone="text-fuchsia-300" />
            <ResourceChip Icon={Activity} label="평균 체력" value={`${Math.round(overview?.avgStamina ?? 0)}%`} tone="text-emerald-300" />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => go('modes')}
              className="rounded-xl bg-gradient-to-r from-emerald-600 to-blue-600 px-5 py-2 text-sm font-black text-white shadow-lg transition hover:from-emerald-500 hover:to-blue-500"
              data-testid="play-button"
            >
              ⚽ 게임 플레이
            </button>
            <button type="button" onClick={logout} title="로그아웃" className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-4 px-4 py-4">
        <nav className="hidden w-52 shrink-0 md:block" aria-label="메인 메뉴">
          <ul className="sticky top-20 space-y-1">
            {MENUS.map(({ page: target, label, Icon }) => (
              <li key={target}>
                <button
                  type="button"
                  onClick={() => go(target)}
                  data-testid={`menu-${target}`}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    page === target ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <nav className="fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t border-slate-800 bg-slate-900/95 md:hidden" aria-label="모바일 메뉴">
          {MENUS.map(({ page: target, label, Icon }) => (
            <button
              key={target}
              type="button"
              onClick={() => go(target)}
              className={`flex min-w-[72px] flex-1 flex-col items-center gap-0.5 px-2 py-2 text-[10px] font-semibold ${page === target ? 'text-blue-400' : 'text-slate-400'}`}
            >
              <Icon className="h-4 w-4" />
              {label.split(' ')[0]}
            </button>
          ))}
        </nav>

        <main className="min-w-0 flex-1 pb-16 md:pb-0">{children}</main>
      </div>
    </div>
  );
}
