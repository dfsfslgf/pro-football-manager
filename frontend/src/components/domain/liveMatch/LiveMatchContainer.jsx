import { useEffect, useState } from 'react';
import { Loader2, BarChart3, Megaphone, MessageSquare } from 'lucide-react';
import useLiveMatchStore from '../../../store/useLiveMatchStore.js';
import useNavStore from '../../../store/useNavStore.js';
import useClubStore from '../../../store/useClubStore.js';
import useSquadStore from '../../../store/useSquadStore.js';
import useCompetitionStore from '../../../store/useCompetitionStore.js';
import { TOUCHLINE_SHOUTS } from '../../../constants/tacticsConfig.js';
import Badge from '../../common/Badge.jsx';
import Notice from '../../common/Notice.jsx';
import PitchCanvas2D from './PitchCanvas2D.jsx';
import LiveControlBar from './LiveControlBar.jsx';
import InGameTacticalPanel from './InGameTacticalPanel.jsx';
import HalfTimeModal from './HalfTimeModal.jsx';
import ScoreHeader from './ScoreHeader.jsx';
import FullTimeReportModal from './FullTimeReportModal.jsx';

/**
 * 경기장 캔버스 바로 아래에 상시 노출되는 실시간 터치라인 감독 지시 바
 */
function TouchlineShoutBar() {
  const status = useLiveMatchStore((s) => s.status);
  const minute = useLiveMatchStore((s) => s.minute);
  const lastShoutMin = useLiveMatchStore((s) => s.lastTouchlineShoutMinute ?? -10);
  const activeShout = useLiveMatchStore((s) => s.homeTeam?.touchlineShout);
  const issueTouchlineShout = useLiveMatchStore((s) => s.issueTouchlineShout);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const cooldownRemain = Math.max(0, 5 - (minute - lastShoutMin));

  const handleShout = (key) => {
    const res = issueTouchlineShout(key);
    setNotice({ type: res.success ? 'success' : 'error', text: res.message });
  };

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-slate-900/80 p-3 shadow-lg">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
          <Megaphone className="h-4 w-4" /> 실시간 터치라인 감독 지시 (경기장 즉시 반영)
        </span>
        <span className="text-[11px] font-semibold text-slate-400">
          {cooldownRemain > 0 ? `다음 지시 가능까지 ${cooldownRemain}분` : '⚡ 즉시 지시 가능'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {Object.values(TOUCHLINE_SHOUTS).map((sh) => {
          const isSelected = activeShout === sh.key;
          return (
            <button
              key={sh.key}
              type="button"
              disabled={status !== 'live' || cooldownRemain > 0}
              onClick={() => handleShout(sh.key)}
              className={`rounded-xl border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${
                isSelected
                  ? 'border-amber-400 bg-amber-500/20 text-white ring-1 ring-amber-400'
                  : 'border-slate-700 bg-slate-950/70 text-slate-200 hover:border-amber-400/60 hover:bg-slate-800'
              }`}
            >
              <p className="text-xs font-black text-amber-300">{sh.label}</p>
              <p className="mt-0.5 truncate text-[10px] text-slate-400">{sh.desc}</p>
            </button>
          );
        })}
      </div>
      <Notice notice={notice} className="mt-2" />
    </div>
  );
}

function LiveStatsBoard() {
  const homeTeam = useLiveMatchStore((s) => s.homeTeam);
  const awayTeam = useLiveMatchStore((s) => s.awayTeam);
  const weather = useLiveMatchStore((s) => s.weather);
  if (!homeTeam || !awayTeam) return null;

  const totalTicks = Math.max(1, (homeTeam.stats?.possessionTicks || 1) + (awayTeam.stats?.possessionTicks || 1));
  const homePoss = Math.round(((homeTeam.stats?.possessionTicks || 1) / totalTicks) * 100);
  const awayPoss = 100 - homePoss;

  const rows = [
    { label: '점유율 (%)', h: `${homePoss}%`, a: `${awayPoss}%`, hVal: homePoss, aVal: awayPoss },
    { label: '슈팅', h: homeTeam.stats?.shots || 0, a: awayTeam.stats?.shots || 0 },
    { label: '유효 슈팅', h: homeTeam.stats?.shotsOnTarget || 0, a: awayTeam.stats?.shotsOnTarget || 0 },
    {
      label: '패스 성공률',
      h: `${homeTeam.stats?.passAccuracy ?? 85}%`,
      a: `${awayTeam.stats?.passAccuracy ?? 85}%`,
      hVal: homeTeam.stats?.passAccuracy ?? 85,
      aVal: awayTeam.stats?.passAccuracy ?? 85,
    },
    { label: '태클 / 볼 탈취', h: homeTeam.stats?.tackles || 0, a: awayTeam.stats?.tackles || 0 },
    { label: '골키퍼 선방', h: homeTeam.stats?.saves || 0, a: awayTeam.stats?.saves || 0 },
    { label: '코너킥', h: homeTeam.stats?.corners || 0, a: awayTeam.stats?.corners || 0 },
    { label: '오프사이드', h: homeTeam.stats?.offsides || 0, a: awayTeam.stats?.offsides || 0 },
    {
      label: '반칙 (옐로/레드)',
      h: `${homeTeam.stats?.fouls || 0} (${homeTeam.stats?.yellowCards || 0}/${homeTeam.stats?.redCards || 0})`,
      a: `${awayTeam.stats?.fouls || 0} (${awayTeam.stats?.yellowCards || 0}/${awayTeam.stats?.redCards || 0})`,
      hVal: homeTeam.stats?.fouls || 0,
      aVal: awayTeam.stats?.fouls || 0,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-lg bg-slate-800/80 px-3 py-2 text-xs text-slate-300">
        <span>
          날씨: <b className="text-white">{weather?.label || '맑음'}</b>
        </span>
        <span>
          팀 OVR: <b className="text-blue-300">{homeTeam.avgOvr}</b> vs <b className="text-rose-300">{awayTeam.avgOvr}</b>
        </span>
      </div>
      <div className="space-y-2.5">
        {rows.map((r) => {
          const hv = r.hVal !== undefined ? r.hVal : Number(r.h) || 0;
          const av = r.aVal !== undefined ? r.aVal : Number(r.a) || 0;
          const sum = hv + av;
          const hPct = sum > 0 ? Math.round((hv / sum) * 100) : 50;
          return (
            <div key={r.label} className="space-y-1 text-xs">
              <div className="flex justify-between font-bold text-slate-200">
                <span className="text-blue-300">{r.h}</span>
                <span className="text-slate-400">{r.label}</span>
                <span className="text-rose-300">{r.a}</span>
              </div>
              <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div className="bg-blue-500 transition-all duration-300" style={{ width: `${hPct}%` }} />
                <div className="bg-rose-500 transition-all duration-300" style={{ width: `${100 - hPct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SideMatchFeed() {
  const [tab, setTab] = useState('commentary');
  const timelineEvents = useLiveMatchStore((s) => s.timelineEvents);
  const events = [...timelineEvents].reverse();

  return (
    <section className="flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab('commentary')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              tab === 'commentary' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" /> 실시간 중계
          </button>
          <button
            type="button"
            onClick={() => setTab('stats')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              tab === 'stats' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" /> 실시간 경기 통계
          </button>
        </div>
      </div>

      {tab === 'stats' ? (
        <LiveStatsBoard />
      ) : (
        <ul className="max-h-[520px] flex-1 space-y-2 overflow-y-auto pr-1">
          {events.map((e, index) => {
            const side = e.team === 'HOME' ? 'border-blue-400' : e.team === 'AWAY' ? 'border-rose-400' : 'border-slate-600';
            return (
              <li
                key={`${e.minute}-${e.type}-${events.length - index}`}
                className={`animate-fade-in-up rounded-lg border-l-4 bg-slate-800/60 px-3 py-2 text-xs ${side} ${
                  e.isUserAction ? 'bg-purple-950/40 text-purple-100' : 'text-slate-200'
                }`}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-black text-white">{e.minute}&apos;</span>
                  {e.type !== 'INFO' && <Badge type={e.type} />}
                </div>
                <p className={e.type === 'GOAL' ? 'font-bold text-amber-200' : ''}>{e.description}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function planQuickNext(report) {
  const none = { available: false, stageId: null, label: '다음 경기 바로 진행' };
  const c = report?.competition;
  if (!c) return none;
  switch (c.type) {
    case 'LEAGUE':
      return c.seasonEnd ? none : { available: true, stageId: null, label: '다음 라운드 바로 진행' };
    case 'CUP':
      return c.advanced && !c.champion ? { available: true, stageId: null, label: '다음 라운드 바로 진행' } : none;
    case 'WORLD_CUP':
      if (c.phase === 'KNOCKOUT') return c.advanced && !c.champion ? { available: true, stageId: null, label: '다음 라운드 바로 진행' } : none;
      return c.advanced === false ? none : { available: true, stageId: null, label: '다음 경기 바로 진행' };
    case 'TOWER':
      if (!c.cleared) return { available: true, stageId: c.stageId, label: `Stage ${c.stageId} 재도전` };
      return c.stageId < c.totalStages ? { available: true, stageId: c.stageId + 1, label: `Stage ${c.stageId + 1} 도전` } : none;
    case 'RANKED':
      return { available: true, stageId: null, label: '다음 랭크 매치 바로 진행' };
    default:
      return none;
  }
}

export default function LiveMatchContainer() {
  const status = useLiveMatchStore((s) => s.status);
  const finishState = useLiveMatchStore((s) => s.finishState);
  const homeTeam = useLiveMatchStore((s) => s.homeTeam);
  const awayTeam = useLiveMatchStore((s) => s.awayTeam);
  const context = useLiveMatchStore((s) => s.context);
  const go = useNavStore((s) => s.go);
  const [isPanelOpen, setPanelOpen] = useState(false);
  const [isLeaving, setLeaving] = useState(false);

  useEffect(() => {
    const live = useLiveMatchStore.getState();
    if (live.status === 'idle') {
      go('lobby');
      return undefined;
    }
    live.attachTicker();
    return () => useLiveMatchStore.getState().detachTicker();
  }, [go]);

  const handleClosePanel = () => {
    setPanelOpen(false);
    useLiveMatchStore.getState().resumeMatch();
  };

  const refreshAfterMatch = async () => {
    await Promise.all([
      useClubStore.getState().refreshOverview(),
      useClubStore.getState().refreshPlayers(),
      useSquadStore.getState().loadSquad(true),
      useCompetitionStore.getState().loadList(),
    ]);
  };

  const handleContinue = async () => {
    setLeaving(true);
    const mode = context?.mode;
    await refreshAfterMatch();
    if (mode) await useCompetitionStore.getState().loadDetail(mode);
    useLiveMatchStore.getState().resetMatch();
    go('modes', { mode });
  };

  const handleQuickNext = async () => {
    setLeaving(true);
    const plan = planQuickNext(finishState.report);
    const mode = context.mode;
    await refreshAfterMatch();
    await useCompetitionStore.getState().loadDetail(mode);
    const result = await useCompetitionStore.getState().prepareNextMatch(mode, plan.stageId);
    useLiveMatchStore.getState().resetMatch();
    go(result.ok ? 'prematch' : 'modes', { mode });
  };

  if (status === 'idle' || !homeTeam || !awayTeam) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" /> 경기장 입장 중...
      </div>
    );
  }

  const plan = planQuickNext(finishState.report);

  return (
    <div className="space-y-4">
      <ScoreHeader />
      <LiveControlBar onOpenTactics={() => setPanelOpen(true)} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <PitchCanvas2D />
          <TouchlineShoutBar />
          {isPanelOpen && status === 'live' && <InGameTacticalPanel mode="live" onClose={handleClosePanel} />}
        </div>
        <SideMatchFeed />
      </div>
      <HalfTimeModal />
      {status === 'finished' && !isLeaving && (
        <FullTimeReportModal
          open={status === 'finished'}
          finishState={finishState}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          homeName={homeTeam.name}
          awayName={awayTeam.name}
          homeStats={homeTeam.stats}
          awayStats={awayTeam.stats}
          score={{ home: homeTeam.score, away: awayTeam.score }}
          onRetrySave={() => useLiveMatchStore.getState().submitResult()}
          onRetry={() => useLiveMatchStore.getState().submitResult()}
          onConfirmExit={handleContinue}
          onContinue={handleContinue}
          onQuickNext={plan.available ? handleQuickNext : null}
          quickNextLabel={plan.label}
        />
      )}
    </div>
  );
}