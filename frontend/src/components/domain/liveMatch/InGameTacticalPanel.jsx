import { X } from 'lucide-react';
import TacticsWorkspace from '../squad/TacticsWorkspace.jsx';

/**
 * 경기 중/하프타임 통합 작전판
 * @param {Object} props
 * @param {() => void} [props.onClose] 작전판을 닫고 경기를 재개하는 콜백 (live 모드에서만 사용)
 * @param {'live'|'halftime'} [props.mode='live'] 하프타임 모달 내장 시 'halftime' (닫기 버튼 숨김)
 * @returns {JSX.Element}
 */
export default function InGameTacticalPanel({ onClose, mode = 'live' }) {
  return (
    <section className="space-y-4 rounded-2xl border border-purple-500/40 bg-slate-900/90 p-4 shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-widest text-purple-200">Tactical Panel</h2>
        {mode === 'live' && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500"
          >
            <X className="h-3.5 w-3.5" /> 작전 종료 · 경기 재개
          </button>
        )}
      </div>
      <TacticsWorkspace source="live" />
    </section>
  );
}
