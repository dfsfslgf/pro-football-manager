import { FAMILIARITY_META } from '../../../constants/tacticsConfig.js';
import StaminaBar from '../../common/StaminaBar.jsx';

/**
 * 교체 탭 안에서 필드 11명의 위치를 클릭으로 직관적으로 맞바꾸는 미니 전술판.
 * 마커는 슬롯 기준 좌표(baseX, baseY)에 놓이며, 위치가 바뀌면 transition-all duration-300 으로 부드럽게 이동합니다.
 * 마커 테두리 색은 포지션 적합도(초록/노랑/주황/빨강)를 나타내고, 퇴장 공석은 점선 'X' 마커로 표시됩니다.
 * @param {Object} props
 * @param {Object[]} props.starters 필드 슬롯 11개 (index = slotIndex)
 * @param {number|null} props.selectedSlotIndex 선택된 슬롯
 * @param {(slotIndex:number) => void} props.onSelectSlot 마커 클릭 핸들러
 * @returns {JSX.Element}
 */
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
        const meta = FAMILIARITY_META[p.familiarity];
        const isGK = p.slotRoleGroup === 'GK';
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelectSlot(p.slotIndex)}
            className="absolute flex w-14 -translate-x-1/2 -translate-y-4 flex-col items-center transition-all duration-300"
            style={{ left: `${p.baseX}%`, top: `${7 + p.baseY * 0.68}%` }}
            title={p.isSentOff ? `${p.slotRoleCode} 퇴장 공석` : `${p.slotRoleCode} · ${p.name} · ${meta.label}`}
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
                p.isSentOff ? 'bg-red-950/70 text-red-300 line-through' : 'bg-black/55 text-white'
              }`}
            >
              {p.name}
            </span>
            <span className="text-[9px] font-black text-white/90">{p.slotRoleCode}</span>
            {!p.isSentOff && <StaminaBar value={p.currentStamina} className="w-9" />}
          </button>
        );
      })}
    </div>
  );
}
