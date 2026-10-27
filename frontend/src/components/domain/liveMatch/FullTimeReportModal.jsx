import { Award, CheckCircle2, Coins, Crown, Flame, Loader2, Sparkles, Trophy } from 'lucide-react';
import { formatNumber } from '../../../constants/gameConfig.js';

export function StandingsTable({ rows = [], limit = null, isBundesliga = false, division = 1 }) {
  const list = limit ? rows.slice(0, limit) : rows;
  const total = rows.length;
  const relegateCount = isBundesliga || total <= 18 ? 2 : 3;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-slate-900/90 text-[10px] uppercase text-slate-400">
          <tr>
            <th className="p-2 text-center">순위</th>
            <th className="p-2 text-left">구단</th>
            <th className="p-2 text-center">경기</th>
            <th className="p-2 text-center">승</th>
            <th className="p-2 text-center">무</th>
            <th className="p-2 text-center">패</th>
            <th className="p-2 text-center">득실</th>
            <th className="p-2 text-center">승점</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r) => {
            const isUser = r.id === 'USER';
            const isPromote = division > 1 && r.rank <= 3;
            const isRelegate = division === 1 && total >= 10 && r.rank > total - relegateCount;
            return (
              <tr
                key={r.id}
                className={`border-t border-slate-800/80 ${
                  isUser ? 'bg-blue-500/15 font-bold text-white' : 'text-slate-300'
                }`}
              >
                <td className="p-2 text-center font-black">
                  <span
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                      r.rank === 1
                        ? 'bg-amber-400 text-slate-950'
                        : isPromote
                        ? 'bg-emerald-500/30 text-emerald-300'
                        : isRelegate
                        ? 'bg-rose-500/30 text-rose-300'
                        : 'text-slate-400'
                    }`}
                  >
                    {r.rank}
                  </span>
                </td>
                <td className="p-2 truncate">
                  {r.emblem && <span className="mr-1.5">{r.emblem}</span>}
                  {r.name}
                  {r.rank === 1 && <span className="ml-1.5 text-[10px] text-amber-300">👑</span>}
                </td>
                <td className="p-2 text-center">{r.p}</td>
                <td className="p-2 text-center text-emerald-300">{r.w}</td>
                <td className="p-2 text-center text-slate-400">{r.d}</td>
                <td className="p-2 text-center text-rose-300">{r.l}</td>
                <td className="p-2 text-center">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                <td className="p-2 text-center font-black text-amber-300">{r.pts}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StatCompareRow({ label, homeVal, awayVal, unit = '' }) {
  const total = Math.max(1, Number(homeVal || 0) + Number(awayVal || 0));
  const homePct = Math.round((Number(homeVal || 0) / total) * 100);
  return (
    <div className="space-y-1 text-xs">
      <div className="flex justify-between font-bold">
        <span className="text-blue-300">
          {homeVal}
          {unit}
        </span>
        <span className="text-slate-400">{label}</span>
        <span className="text-rose-300">
          {awayVal}
          {unit}
        </span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className="bg-blue-500" style={{ width: `${homePct}%` }} />
        <div className="bg-rose-500" style={{ width: `${100 - homePct}%` }} />
      </div>
    </div>
  );
}

export default function FullTimeReportModal({
  open,
  homeTeam,
  awayTeam,
  finishState,
  onRetrySave,
  onConfirmExit,
}) {
  if (!open) return null;

  const report = finishState?.report;
  const comp = report?.competition;
  const isChampion = Boolean(
    comp?.champion ||
      comp?.seasonEnd?.champion ||
      comp?.newlyClinchedByUser ||
      report?.rewards?.breakdown?.isChampion
  );
  const isEarlyClinch = Boolean(comp?.newlyClinchedByUser && !comp?.finished);

  const hStats = report?.homeStats || homeTeam?.stats || {};
  const aStats = report?.awayStats || awayTeam?.stats || {};
  const homeOffsides = homeTeam?.stats?.offsides ?? hStats.offsides ?? 0;
  const awayOffsides = awayTeam?.stats?.offsides ?? aStats.offsides ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-md"
      data-testid="fulltime-modal"
    >
      <div className="max-h-[92vh] w-full max-w-4xl space-y-4 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        {/* 시즌 우승 / 대회 우승 / 조기 우승 확정 시 특별 세레머니 배너 */}
        {isChampion && (
          <div className="relative overflow-hidden rounded-2xl border-2 border-amber-400 bg-gradient-to-r from-amber-600/30 via-yellow-500/20 to-amber-600/30 p-6 text-center shadow-2xl">
            <div className="flex justify-center gap-2 text-amber-300">
              <Sparkles className="h-6 w-6 animate-pulse" />
              <Crown className="h-8 w-8 text-yellow-300" />
              <Sparkles className="h-6 w-6 animate-pulse" />
            </div>
            <h2 className="mt-2 text-3xl font-black tracking-wider text-white">
              🏆 {isEarlyClinch ? '리그 조기 우승 확정!' : `${comp?.label || '대회'} 최종 우승!`} 🎉
            </h2>
            <p className="mt-1 text-sm font-bold text-amber-200">
              {isEarlyClinch
                ? `남은 경기 결과와 관계없이 ${homeTeam?.name} 구단이 압도적인 승점 차로 이번 시즌 챔피언에 등극했습니다!`
                : `축하합니다! ${homeTeam?.name} 구단이 모든 경쟁자를 물리치고 정상에 올라 트로피를 들어 올립니다!`}
            </p>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-400 px-4 py-1 text-xs font-black text-slate-950">
              <Trophy className="h-4 w-4" /> 챔피언 특별 보너스 지급 완료
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <span className="rounded bg-blue-600/20 px-2 py-0.5 text-[10px] font-bold text-blue-300">FULL TIME REPORT</span>
            <h3 className="mt-1 text-xl font-black text-white">
              {homeTeam?.name} <span className="text-amber-300">{homeTeam?.score}</span> :{' '}
              <span className="text-amber-300">{awayTeam?.score}</span> {awayTeam?.name}
            </h3>
          </div>
          {report?.mom && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
              <Award className="h-5 w-5 text-amber-400" />
              <div>
                <p className="text-[10px] font-bold text-amber-300">MAN OF THE MATCH</p>
                <p className="font-black text-white">
                  {report.mom.name} ({report.mom.position}) · ★{report.mom.rating}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-2.5 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">팀 주요 매치 통계 (오프사이드 포함)</h4>
            <StatCompareRow label="점유율" homeVal={hStats.possession ?? 50} awayVal={aStats.possession ?? 50} unit="%" />
            <StatCompareRow label="슈팅" homeVal={hStats.shots ?? 0} awayVal={aStats.shots ?? 0} />
            <StatCompareRow label="유효 슈팅" homeVal={hStats.shotsOnTarget ?? 0} awayVal={aStats.shotsOnTarget ?? 0} />
            <StatCompareRow label="코너킥" homeVal={hStats.corners ?? 0} awayVal={aStats.corners ?? 0} />
            <StatCompareRow label="오프사이드" homeVal={homeOffsides} awayVal={awayOffsides} />
            <StatCompareRow label="반칙 (파울)" homeVal={hStats.fouls ?? 0} awayVal={aStats.fouls ?? 0} />
            <StatCompareRow label="경고 / 퇴장" homeVal={`${hStats.yellowCards ?? 0}/${hStats.redCards ?? 0}`} awayVal={`${aStats.yellowCards ?? 0}/${aStats.redCards ?? 0}`} />
            <StatCompareRow label="골키퍼 선방" homeVal={hStats.saves ?? 0} awayVal={aStats.saves ?? 0} />
          </div>

          <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">경기 정산 보상 및 선수단 평점</h4>
            {finishState?.status === 'saving' && (
              <p className="flex items-center gap-2 py-6 text-xs text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> 경기 결과를 서버에 기록하는 중...
              </p>
            )}
            {finishState?.status === 'error' && (
              <div className="space-y-2 rounded-lg border border-rose-500/40 bg-rose-950/30 p-3 text-xs text-rose-200">
                <p>{finishState.message}</p>
                <button
                  type="button"
                  onClick={onRetrySave}
                  className="rounded bg-rose-600 px-3 py-1 font-bold text-white hover:bg-rose-500"
                >
                  다시 저장 시도
                </button>
              </div>
            )}
            {report && (
              <>
                <div className="flex flex-wrap items-center justify-between rounded-lg bg-slate-900 p-3 text-xs">
                  <span className="flex items-center gap-1.5 font-bold text-amber-300">
                    <Coins className="h-4 w-4" /> 총 획득 골드: +{formatNumber(report.rewards.gold)} G
                  </span>
                  {report.rewards.cashFree > 0 && (
                    <span className="font-bold text-emerald-300">무료 캐시: +{formatNumber(report.rewards.cashFree)} C</span>
                  )}
                </div>
                <div className="max-h-48 overflow-y-auto">
                  <table className="w-full text-[11px]">
                    <thead className="bg-slate-900 text-slate-400">
                      <tr>
                        <th className="p-1.5 text-left">포지션</th>
                        <th className="p-1.5 text-left">선수명</th>
                        <th className="p-1.5 text-center">득점/도움</th>
                        <th className="p-1.5 text-center">평점</th>
                        <th className="p-1.5 text-right">잔여체력</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(report.players || []).map((p) => (
                        <tr key={p.userPlayerId} className="border-t border-slate-800/70 text-slate-200">
                          <td className="p-1.5 font-bold text-blue-300">{p.position}</td>
                          <td className="p-1.5 font-semibold text-white">
                            {p.name}
                            {p.red > 0 && <span className="ml-1 text-[10px] text-rose-400">🟥퇴장(징계)</span>}
                          </td>
                          <td className="p-1.5 text-center">
                            {p.goals > 0 ? `${p.goals}G ` : ''}
                            {p.assists > 0 ? `${p.assists}A` : ''}
                            {p.goals === 0 && p.assists === 0 ? '-' : ''}
                          </td>
                          <td className="p-1.5 text-center font-black text-amber-300">★{p.rating.toFixed(1)}</td>
                          <td className="p-1.5 text-right text-sky-300">{Math.round(p.stamina)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            disabled={finishState?.status === 'saving'}
            onClick={onConfirmExit}
            data-testid="fulltime-confirm"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-emerald-600 px-6 py-2.5 text-sm font-black text-white shadow-lg hover:from-blue-500 hover:to-emerald-500 disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" /> 확인 및 로비로 이동
          </button>
        </div>
      </div>
    </div>
  );
}