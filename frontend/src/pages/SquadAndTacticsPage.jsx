import { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, RefreshCw, RotateCcw, Sparkles, Users } from 'lucide-react';
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

const POSITION_SORT_ORDER = { FW: 1, MF: 2, DF: 3, GK: 4 };

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
  const autoFillBench = useSquadStore((s) => s.autoFillBench);
  const autoFillAll = useSquadStore((s) => s.autoFillAll);

  const [notice, setNotice] = useState(null);
  const [posFilter, setPosFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('position');
  const [targetSlotIdx, setTargetSlotIdx] = useState(0);

  useEffect(() => {
    const store = useSquadStore.getState();
    if (!store.loaded || store.starters.length === 0) {
      store.loadSquad(false);
    }
  }, []);

  const handleSave = async () => {
    const result = await useSquadStore.getState().saveSquad();
    setNotice({ type: result.success ? 'success' : 'error', text: result.message });
  };

  const handleResetChanges = async () => {
    await useSquadStore.getState().loadSquad(true);
    setNotice({ type: 'success', text: '🔄 서버에 마지막으로 저장된 라인업과 후보를 다시 불러왔습니다.' });
  };

  // [요구사항 7번 해결] 후보 11명 자동완성 후 즉시 서버에도 자동 저장!
  const handleAutoBench = async () => {
    const res = autoFillBench();
    await useSquadStore.getState().saveSquad();
    setNotice({ type: 'success', text: `${res.message} (자동 저장 완료)` });
  };

  // [요구사항 7번 해결] 선발 11명 + 후보 11명 전체 자동완성 후 즉시 서버에 자동 저장!
  const handleAutoAll = async () => {
    const res = autoFillAll();
    await useSquadStore.getState().saveSquad();
    setNotice({ type: 'success', text: `${res.message} (자동 저장 완료)` });
  };

  const sortedPool = useMemo(() => {
    const allCandidates = [
      ...bench.map((p) => ({ ...p, squadGroup: '벤치' })),
      ...reserve.map((p) => ({ ...p, squadGroup: '예비' })),
    ];
    const filtered = allCandidates.filter((p) => (posFilter === 'ALL' ? true : p.mainPosition === posFilter));
    return filtered.sort((a, b) => {
      if (sortBy === 'position') {
        const wA = POSITION_SORT_ORDER[a.mainPosition] || 99;
        const wB = POSITION_SORT_ORDER[b.mainPosition] || 99;
        if (wA !== wB) return wA - wB;
        return (b.overall || 0) - (a.overall || 0);
      }
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

  if (isLoading && starters.length === 0) {
    return (
      <p className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> 스쿼드를 불러오는 중...
      </p>
    );
  }

  if (!loaded && starters.length === 0) {
    return (
      <div className="space-y-3 py-10 text-center">
        <Notice notice={{ type: 'error', text: error || '스쿼드를 불러오지 못했습니다.' }} />
        <button
          type="button"
          onClick={() => useSquadStore.getState().loadSquad(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500"
        >
          <RefreshCw className="h-4 w-4" /> 스쿼드 다시 불러오기
        </button>
      </div>
    );
  }

  const averageOvr = starters.length ? Math.round(starters.reduce((s, p) => s + (p.overall || 0), 0) / starters.length) : 0;
  const averageStamina = starters.length
    ? Math.round(starters.reduce((s, p) => s + (p.currentStamina ?? p.stamina ?? 100), 0) / starters.length)
    : 0;

  return (
    <div className="space-y-4" data-testid="squad-page">
      <Panel
        title="스쿼드 · 전술 통합 관리"
        right={
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-slate-400">
              {formation} · 선발 평균 OVR <b className="text-emerald-300">{averageOvr}</b> · 평균 체력{' '}
              <b className="text-sky-300">{averageStamina}%</b>
            </span>
            <button
              type="button"
              onClick={handleAutoBench}
              className="inline-flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-500"
              title="GK 1, 풀백 2, 센터백 2, 윙어 2, 중미 2, 공격수 2 최고 OVR로 후보 11명 자동 선발"
            >
              <Users className="h-3.5 w-3.5" /> 후보 11명 자동완성
            </button>
            <button
              type="button"
              onClick={handleAutoAll}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500"
              title="선발 11명 + 후보 11명(총 22명)을 한 번에 최고 OVR로 자동 구성"
            >
              <Sparkles className="h-3.5 w-3.5" /> 선발+후보 전체 자동완성
            </button>
            {dirty && (
              <>
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">미저장 변경 있음</span>
                <button
                  type="button"
                  onClick={handleResetChanges}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> 되돌리기
                </button>
              </>
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

      <Panel
        title="포지션별 후보 정렬 & 원클릭 빠른 교체 (FW → MF → DF → GK)"
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
              <option value="position">정렬: 포지션 순 (FW→MF→DF→GK)</option>
              <option value="overall">정렬: OVR 높은순</option>
              <option value="stamina">정렬: 체력 높은순</option>
              <option value="shooting">정렬: 골 결정력 순</option>
              <option value="speed">정렬: 스피드 순</option>
            </select>
          </div>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-900/90 p-2.5 text-xs">
          <span className="font-bold text-amber-300">1단계 · 교체할 선발 슬롯 선택:</span>
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
                  ? 'border-amber-400 bg-amber-500/20 text-amber-200 ring-2 ring-amber-400/50'
                  : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              [{s.slotRoleCode}] {s.name} (OVR {s.overall} · {Math.round(s.currentStamina ?? s.stamina ?? 100)}%)
            </button>
          ))}
        </div>

        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-900 text-[10px] uppercase text-slate-400">
              <tr>
                <th className="p-2 text-left">구분</th>
                <th className="p-2 text-center">주/세부포지션</th>
                <th className="p-2 text-left">선수명</th>
                <th className="p-2 text-center">OVR</th>
                <th className="p-2 text-center">체력</th>
                <th className="p-2 text-center">골결정력</th>
                <th className="p-2 text-center">스피드</th>
                <th className="p-2 text-center">패스</th>
                <th className="p-2 text-center">드리블</th>
                <th className="p-2 text-center">수비력</th>
                <th className="p-2 text-right">2단계 · 원클릭 교체</th>
              </tr>
            </thead>
            <tbody>
              {sortedPool.map((p) => {
                const st = p.effectiveStats || p.baseStats || {};
                const targetStarter = starters[targetSlotIdx];
                return (
                  <tr key={p.id} className="border-t border-slate-800 text-slate-200 hover:bg-slate-800/50">
                    <td className="p-2 text-slate-400">{p.squadGroup}</td>
                    <td className="p-2 text-center font-bold text-blue-300">
                      {p.mainPosition} ({p.roleCodes?.join('/') || p.preferredRoleCode || p.mainPosition})
                    </td>
                    <td className="p-2 font-bold text-white">{p.name}</td>
                    <td className="p-2 text-center font-black text-emerald-300">{p.overall}</td>
                    <td className="p-2 text-center text-sky-300">{Math.round(p.currentStamina ?? p.stamina ?? 100)}%</td>
                    <td className="p-2 text-center">{Math.round(st.shooting || 70)}</td>
                    <td className="p-2 text-center">{Math.round(st.speed || 70)}</td>
                    <td className="p-2 text-center">{Math.round(st.passing || 70)}</td>
                    <td className="p-2 text-center">{Math.round(st.dribbling || 70)}</td>
                    <td className="p-2 text-center">{Math.round(st.defense || 70)}</td>
                    <td className="p-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleQuickSwap(p.id)}
                        className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-500"
                      >
                        <RefreshCw className="h-3 w-3" /> [{targetStarter?.slotRoleCode}] {targetStarter?.name}와 교체
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}