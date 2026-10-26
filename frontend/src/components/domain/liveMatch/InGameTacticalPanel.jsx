import { useState } from 'react';
import { Megaphone, X } from 'lucide-react';
import TacticsWorkspace from '../squad/TacticsWorkspace.jsx';
import useLiveMatchStore from '../../../store/useLiveMatchStore.js';
import { TOUCHLINE_SHOUTS } from '../../../constants/tacticsConfig.js';
import Notice from '../../common/Notice.jsx';

export default function InGameTacticalPanel({ onClose, mode = 'live' }) {
  const issueTouchlineShout = useLiveMatchStore((s) => s.issueTouchlineShout);
  const activeShout = useLiveMatchStore((s) => s.homeTeam?.touchlineShout);
  const [notice, setNotice] = useState(null);

  const handleShout = (key) => {
    const res = issueTouchlineShout(key);
    setNotice({ type: res.success ? 'success' : 'error', text: res.message });
  };

  return (
    <section className="space-y-4 rounded-2xl border border-purple-500/40 bg-slate-900/90 p-4 shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-widest text-purple-200">Tactical Panel & Touchline Shouts</h2>
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

      <div className="rounded-xl border border-amber-500/30 bg-slate-950/70 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-amber-300">
          <Megaphone className="h-4 w-4" /> 실시간 터치라인 감독 지시 (5분 쿨타임 · 선수단 사기 및 평점/집중력 상승)
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {Object.values(TOUCHLINE_SHOUTS).map((sh) => {
            const isSelected = activeShout === sh.key;
            return (
              <button
                key={sh.key}
                type="button"
                onClick={() => handleShout(sh.key)}
                className={`rounded-lg border p-2 text-left transition ${
                  isSelected
                    ? 'border-amber-400 bg-amber-500/20 text-white'
                    : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-amber-400/60 hover:bg-slate-800'
                }`}
              >
                <p className="text-xs font-black text-amber-300">{sh.label}</p>
                <p className="mt-0.5 text-[10px] text-slate-400">{sh.desc}</p>
              </button>
            );
          })}
        </div>
        <Notice notice={notice} className="mt-2" />
      </div>

      <TacticsWorkspace source="live" />
    </section>
  );
}