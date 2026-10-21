import useLiveMatchStore from '../../../store/useLiveMatchStore.js';
import { TEAM_TACTIC_LABELS } from '../../../constants/tacticsConfig.js';
import { getPeriodLabel } from './LiveControlBar.jsx';

/**
 * 한 팀의 득점/퇴장 이벤트를 선수별로 묶어 목록으로 만듭니다. (득점 분과 어시스트 포함)
 * @param {Object[]} events 타임라인 이벤트
 * @param {'HOME'|'AWAY'} team
 * @returns {{goals:Array<{name:string, shots:Array<{minute:number, assist:string|null}>}>, reds:Array<{name:string, minute:number}>}}
 */
export function summarizeScoreEvents(events, team) {
  const goalMap = new Map();
  const reds = [];
  for (const e of events) {
    if (e.team !== team) continue;
    if (e.type === 'GOAL') {
      const name = e.primaryPlayerName || '알 수 없음';
      if (!goalMap.has(name)) goalMap.set(name, []);
      goalMap.get(name).push({ minute: e.minute, assist: e.secondaryPlayerName || null });
    } else if (e.type === 'RED_CARD') {
      reds.push({ name: e.primaryPlayerName || '알 수 없음', minute: e.minute });
    }
  }
  return { goals: [...goalMap.entries()].map(([name, shots]) => ({ name, shots })), reds };
}

/**
 * 한쪽 팀 영역: 엠블럼, 팀명, 포메이션/성향, 득점자(분·어시스트)와 퇴장자 목록.
 * @param {Object} props
 * @param {Object} props.team 경기용 팀 객체
 * @param {{goals:Array, reds:Array}} props.summary 득점/퇴장 요약
 * @returns {JSX.Element}
 */
function TeamBlock({ team, summary }) {
  const isHome = team.side === 'HOME';
  return (
    <div className="flex flex-1 flex-col items-center gap-1 text-center">
      <div
        className={`flex h-14 w-14 items-center justify-center rounded-full border-2 text-2xl ${
          isHome ? 'border-blue-400 bg-blue-600/30' : 'border-rose-400 bg-rose-600/30'
        }`}
      >
        {team.emblem || team.name.slice(0, 1)}
      </div>
      <p className={`text-sm font-bold tracking-wide ${isHome ? 'text-blue-300' : 'text-rose-300'}`}>{team.name}</p>
      <p className="text-[11px] text-slate-400">
        {team.formation} · {TEAM_TACTIC_LABELS.mentality[team.tactics.mentality]}
      </p>
      <ul className="mt-1 min-h-[2.5rem] space-y-0.5 text-[11px] text-slate-300" data-testid={`scorers-${team.side}`}>
        {summary.goals.map((g) => (
          <li key={g.name}>
            ⚽ <span className="font-semibold">{g.name}</span>{' '}
            {g.shots.map((s, i) => (
              <span key={`${s.minute}-${i}`} className="text-slate-400">
                {i > 0 && ', '}
                {s.minute}&apos;{s.assist && <span className="text-slate-500"> (도움 {s.assist})</span>}
              </span>
            ))}
          </li>
        ))}
        {summary.reds.map((r) => (
          <li key={`${r.name}-${r.minute}`} className="text-red-300">
            🟥 {r.name} {r.minute}&apos;
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 실시간 전광판: 양 팀 엠블럼/이름, 현재 스코어, 경기 시간, 실시간 득점자 목록(득점 분 + 도움)과 퇴장자를 표시합니다.
 * 득점/퇴장 이벤트가 타임라인에 기록되는 즉시 갱신됩니다.
 * @returns {JSX.Element|null}
 */
export default function ScoreHeader() {
  const homeTeam = useLiveMatchStore((s) => s.homeTeam);
  const awayTeam = useLiveMatchStore((s) => s.awayTeam);
  const minute = useLiveMatchStore((s) => s.minute);
  const matchPhase = useLiveMatchStore((s) => s.matchPhase);
  const events = useLiveMatchStore((s) => s.timelineEvents);
  const context = useLiveMatchStore((s) => s.context);
  if (!homeTeam || !awayTeam) return null;

  const homeSummary = summarizeScoreEvents(events, 'HOME');
  const awaySummary = summarizeScoreEvents(events, 'AWAY');

  return (
    <section className="rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 p-4 shadow-2xl" data-testid="score-header">
      {context?.label && <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-widest text-slate-500">{context.label}</p>}
      <div className="flex items-start justify-between gap-4">
        <TeamBlock team={homeTeam} summary={homeSummary} />
        <div className="pt-2 text-center">
          <p className="text-4xl font-black tracking-tight text-white" data-testid="score-text">
            {homeTeam.score} <span className="text-slate-600">:</span> {awayTeam.score}
          </p>
          <p className="mt-1 rounded-full bg-slate-800 px-3 py-0.5 text-[11px] font-semibold text-slate-300">{getPeriodLabel(minute, matchPhase)}</p>
        </div>
        <TeamBlock team={awayTeam} summary={awaySummary} />
      </div>
    </section>
  );
}
