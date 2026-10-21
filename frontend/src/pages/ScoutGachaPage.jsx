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

/**
 * 스카우트 결과 카드 한 장. 뒷면에서 앞면으로 뒤집히는 오픈 애니메이션을 재생합니다.
 * @param {Object} props
 * @param {Object|null} props.result 서버 결과 { userPlayerId, player }
 * @param {boolean} props.revealed 앞면 공개 여부
 * @returns {JSX.Element}
 */
function ResultCard({ result, revealed }) {
  if (!revealed) {
    return (
      <div className="flex h-44 items-center justify-center rounded-xl border-2 border-slate-600 bg-gradient-to-br from-slate-700 to-slate-900 text-4xl shadow-lg">❔</div>
    );
  }
  const { player } = result;
  const meta = RARITY_META[player.rarity] || RARITY_META.COMMON;
  return (
    <div className={`h-44 animate-card-flip rounded-xl border-2 p-3 text-center shadow-xl ${meta.card} ${meta.glow}`} data-testid="scout-result-card" data-rarity={player.rarity}>
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

/**
 * 스카우트(가챠) 화면: 4종 패키지의 비용과 희귀도 확률(%)을 보여주고, 1회/10연차 뽑기 결과를 카드 뒤집기 애니메이션으로 공개합니다.
 * 캐시는 무료 캐시를 먼저, 부족분은 유료 캐시에서 차감됩니다. (서버가 정산)
 * @returns {JSX.Element}
 */
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
      .then(setPackages)
      .catch((err) => setNotice({ type: 'error', text: errorMessage(err) }));
    return () => clearInterval(timerRef.current);
  }, [refreshOverview]);

  /**
   * 결과 카드를 0.45초 간격으로 한 장씩 공개합니다.
   * @param {number} total 공개할 카드 수
   * @returns {void}
   */
  const startReveal = useCallback((total) => {
    clearInterval(timerRef.current);
    setRevealedCount(0);
    let shown = 0;
    timerRef.current = setInterval(() => {
      shown += 1;
      setRevealedCount(shown);
      if (shown >= total) clearInterval(timerRef.current);
    }, 450);
  }, []);

  /**
   * 스카우트를 실행합니다.
   * @param {string} packageKey
   * @param {number} count 1 또는 10
   * @returns {Promise<void>}
   */
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
      setNotice({
        type: 'success',
        text: `스카우트 완료! ${CURRENCY_LABEL[consumption.currency]} ${formatNumber(consumption.totalCost)} 사용 (무료 ${formatNumber(consumption.deductedFree)} / 유료 ${formatNumber(consumption.deductedPaid)})`,
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
        <Panel title="스카우트 결과" right={<button type="button" onClick={() => setRevealedCount(results.length)} className="text-xs font-bold text-blue-300">모두 공개</button>}>
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
              {pkg.positions ? `대상 포지션: ${pkg.positions.join(', ')}` : '전체 포지션 대상'} · 결제 수단: {CURRENCY_LABEL[pkg.currency]}
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
              {Object.entries(pkg.costs).map(([count, cost]) => {
                const key = `${pkg.key}:${count}`;
                const balance = pkg.currency === 'GOLD' ? wallet?.gold ?? 0 : (wallet?.cashFree ?? 0) + (wallet?.cashPaid ?? 0);
                return (
                  <button
                    key={count}
                    type="button"
                    disabled={Boolean(busyKey) || balance < cost}
                    onClick={() => handleScout(pkg.key, Number(count))}
                    data-testid={`scout-${pkg.key}-${count}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-2 text-sm font-bold text-white hover:from-purple-500 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busyKey === key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {count === '1' ? '1회' : `${count}연차`} · {formatNumber(cost)} {CURRENCY_LABEL[pkg.currency]}
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
