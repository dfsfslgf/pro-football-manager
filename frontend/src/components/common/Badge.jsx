const BADGE_STYLES = {
  GOAL: { label: 'GOAL', className: 'bg-blue-500/20 text-blue-300 border-blue-400/60' },
  YELLOW_CARD: { label: 'YELLOW CARD', className: 'bg-amber-500/20 text-amber-300 border-amber-400/60' },
  RED_CARD: { label: 'RED CARD', className: 'bg-red-500/20 text-red-300 border-red-500/60' },
  SUBSTITUTION: { label: 'SUBSTITUTION', className: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/60' },
  TACTIC_CHANGE: { label: 'TACTIC', className: 'bg-purple-500/20 text-purple-300 border-purple-400/60' },
  WIN: { label: 'WIN', className: 'bg-yellow-400/20 text-yellow-300 border-yellow-400/70' },
  DRAW: { label: 'DRAW', className: 'bg-slate-500/20 text-slate-300 border-slate-400/60' },
  LOSE: { label: 'LOSE', className: 'bg-slate-700/40 text-slate-400 border-slate-600' },
};

/**
 * 이벤트/승패 상태 표시용 알약(Pill) 뱃지.
 * @param {Object} props
 * @param {'GOAL'|'YELLOW_CARD'|'RED_CARD'|'SUBSTITUTION'|'TACTIC_CHANGE'|'WIN'|'DRAW'|'LOSE'} props.type 뱃지 종류
 * @param {string} [props.label] 기본 라벨을 덮어쓸 텍스트
 * @returns {JSX.Element}
 */
export default function Badge({ type, label }) {
  const style = BADGE_STYLES[type] || BADGE_STYLES.DRAW;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wider ${style.className}`}
    >
      {label || style.label}
    </span>
  );
}
