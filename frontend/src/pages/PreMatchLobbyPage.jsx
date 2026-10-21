import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Swords } from 'lucide-react';
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
import { TEAM_TACTIC_GROUPS, TEAM_TACTIC_LABELS } from '../constants/tacticsConfig.js';

/**
 * 상대 팀 브리핑 카드: 엠블럼/이름/전력/포메이션/전술과 선발 11명 요약.
 * @param {Object} props
 * @param {Object} props.opponent 서버 opponent 객체
 * @returns {JSX.Element}
 */
function OpponentCard({ opponent }) {
  return (
    <Panel title="상대 팀 브리핑">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-rose-400 bg-rose-600/20 text-2xl">{opponent.emblem}</span>
        <div>
          <p className="text-base font-black text-white" data-testid="opponent-name">
            {opponent.name}
          </p>
          <p className="text-xs text-slate-400">
            전력 {opponent.strength} · {opponent.formation}
          </p>
        </div>
      </div>
      <ul className="mt-3 space-y-1 text-[11px] text-slate-300">
        {TEAM_TACTIC_GROUPS.map((g) => (
          <li key={g.key} className="flex justify-between">
            <span className="text-slate-500">{g.label}</span>
            <span className="font-semibold">{TEAM_TACTIC_LABELS[g.key][opponent.tactics[g.key]]}</span>
          </li>
        ))}
      </ul>
      <h4 className="mb-1 mt-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">주요 선수</h4>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-slate-300">
        {opponent.starters.map((p) => (
          <li key={p.userPlayerId} className="flex justify-between">
            <span className="truncate">{p.name}</span>
            <span className="text-slate-500">
              {p.mainPosition} {p.overall}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/**
 * 경기 전 로비: 상대 팀/시나리오 브리핑과 스쿼드 화면과 동일한 전술 작업대(포메이션, 선발/벤치 교체, 위치 스왑,
 * 팀 세부 전술, 개인 지침)를 제공하고, [라인업 저장 및 경기장 입장 (Kick Off)] 으로 서버 경기 세션을 발급받아 라이브 경기를 시작합니다.
 * @returns {JSX.Element|null}
 */
export default function PreMatchLobbyPage() {
  const pending = useCompetitionStore((s) => s.pending);
  const club = useAuthStore((s) => s.club);
  const user = useAuthStore((s) => s.user);
  const loaded = useSquadStore((s) => s.loaded);
  const go = useNavStore((s) => s.go);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pending) go('modes');
    else if (!useSquadStore.getState().dirty) useSquadStore.getState().loadSquad();
  }, [pending, go]);

  if (!pending) return null;
  const { mode, stageId, next } = pending;
  const { opponent, scenario } = next;
  const meta = MODE_META[mode];

  /**
   * 라인업을 저장하고 서버 경기 세션을 발급받아 라이브 경기를 시작합니다.
   * @returns {Promise<void>}
   */
  const handleKickOff = async () => {
    setBusy(true);
    setNotice(null);
    const saved = await useSquadStore.getState().saveSquad();
    if (!saved.success) {
      setNotice({ type: 'error', text: saved.message });
      setBusy(false);
      return;
    }
    try {
      const session = await startLiveSession({ mode, stageId: next.stageId ?? stageId ?? null });
      const squad = useSquadStore.getState();
      const away = {
        clubId: 0,
        name: opponent.name,
        emblem: opponent.emblem,
        formation: opponent.formation,
        tactics: opponent.tactics,
        starters: opponent.starters.map((p, i) => normalizePlayer({ ...p, stamina: 100 }, 'AWAY', i + 1)),
        bench: opponent.bench.map((p, i) => normalizePlayer({ ...p, stamina: 100 }, 'AWAY', 12 + i)),
      };
      useLiveMatchStore.getState().initMatch({
        home: {
          clubId: user.id,
          name: club.name,
          emblem: club.emblemIcon,
          formation: squad.formation,
          tactics: squad.teamTactics,
          starters: squad.starters,
          bench: squad.bench,
        },
        away,
        sessionId: session.sessionId,
        context: { mode, stageId: next.stageId ?? stageId ?? null, ref: next.ref, label: next.label },
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
      <Panel
        title={`${meta.icon} ${next.label}`}
        right={
          <button type="button" onClick={() => go('modes', { mode })} className="inline-flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-white">
            <ArrowLeft className="h-3.5 w-3.5" /> 모드 선택으로
          </button>
        }
      >
        {scenario ? (
          <div className="rounded-xl border border-purple-500/50 bg-purple-950/20 p-3" data-testid="scenario-box">
            <p className="text-sm font-black text-purple-200">시나리오 · {scenario.title}</p>
            <p className="mt-1 text-xs text-slate-300">{scenario.description}</p>
            <p className="mt-1 text-[11px] text-slate-400">
              시작 {scenario.startMinute}분 · 스코어 {scenario.scoreHome}:{scenario.scoreAway}
              {scenario.homeRedCard && ' · 센터백 퇴장 (10명)'} · 목표: {scenario.objective.text}
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-400">전술을 점검하고 킥오프를 눌러 경기장에 입장하세요. 경기 중에도 전술/교체를 바꿀 수 있습니다.</p>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <div className="xl:col-span-1">
          <OpponentCard opponent={opponent} />
        </div>
        <Panel title="내 라인업 · 전술" className="xl:col-span-3">
          {loaded ? (
            <TacticsWorkspace source="squad" />
          ) : (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> 라인업을 불러오는 중...
            </p>
          )}
        </Panel>
      </div>

      <Notice notice={notice} />
      <div className="sticky bottom-0 flex justify-end rounded-xl bg-slate-950/90 py-3 backdrop-blur">
        <button
          type="button"
          disabled={busy || !loaded}
          onClick={handleKickOff}
          data-testid="kickoff-button"
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-blue-600 px-6 py-3 text-sm font-black text-white shadow-lg transition hover:from-emerald-500 hover:to-blue-500 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Swords className="h-5 w-5" />}
          라인업 저장 및 경기장 입장 (Kick Off)
        </button>
      </div>
    </div>
  );
}
