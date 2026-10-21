import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ArrowLeftRight } from 'lucide-react';
import useLiveMatchStore from '../../../store/useLiveMatchStore.js';
import useSquadStore from '../../../store/useSquadStore.js';
import { FORMATION_CODES } from '../../../constants/formations.js';
import { MATCH_RULES } from '../../../constants/matchConfig.js';
import {
  CATEGORY_LABELS,
  FAMILIARITY_META,
  INSTRUCTIONS_BY_CATEGORY,
  TEAM_TACTIC_GROUPS,
  calculatePositionFamiliarity,
  estimateDrainPerMinute,
  getInstructionCategory,
  getInstructionDef,
  getRoleCodes,
  summarizeTacticEffects,
} from '../../../constants/tacticsConfig.js';
import { getOverall, getRating } from '../../../utils/playerStats.js';
import StaminaBar from '../../common/StaminaBar.jsx';
import InteractiveMiniPitch from '../liveMatch/InteractiveMiniPitch.jsx';

const TONE_CLASS = { good: 'text-emerald-300', bad: 'text-red-300', neutral: 'text-slate-300' };

/**
 * 전술 작업대가 다루는 팀 모델(라이브 경기 스토어 또는 경기 전 스쿼드 스토어)을 통일된 인터페이스로 반환합니다.
 * 두 스토어의 액션은 모두 `{success, message}` 를 돌려주므로 화면은 출처를 신경 쓰지 않습니다.
 * @param {'live'|'squad'} source 'live': 진행 중인 경기(교체 횟수 제한 있음), 'squad': 경기 전 라인업 편집(제한 없음)
 * @returns {Object|null} { isLive, formation, tactics, starters, bench, reserve, subsLeft, swap, substitute, swapBenchReserve, changeFormation, updateTactics, setInstruction }
 */
function useWorkspaceModel(source) {
  const homeTeam = useLiveMatchStore((s) => s.homeTeam);
  const live = useLiveMatchStore(
    useShallow((s) => ({
      swap: s.swapFieldPositions,
      substitute: s.makeUserSubstitution,
      changeFormation: s.changeFormation,
      updateTactics: s.updateTeamTactics,
      setInstruction: s.setPlayerInstruction,
    }))
  );
  const squadState = useSquadStore(
    useShallow((s) => ({
      formation: s.formation,
      teamTactics: s.teamTactics,
      starters: s.starters,
      bench: s.bench,
      reserve: s.reserve,
    }))
  );
  const squadActions = useSquadStore(
    useShallow((s) => ({
      swap: s.swapFieldPositions,
      substitute: s.substitute,
      swapBenchReserve: s.swapBenchReserve,
      changeFormation: s.changeFormation,
      updateTactics: s.updateTeamTactics,
      setInstruction: s.setPlayerInstruction,
    }))
  );

  if (source === 'live') {
    if (!homeTeam) return null;
    return {
      isLive: true,
      formation: homeTeam.formation,
      tactics: homeTeam.tactics,
      starters: homeTeam.starters,
      bench: homeTeam.bench,
      reserve: [],
      subsLeft: homeTeam.subsLeft,
      ...live,
      swapBenchReserve: null,
    };
  }
  return {
    isLive: false,
    formation: squadState.formation,
    tactics: squadState.teamTactics,
    starters: squadState.starters,
    bench: squadState.bench,
    reserve: squadState.reserve,
    subsLeft: Infinity,
    ...squadActions,
  };
}

/**
 * 포지션 적합도 뱃지.
 * @param {Object} props
 * @param {'NATURAL'|'ADEQUATE'|'UNFAMILIAR'|'SEVERE'} props.familiarity
 * @returns {JSX.Element}
 */
function FamiliarityBadge({ familiarity }) {
  const meta = FAMILIARITY_META[familiarity];
  return <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.badgeClass}`}>{meta.label}</span>;
}

/**
 * 피드백 배너(성공/실패 메시지).
 * @param {Object} props
 * @param {{success:boolean, message:string}|null} props.feedback
 * @returns {JSX.Element|null}
 */
function Feedback({ feedback }) {
  if (!feedback) return null;
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
        feedback.success ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-200' : 'border-red-500/50 bg-red-950/30 text-red-200'
      }`}
    >
      {feedback.message}
    </div>
  );
}

/**
 * 필드 선수 카드: 슬롯명, 주 포지션, 적합도 뱃지, 체력 바, 평점/OVR, 경고 표시. 퇴장 공석은 "공석" 카드로 표시됩니다.
 * @param {Object} props
 * @param {Object} props.player 필드 슬롯의 선수
 * @param {boolean} props.isLive 라이브 경기 여부 (라이브: 평점, 경기 전: OVR)
 * @param {boolean} props.isSelected
 * @param {() => void} props.onClick
 * @returns {JSX.Element}
 */
function FieldPlayerCard({ player, isLive, isSelected, onClick }) {
  const stamina = player.currentStamina ?? player.stamina;
  const exhausted = isLive && !player.isSentOff && stamina <= MATCH_RULES.EXHAUSTED_STAMINA;
  const preferred = player.roleCodes?.length ? ` (${player.roleCodes.join('/')})` : player.preferredRoleCode ? ` (${player.preferredRoleCode})` : '';

  if (player.isSentOff) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`w-full rounded-lg border border-dashed border-red-500/50 bg-red-950/20 p-2 text-left transition hover:bg-red-950/40 ${
          isSelected ? 'ring-4 ring-amber-400 bg-amber-950/40' : ''
        }`}
      >
        <div className="flex items-center gap-2 text-xs">
          <span className="w-10 rounded bg-slate-700 py-0.5 text-center font-bold text-slate-200">{player.slotRoleCode}</span>
          <span className="flex-1 truncate font-semibold text-red-300">
            퇴장 공석 · <span className="line-through">{player.name}</span>
          </span>
          <span className="text-[10px] text-red-300">살아있는 선수를 이 슬롯으로 이동시킬 수 있습니다</span>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border border-slate-700 bg-slate-800/70 p-2 text-left transition hover:bg-slate-800 ${
        isSelected ? 'ring-4 ring-amber-400 bg-amber-950/40' : ''
      }`}
    >
      <div className="flex items-center gap-2 text-xs">
        <span className="w-10 rounded bg-slate-700 py-0.5 text-center font-bold text-slate-200">{player.slotRoleCode}</span>
        <span className="flex-1 truncate font-semibold text-slate-100">{player.name}</span>
        {player.yellowCards === 1 && <span className="h-3.5 w-2.5 rounded-sm bg-yellow-400" title="경고 1장" />}
        <span className="text-slate-400">{isLive ? `평점 ${getRating(player).toFixed(1)}` : `OVR ${player.overall || getOverall(player)}`}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
        <span>
          주포지션: {player.mainPosition}
          {preferred}
        </span>
        <FamiliarityBadge familiarity={player.familiarity} />
      </div>
      <div className="mt-1 flex items-center gap-2">
        <StaminaBar value={stamina} showLabel className="flex-1" />
        {exhausted && <span className="animate-pulse whitespace-nowrap text-[10px] font-bold text-red-400">체력 고갈! 교체 권장</span>}
      </div>
    </button>
  );
}

/**
 * 벤치/예비 선수 카드. 필드 선수가 선택된 상태면 그 슬롯에 투입했을 때의 적합도를 미리 보여줍니다.
 * @param {Object} props
 * @param {Object} props.player
 * @param {boolean} props.isSelected
 * @param {Object|null} props.selectedFieldSlot 선택된 필드 슬롯 선수
 * @param {() => void} props.onClick
 * @returns {JSX.Element}
 */
function BenchCard({ player, isSelected, selectedFieldSlot, onClick }) {
  const preview = selectedFieldSlot ? calculatePositionFamiliarity(player.mainPosition, selectedFieldSlot.slotRoleCode, getRoleCodes(player)).familiarity : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border border-slate-700 bg-slate-800/70 p-2 text-left transition hover:bg-slate-800 ${
        isSelected ? 'ring-4 ring-amber-400 bg-amber-950/40' : ''
      }`}
    >
      <div className="flex items-center gap-2 text-xs">
        <span className="w-10 rounded bg-slate-700 py-0.5 text-center font-bold text-slate-200">{player.mainPosition}</span>
        <span className="flex-1 truncate font-semibold text-slate-100">{player.name}</span>
        <span className="text-slate-400">OVR {player.overall || getOverall(player)}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
        <span>
          주포지션: {player.mainPosition}
          {player.roleCodes?.length ? ` (${player.roleCodes.join('/')})` : player.preferredRoleCode ? ` (${player.preferredRoleCode})` : ''}
        </span>
        {preview && (
          <>
            <ArrowLeftRight className="h-3 w-3" />
            <span>{selectedFieldSlot.slotRoleCode} 투입 시</span>
            <FamiliarityBadge familiarity={preview} />
          </>
        )}
      </div>
      <StaminaBar value={player.currentStamina ?? player.stamina} showLabel className="mt-1" />
    </button>
  );
}

/**
 * 탭 1: 포지션 변경 & 선수 교체. 필드 선수 <-> 필드 선수는 교체 카드 소모 없이 위치 스왑,
 * 필드 선수 <-> 벤치 선수는 (경기 중) 교체 카드 1장 소모 교체가 클릭만으로 실행됩니다. 경기 전에는 예비 선수단도 함께 다룹니다.
 * @param {Object} props
 * @param {Object} props.model useWorkspaceModel 결과
 * @returns {JSX.Element}
 */
function SubstitutionTab({ model }) {
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (!feedback) return undefined;
    const timer = setTimeout(() => setFeedback(null), 5000);
    return () => clearTimeout(timer);
  }, [feedback]);

  const selectedFieldSlot = selectedTarget?.kind === 'field' ? model.starters[selectedTarget.slotIndex] : null;

  /**
   * 필드/벤치/예비 항목 클릭: 첫 클릭은 선택, 두 번째 클릭은 조합에 따라 위치 스왑 / 교체 / 벤치 변경을 즉시 실행합니다.
   * @param {{kind:'field', slotIndex:number}|{kind:'bench'|'reserve', id:string}} target
   * @returns {void}
   */
  const handleSelect = (target) => {
    const current = selectedTarget;
    if (!current) {
      setSelectedTarget(target);
      return;
    }
    const sameItem = current.kind === target.kind && (current.kind === 'field' ? current.slotIndex === target.slotIndex : current.id === target.id);
    if (sameItem) {
      setSelectedTarget(null);
      return;
    }
    if (current.kind === 'field' && target.kind === 'field') {
      setFeedback(model.swap(current.slotIndex, target.slotIndex));
    } else if (current.kind === 'field') {
      setFeedback(model.substitute(current.slotIndex, target.id));
    } else if (target.kind === 'field') {
      setFeedback(model.substitute(target.slotIndex, current.id));
    } else if (model.swapBenchReserve && current.kind !== target.kind) {
      const benchId = current.kind === 'bench' ? current.id : target.id;
      const reserveId = current.kind === 'reserve' ? current.id : target.id;
      setFeedback(model.swapBenchReserve(benchId, reserveId));
    } else {
      setSelectedTarget(target);
      return;
    }
    setSelectedTarget(null);
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-400">
        필드 선수 두 명을 차례로 클릭하면 <b className="text-emerald-300">교체 카드 소모 없이 위치만 맞교환</b>되고, 필드 선수와 벤치 선수를 클릭하면
        {model.isLive ? <b className="text-purple-300"> 교체 카드 1장</b> : <b className="text-purple-300"> 경기 전이라 횟수 제한 없이</b>}
        {model.isLive ? '이 소모됩니다.' : ' 교체됩니다.'} 퇴장 공석 슬롯도 선택해 생존 선수를 이동시킬 수 있습니다.
        {!model.isLive && ' 예비 선수단과 벤치 선수를 클릭하면 경기 엔트리(벤치 7명)가 바뀝니다.'}
      </p>
      <Feedback feedback={feedback} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="md:col-start-1 md:row-start-1 xl:col-start-1">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">실시간 미니 전술판</h3>
          <InteractiveMiniPitch
            starters={model.starters}
            selectedSlotIndex={selectedTarget?.kind === 'field' ? selectedTarget.slotIndex : null}
            onSelectSlot={(slotIndex) => handleSelect({ kind: 'field', slotIndex })}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.values(FAMILIARITY_META).map((meta) => (
              <span key={meta.key} className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.badgeClass}`}>
                {meta.label}
              </span>
            ))}
          </div>
        </div>

        <div className="md:col-start-2 md:row-span-2 md:row-start-1 xl:col-start-2 xl:row-span-1">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">{model.isLive ? '출전 중인 필드 11명' : '선발 11명'}</h3>
          <ul className="space-y-1.5">
            {model.starters.map((p) => (
              <li key={p.id}>
                <FieldPlayerCard
                  player={p}
                  isLive={model.isLive}
                  isSelected={selectedTarget?.kind === 'field' && selectedTarget.slotIndex === p.slotIndex}
                  onClick={() => handleSelect({ kind: 'field', slotIndex: p.slotIndex })}
                />
              </li>
            ))}
          </ul>
        </div>

        <div className="md:col-start-1 md:row-start-2 xl:col-start-3 xl:row-start-1">
          <h3 className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
            <span>벤치 {model.bench.length}명</span>
            {model.isLive ? (
              <span className="text-purple-300">
                남은 교체 {model.subsLeft}/{MATCH_RULES.MAX_SUBSTITUTIONS}
              </span>
            ) : (
              <span className="text-emerald-300">경기 전 · 교체 무제한</span>
            )}
          </h3>
          <ul className="space-y-1.5">
            {model.bench.map((p) => (
              <li key={p.id}>
                <BenchCard
                  player={p}
                  isSelected={selectedTarget?.kind === 'bench' && selectedTarget.id === p.id}
                  selectedFieldSlot={selectedFieldSlot}
                  onClick={() => handleSelect({ kind: 'bench', id: p.id })}
                />
              </li>
            ))}
            {model.bench.length === 0 && <li className="py-3 text-center text-xs text-slate-500">벤치 선수가 없습니다.</li>}
          </ul>

          {model.reserve.length > 0 && (
            <>
              <h3 className="mb-2 mt-4 text-xs font-bold uppercase tracking-wider text-slate-400">예비 선수단 {model.reserve.length}명 (경기 엔트리 제외)</h3>
              <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {model.reserve.map((p) => (
                  <li key={p.id}>
                    <BenchCard
                      player={p}
                      isSelected={selectedTarget?.kind === 'reserve' && selectedTarget.id === p.id}
                      selectedFieldSlot={selectedFieldSlot}
                      onClick={() => handleSelect({ kind: 'reserve', id: p.id })}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 탭 2: 포메이션 + 팀 세부 전술 5종 + 실시간 효과 요약.
 * @param {Object} props
 * @param {Object} props.model
 * @returns {JSX.Element}
 */
function TeamTacticsTab({ model }) {
  const [feedback, setFeedback] = useState(null);
  const effects = summarizeTacticEffects(model.tactics);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">포메이션</span>
          <select
            value={model.formation}
            onChange={(e) => setFeedback(model.changeFormation(e.target.value))}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {FORMATION_CODES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-slate-500">변경 시 선수들이 새 슬롯으로 재배치되고 적합도가 재계산됩니다.</span>
        </div>

        {TEAM_TACTIC_GROUPS.map((group) => (
          <div key={group.key}>
            <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">{group.label}</h3>
            <div className="flex flex-wrap overflow-hidden rounded-lg border border-slate-700">
              {group.options.map((option) => {
                const active = model.tactics[group.key] === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFeedback(model.updateTactics({ [group.key]: option.value }))}
                    className={`flex-1 px-3 py-1.5 text-xs font-semibold transition ${
                      active ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <Feedback feedback={feedback} />
      </div>

      <aside className="rounded-xl border border-slate-700 bg-slate-800/50 p-3">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-purple-200">실시간 전술 효과</h3>
        <ul className="space-y-1.5 text-xs">
          {effects.map((e) => (
            <li key={e.label} className="flex items-center justify-between gap-2">
              <span className="text-slate-400">{e.label}</span>
              <span className={`font-bold ${TONE_CLASS[e.tone]}`}>{e.value}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

/**
 * 지침의 체력 소모 배율 뱃지.
 * @param {Object} props
 * @param {number} props.staminaMul
 * @returns {JSX.Element}
 */
function StaminaEffectBadge({ staminaMul }) {
  const pct = Math.round((staminaMul - 1) * 100);
  if (pct < 0) {
    return <span className="whitespace-nowrap rounded-full border border-emerald-500/60 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">체력 절약 {pct}%</span>;
  }
  if (pct > 0) {
    return <span className="whitespace-nowrap rounded-full border border-amber-500/60 bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">체력 소모 주의 +{pct}%</span>;
  }
  return <span className="whitespace-nowrap rounded-full border border-slate-600 bg-slate-700/40 px-2 py-0.5 text-[10px] font-bold text-slate-300">체력 소모 보통</span>;
}

/**
 * 탭 3: 선발 11명의 현재 슬롯에 맞는 개인 지침 선택 + 예상 체력 소모 배지.
 * @param {Object} props
 * @param {Object} props.model
 * @returns {JSX.Element}
 */
function InstructionsTab({ model }) {
  const [feedback, setFeedback] = useState(null);

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-400">
        지침은 현재 배치된 포지션에 맞춰 제공되며, 포지션을 바꾸면 맞지 않는 지침은 기본값으로 초기화됩니다. 분당 소모량은 포지션 x 팀 전술(템포/압박) x 지침을 모두 반영한 예상치입니다.
      </p>
      <Feedback feedback={feedback} />
      <ul className="grid grid-cols-1 gap-2 xl:grid-cols-2">
        {model.starters.map((p) => {
          if (p.isSentOff) {
            return (
              <li key={p.id} className="rounded-lg border border-dashed border-red-500/40 bg-red-950/10 p-2 text-xs text-red-300">
                {p.slotRoleCode} · 퇴장 공석
              </li>
            );
          }
          const category = getInstructionCategory(p.slotRoleCode);
          const options = INSTRUCTIONS_BY_CATEGORY[category];
          const def = getInstructionDef(p.instruction);
          return (
            <li key={p.id} className="rounded-lg border border-slate-700 bg-slate-800/60 p-2.5">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="w-10 rounded bg-slate-700 py-0.5 text-center font-bold text-slate-200">{p.slotRoleCode}</span>
                <span className="font-semibold text-slate-100">{p.name}</span>
                <span className="text-[10px] text-slate-500">{CATEGORY_LABELS[category]}</span>
                <span className="ml-auto flex items-center gap-1.5">
                  <StaminaEffectBadge staminaMul={def.staminaMul} />
                  <span className="text-[10px] text-slate-400">분당 -{estimateDrainPerMinute(p, model.tactics).toFixed(2)}</span>
                </span>
              </div>
              {category === 'GOALKEEPER' ? (
                <p className="mt-1.5 text-[11px] text-slate-500">골키퍼는 개인 지침이 없습니다.</p>
              ) : (
                <>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {options.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setFeedback(model.setInstruction(p.slotIndex, option))}
                        title={getInstructionDef(option).desc}
                        className={`rounded-md px-2 py-1 text-[11px] font-semibold transition ${
                          p.instruction === option ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                      >
                        {getInstructionDef(option).label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">{def.desc}</p>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * 경기 중/하프타임/경기 전 로비/스쿼드 화면에서 공통으로 쓰는 통합 전술 작업대.
 * 3개 탭: [1. 포지션 변경 & 선수 교체] [2. 팀 세부 전술] [3. 선수 개인 지침].
 * source 에 따라 라이브 경기 스토어 또는 경기 전 스쿼드 스토어에 동일한 UI 로 연결되며, 모든 변경은 즉시 해당 스토어에 반영됩니다.
 * @param {Object} props
 * @param {'live'|'squad'} props.source 데이터 출처
 * @returns {JSX.Element|null}
 */
export default function TacticsWorkspace({ source }) {
  const model = useWorkspaceModel(source);
  const [tab, setTab] = useState('swap');
  if (!model) return null;

  const tabs = [
    { id: 'swap', label: model.isLive ? `🔄 포지션 변경 & 선수 교체 (남은 교체: ${model.subsLeft}/${MATCH_RULES.MAX_SUBSTITUTIONS})` : '🔄 포지션 변경 & 선수 교체' },
    { id: 'team', label: '📋 팀 세부 전술' },
    { id: 'instructions', label: '🎯 선수 개인 지침' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5 border-b border-slate-700 pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              tab === t.id ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'swap' && <SubstitutionTab model={model} />}
      {tab === 'team' && <TeamTacticsTab model={model} />}
      {tab === 'instructions' && <InstructionsTab model={model} />}
    </div>
  );
}
