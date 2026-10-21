import { useEffect } from 'react';
import useClubStore from '../store/useClubStore.js';
import useCompetitionStore from '../store/useCompetitionStore.js';
import useNavStore from '../store/useNavStore.js';
import Panel from '../components/common/Panel.jsx';
import RarityBadge from '../components/common/RarityBadge.jsx';
import { MODE_META, MODE_ORDER, formatNumber } from '../constants/gameConfig.js';

/**
 * 숫자 지표 카드.
 * @param {Object} props
 * @param {string} props.label
 * @param {string|number} props.value
 * @param {string} [props.sub]
 * @returns {JSX.Element}
 */
function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-white">{value}</p>
      {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
}

/**
 * 로비 대시보드: 구단 종합 현황(팀 OVR/평균 체력/전적), 진행 중인 대회 요약, 핵심 선수, 후원/퀘스트 알림과 바로가기.
 * @returns {JSX.Element}
 */
export default function LobbyDashboardPage() {
  const overview = useClubStore((s) => s.overview);
  const refreshOverview = useClubStore((s) => s.refreshOverview);
  const list = useCompetitionStore((s) => s.list);
  const loadList = useCompetitionStore((s) => s.loadList);
  const go = useNavStore((s) => s.go);

  useEffect(() => {
    refreshOverview();
    loadList();
  }, [refreshOverview, loadList]);

  if (!overview) return <p className="py-10 text-center text-sm text-slate-500">구단 정보를 불러오는 중...</p>;

  const record = overview.record;
  const competitions = list.length ? list : overview.competitions;

  return (
    <div className="space-y-4" data-testid="lobby-page">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="팀 종합 OVR" value={overview.teamOvr} sub={`보유 선수 ${overview.squadSize}명`} />
        <StatCard label="평균 체력" value={`${Math.round(overview.avgStamina)}%`} sub="의무실에서 회복할 수 있습니다" />
        <StatCard label="통산 전적" value={`${record.wins}승 ${record.draws}무 ${record.losses}패`} sub={`득점 ${record.goalsFor} / 실점 ${record.goalsAgainst}`} />
        <StatCard label="후원사" value={overview.sponsor.label} sub={`경기당 ${formatNumber(overview.sponsor.matchFee)}G + 승리 ${formatNumber(overview.sponsor.winBonus)}G`} />
      </div>

      {overview.claimableQuests > 0 && (
        <button
          type="button"
          onClick={() => go('finance')}
          className="w-full rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-left text-sm font-bold text-amber-200 hover:bg-amber-500/20"
        >
          🎁 수령 가능한 퀘스트 보상이 {overview.claimableQuests}개 있습니다! (재정 · 후원 메뉴에서 수령)
        </button>
      )}

      <Panel title="게임 모드 진행 현황" right={<button type="button" onClick={() => go('modes')} className="text-xs font-bold text-blue-300 hover:text-blue-200">모드 선택 →</button>}>
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {MODE_ORDER.map((mode) => {
            const row = competitions.find((c) => c.mode === mode);
            const meta = MODE_META[mode];
            return (
              <li key={mode} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                <span className="text-2xl">{meta.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white">{meta.title}</p>
                  <p className="truncate text-[11px] text-slate-400">{row?.summary || '아직 시작하지 않았습니다.'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => go('modes', { mode })}
                  className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-700"
                >
                  {row?.status === 'ACTIVE' ? '이어하기' : '시작'}
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="핵심 선수 TOP 5" right={<button type="button" onClick={() => go('squad')} className="text-xs font-bold text-blue-300 hover:text-blue-200">스쿼드 관리 →</button>}>
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-5">
          {overview.topPlayers.map((p) => (
            <li key={p.userPlayerId} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-center">
              <RarityBadge rarity={p.rarity} />
              <p className="mt-2 truncate text-sm font-bold text-white">{p.name}</p>
              <p className="text-[11px] text-slate-400">
                {p.mainPosition} · Lv.{p.level}
              </p>
              <p className="mt-1 text-xl font-black text-emerald-300">{p.overall}</p>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
