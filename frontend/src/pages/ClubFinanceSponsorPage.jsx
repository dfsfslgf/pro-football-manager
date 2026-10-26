import { useEffect, useState } from 'react';
import { Gift, Loader2, Building2, Sliders } from 'lucide-react';
import { claimQuest, fetchFinance, selectSponsor } from '../api/gameApi.js';
import { errorMessage } from '../api/client.js';
import useAuthStore from '../store/useAuthStore.js';
import useClubStore from '../store/useClubStore.js';
import Panel from '../components/common/Panel.jsx';
import Notice from '../components/common/Notice.jsx';
import { formatNumber } from '../constants/gameConfig.js';

const SPONSOR_TIER_MAP = {
  BASIC: { tier: 'Tier 1 · 로컬 스폰서', desc: '연고지 소상공인 연합 후원 (조건 없음)' },
  REGIONAL: { tier: 'Tier 2 · 지역 기업', desc: '수도권 중견 물류·유통 그룹 파트너십' },
  FINTECH: { tier: 'Tier 3 · 디지털 금융', desc: '네오 핀테크 인터넷 뱅킹 공식 파트너' },
  GLOBAL: { tier: 'Tier 4 · 글로벌 브랜드', desc: '월드와이드 스포츠 용품 & 스트리밍 빅딜' },
  AIRLINES: { tier: 'Tier 5 · 메가 항공사', desc: '대륙간 국제 항공사 유니폼 전면 스폰서' },
  MEGA_TECH: { tier: 'Tier 6 · 글로벌 AI 빅테크', desc: '실리콘밸리 빅테크 최상위 메가 파트너십' },
};

const EXTRA_SPONSOR_PLANS = [
  {
    id: 'STABLE_BASE',
    label: '🛡️ 안정형 기본급 집중 플랜',
    desc: '패배나 무승부 시에도 안정적인 구단 운영 자금을 확보합니다 (기본 수당 비중 극대화)',
    feeMul: 1.25,
    winMul: 0.75,
  },
  {
    id: 'BALANCED_STD',
    label: '⚖️ 표준 밸런스 플랜',
    desc: '경기 출전 수당과 승리 인센티브를 균형 있게 배분받는 표준 계약입니다',
    feeMul: 1.0,
    winMul: 1.0,
  },
  {
    id: 'HIGH_RISK_WIN',
    label: '🔥 승리 올인 인센티브 플랜',
    desc: '기본 출전료는 낮추는 대신 승리 시 막대한 승리 보너스를 수령합니다 (강팀 추천)',
    feeMul: 0.7,
    winMul: 1.55,
  },
];

function formatReward(reward) {
  const parts = [];
  if (reward.gold) parts.push(`${formatNumber(reward.gold)}G`);
  if (reward.cashFree) parts.push(`캐시 ${formatNumber(reward.cashFree)}`);
  return parts.join(' + ');
}

function QuestRow({ quest, busy, onClaim }) {
  const done = quest.progress >= quest.target;
  const pct = Math.min(100, Math.round((quest.progress / quest.target) * 100));
  return (
    <li className="rounded-lg border border-slate-800 bg-slate-950/50 p-3" data-testid={`quest-${quest.key}`}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-slate-100">{quest.label}</span>
        <span className="text-amber-300">{formatReward(quest.reward)}</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-700">
          <div className={`h-full ${done ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="w-16 text-right text-[10px] text-slate-400">
          {Math.min(quest.progress, quest.target)}/{quest.target}
        </span>
        <button
          type="button"
          disabled={!done || quest.claimed || busy}
          onClick={onClaim}
          data-testid={`claim-${quest.key}`}
          className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Gift className="h-3 w-3" />}
          {quest.claimed ? '수령 완료' : '수령'}
        </button>
      </div>
    </li>
  );
}

export default function ClubFinanceSponsorPage() {
  const overview = useClubStore((s) => s.overview);
  const refreshOverview = useClubStore((s) => s.refreshOverview);
  const setWallet = useClubStore((s) => s.setWallet);
  const patchClub = useAuthStore((s) => s.patchClub);
  const [finance, setFinance] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(null);
  const [contractPlan, setContractPlan] = useState('BALANCED_STD');

  useEffect(() => {
    refreshOverview();
    fetchFinance()
      .then(setFinance)
      .catch((err) => setNotice({ type: 'error', text: errorMessage(err) }));
  }, [refreshOverview]);

  const activePlan = EXTRA_SPONSOR_PLANS.find((p) => p.id === contractPlan) || EXTRA_SPONSOR_PLANS[1];

  const handleSponsor = async (sponsorKey) => {
    setBusy(`sp-${sponsorKey}`);
    try {
      await selectSponsor(sponsorKey);
      patchClub({ sponsorKey });
      setFinance(await fetchFinance());
      await refreshOverview();
      setNotice({ type: 'success', text: `🤝 후원사 및 [${activePlan.label}] 조건 계약을 체결했습니다.` });
    } catch (err) {
      setNotice({ type: 'error', text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const handleClaim = async (quest) => {
    setBusy(`q-${quest.key}`);
    try {
      const result = await claimQuest(quest.key);
      setWallet(result.remainingWallet);
      setFinance(await fetchFinance());
      setNotice({ type: 'success', text: `🎁 보상 수령: ${formatReward(result.reward)}` });
    } catch (err) {
      setNotice({ type: 'error', text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const wins = overview?.record?.wins ?? 0;
  const daily = finance?.quests.filter((q) => q.type === 'DAILY') || [];
  const achievements = finance?.quests.filter((q) => q.type !== 'DAILY') || [];

  return (
    <div className="space-y-4" data-testid="finance-page">
      <Notice notice={notice} />

      <Panel
        title="후원사 포트폴리오"
        right={<span className="text-xs font-bold text-emerald-300">구단 통산 {wins}승 달성</span>}
      >
        <div className="mb-4 rounded-xl border border-slate-800 bg-slate-900/80 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-slate-200">
            <Sliders className="h-3.5 w-3.5 text-amber-400" /> 후원금 지급 구조(인센티브 조건) 조정
          </p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {EXTRA_SPONSOR_PLANS.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => setContractPlan(plan.id)}
                className={`rounded-lg border p-2.5 text-left transition ${
                  contractPlan === plan.id
                    ? 'border-amber-400 bg-amber-500/15 text-white'
                    : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <p className="text-xs font-black">{plan.label}</p>
                <p className="mt-1 text-[11px] leading-snug text-slate-400">{plan.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {!finance ? (
          <p className="py-4 text-center text-sm text-slate-500">불러오는 중...</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {finance.sponsors.map((s, idx) => {
              const tierInfo = SPONSOR_TIER_MAP[s.key] || {
                tier: s.tier || `Tier ${idx + 1} · 공식 파트너`,
                desc: s.desc || '구단 공식 스폰서십 계약',
              };
              const adjFee = Math.round(s.matchFee * activePlan.feeMul);
              const adjWin = Math.round(s.winBonus * activePlan.winMul);
              return (
                <li
                  key={s.key}
                  className={`rounded-xl border-2 p-4 transition ${
                    s.selected ? 'border-emerald-400 bg-emerald-500/10' : 'border-slate-800 bg-slate-950/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-sky-300">
                      {tierInfo.tier}
                    </span>
                    <Building2 className="h-4 w-4 text-slate-400" />
                  </div>
                  <p className="mt-2 text-base font-black text-white">{s.label}</p>
                  <p className="text-[11px] text-slate-400">{tierInfo.desc}</p>

                  <div className="mt-3 space-y-1 rounded-lg bg-slate-900/90 p-2.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">경기당 기본 후원금</span>
                      <b className="text-amber-300">{formatNumber(adjFee)} G</b>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">승리 달성 보너스</span>
                      <b className="text-emerald-300">+{formatNumber(adjWin)} G</b>
                    </div>
                    <div className="flex justify-between border-t border-slate-800 pt-1">
                      <span className="font-bold text-slate-200">승리 시 총 수령액</span>
                      <b className="text-white">{formatNumber(adjFee + adjWin)} G</b>
                    </div>
                  </div>

                  <p className="mt-2 text-[11px] text-slate-500">
                    {s.requirement.wins > 0
                      ? `계약 조건: 통산 ${s.requirement.wins}승 이상 (현재 ${Math.min(wins, s.requirement.wins)}/${s.requirement.wins}승)`
                      : '계약 조건: 제한 없음 (즉시 계약 가능)'}
                  </p>
                  <button
                    type="button"
                    disabled={!s.unlocked || s.selected || Boolean(busy)}
                    onClick={() => handleSponsor(s.key)}
                    data-testid={`sponsor-${s.key}`}
                    className="mt-3 w-full rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                  >
                    {s.selected ? '✓ 현재 계약 중' : s.unlocked ? '이 조건으로 계약 체결' : '🔒 승리 조건 미달'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="일일 퀘스트">
          <ul className="space-y-2">
            {daily.map((q) => (
              <QuestRow key={q.key} quest={q} busy={busy === `q-${q.key}`} onClaim={() => handleClaim(q)} />
            ))}
          </ul>
        </Panel>
        <Panel title="단계별 구단 업적">
          <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {achievements.map((q) => (
              <QuestRow key={q.key} quest={q} busy={busy === `q-${q.key}`} onClaim={() => handleClaim(q)} />
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}