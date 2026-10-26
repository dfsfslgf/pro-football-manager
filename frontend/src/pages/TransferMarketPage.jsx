import { useEffect, useMemo, useState } from 'react';
import { Loader2, ShoppingCart, Trash2, RefreshCw, CheckSquare, Sparkles } from 'lucide-react';
import { buyListing, fetchMarket, releasePlayer } from '../api/gameApi.js';
import { errorMessage } from '../api/client.js';
import useClubStore from '../store/useClubStore.js';
import useSquadStore from '../store/useSquadStore.js';
import Panel from '../components/common/Panel.jsx';
import Notice from '../components/common/Notice.jsx';
import RarityBadge from '../components/common/RarityBadge.jsx';
import { RARITY_META, formatNumber } from '../constants/gameConfig.js';

// 새로고침 시 추가 공급되는 글로벌 실제 선수 스카우트 풀 (유럽 1·2부 + K리그 + MLS 실명 선수)
const EXTRA_REAL_SCOUT_POOL = [
  { name: '손흥민 (H.M. Son)', mainPosition: 'FW', preferredRoleCode: 'LW', rarity: 'LEGEND', overall: 91, price: 8500 },
  { name: '엘링 홀란드 (E. Haaland)', mainPosition: 'FW', preferredRoleCode: 'ST', rarity: 'LEGEND', overall: 92, price: 9200 },
  { name: '킬리안 음바페 (K. Mbappé)', mainPosition: 'FW', preferredRoleCode: 'ST', rarity: 'LEGEND', overall: 92, price: 9400 },
  { name: '케빈 더 브라위너 (KDB)', mainPosition: 'MF', preferredRoleCode: 'CAM', rarity: 'LEGEND', overall: 91, price: 8800 },
  { name: '주드 벨링엄 (J. Bellingham)', mainPosition: 'MF', preferredRoleCode: 'CAM', rarity: 'EPIC', overall: 90, price: 8200 },
  { name: '김민재 (M.J. Kim)', mainPosition: 'DF', preferredRoleCode: 'CB', rarity: 'EPIC', overall: 88, price: 6900 },
  { name: '이강인 (K.I. Lee)', mainPosition: 'MF', preferredRoleCode: 'CAM', rarity: 'EPIC', overall: 86, price: 5800 },
  { name: '황희찬 (H.C. Hwang)', mainPosition: 'FW', preferredRoleCode: 'ST', rarity: 'RARE', overall: 83, price: 4200 },
  { name: '양민혁 (M.H. Yang)', mainPosition: 'FW', preferredRoleCode: 'RW', rarity: 'RARE', overall: 81, price: 3400 },
  { name: '배준호 (J.H. Bae - 챔피언십)', mainPosition: 'MF', preferredRoleCode: 'LW', rarity: 'RARE', overall: 80, price: 3100 },
  { name: '엄지성 (J.S. Eom - 챔피언십)', mainPosition: 'FW', preferredRoleCode: 'LW', rarity: 'RARE', overall: 79, price: 2800 },
  { name: '백승호 (S.H. Paik - 챔피언십)', mainPosition: 'MF', preferredRoleCode: 'CM', rarity: 'RARE', overall: 80, price: 3000 },
  { name: '조현우 (H.W. Jo - K리그)', mainPosition: 'GK', preferredRoleCode: 'GK', rarity: 'EPIC', overall: 85, price: 4800 },
  { name: '이동경 (D.G. Lee - K리그)', mainPosition: 'MF', preferredRoleCode: 'CAM', rarity: 'RARE', overall: 81, price: 3200 },
  { name: '세징야 (Cesinha - K리그)', mainPosition: 'MF', preferredRoleCode: 'CAM', rarity: 'EPIC', overall: 84, price: 4500 },
  { name: '리오넬 메시 (L. Messi - MLS)', mainPosition: 'FW', preferredRoleCode: 'RW', rarity: 'LEGEND', overall: 90, price: 8400 },
  { name: '루이스 수아레스 (L. Suárez - MLS)', mainPosition: 'FW', preferredRoleCode: 'ST', rarity: 'EPIC', overall: 84, price: 4600 },
  { name: '데얀 쿨루셉스키 (D. Kulusevski)', mainPosition: 'FW', preferredRoleCode: 'RW', rarity: 'EPIC', overall: 85, price: 5100 },
  { name: '페데리코 발베르데 (F. Valverde)', mainPosition: 'MF', preferredRoleCode: 'CM', rarity: 'EPIC', overall: 89, price: 7600 },
  { name: '버질 판 데이크 (V. van Dijk)', mainPosition: 'DF', preferredRoleCode: 'CB', rarity: 'LEGEND', overall: 90, price: 8300 },
];

export default function TransferMarketPage() {
  const players = useClubStore((s) => s.players);
  const gold = useClubStore((s) => s.overview?.wallet?.gold ?? 0);
  const refreshPlayers = useClubStore((s) => s.refreshPlayers);
  const refreshOverview = useClubStore((s) => s.refreshOverview);
  const setWallet = useClubStore((s) => s.setWallet);

  const [market, setMarket] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(null);
  const [posFilter, setPosFilter] = useState('ALL');
  const [selectedListings, setSelectedListings] = useState([]);
  const [selectedReleases, setSelectedReleases] = useState([]);
  const [maxReleaseOvr, setMaxReleaseOvr] = useState(75);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    refreshPlayers();
    refreshOverview();
    fetchMarket()
      .then(setMarket)
      .catch((err) => setNotice({ type: 'error', text: errorMessage(err) }));
  }, [refreshPlayers, refreshOverview]);

  const releasable = useMemo(
    () =>
      players
        .filter((p) => !p.isStarter && p.lineupSlot === null)
        .filter((p) => (posFilter === 'ALL' ? true : p.mainPosition === posFilter))
        .sort((a, b) => a.overall - b.overall),
    [players, posFilter]
  );

  // 오늘의 이적 매물 즉시 새로고침 기능
  const handleRefreshMarket = async () => {
    setBusy('refresh');
    setNotice(null);
    try {
      const baseMarket = await fetchMarket();
      const shuffled = [...EXTRA_REAL_SCOUT_POOL].sort(() => Math.random() - 0.5).slice(0, 4);
      const mergedListings = (baseMarket.listings || []).map((item, idx) => {
        if (item.purchased || idx >= shuffled.length) return item;
        const special = shuffled[idx];
        return {
          ...item,
          name: special.name,
          mainPosition: special.mainPosition,
          preferredRoleCode: special.preferredRoleCode,
          rarity: item.rarity || special.rarity,
        };
      });
      setMarket({ ...baseMarket, listings: mergedListings });
      setSelectedListings([]);
      setRefreshCount((c) => c + 1);
      setNotice({ type: 'success', text: `🔄 스카우트 네트워크를 통해 오늘의 이적 매물을 새로고침했습니다! (갱신 ${refreshCount + 1}회)` });
    } catch (err) {
      setNotice({ type: 'error', text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const handleBuy = async (listing) => {
    setBusy(listing.listingKey);
    setNotice(null);
    try {
      const result = await buyListing(listing.listingKey);
      setWallet(result.remainingWallet);
      setMarket((m) => ({
        ...m,
        listings: m.listings.map((l) => (l.listingKey === listing.listingKey ? { ...l, purchased: true } : l)),
      }));
      await refreshPlayers();
      useSquadStore.setState({ loaded: false });
      setNotice({ type: 'success', text: `${listing.name} 영입 완료! (-${formatNumber(result.price)}G)` });
    } catch (err) {
      setNotice({ type: 'error', text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  // 선택한 매물 일괄 영입 기능
  const handleBulkBuy = async () => {
    if (!market) return;
    const targets = market.listings.filter((l) => !l.purchased && selectedListings.includes(l.listingKey));
    if (targets.length === 0) {
      setNotice({ type: 'error', text: '일괄 영입할 선수를 먼저 선택해주세요.' });
      return;
    }
    const totalCost = targets.reduce((sum, l) => sum + l.price, 0);
    if (gold < totalCost) {
      setNotice({ type: 'error', text: `골드가 부족합니다. (필요: ${formatNumber(totalCost)}G / 보유: ${formatNumber(gold)}G)` });
      return;
    }
    setBusy('bulk-buy');
    let boughtCount = 0;
    try {
      for (const item of targets) {
        const result = await buyListing(item.listingKey);
        setWallet(result.remainingWallet);
        boughtCount++;
      }
      const refreshed = await fetchMarket();
      setMarket(refreshed);
      setSelectedListings([]);
      await refreshPlayers();
      useSquadStore.setState({ loaded: false });
      setNotice({ type: 'success', text: `⚡ 선택한 선수 ${boughtCount}명 일괄 영입 완료! (-${formatNumber(totalCost)}G)` });
    } catch (err) {
      setNotice({ type: 'error', text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const handleRelease = async (player) => {
    if (!window.confirm(`${player.name} 선수를 방출할까요? 되돌릴 수 없습니다.`)) return;
    setBusy(`rel-${player.userPlayerId}`);
    setNotice(null);
    try {
      const result = await releasePlayer(player.userPlayerId);
      setWallet(result.remainingWallet);
      await refreshPlayers();
      useSquadStore.setState({ loaded: false });
      setNotice({ type: 'success', text: `${player.name} 방출 완료 (+${formatNumber(result.refund)}G 환급)` });
    } catch (err) {
      setNotice({ type: 'error', text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  // 선택한 잉여 선수 일괄 방출 기능 (최소 보유 인원 18명 자동 보호)
  const handleBulkRelease = async () => {
    const maxCanRelease = Math.max(0, players.length - 18);
    if (maxCanRelease <= 0) {
      setNotice({ type: 'error', text: '최소 구단 보유 인원(18명) 제한으로 더 이상 방출할 수 없습니다.' });
      return;
    }
    const targets = releasable.filter((p) => selectedReleases.includes(p.userPlayerId)).slice(0, maxCanRelease);
    if (targets.length === 0) {
      setNotice({ type: 'error', text: '일괄 방출할 선수를 체크박스로 선택해주세요.' });
      return;
    }
    if (!window.confirm(`선택한 ${targets.length}명의 선수를 일괄 방출할까요?`)) return;

    setBusy('bulk-release');
    let totalRefund = 0;
    let releasedCount = 0;
    try {
      for (const p of targets) {
        const result = await releasePlayer(p.userPlayerId);
        totalRefund += result.refund || 0;
        setWallet(result.remainingWallet);
        releasedCount++;
      }
      setSelectedReleases([]);
      await refreshPlayers();
      useSquadStore.setState({ loaded: false });
      setNotice({ type: 'success', text: `🗑️ 선수 ${releasedCount}명 일괄 방출 완료! (+${formatNumber(totalRefund)}G 환급)` });
    } catch (err) {
      setNotice({ type: 'error', text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const toggleListingSelect = (key) => {
    setSelectedListings((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const toggleReleaseSelect = (id) => {
    setSelectedReleases((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const selectLowOvrPlayers = () => {
    const ids = releasable.filter((p) => p.overall <= maxReleaseOvr).map((p) => p.userPlayerId);
    setSelectedReleases(ids);
  };

  return (
    <div className="space-y-4" data-testid="market-page">
      <Notice notice={notice} />
      <Panel
        title={`오늘의 이적 매물 ${market ? `(${market.date})` : ''}`}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-amber-300">보유 골드 {formatNumber(gold)} G</span>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={handleRefreshMarket}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-100 hover:bg-slate-700 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy === 'refresh' ? 'animate-spin' : ''}`} /> 매물 새로고침
            </button>
            <button
              type="button"
              disabled={Boolean(busy) || selectedListings.length === 0}
              onClick={handleBulkBuy}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              <Sparkles className="h-3.5 w-3.5" /> 선택 일괄 영입 ({selectedListings.length}명)
            </button>
          </div>
        }
      >
        {!market ? (
          <p className="py-6 text-center text-sm text-slate-500">매물을 불러오는 중...</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {market.listings.map((l) => {
              const meta = RARITY_META[l.rarity] || RARITY_META.COMMON;
              const isChecked = selectedListings.includes(l.listingKey);
              return (
                <li
                  key={l.listingKey}
                  className={`rounded-xl border-2 p-3 transition ${meta.card} ${isChecked ? 'ring-2 ring-emerald-400' : ''}`}
                  data-testid="market-listing"
                >
                  <div className="flex items-center justify-between">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        disabled={l.purchased}
                        checked={isChecked}
                        onChange={() => toggleListingSelect(l.listingKey)}
                        className="h-3.5 w-3.5 rounded accent-emerald-500"
                      />
                      <RarityBadge rarity={l.rarity} />
                    </label>
                    <span className="text-xl font-black text-emerald-300">OVR {l.overall}</span>
                  </div>
                  <p className="mt-2 truncate text-sm font-black text-white">{l.name}</p>
                  <p className="text-[11px] text-slate-400">
                    {l.mainPosition} {l.preferredRoleCode ? `· ${l.preferredRoleCode}` : ''}
                  </p>
                  <button
                    type="button"
                    disabled={l.purchased || Boolean(busy) || gold < l.price}
                    onClick={() => handleBuy(l)}
                    data-testid={`buy-${l.listingKey}`}
                    className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy === l.listingKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShoppingCart className="h-3.5 w-3.5" />}
                    {l.purchased ? '영입 완료' : `${formatNumber(l.price)} G 영입`}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel
        title={`잉여 선수 관리 및 일괄 방출 (${releasable.length}명)`}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={posFilter}
              onChange={(e) => setPosFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-white"
            >
              <option value="ALL">전체 포지션</option>
              <option value="FW">FW (공격수)</option>
              <option value="MF">MF (미드필더)</option>
              <option value="DF">DF (수비수)</option>
              <option value="GK">GK (골키퍼)</option>
            </select>
            <div className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs">
              <span className="text-slate-400">OVR</span>
              <input
                type="number"
                min={50}
                max={95}
                value={maxReleaseOvr}
                onChange={(e) => setMaxReleaseOvr(Number(e.target.value))}
                className="w-12 rounded bg-slate-800 px-1 text-center font-bold text-white"
              />
              <button
                type="button"
                onClick={selectLowOvrPlayers}
                className="inline-flex items-center gap-1 rounded bg-slate-700 px-2 py-0.5 text-[11px] font-bold text-slate-200 hover:bg-slate-600"
              >
                <CheckSquare className="h-3 w-3" /> 이하 일괄선택
              </button>
            </div>
            <button
              type="button"
              disabled={Boolean(busy) || selectedReleases.length === 0}
              onClick={handleBulkRelease}
              className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" /> 선택 일괄 방출 ({selectedReleases.length}명)
            </button>
          </div>
        }
      >
        <p className="mb-3 text-xs text-slate-400">
          선발/벤치 명단에 없는 예비 선수만 방출할 수 있으며, 최소 18명은 보유해야 합니다. 조건(OVR 이하) 선택으로 한 번에 방출할 수 있습니다.
        </p>
        {releasable.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-500">방출 가능한 예비 선수가 없습니다.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {releasable.map((p) => {
              const checked = selectedReleases.includes(p.userPlayerId);
              return (
                <li
                  key={p.userPlayerId}
                  className={`flex items-center gap-2 rounded-lg border p-2 text-xs transition ${
                    checked ? 'border-rose-500 bg-rose-950/30' : 'border-slate-800 bg-slate-950/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleReleaseSelect(p.userPlayerId)}
                    className="h-3.5 w-3.5 rounded accent-rose-500"
                  />
                  <span className="w-8 rounded bg-slate-700 py-0.5 text-center font-bold text-slate-200">{p.mainPosition}</span>
                  <span className="flex-1 truncate font-semibold text-slate-100">{p.name}</span>
                  <span className="text-slate-400">Lv.{p.level}</span>
                  <span className="font-black text-emerald-300">OVR {p.overall}</span>
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => handleRelease(p)}
                    data-testid={`release-${p.userPlayerId}`}
                    className="rounded-md bg-rose-600/80 p-1.5 text-white hover:bg-rose-500 disabled:opacity-40"
                    title="개별 방출"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}