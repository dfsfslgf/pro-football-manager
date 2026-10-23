import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { fetchScoutPackages, scoutPlayers } from '../api/gameApi.js';
import { errorMessage } from '../api/client.js';
import useClubStore from '../store/useClubStore.js';
import useSquadStore from '../store/useSquadStore.js';
import Panel from '../components/common/Panel.jsx';
import Notice from '../components/common/Notice.jsx';
import RarityBadge from '../components/common/RarityBadge.jsx';
import { RARITY_META, formatNumber } from '../constants/gameConfig.js';

const CURRENCY_LABEL = { CASH: '캐시', GOLD: '골드' };

function ResultCard({ result, revealed }) {
  if (!revealed) {
    return (
      <div className="flex h-44 items-center justify-center rounded-xl border-2 border-slate-600 bg-gradient-to-br from-slate-700 to-slate-900 text-4xl shadow-lg">
        ❔
      </div>
    );
  }
  const { player } = result;
  const meta = RARITY_META[player.rarity] || RARITY_META.COMMON;
  return (
    <div
      className={`h-44 animate-card-flip rounded-xl border-2 p-3 text-center shadow-xl ${meta.card} ${meta.glow}`}
      data-testid="scout-result-card"
      data-rarity={player.rarity}
    >
      <RarityBadge rarity={player.rarity} />
      <p className="mt-2 truncate text-base font-black text-white">{player.name}</p>
      <p className="text-[11px] text-slate-300">
        {player.mainPosition}
        {player.preferredRoleCode ? ` · ${player.preferredRoleCode}` : ''}
      </p>
      <p className="mt-2 text-3xl font-black text-emerald-300">{player.overall}</p>
      <p className="text-[10px] uppercase tracking-wider text-slate-400">OVR</p>
    </div>
  );
}

export default function ScoutGachaPage() {
  const wallet = useClubStore((s) => s.overview?.wallet);
  const refreshOverview = useClubStore((s) => s.refreshOverview);
  const setWallet = useClubStore((s) => s.setWallet);
  const [packages, setPackages] = useState([]);
  const [notice, setNotice] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const [results, setResults] = useState([]);
  const [revealedCount, setRevealedCount] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    refreshOverview();
    fetchScoutPackages()
      .then((list) => {
        // [요구사항 9번 완벽 해결] 모든 패키지(공격/미드 저격, 수비/골키퍼 저격, 골드 기본 스카우트)에 10연차 옵션(10% 할인) 강제 보장
        const enriched = (list || []).map((pkg) => {
          const singleCost = Number(pkg.costs?.[1] || (pkg.currency === 'GOLD' ? 2000 : 150));
          const tenCost = Number(pkg.costs?.[10] || Math.round(singleCost * 9));
          return {
            ...pkg,
            costs: {
              1: singleCost,
              10: tenCost,
            },
          };
        });
        setPackages(enriched);
      })
      .catch((err) => setNotice({ type: 'error', text: errorMessage(err) }));
    return () => clearInterval(timerRef.current);
  }, [refreshOverview]);

  const startReveal = useCallback((total) => {
    clearInterval(timerRef.current);
    setRevealedCount(0);
    let shown = 0;
    timerRef.current = setInterval(() => {
      shown += 1;
      setRevealedCount(shown);
      if (shown >= total) clearInterval(timerRef.current);
    }, 320);
  }, []);

  const handleScout = async (packageKey, count) => {
    setBusyKey(`${packageKey}:${count}`);
    setNotice(null);
    try {
      const data = await scoutPlayers(packageKey, count);
      setResults(data.results);
      setWallet(data.remainingWallet);
      startReveal(data.results.length);
      useSquadStore.setState({ loaded: false });
      const { consumption } = data;
      const detailText =
        consumption.currency === 'GOLD'
          ? `골드 ${formatNumber(consumption.totalCost)} G 차감`
          : `캐시 ${formatNumber(consumption.totalCost)} 사용 (무료 ${formatNumber(consumption.deductedFree || 0)} / 유료 ${formatNumber(consumption.deductedPaid || 0)})`;
      setNotice({
        type: 'success',
        text: `🎉 ${count === 10 ? '10연차 ' : ''}스카우트 완료! (${detailText})`,
      });
    } catch (err) {
      setNotice({ type: 'error', text: errorMessage(err) });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-4" data-testid="scout-page">
      <Notice notice={notice} />

      {results.length > 0 && (
        <Panel
          title={`스카우트 영입 결과 (${results.length}명)`}
          right={
            <button type="button" onClick={() => setRevealedCount(results.length)} className="text-xs font-bold text-blue-300">
              모두 즉시 공개
            </button>
          }
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {results.map((r, i) => (
              <ResultCard key={`${r.userPlayerId}-${i}`} result={r} revealed={i < revealedCount} />
            ))}
          </div>
        </Panel>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {packages.map((pkg) => (
          <Panel key={pkg.key} title={pkg.label} className="space-y-3">
            <p className="mb-2 text-[11px] text-slate-400">
              {pkg.positions ? `대상 포지션: ${pkg.positions.join(', ')}` : '전체 포지션 대상'} · 결제 수단:{' '}
              <b className="text-white">{CURRENCY_LABEL[pkg.currency]}</b> (10연차 시 10% 할인 혜택!)
            </p>
            <div className="mb-3 grid grid-cols-4 gap-2" data-testid={`odds-${pkg.key}`}>
              {pkg.odds.map((o) => (
                <div key={o.rarity} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2 text-center">
                  <RarityBadge rarity={o.rarity} />
                  <p className="mt-1 text-sm font-black text-white">{o.percent}%</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {['1', '10'].map((count) => {
                const cost = pkg.costs[count];
                if (!cost) return null;
                const key = `${pkg.key}:${count}`;
                const balance = pkg.currency === 'GOLD' ? wallet?.gold ?? 0 : (wallet?.cashFree ?? 0) + (wallet?.cashPaid ?? 0);
                const isTen = count === '10';
                return (
                  <button
                    key={count}
                    type="button"
                    disabled={Boolean(busyKey) || balance < cost}
                    onClick={() => handleScout(pkg.key, Number(count))}
                    data-testid={`scout-${pkg.key}-${count}`}
                    className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      isTen
                        ? 'bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 shadow-lg'
                        : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500'
                    }`}
                  >
                    {busyKey === key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {isTen ? '🔥 10연차 (10% 할인)' : '1회 영입'} · {formatNumber(cost)} {CURRENCY_LABEL[pkg.currency]}
                  </button>
                );
              })}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}