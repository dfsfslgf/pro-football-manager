/**
 * 체력 게이지 바 (초록 -> 노랑 -> 빨강).
 * @param {Object} props
 * @param {number} props.value 체력 0~100
 * @param {boolean} [props.showLabel=false] 우측에 % 숫자 표시 여부
 * @param {string} [props.className=''] 추가 클래스
 * @returns {JSX.Element}
 */
export default function StaminaBar({ value, showLabel = false, className = '' }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const color = pct > 60 ? 'bg-emerald-500' : pct > 30 ? 'bg-amber-400' : 'bg-red-500';
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-700">
        <div className={`h-full ${color} transition-all duration-300`} style={{ width: `${pct}%` }} />
      </div>
      {showLabel && <span className="w-8 text-right text-[10px] font-semibold text-slate-300">{pct}%</span>}
    </div>
  );
}
