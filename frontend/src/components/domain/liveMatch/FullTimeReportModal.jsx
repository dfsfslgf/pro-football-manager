import { Loader2, RefreshCw, Trophy } from 'lucide-react';
import { OUTCOME_META, formatNumber } from '../../../constants/gameConfig.js';

function RatingBar({ rating }) {
  const pct = Math.max(0, Math.min(100, ((rating - 3) / 7) * 100));
  const color = rating >= 8 ? 'bg-yellow-400' : rating >= 7 ? 'bg-emerald-500' : rating >= 6 ? 'bg-sky-500' : 'bg-rose-500';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-700">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-xs font-black text-white">{rating.toFixed(1)}</span>
    </div>
  );
}

function MomCard({ mom }) {
  if (!mom) return null;
  return (
    <div
      className="rounded-xl border-2 border-yellow-400/80 bg-gradient-to-br from-yellow-500/25 via-amber-900/20 to-slate-900 p-4 shadow-lg shadow-yellow-500/20"
      data-testid="mom-card"
    >
      <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.25em] text-yellow-300">
        <Trophy className="h-3.5 w-3.5" /> Man of the Match
      </p>
      <p className="mt-2 text-2xl font-black text-white">{mom.name}</p>
      <p className="text-xs text-yellow-100/80">
        {mom.position} · {mom.minutes}분 출전 · 득점 {mom.goals} · 도움 {mom.assists}
        {mom.saves > 0 ? ` · 선방 ${mom.saves}` : ''}
      </p>
      <p className="mt-2 text-4xl font-black text-yellow-300">{mom.rating.toFixed(1)}</p>
    </div>
  );
}

export function StandingsTable({ rows, limit = 10 }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
          <th className="py-1 pr-2">#</th>
          <th>팀</th>
          <th className="text-center">경기</th>
          <th className="text-center">승</th>
          <th className="text-center">무</th>
          <th className="text-center">패</th>
          <th className="text-center">득실</th>
          <th className="text-right">승점</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, limit).map((r) => (
          <tr key={r.id} className={r.id === 'USER' ? 'bg-blue-500/15 font-bold text-white' : 'text-slate-300'}>
            <td className="py-1 pr-2">{r.rank}</td>
            <td className="truncate">
              {r.emblem} {r.name}
            </td>
            <td className="text-center">{r.p}</td>
            <td className="text-center">{r.w}</td>
            <td className="text-center">{r.d}</td>
            <td className="text-center">{r.l}</td>
            <td className="text-center">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
            <td className="text-right font-black">{r.pts}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CompetitionSummary({ competition }) {
  if (!competition) return null;
  const box = 'rounded-xl border border-slate-700 bg-slate-950/60 p-4';
  if (competition.type === 'LEAGUE') {
    const rankDelta = competition.rankBefore - competition.rank;
    return (
      <div className={box} data-testid="competition-summary">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-300">
          리그 {competition.round}/{competition.totalRounds}라운드 결과
        </h3>
        <p className="mb-2 text-sm text-slate-200">
          현재 <b className="text-white">{competition.rank}위</b> · 승점 {competition.points}
          {rankDelta !== 0 && <span className={rankDelta > 0 ? 'ml-2 text-emerald-300' : 'ml-2 text-rose-300'}>{rankDelta > 0 ? `▲${rankDelta}` : `▼${-rankDelta}`}</span>}
        </p>
        <StandingsTable rows={competition.standings} />
        {competition.seasonEnd && (
          <p className="mt-3 rounded-lg bg-amber-500/10 p-2 text-center text-sm font-bold text-amber-200">
            🏁 시즌 종료! 최종 {competition.seasonEnd.rank}위 ·{' '}
            {competition.seasonEnd.promoted ? '🔺 승격!' : competition.seasonEnd.relegated ? '🔻 강등' : '잔류'}
            {competition.seasonEnd.champion && ' · 🏆 우승'}
          </p>
        )}
      </div>
    );
  }
  if (competition.type === 'CUP' || (competition.type === 'WORLD_CUP' && competition.phase === 'KNOCKOUT')) {
    const m = competition.match;
    const userIsA = m.a === 'USER';
    const [ug, og] = userIsA ? [m.ga, m.gb] : [m.gb, m.ga];
    const pens = m.pens ? (userIsA ? m.pens : [m.pens[1], m.pens[0]]) : null;
    return (
      <div className={box} data-testid="competition-summary">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-300">{competition.roundName}</h3>
        <p className="text-sm text-slate-200">
          정규시간 {ug}:{og}
          {m.et && ` · 연장 ${userIsA ? m.et[0] : m.et[1]}:${userIsA ? m.et[1] : m.et[0]}`}
          {pens && ` · 승부차기 ${pens[0]}:${pens[1]}`}
        </p>
        <p className={`mt-2 text-sm font-bold ${competition.advanced ? 'text-emerald-300' : 'text-rose-300'}`}>
          {competition.champion ? '🏆 우승을 차지했습니다!' : competition.advanced ? '✅ 다음 라운드 진출!' : '❌ 탈락했습니다.'}
        </p>
      </div>
    );
  }
  if (competition.type === 'WORLD_CUP') {
    return (
      <div className={box} data-testid="competition-summary">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-300">
          월드컵 조별리그 {competition.matchday}차전 · A조 순위
        </h3>
        <StandingsTable rows={competition.groupStandings.A} limit={4} />
        {competition.advanced !== undefined && (
          <p className={`mt-3 text-center text-sm font-bold ${competition.advanced ? 'text-emerald-300' : 'text-rose-300'}`}>
            {competition.advanced ? '✅ 8강 토너먼트 진출!' : '❌ 조별리그 탈락'}
          </p>
        )}
      </div>
    );
  }
  if (competition.type === 'TOWER') {
    return (
      <div className={box} data-testid="competition-summary">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-300">
          Stage {competition.stageId} · {competition.title}
        </h3>
        <p className="text-xs text-slate-400">목표: {competition.objective.text}</p>
        <p className={`mt-2 text-sm font-bold ${competition.cleared ? 'text-emerald-300' : 'text-rose-300'}`}>
          {competition.cleared ? (competition.firstClear ? '🎉 첫 클리어! 큰 보상 획득' : '✅ 클리어 (반복 보상)') : '❌ 목표 미달성'}
        </p>
        <p className="text-[11px] text-slate-500">
          {competition.clearedCount}/{competition.totalStages} 스테이지 클리어
        </p>
      </div>
    );
  }
  if (competition.type === 'RANKED') {
    return (
      <div className={box} data-testid="competition-summary">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-300">랭크 결과</h3>
        <p className="text-sm text-slate-200">
          {competition.rpBefore} RP → <b className="text-white">{competition.rpAfter} RP</b>{' '}
          <span className={competition.delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}>({competition.delta >= 0 ? '+' : ''}{competition.delta})</span>
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {competition.tierChanged ? `티어 변경: ${competition.tierBefore} → ${competition.tierAfter}` : `현재 티어: ${competition.tierAfter}`}
          {competition.streak >= 2 && ` · 🔥 ${competition.streak}연승`}
        </p>
      </div>
    );
  }
  return null;
}

export default function FullTimeReportModal({ finishState, homeName, awayName, score, onRetry, onContinue, onQuickNext, quickNextLabel = '다음 경기 바로 진행' }) {
  const report = finishState.report;
  const outcome = report?.outcome || (score.home > score.away ? 'WIN' : score.home === score.away ? 'DRAW' : 'LOSE');
  const meta = OUTCOME_META[outcome];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/90 p-4 backdrop-blur-sm" data-testid="fulltime-modal">
      <div className={`mx-auto max-w-4xl space-y-4 rounded-2xl border bg-gradient-to-b p-5 shadow-2xl ${meta.bg}`}>
        <header className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-slate-400">Full Time</p>
          <p className={`mt-1 text-lg font-black ${meta.className}`}>{meta.label}</p>
          <p className="mt-1 text-5xl font-black text-white">
            {score.home} <span className="text-slate-600">:</span> {score.away}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {homeName} vs {awayName}
          </p>
        </header>
        {finishState.status === 'saving' && (
          <p className="flex items-center justify-center gap-2 py-6 text-sm text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin" /> 경기 결과를 서버에 저장하고 정산하는 중...
          </p>
        )}
        {finishState.status === 'error' && (
          <div className="space-y-3 rounded-xl border border-red-500/50 bg-red-950/30 p-4 text-center">
            <p className="text-sm font-semibold text-red-200">{finishState.message}</p>
            <button type="button" onClick={onRetry} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-500">
              <RefreshCw className="h-4 w-4" /> 저장 다시 시도
            </button>
          </div>
        )}
        {report && (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <MomCard mom={report.mom} />
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4" data-testid="rewards-box">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-300">보상 내역</h3>
                <ul className="space-y-1 text-sm">
                  <li className="flex justify-between text-slate-300">
                    <span>경기 보상</span>
                    <b className="text-amber-300">+{formatNumber(report.rewards.breakdown.match)} G</b>
                  </li>
                  <li className="flex justify-between text-slate-300">
                    <span>후원사 ({report.rewards.breakdown.sponsorName})</span>
                    <b className="text-amber-300">+{formatNumber(report.rewards.breakdown.sponsor)} G</b>
                  </li>
                  {report.rewards.breakdown.competition > 0 && (
                    <li className="flex justify-between text-slate-300">
                      <span>대회 보상</span>
                      <b className="text-amber-300">+{formatNumber(report.rewards.breakdown.competition)} G</b>
                    </li>
                  )}
                  {report.rewards.cashFree > 0 && (
                    <li className="flex justify-between text-slate-300">
                      <span>무료 캐시</span>
                      <b className="text-sky-300">+{formatNumber(report.rewards.cashFree)}</b>
                    </li>
                  )}
                  <li className="flex justify-between border-t border-slate-700 pt-1 text-slate-100">
                    <span className="font-bold">합계</span>
                    <b className="text-amber-300">+{formatNumber(report.rewards.gold)} G</b>
                  </li>
                  <li className="flex justify-between text-xs text-slate-400">
                    <span>선수단 획득 경험치</span>
                    <span>+{formatNumber(report.totalExp)} EXP</span>
                  </li>
                  {report.restRecovery > 0 && (
                    <li className="flex justify-between text-xs text-slate-400">
                      <span>경기 후 휴식 (손실 체력 회복)</span>
                      <span className="text-emerald-300">손실의 {report.restRecovery}%</span>
                    </li>
                  )}
                </ul>
              </div>
            </div>
            <CompetitionSummary competition={report.competition} />
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-300">선수 평점</h3>
              <table className="w-full text-xs" data-testid="ratings-table">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="py-1">선수</th>
                    <th>포지션</th>
                    <th className="text-center">출전</th>
                    <th className="text-center">득점</th>
                    <th className="text-center">도움</th>
                    <th className="text-center">카드</th>
                    <th>평점</th>
                  </tr>
                </thead>
                <tbody>
                  {[...report.players]
                    .sort((a, b) => b.rating - a.rating)
                    .map((p) => (
                      <tr key={p.userPlayerId} className={`text-slate-300 ${report.mom && p.userPlayerId === report.mom.userPlayerId ? 'bg-yellow-500/10' : ''}`}>
                        <td className="py-1 font-semibold text-slate-100">
                          {report.mom && p.userPlayerId === report.mom.userPlayerId && '🏅 '}
                          {p.name}
                        </td>
                        <td>{p.position}</td>
                        <td className="text-center">{p.minutes}&apos;</td>
                        <td className="text-center">{p.goals || '-'}</td>
                        <td className="text-center">{p.assists || '-'}</td>
                        <td className="text-center">
                          {p.yellow > 0 && '🟨'}
                          {p.red > 0 && '🟥'}
                          {!p.yellow && !p.red && '-'}
                        </td>
                        <td>
                          <RatingBar rating={p.rating} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={onContinue}
                className="rounded-xl border border-slate-600 bg-slate-800 px-5 py-2.5 text-sm font-bold text-slate-100 hover:bg-slate-700"
                data-testid="continue-button"
              >
                계속하기
              </button>
              {onQuickNext && (
                <button
                  type="button"
                  onClick={onQuickNext}
                  className="rounded-xl bg-gradient-to-r from-emerald-600 to-blue-600 px-5 py-2.5 text-sm font-black text-white shadow-lg hover:from-emerald-500 hover:to-blue-500"
                  data-testid="quick-next-button"
                >
                  ⏭ {quickNextLabel}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}