import { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, ArrowUpDown, RefreshCw } from 'lucide-react';
import useSquadStore from '../store/useSquadStore.js';
import Panel from '../components/common/Panel.jsx';
import Notice from '../components/common/Notice.jsx';
import TacticsWorkspace from '../components/domain/squad/TacticsWorkspace.jsx';

const POS_FILTERS = [
  { id: 'ALL', label: '전체' },
  { id: 'FW', label: 'FW (공격수)' },
  { id: 'MF', label: 'MF (미드필더)' },
  { id: 'DF', label: 'DF (수비수)' },
  { id: 'GK', label: 'GK (골키퍼)' },
];

export default function SquadAndTacticsPage() {
  const loaded = useSquadStore((s) => s.loaded);
  const isLoading = useSquadStore((s) => s.isLoading);
  const isSaving = useSquadStore((s) => s.isSaving);
  const dirty = useSquadStore((s) => s.dirty);
  const error = useSquadStore((s) => s.error);
  const starters = useSquadStore((s) => s.starters);
  const bench = useSquadStore((s) => s.bench);
  const reserve = useSquadStore((s) => s.reserve);
  const formation = useSquadStore((s) => s.formation);
  const substitute = useSquadStore((s) => s.substitute);

  const [notice, setNotice] = useState(null);
  const [posFilter, setPosFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('overall'); // 'overall' | 'stamina' | 'shooting' | 'speed'
  const [targetSlotIdx, setTargetSlotIdx] = useState(0);

  useEffect(() => {
    const store = useSquadStore.getState();
    if (!store.dirty) store.loadSquad();
  }, []);

  const handleSave = async () => {
    const result = await useSquadStore.getState().saveSquad();
    setNotice({ type: result.success ? 'success' : 'error', text: result.message });
  };

  // [요구사항 20 & 49 반영] 포지션별 필터링 + 세부 능력치 수치 확인 및 원클릭 선발 교체 리스트
  const sortedPool = useMemo(() => {
    const allCandidates = [
      ...bench.map((p) => ({ ...p, squadGroup: '벤치' })),
      ...reserve.map((p) => ({ ...p, squadGroup: '예비' })),
    ];
    const filtered = allCandidates.filter((p) => (posFilter === 'ALL' ? true : p.mainPosition === posFilter));
    return filtered.sort((a, b) => {
      if (sortBy === 'stamina') return (b.currentStamina ?? b.stamina ?? 100) - (a.currentStamina ?? a.stamina ?? 100);
      if (sortBy === 'shooting') return (b.effectiveStats?.shooting || 0) - (a.effectiveStats?.shooting || 0);
      if (sortBy === 'speed') return (b.effectiveStats?.speed || 0) - (a.effectiveStats?.speed || 0);
      return (b.overall || 0) - (a.overall || 0);
    });
  }, [bench, reserve, posFilter, sortBy]);

  const handleQuickSwap = (candidateId) => {
    const res = substitute(targetSlotIdx, candidateId);
    setNotice({ type: res.success ? 'success' : 'error', text: res.message });
  };

  if (!loaded && isLoading) {
    return (
      <p className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> 스쿼드를 불러오는 중...
      </p>
    );
  }
  if (!loaded) return <Notice notice={{ type: 'error', text: error || '스쿼드를 불러오지 못했습니다.' }} />;

  const averageOvr = starters.length ? Math.round(starters.reduce((s, p) => s + (p.overall || 0), 0) / starters.length) : 0;
  const averageStamina = starters.length
    ? Math.round(starters.reduce((s, p) => s + (p.currentStamina ?? p.stamina ?? 100), 0) / starters.length)
    : 0;

  return (
    <div className="space-y-4" data-testid="squad-page">
      <Panel
        title="스쿼드 · 전술 통합 관리"
        right={
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-400">
              {formation} · 선발 평균 OVR <b className="text-emerald-300">{averageOvr}</b> · 평균 체력{' '}
              <b className="text-sky-300">{averageStamina}%</b>
            </span>
            {dirty && (
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">저장 안 됨</span>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !dirty}
              data-testid="save-lineup"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} 변경사항 저장
            </button>
          </div>
        }
      >
        <Notice notice={notice} className="mb-3" />
        <TacticsWorkspace source="squad" />
      </Panel>

      {/* [요구사항 20 & 49] 포지션별 선수 정렬 및 세부 능력치 수치 비교 빠른 교체 패널 */}
      <Panel
        title="포지션별 보유 선수 정렬 & 수치 비교 빠른 교체"
        right={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-slate-700">
              {POS_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setPosFilter(f.id)}
                  className={`px-2.5 py-1 text-xs font-bold ${
                    posFilter === f.id ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-semibold text-white"
            >
              <option value="overall">정렬: OVR 높은순</option>
              <option value="stamina">정렬: 체력 높은순</option>
              <option value="shooting">정렬: 골 결정력(슈팅) 순</option>
              <option value="speed">정렬: 스피드 순</option>
            </select>
          </div>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-900/90 p-2.5 text-xs">
          <span className="font-bold text-slate-300">교체할 선발 슬롯 선택:</span>
          {starters.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setTargetSlotIdx(idx);
                setPosFilter(s.slotRoleGroup || s.mainPosition);
              }}
              className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                targetSlotIdx === idx
                  ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                  : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              [{s.slotRoleCode}] {s.name} (OVR {s.overall} · 체력 {Math.round(s.currentStamina ?? s.stamina ?? 100)}%)
            </button>
          ))}
        </div>

        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-900 text-[10px] uppercase text-slate-400">
              <tr>
                <th className="p-2 text-left">구분</th>
                <th className="p-2 text-center">포지션</th>
                <th className="p-2 text-left">선수명</th>
                <th className="p-2 text-center">OVR</th>
                <th className="p-2 text-center">체력</th>
                <th className="p-2 text-center">골결정력</th>
                <th className="p-2 text-center">스피드</th>
                <th className="p-2 text-center">패스</th>
                <th className="p-2 text-center">드리블</th>
                <th className="p-2 text-center">수비력</th>
                <th className="p-2 text-center">피지컬</th>
                <th className="p-2 text-right">교체 투입</th>
              </tr>
            </thead>
            <tbody>
              {sortedPool.map((p) => {
                const st = p.effectiveStats || p.baseStats || {};
                const targetStarter = starters[targetSlotIdx];
                return (
                  <tr key={p.id} className="border-t border-slate-800 text-slate-200 hover:bg-slate-800/50">
                    <td className="p-2 text-slate-400">{p.squadGroup}</td>
                    <td className="p-2 text-center font-bold text-blue-300">{p.mainPosition}</td>
                    <td className="p-2 font-bold text-white">{p.name}</td>
                    <td className="p-2 text-center font-black text-emerald-300">{p.overall}</td>
                    <td className="p-2 text-center text-sky-300">{Math.round(p.currentStamina ?? p.stamina ?? 100)}%</td>
                    <td className="p-2 text-center">{Math.round(st.shooting || 70)}</td>
                    <td className="p-2 text-center">{Math.round(st.speed || 70)}</td>
                    <td className="p-2 text-center">{Math.round(st.passing || 70)}</td>
                    <td className="p-2 text-center">{Math.round(st.dribbling || 70)}</td>
                    <td className="p-2 text-center">{Math.round(st.defense || 70)}</td>
                    <td className="p-2 text-center">{Math.round(st.physical || 70)}</td>
                    <td className="p-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleQuickSwap(p.id)}
                        className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-500"
                      >
                        <RefreshCw className="h-3 w-3" /> {targetStarter?.slotRoleCode || '선발'} 교체
                      </button>
                    </td>
                  </tr>
                );
              })}
              {sortedPool.length === 0 && (
                <tr>
                  <td colSpan={12} className="py-6 text-center text-slate-500">
                    해당 포지션의 대기 선수가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}