import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Play, Sparkles, Wand2 } from 'lucide-react';
import { startLiveSession } from '../api/matchApi.js';
import { errorMessage } from '../api/client.js';
import useAuthStore from '../store/useAuthStore.js';
import useCompetitionStore from '../store/useCompetitionStore.js';
import useLiveMatchStore from '../store/useLiveMatchStore.js';
import useNavStore from '../store/useNavStore.js';
import useSquadStore, { normalizePlayer } from '../store/useSquadStore.js';
import Panel from '../components/common/Panel.jsx';
import Notice from '../components/common/Notice.jsx';
import TacticsWorkspace from '../components/domain/squad/TacticsWorkspace.jsx';
import { MODE_META } from '../constants/gameConfig.js';

export default function PreMatchLobbyPage() {
  const user = useAuthStore((s) => s.user);
  const club = useAuthStore((s) => s.club);
  const pending = useCompetitionStore((s) => s.pending);
  const selectedWorldCupNation = useCompetitionStore((s) => s.selectedWorldCupNation);
  const params = useNavStore((s) => s.params);
  const go = useNavStore((s) => s.go);
  const starters = useSquadStore((s) => s.starters);
  const autoFillBench = useSquadStore((s) => s.autoFillBench);
  const autoFillAll = useSquadStore((s) => s.autoFillAll);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const wcNation = params?.nation || selectedWorldCupNation || { code: 'KOR', name: '대한민국', emblem: '🐯' };
  const resolvedNext = pending?.next?.opponent ? pending.next : pending?.opponent ? pending : null;

  useEffect(() => {
    if (!pending || !resolvedNext || !resolvedNext.opponent) {
      go('lobby');
      return;
    }
    if (pending.mode === 'WORLD_CUP') {
      useSquadStore.getState().loadNationalSquad(wcNation?.code || 'KOR');
    } else {
      useSquadStore.getState().loadSquad(true);
    }
  }, [pending, resolvedNext, wcNation?.code, go]);

  if (!pending || !resolvedNext || !resolvedNext.opponent) {
    return null;
  }

  const { mode, stageId } = pending;
  const { opponent, scenario, ref, label } = resolvedNext;
  const meta = MODE_META[mode] || MODE_META.LEAGUE;

  const displayHomeName =
    mode === 'WORLD_CUP' ? `${wcNation?.name || '대한민국'} 국가대표팀` : club?.name || '내 구단';
  const displayHomeEmblem =
    mode === 'WORLD_CUP' ? wcNation?.emblem || '🐯' : club?.emblemIcon || '🛡️';

  const handleAutoBench = () => {
    const res = autoFillBench();
    setNotice({ type: 'success', text: res.message });
  };

  const handleAutoAll = () => {
    const res = autoFillAll();
    setNotice({ type: 'success', text: res.message });
  };

  const handleKickOff = async () => {
    setBusy(true);
    setNotice(null);

    const suspendedStarters = (starters || []).filter((p) => (p.suspendedMatches || 0) > 0);
    if (suspendedStarters.length > 0 && mode !== 'WORLD_CUP') {
      setNotice({
        type: 'error',
        text: `퇴장 징계로 출전 정지 중인 선수(${suspendedStarters.map((p) => `${p.name} [잔여 ${p.suspendedMatches}경기]`).join(', ')})가 선발에 포함되어 있습니다. 후보 선수로 교체해 주세요.`,
      });
      setBusy(false);
      return;
    }

    if (mode !== 'WORLD_CUP') {
      const saved = await useSquadStore.getState().saveSquad();
      if (!saved.success) {
        setNotice({ type: 'error', text: saved.message });
        setBusy(false);
        return;
      }
    }

    try {
      const session = await startLiveSession({
        mode,
        stageId: resolvedNext.stageId ?? stageId ?? null,
      });
      const squad = useSquadStore.getState();
      const away = {
        clubId: 0,
        name: opponent.name,
        emblem: opponent.emblem,
        formation: opponent.formation,
        tactics: opponent.tactics,
        starters: (opponent.starters || []).map((p, i) =>
          normalizePlayer({ ...p, stamina: p.stamina ?? 100 }, 'AWAY', i + 1)
        ),
        bench: (opponent.bench || []).map((p, i) =>
          normalizePlayer({ ...p, stamina: p.stamina ?? 100 }, 'AWAY', 12 + i)
        ),
      };
      useLiveMatchStore.getState().initMatch({
        home: {
          clubId: user?.id || 1,
          name: displayHomeName,
          emblem: displayHomeEmblem,
          formation: squad.formation,
          tactics: squad.teamTactics,
          starters: squad.starters,
          bench: squad.bench,
        },
        away,
        sessionId: session.sessionId,
        context: {
          mode,
          stageId: resolvedNext.stageId ?? stageId ?? null,
          ref: ref || 'M:1',
          label: label || meta.title,
        },
        scenario,
      });
      go('match');
    } catch (err) {
      setNotice({ type: 'error', text: errorMessage(err, '경기를 시작하지 못했습니다.') });
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="prematch-page">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
        <div>
          <span className="text-xs font-bold text-purple-300">
            {meta.icon} {label}
          </span>
          <h2 className="mt-0.5 text-xl font-black text-white">
            {displayHomeEmblem} {displayHomeName} <span className="text-slate-500">vs</span> {opponent.emblem}{' '}
            {opponent.name}{' '}
            <span className="text-sm font-bold text-amber-300">(전력 {opponent.strength})</span>
          </h2>
          {scenario && (
            <p className="mt-1 text-xs text-amber-200">
              🎯 시나리오 목표: <b>{scenario.objective?.text}</b> · {scenario.description}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => go('modes', { mode })}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-300 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> 대회 화면으로
          </button>
          <button
            type="button"
            onClick={handleKickOff}
            disabled={busy}
            data-testid="kickoff-button"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-blue-600 px-6 py-2.5 text-sm font-black text-white shadow-lg hover:from-emerald-500 hover:to-blue-500 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} 킥오프 (경기 시작)
          </button>
        </div>
      </div>

      <Notice notice={notice} />

      <Panel
        title={
          mode === 'WORLD_CUP'
            ? `🌍 2026 월드컵 ${displayHomeName} 26인 공식 엔트리 & 전술 점검`
            : '출전 라인업 & 후보 11명 최종 점검'
        }
        right={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleAutoBench}
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/50 bg-sky-500/15 px-3 py-1.5 text-xs font-bold text-sky-200 hover:bg-sky-500/25"
            >
              <Wand2 className="h-3.5 w-3.5" /> 후보 11명 자동완성
            </button>
            <button
              type="button"
              onClick={handleAutoAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-500/25"
            >
              <Sparkles className="h-3.5 w-3.5" /> 선발+후보 22명 전체 자동완성
            </button>
          </div>
        }
      >
        <TacticsWorkspace source="squad" />
      </Panel>
    </div>
  );
}