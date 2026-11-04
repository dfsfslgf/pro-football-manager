import useLiveMatchStore from '../../../store/useLiveMatchStore.js';

const SPEEDS = [1, 2, 4];

/**
 * 현재 분을 "42' 전반전" 형태의 라벨로 변환함.
 * @param {number} minute 0~120
 * @param {string} matchPhase PRE_MATCH | FIRST_HALF | HALF_TIME | SECOND_HALF | EXTRA_TIME_1 | EXTRA_TIME_2 | FULL_TIME
 * @param {{home:number, away:number}|null} shootout 승부차기 결과(있으면 종료 라벨에 표시)
 * @returns {string}
 */
export function getPeriodLabel(minute, matchPhase, shootout = null) {
  if (matchPhase === 'FULL_TIME') {
    if (shootout) return `승부차기 ${shootout.home} : ${shootout.away} 종료`;
    return minute > 90 ? `${minute}' 연장 종료` : `90' 경기 종료`;
  }
  if (matchPhase === 'HALF_TIME') return `45' 하프타임`;
  if (minute === 0) return `0' 킥오프`;
  if (matchPhase === 'EXTRA_TIME_1') return `${minute}' 연장 전반`;
  if (matchPhase === 'EXTRA_TIME_2') return `${minute}' 연장 후반`;
  return `${minute}' ${matchPhase === 'SECOND_HALF' ? '후반전' : '전반전'}`;
}

/**
 * 경기 진행 시간, 재생/일시정지, 배속(1x/2x/4x), 전술/교체 버튼을 제공하는 상단 컨트롤 바.
 * 전술/교체 버튼을 누르면 경기가 자동으로 일시정지되고 작전판이 열림. 하프타임에는 모달에서만 조작할 수 있음.
 * @param {Object} props
 * @param {() => void} props.onOpenTactics 작전판 열기 콜백
 * @returns {JSX.Element}
 */
export default function LiveControlBar({ onOpenTactics }) {
  const minute = useLiveMatchStore((s) => s.minute);
  const matchPhase = useLiveMatchStore((s) => s.matchPhase);
  const shootout = useLiveMatchStore((s) => s.shootout);
  const isPaused = useLiveMatchStore((s) => s.isPaused);
  const playbackSpeed = useLiveMatchStore((s) => s.playbackSpeed);
  const subsLeft = useLiveMatchStore((s) => s.homeTeam?.subsLeft ?? 0);
  const togglePause = useLiveMatchStore((s) => s.togglePause);
  const setPlaybackSpeed = useLiveMatchStore((s) => s.setPlaybackSpeed);
  const pauseMatch = useLiveMatchStore((s) => s.pauseMatch);

  const isFinished = matchPhase === 'FULL_TIME';
  const isHalfTime = matchPhase === 'HALF_TIME';

  const handleOpenTactics = () => {
    pauseMatch();
    onOpenTactics();
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
      <span className="min-w-[110px] rounded-lg bg-slate-800 px-3 py-1.5 text-center text-sm font-black text-white">
        {getPeriodLabel(minute, matchPhase, shootout)}
      </span>

      <button
        type="button"
        onClick={togglePause}
        disabled={isFinished || isHalfTime}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPaused ? '▶ 재생' : '⏸ 일시정지'}
      </button>

      <div className="flex overflow-hidden rounded-lg border border-slate-700">
        {SPEEDS.map((speed) => (
          <button
            key={speed}
            type="button"
            onClick={() => setPlaybackSpeed(speed)}
            disabled={isFinished}
            className={`px-3 py-1.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              playbackSpeed === speed ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {speed}x
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={handleOpenTactics}
        disabled={isFinished || isHalfTime}
        className="ml-auto inline-flex items-center gap-2 rounded-lg border border-purple-500/60 bg-purple-500/10 px-4 py-1.5 text-sm font-semibold text-purple-200 transition hover:bg-purple-500/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        ⚙️ 전술/선수 교체 (남은 교체: {subsLeft})
      </button>
    </div>
  );
}
