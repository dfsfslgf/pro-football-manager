import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, UserCheck } from 'lucide-react';
import useClubStore from '../store/useClubStore.js';
import Panel from '../components/common/Panel.jsx';
import RarityBadge from '../components/common/RarityBadge.jsx';
import StatRadar from '../components/common/StatRadar.jsx';
import { POSITION_LABELS } from '../constants/gameConfig.js';

// [요구사항 8번 해결] 알파벳순(DF-FW-GK-MF) 꼬임을 방지하는 축구 표준 포지션 순서 가중치
const POSITION_ORDER_WEIGHT = { FW: 1, MF: 2, DF: 3, GK: 4 };

const FIELD_COLUMNS = [
  { key: 'goals', label: '득점', get: (p) => p.stats?.goals || 0 },
  { key: 'assists', label: '도움', get: (p) => p.stats?.assists || 0 },
  { key: 'shotsOnTarget', label: '유효슈팅', get: (p) => Math.max(p.stats?.goals || 0, p.stats?.shotsOnTarget || 0) },
];
const GK_COLUMNS = [
  { key: 'cleanSheets', label: '클린시트', get: (p) => p.stats?.cleanSheets || 0 },
  { key: 'goalsConceded', label: '실점', get: (p) => p.stats?.goalsConceded || 0 },
  { key: 'saves', label: '선방', get: (p) => p.stats?.saves || 0 },
];
const BASE_COLUMNS = [
  { key: 'overall', label: 'OVR', get: (p) => p.overall || 0 },
  { key: 'level', label: 'Lv', get: (p) => p.level || 1 },
  { key: 'matchesPlayed', label: '경기', get: (p) => p.stats?.matchesPlayed || 0 },
];
const TAIL_COLUMNS = [
  { key: 'yellowCards', label: '경고', get: (p) => p.stats?.yellowCards || 0 },
  { key: 'redCards', label: '퇴장', get: (p) => p.stats?.redCards || 0 },
  { key: 'avgRating', label: '평균 평점', get: (p) => p.stats?.avgRating || 0 },
];

const FILTERS = [
  { id: 'ALL', label: '전체' },
  { id: 'FW', label: '공격수 (FW)' },
  { id: 'MF', label: '미드필더 (MF)' },
  { id: 'DF', label: '수비수 (DF)' },
  { id: 'GK', label: '골키퍼 (GK)' },
];

const STAT_LABELS_KO = [
  { key: 'shooting', label: '골 결정력 (슈팅)' },
  { key: 'speed', label: '스피드 (가속력)' },
  { key: 'passing', label: '패스 / 시야' },
  { key: 'dribbling', label: '드리블 / 볼컨트롤' },
  { key: 'defense', label: '수비력 / 태클' },
  { key: 'physical', label: '피지컬 / 몸싸움' },
  { key: 'gkReflexes', label: 'GK 반사신경' },
];

function getPlayerAvatarUrl(player) {
  const customUrl = player?.photoUrl || player?.imageUrl || player?.baseStats?.photoUrl;
  if (customUrl) return customUrl;
  const seed = encodeURIComponent(player?.name || `player_${player?.userPlayerId || 1}`);
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}&backgroundColor=1e293b`;
}

export default function PlayerStatsRecordPage() {
  const players = useClubStore((s) => s.players);
  const record = useClubStore((s) => s.record);
  const refreshPlayers = useClubStore((s) => s.refreshPlayers);
  const [filter, setFilter] = useState('ALL');
  const [sort, setSort] = useState({ key: 'position', dir: 'asc' });
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    refreshPlayers();
  }, [refreshPlayers]);

  const specific = filter === 'GK' ? GK_COLUMNS : FIELD_COLUMNS;
  const columns = useMemo(() => [...BASE_COLUMNS, ...specific, ...TAIL_COLUMNS], [specific]);

  const rows = useMemo(() => {
    const filtered = players.filter((p) => (filter === 'ALL' ? true : p.mainPosition === filter));
    const column = columns.find((c) => c.key === sort.key);
    const sorted = [...filtered].sort((a, b) => {
      if (sort.key === 'name') return a.name.localeCompare(b.name, 'ko');
      if (sort.key === 'position') {
        const wA = POSITION_ORDER_WEIGHT[a.mainPosition] || 99;
        const wB = POSITION_ORDER_WEIGHT[b.mainPosition] || 99;
        if (wA !== wB) return wA - wB;
        return (b.overall || 0) - (a.overall || 0);
      }
      return column ? column.get(a) - column.get(b) : 0;
    });
    return sort.dir === 'desc' ? sorted.reverse() : sorted;
  }, [players, filter, sort, columns]);

  const selected = players.find((p) => p.userPlayerId === selectedId) || rows[0] || null;

  const toggleSort = (key) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: key === 'position' ? 'asc' : 'desc' }
    );

  const header = (col) => (
    <th
      key={col.key}
      className="cursor-pointer select-none px-2 py-2 text-center hover:text-white"
      onClick={() => toggleSort(col.key)}
    >
      <span className="inline-flex items-center gap-0.5">
        {col.label}
        {sort.key === col.key && (sort.dir === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
      </span>
    </th>
  );

  return (
    <div className="space-y-4" data-testid="records-page">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel
          title="선수 기록실 (포지션 순서 정렬: FW → MF → DF → GK)"
          className="xl:col-span-2"
          right={
            <div className="flex flex-wrap overflow-hidden rounded-lg border border-slate-700">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setFilter(f.id);
                    setSort({ key: 'overall', dir: 'desc' });
                  }}
                  className={`px-3 py-1 text-xs font-semibold transition ${
                    filter === f.id ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          }
        >
          {record && (
            <p className="mb-3 text-xs text-slate-400">
              구단 통산 {record.matches}경기 · {record.wins}승 {record.draws}무 {record.losses}패 · 득점 {record.goalsFor} / 실점{' '}
              {record.goalsAgainst}
            </p>
          )}
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full text-xs" data-testid="records-table">
              <thead className="sticky top-0 bg-slate-900 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="cursor-pointer px-2 py-2 text-left hover:text-white" onClick={() => toggleSort('name')}>
                    선수
                  </th>
                  <th className="cursor-pointer px-2 py-2 text-center hover:text-white" onClick={() => toggleSort('position')}>
                    <span className="inline-flex items-center gap-0.5">
                      포지션
                      {sort.key === 'position' &&
                        (sort.dir === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                    </span>
                  </th>
                  {columns.map(header)}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr
                    key={p.userPlayerId}
                    onClick={() => setSelectedId(p.userPlayerId)}
                    className={`cursor-pointer border-t border-slate-800 text-slate-300 hover:bg-slate-800/60 ${
                      selected?.userPlayerId === p.userPlayerId ? 'bg-blue-500/15' : ''
                    }`}
                  >
                    <td className="flex items-center gap-2 px-2 py-1.5 font-semibold text-slate-100">
                      <img
                        src={getPlayerAvatarUrl(p)}
                        alt={p.name}
                        className="h-6 w-6 rounded-full border border-slate-600 bg-slate-800 object-cover"
                      />
                      <span>{p.name}</span>
                    </td>
                    <td className="px-2 text-center">
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-200">
                        {p.mainPosition}
                      </span>
                    </td>
                    {columns.map((c) => (
                      <td key={c.key} className="px-2 text-center">
                        {c.key === 'avgRating' ? (p.stats?.matchesPlayed ? c.get(p).toFixed(2) : '-') : c.get(p)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="선수 상세 & 세부 능력치 수치">
          {selected ? (
            <div className="flex flex-col items-center gap-3" data-testid="player-detail">
              <div className="flex items-center gap-3">
                <img
                  src={getPlayerAvatarUrl(selected)}
                  alt={selected.name}
                  className="h-16 w-16 rounded-full border-2 border-blue-400 bg-slate-800 object-cover shadow-lg"
                />
                <div>
                  <RarityBadge rarity={selected.rarity} />
                  <p className="mt-1 text-lg font-black text-white">{selected.name}</p>
                  <p className="text-xs text-slate-400">
                    {POSITION_LABELS[selected.mainPosition]} · {selected.roleCodes?.join(' / ') || selected.mainPosition} · Lv.
                    {selected.level} · <b className="text-emerald-300">OVR {selected.overall}</b>
                  </p>
                </div>
              </div>

              <StatRadar stats={selected.effectiveStats} baseStats={selected.baseStats} />

              <div className="w-full space-y-1.5 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <p className="mb-2 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <UserCheck className="h-3.5 w-3.5 text-blue-400" /> 세부 능력치 수치 (Effective Stats)
                </p>
                {STAT_LABELS_KO.map(({ key, label }) => {
                  const val = Math.round(selected.effectiveStats?.[key] ?? selected.baseStats?.[key] ?? 70);
                  const baseVal = Math.round(selected.baseStats?.[key] ?? val);
                  const diff = val - baseVal;
                  const barColor =
                    val >= 90 ? 'bg-amber-400' : val >= 80 ? 'bg-emerald-500' : val >= 70 ? 'bg-sky-500' : 'bg-slate-500';
                  return (
                    <div key={key} className="space-y-0.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-300">{label}</span>
                        <span className="font-black text-white">
                          {val}
                          {diff > 0 && <span className="ml-1 text-[10px] text-emerald-400">(+{diff})</span>}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                        <div className={`h-full ${barColor}`} style={{ width: `${Math.min(100, val)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">선수를 선택하세요.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}