import { useState } from 'react';
import { PlayCircle } from 'lucide-react';
import useLiveMatchStore from '../../../store/useLiveMatchStore.js';
import { LOCKER_TALKS } from '../../../constants/tacticsConfig.js';
import ProgressBar from '../../common/ProgressBar.jsx';
import InGameTacticalPanel from './InGameTacticalPanel.jsx';

/**
 * 전반 45분 종료 시 자동으로 열리는 하프타임 라커룸 모달.
 * 전반전 요약, 체력 회복 결과, 감독 라커룸 토크(1회), 통합 전술 패널(교체/위치 스왑/팀 전술/개인 지침)을 제공하며
 * [후반전 킥오프] 버튼을 눌러야 후반전이 시작됩니다.
 * @returns {JSX.Element|null}
 */
export default function HalfTimeModal() {
  const isOpen = useLiveMatchStore((s) => s.isHalfTimeModalOpen);
  const summary = useLiveMatchStore((s) => s.halfTimeSummary);
  const lockerTalk = useLiveMatchStore((s) => s.lockerTalk);
  const homeTeam = useLiveMatchStore((s) => s.homeTeam);
  const awayTeam = useLiveMatchStore((s) => s.awayTeam);
  const selectLockerTalk = useLiveMatchStore((s) => s.selectLockerTalk);
  const startSecondHalf = useLiveMatchStore((s) => s.startSecondHalf);
  const [talkFeedback, setTalkFeedback] = useState(null);

  if (!isOpen || !summary || !homeTeam || !awayTeam) return null;

  const recovered = summary.homeRecovery;
  const averageGain = recovered.length ? recovered.reduce((sum, r) => sum + (r.after - r.before), 0) / recovered.length : 0;
  const tired = [...homeTeam.starters]
    .filter((p) => !p.isSentOff)
    .sort((a, b) => a.currentStamina - b.currentStamina)
    .slice(0, 3);
  const isLosing = summary.scoreHome < summary.scoreAway;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 p-4 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <header className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-300">Half Time · 라커룸</p>
          <p className="mt-1 text-4xl font-black text-white">
            {summary.scoreHome} <span className="text-slate-600">:</span> {summary.scoreAway}
          </p>
          <p className="text-xs text-slate-400">
            {homeTeam.name} vs {awayTeam.name} · 전반 45분 종료
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-300">전반전 통계</h2>
            <ProgressBar label="볼 점유율" homeValue={summary.homeStats.possession} awayValue={summary.awayStats.possession} unit="%" />
            <ProgressBar label="총 슈팅" homeValue={summary.homeStats.shots} awayValue={summary.awayStats.shots} />
            <ProgressBar label="유효 슈팅" homeValue={summary.homeStats.shotsOnTarget} awayValue={summary.awayStats.shotsOnTarget} />
            <ProgressBar label="코너킥" homeValue={summary.homeStats.corners} awayValue={summary.awayStats.corners} />
            <ProgressBar label="파울" homeValue={summary.homeStats.fouls} awayValue={summary.awayStats.fouls} />
            <ProgressBar label="옐로카드" homeValue={summary.homeStats.yellowCards} awayValue={summary.awayStats.yellowCards} />
            <ProgressBar label="레드카드" homeValue={summary.homeStats.redCards} awayValue={summary.awayStats.redCards} />
          </section>

          <section className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-300">라커룸 휴식</h2>
            <p className="text-sm text-emerald-300">
              생존 선수 평균 체력 <b>+{averageGain.toFixed(1)}</b> 회복
            </p>
            <p className="text-[11px] text-slate-500">손실 체력의 25% (최소 +5 ~ 최대 +12) 회복</p>
            <h3 className="pt-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">가장 지친 선수</h3>
            <ul className="space-y-1 text-xs">
              {tired.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <span className="text-slate-200">
                    {p.slotRoleCode} {p.name}
                  </span>
                  <span className={p.currentStamina <= 40 ? 'font-bold text-red-300' : 'text-amber-300'}>{Math.round(p.currentStamina)}%</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-300">감독 라커룸 토크 (1회)</h2>
            <div className="space-y-1.5">
              {Object.entries(LOCKER_TALKS).map(([type, talk]) => (
                <button
                  key={type}
                  type="button"
                  disabled={Boolean(lockerTalk)}
                  onClick={() => setTalkFeedback(selectLockerTalk(type))}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition disabled:cursor-not-allowed ${
                    lockerTalk === type
                      ? 'border-amber-400 bg-amber-500/20 text-amber-100'
                      : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-40'
                  }`}
                >
                  <span className="font-bold">{talk.label}</span>
                  <span className="block text-[10px] text-slate-400">{talk.desc}</span>
                </button>
              ))}
            </div>
            <TalkHint isLosing={isLosing} lockerTalk={lockerTalk} />
            {talkFeedback && (
              <p className={`text-[11px] ${talkFeedback.success ? 'text-emerald-300' : 'text-red-300'}`}>{talkFeedback.message}</p>
            )}
          </section>
        </div>

        <InGameTacticalPanel mode="halftime" />

        <div className="sticky bottom-0 flex justify-end rounded-xl bg-slate-900/95 py-3">
          <button
            type="button"
            onClick={startSecondHalf}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-blue-600 px-6 py-3 text-sm font-black text-white shadow-lg transition hover:from-emerald-500 hover:to-blue-500"
          >
            <PlayCircle className="h-5 w-5" />
            ▶️ 후반전 킥오프 (Start 2nd Half)
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 라커룸 토크 선택 힌트 문구.
 * @param {Object} props
 * @param {boolean} props.isLosing 현재 지고 있는지
 * @param {string|null} props.lockerTalk 이미 선택한 토크
 * @returns {JSX.Element}
 */
function TalkHint({ isLosing, lockerTalk }) {
  if (lockerTalk) return <p className="text-[11px] text-slate-500">이미 라커룸 토크를 마쳤습니다.</p>;
  return (
    <p className="text-[11px] text-slate-500">
      {isLosing ? '지고 있어 "강하게 질책"의 집중력 보너스가 적용됩니다.' : '앞서거나 비기고 있으면 "강하게 질책"은 효과가 없습니다.'}
    </p>
  );
}
