/**
 * 홈/어웨이 양방향 비교 게이지 바. 홈(좌, 파랑)과 어웨이(우, 빨강)가 마주 보며 채워집니다.
 * @param {Object} props
 * @param {string} props.label 지표 이름
 * @param {number} props.homeValue 홈 수치
 * @param {number} props.awayValue 원정 수치
 * @param {string} [props.unit=''] 수치 단위 (예: '%')
 * @returns {JSX.Element}
 */
export default function ProgressBar({ label, homeValue, awayValue, unit = '' }) {
  const home = Number(homeValue) || 0;
  const away = Number(awayValue) || 0;
  const total = home + away;
  const homePercent = total === 0 ? 50 : (home / total) * 100;
  const awayPercent = total === 0 ? 50 : (away / total) * 100;

  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-bold text-blue-400">
          {home}
          {unit}
        </span>
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
        <span className="font-bold text-rose-400">
          {away}
          {unit}
        </span>
      </div>
      <div className="flex h-2 w-full gap-1">
        <div className="flex h-full flex-1 justify-end overflow-hidden rounded-l-full bg-slate-800">
          <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${homePercent}%` }} />
        </div>
        <div className="flex h-full flex-1 justify-start overflow-hidden rounded-r-full bg-slate-800">
          <div className="h-full bg-rose-500 transition-all duration-500" style={{ width: `${awayPercent}%` }} />
        </div>
      </div>
    </div>
  );
}
