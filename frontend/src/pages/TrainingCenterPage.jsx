import { useEffect, useMemo, useState } from 'react';
import { Dumbbell, HeartPulse, Loader2, Target } from 'lucide-react';
import { levelUpPlayer, recoverStamina, trainPosition } from '../api/gameApi.js';
import { errorMessage } from '../api/client.js';
import useClubStore from '../store/useClubStore.js';
import useSquadStore from '../store/useSquadStore.js';
import Panel from '../components/common/Panel.jsx';
import Notice from '../components/common/Notice.jsx';
import RarityBadge from '../components/common/RarityBadge.jsx';
import StaminaBar from '../components/common/StaminaBar.jsx';
import { ROLE_OPTIONS, TRAINING_RULES, formatNumber } from '../constants/gameConfig.js';

export default function TrainingCenterPage() {
  const players = useClubStore((s) => s.players);
  const gold = useClubStore((s) => s.overview?.wallet?.gold ?? 0);
  const refreshPlayers = useClubStore((s) => s.refreshPlayers);
  const refreshOverview = useClubStore((s) => s.refreshOverview);
  const setWallet = useClubStore((s) => s.setWallet);
  const [selectedId, setSelectedId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    refreshPlayers();
    refreshOverview();
  }, [refreshPlayers, refreshOverview]);

  const sorted = useMemo(() => [...players].sort((a, b) => b.overall - a.overall), [players]);
  const selected = players.find((p) => p.userPlayerId === selectedId) || sorted[0] || null;
  const tiredPlayers = players.filter((p) => p.stamina < 100);
  const missingAll = tiredPlayers.reduce((sum, p) => sum + (100 - p.stamina), 0);
  const allCost = Math.ceil(missingAll * TRAINING_RULES.MEDICAL_COST_PER_POINT * TRAINING_RULES.ALL_DISCOUNT);

  const run = async (key, action, describe) => {
    setBusy(key);
    setNotice(null);
    try {
      const result = await action();
      setWallet(result.remainingWallet);
      await refreshPlayers();
      // [요구사항 2번 해결] loaded: false 로 날리지 않고 백업된 후보를 보존하며 최신 능력치만 동기화!
      if (useSquadStore.getState().loaded) {
        await useSquadStore.getState().loadSquad(true);
      }
      setNotice(describe(result));
    } catch (err) {
      setNotice({ type: 'error', text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const levelUp = (p) =>
    run(
      `level-${p.userPlayerId}`,
      () => levelUpPlayer(p.userPlayerId),
      (r) =>
        r.success
          ? { type: 'success', text: `🎉 레벨업 성공! ${p.name} Lv.${r.level} (OVR ${r.overall}) · ${formatNumber(r.cost)}G 사용` }
          : {
              type: 'info',
              text: `레벨업 실패... 보너스 게이지가 ${r.gauge}% 로 올랐습니다. (성공 확률 ${Math.round(r.rate * 100)}%, ${formatNumber(r.cost)}G 사용)`,
            }
    );

  const learnRole = (p, roleCode) =>
    run(
      `role-${p.userPlayerId}-${roleCode}`,
      () => trainPosition(p.userPlayerId, roleCode),
      (r) => ({
        type: 'success',
        text: `🎯 ${p.name} 선수가 [${r.learnedRoleCode || roleCode}] 포지션을 추가로 습득했습니다! (보유 포지션: ${(r.roleCodes || []).join(' / ')})`,
      })
    );

  const recover = (p) =>
    run(
      p ? `rec-${p.userPlayerId}` : 'rec-all',
      () => recoverStamina(p ? p.userPlayerId : null),
      (r) => ({ type: 'success', text: `체력 회복 완료: ${r.recovered}명 (${formatNumber(r.cost)}G)` })
    );

  const rate = selected ? TRAINING_RULES.successRate(selected.level, selected.bonusGauge) : 0;
  const cost = selected ? TRAINING_RULES.levelUpCost(selected.level) : 0;
  const roleOptions = selected ? ROLE_OPTIONS[selected.mainPosition] || [] : [];
  const missing = selected ? 100 - selected.stamina : 0;

  return (
    <div className="space-y-4" data-testid="training-page">
      <Notice notice={notice} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="선수 목록" className="xl:col-span-1">
          <ul className="max-h-[620px] space-y-1.5 overflow-y-auto pr-1">
            {sorted.map((p) => (
              <li key={p.userPlayerId}>
                <button
                  type="button"
                  onClick={() => setSelectedId(p.userPlayerId)}
                  data-testid={`train-player-${p.userPlayerId}`}
                  className={`w-full rounded-lg border p-2 text-left transition ${
                    selected?.userPlayerId === p.userPlayerId
                      ? 'border-blue-400 bg-blue-500/10'
                      : 'border-slate-800 bg-slate-950/50 hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span className="w-8 rounded bg-slate-700 py-0.5 text-center font-bold text-slate-200">{p.mainPosition}</span>
                    <span className="flex-1 truncate font-semibold text-slate-100">{p.name}</span>
                    <span className="text-[10px] text-sky-300">{(p.roleCodes || []).join('/')}</span>
                    <span className="text-slate-400">Lv.{p.level}</span>
                    <span className="font-black text-emerald-300">{p.overall}</span>
                  </div>
                  <StaminaBar value={p.stamina} showLabel className="mt-1" />
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="space-y-4 xl:col-span-2">
          {selected && (
            <>
              <Panel title={`${selected.name} · 레벨업 특훈`} right={<RarityBadge rarity={selected.rarity} />}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2 text-sm text-slate-300">
                    <p>
                      현재 <b className="text-white">Lv.{selected.level}</b> / {TRAINING_RULES.MAX_LEVEL} · OVR{' '}
                      <b className="text-emerald-300">{selected.overall}</b>
                    </p>
                    <p className="text-xs text-slate-400">성공 시 모든 기본 능력치가 영구적으로 +2% 상승합니다.</p>
                    <div>
                      <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                        <span>보너스 게이지 (실패 시 +{TRAINING_RULES.FAIL_GAUGE}%)</span>
                        <span data-testid="bonus-gauge">{selected.bonusGauge}%</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-slate-700">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-amber-400 transition-all"
                          style={{ width: `${selected.bonusGauge}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[10px] text-slate-500">게이지가 100% 가 되면 다음 특훈은 확정 성공합니다.</p>
                    </div>
                  </div>
                  <div className="flex flex-col justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                    <p className="text-xs text-slate-400">
                      성공 확률 <b className="text-lg text-white">{Math.round(rate * 100)}%</b>
                    </p>
                    <p className="text-xs text-slate-400">
                      비용 <b className="text-amber-300">{formatNumber(cost)} G</b>
                    </p>
                    <button
                      type="button"
                      disabled={Boolean(busy) || selected.level >= TRAINING_RULES.MAX_LEVEL || gold < cost}
                      onClick={() => levelUp(selected)}
                      data-testid="level-up-button"
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {busy === `level-${selected.userPlayerId}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Dumbbell className="h-4 w-4" />
                      )}
                      {selected.level >= TRAINING_RULES.MAX_LEVEL ? '최대 레벨' : '레벨업 특훈'}
                    </button>
                  </div>
                </div>
              </Panel>

              <Panel title="멀티 포지션 숙련도 훈련 (다중 습득 가능)">
                {roleOptions.length === 0 ? (
                  <p className="text-xs text-slate-500">골키퍼는 포지션 훈련을 할 수 없습니다.</p>
                ) : (
                  <>
                    <p className="mb-2 text-xs text-slate-400">
                      원하는 만큼 여러 세부 포지션을 계속 습득하여 멀티 플레이어로 육성할 수 있습니다! (습득한 모든 포지션에서 적합도 100% 발휘)
                      <br />
                      현재 보유 포지션: <b className="text-emerald-300">{(selected.roleCodes || []).join(' / ') || '-'}</b> · 포지션당 훈련 비용{' '}
                      <b className="text-amber-300">{formatNumber(TRAINING_RULES.POSITION_TRAIN_COST)} G</b>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {roleOptions.map((role) => {
                        const known = (selected.roleCodes || []).includes(role);
                        return (
                          <button
                            key={role}
                            type="button"
                            disabled={known || Boolean(busy) || gold < TRAINING_RULES.POSITION_TRAIN_COST}
                            onClick={() => learnRole(selected, role)}
                            data-testid={`learn-${role}`}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                              known
                                ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-300'
                                : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40'
                            }`}
                          >
                            <Target className="h-3.5 w-3.5" /> {role} {known ? '✓ 습득 완료' : '+ 추가 습득'}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </Panel>

              <Panel title="스포츠 과학 의무실">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex-1 text-xs text-slate-400">
                    <p>
                      {selected.name} 체력 <b className="text-white">{Math.round(selected.stamina)}%</b> · 1% 당{' '}
                      {TRAINING_RULES.MEDICAL_COST_PER_POINT}G
                    </p>
                    <p>
                      전체 선수단: 회복 필요 {tiredPlayers.length}명 · 총 {formatNumber(allCost)} G (10% 할인)
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={Boolean(busy) || missing <= 0 || gold < missing * TRAINING_RULES.MEDICAL_COST_PER_POINT}
                    onClick={() => recover(selected)}
                    data-testid="recover-one"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <HeartPulse className="h-4 w-4" /> 선택 선수 회복 ({formatNumber(missing * TRAINING_RULES.MEDICAL_COST_PER_POINT)}G)
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(busy) || tiredPlayers.length === 0 || gold < allCost}
                    onClick={() => recover(null)}
                    data-testid="recover-all"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-xs font-bold text-white hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <HeartPulse className="h-4 w-4" /> 전체 회복
                  </button>
                </div>
              </Panel>
            </>
          )}
        </div>
      </div>
    </div>
  );
}