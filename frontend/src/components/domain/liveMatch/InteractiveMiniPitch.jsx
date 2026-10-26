import { FAMILIARITY_META } from '../../../constants/tacticsConfig.js';
import StaminaBar from '../../common/StaminaBar.jsx';

export default function InteractiveMiniPitch({ starters, selectedSlotIndex, onSelectSlot }) {
  return (
    <div
      className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border-2 border-white/70 shadow-xl"
      style={{
        backgroundImage: 'repeating-linear-gradient(90deg, #2f7d32 0, #2f7d32 8.333%, #388e3c 8.333%, #388e3c 16.666%)',
      }}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 h-full w-px bg-white/70" />
        <div className="absolute left-1/2 top-1/2 h-[27%] w-[17%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70" />
        <div className="absolute left-0 top-[20%] h-[60%] w-[16%] border border-l-0 border-white/70" />
        <div className="absolute left-0 top-[36%] h-[28%] w-[5.5%] border border-l-0 border-white/70" />
        <div className="absolute right-0 top-[20%] h-[60%] w-[16%] border border-r-0 border-white/70" />
        <div className="absolute right-0 top-[36%] h-[28%] w-[5.5%] border border-r-0 border-white/70" />
      </div>

      {starters.map((p) => {
        const isSelected = selectedSlotIndex === p.slotIndex;
        const meta = FAMILIARITY_META[p.familiarity] || FAMILIARITY_META.NATURAL;
        const isGK = p.slotRoleGroup === 'GK';
        const ratingVal = Number(p.liveRating ?? p.rating ?? 6.0).toFixed(1);
        const staminaVal = p.currentStamina ?? p.stamina ?? 100;

        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelectSlot(p.slotIndex)}
            className="absolute flex w-16 -translate-x-1/2 -translate-y-4 flex-col items-center transition-all duration-300"
            style={{ left: `${p.baseX}%`, top: `${7 + p.baseY * 0.68}%` }}
            title={p.isSentOff ? `${p.slotRoleCode} 퇴장 공석` : `${p.slotRoleCode} · ${p.name} · 평점 ${ratingVal} · 체력 ${Math.round(staminaVal)}%`}
          >
            {p.isSentOff ? (
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed border-red-300 bg-black/40 text-sm font-black text-red-300 ${
                  isSelected ? 'ring-4 ring-amber-400' : ''
                }`}
              >
                ✕
              </span>
            ) : (
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full border-[3px] text-[11px] font-black shadow-lg ${
                  isGK ? 'bg-yellow-400 text-slate-900' : 'bg-blue-600 text-white'
                } ${isSelected ? 'ring-4 ring-amber-400' : ''}`}
                style={{ borderColor: meta.color }}
              >
                {p.backNumber}
              </span>
            )}
            <span
              className={`mt-0.5 max-w-full truncate rounded px-1 text-[9px] font-semibold ${
                p.isSentOff ? 'bg-red-950/70 text-red-300 line-through' : 'bg-black/65 text-white'
              }`}
            >
              {p.name}
            </span>
            <span className="text-[9px] font-black text-amber-300">
              {p.slotRoleCode} · ★{ratingVal}
            </span>
            {!p.isSentOff && <StaminaBar value={staminaVal} className="w-10" />}
          </button>
        );
      })}
    </div>
  );
}