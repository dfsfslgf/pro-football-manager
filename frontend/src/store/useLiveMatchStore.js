import { create } from 'zustand';
import { FORMATIONS, FORMATION_CODES, getFormationSlots } from '../constants/formations.js';
import { MATCH_RULES, TICK_BASE_MS } from '../constants/matchConfig.js';
import {
  DEFAULT_POSITION_DRAIN,
  DEFAULT_TEAM_TACTICS,
  FAMILIARITY_META,
  LOCKER_TALKS,
  NEUTRAL_TALK_EFFECT,
  POSITION_STAMINA_DRAIN_MULTIPLIER,
  TEAM_TACTIC_GROUPS,
  TEAM_TACTIC_LABELS,
  TOUCHLINE_SHOUTS,
  applySlotToPlayer,
  assignPlayersByFamiliarity,
  getInstructionCategory,
  getInstructionDef,
  getSlotOf,
  getTacticEffect,
  getTalkEffect,
  getTeamStaminaMod,
  isValidInstruction,
  normalizeRoleCode,
  INSTRUCTION_DEFS,
} from '../constants/tacticsConfig.js';
import { getLiveStats } from '../utils/playerStats.js';
import { finishLiveMatch } from '../api/matchApi.js';
import { errorMessage } from '../api/client.js';

const WEATHER_TYPES = [
  { code: 'SUNNY', label: '맑음 (쾌적한 잔디)', passMod: 1.0, speedMod: 1.0, staminaMod: 1.0, longShotMod: 1.0 },
  { code: 'RAINY', label: '우천 (미끄러운 잔디)', passMod: 0.92, speedMod: 0.95, staminaMod: 1.08, longShotMod: 1.12 },
  { code: 'WINDY', label: '강풍 (롱패스 변칙 궤적)', passMod: 0.95, speedMod: 0.98, staminaMod: 1.03, longShotMod: 1.06 },
  { code: 'NIGHT_CLEAR', label: '야간 경기 (최상의 집중력)', passMod: 1.03, speedMod: 1.02, staminaMod: 0.97, longShotMod: 1.02 },
];

export function getSafeName(player, fallback = '출전 선수') {
  if (!player) return fallback;
  if (typeof player === 'string') {
    const s = player.trim();
    if (s && !s.toLowerCase().includes('undefined') && !s.toLowerCase().includes('null') && !/^[HA]#\d+$/i.test(s)) {
      return s;
    }
    return fallback;
  }
  const rawName = player.name || player.safeName || player.playerName || player.koreanName;
  if (
    !rawName ||
    String(rawName).toLowerCase().includes('undefined') ||
    String(rawName).trim() === '' ||
    /^[HA]#\d+$/i.test(String(rawName).trim())
  ) {
    return fallback;
  }
  return String(rawName).trim();
}

export function calcPlayerOvr(p) {
  if (!p) return 70;
  if (Number(p.overall) > 0) return Number(p.overall);
  const s = p.effectiveStats || p.baseStats || {};
  const role = p.slotRoleGroup || p.mainPosition || 'MF';
  if (role === 'GK' || p.slotRoleCode === 'GK') {
    return Math.round((s.gkReflexes || 75) * 0.7 + (s.physical || 70) * 0.15 + (s.passing || 65) * 0.15);
  }
  if (role === 'DF') {
    return Math.round((s.defense || 75) * 0.45 + (s.physical || 75) * 0.25 + (s.speed || 72) * 0.15 + (s.passing || 70) * 0.15);
  }
  if (role === 'MF') {
    return Math.round((s.passing || 75) * 0.35 + (s.dribbling || 75) * 0.25 + (s.speed || 73) * 0.15 + (s.shooting || 72) * 0.15 + (s.defense || 68) * 0.1);
  }
  return Math.round((s.shooting || 76) * 0.42 + (s.speed || 76) * 0.25 + (s.dribbling || 75) * 0.23 + (s.physical || 72) * 0.1);
}

export function calcTeamAvgOvr(team) {
  const alive = (team?.starters || []).filter((p) => p && !p.isSentOff);
  if (alive.length === 0) return 70;
  const sum = alive.reduce((acc, p) => acc + calcPlayerOvr(p) * (p.familiarityMultiplier || 1), 0);
  return Math.round(sum / alive.length);
}

function createEmptyStats() {
  return {
    possessionTicks: 1,
    shots: 0,
    shotsOnTarget: 0,
    corners: 0,
    fouls: 0,
    yellowCards: 0,
    redCards: 0,
    passesAttempted: 0,
    passesCompleted: 0,
    passAccuracy: 85,
    tackles: 0,
    interceptions: 0,
    saves: 0,
    offsides: 0,
    freeKicks: 0,
    penalties: 0,
  };
}

export function buildFieldTeam({ side, clubId, name, emblem, formation, starters, bench, tactics }) {
  const slots = getFormationSlots(formation, side);
  const matchState = {
    yellowCards: 0,
    isSentOff: false,
    isInjured: false,
    goals: 0,
    assists: 0,
    minutesPlayed: 0,
    enteredAsSub: false,
    shots: 0,
    shotsOnTarget: 0,
    saves: 0,
    tackles: 0,
    passesCompleted: 0,
    morale: 75,
    liveRating: 6.0,
    rating: 6.0,
  };
  const builtStarters = starters.map((p, i) => {
    const slot = slots[i] || { baseX: 50, baseY: 50, label: 'CM', role: 'MF' };
    const startStamina = p.currentStamina ?? p.stamina ?? 100;
    const player = applySlotToPlayer(
      { ...p, ...matchState, stamina: startStamina, currentStamina: startStamina, instruction: p.instruction || undefined },
      slot
    );
    player.uid = `${side}_${i}`;
    player.slotIndex = i;
    player.computedOvr = calcPlayerOvr(player);
    return player;
  });
  const builtBench = (bench || []).map((p, bIdx) => {
    const startStamina = p.currentStamina ?? p.stamina ?? 100;
    return {
      ...p,
      ...matchState,
      slotIndex: null,
      slotRoleGroup: p.mainPosition,
      slotRoleCode: p.preferredRoleCode || p.mainPosition,
      role: p.mainPosition,
      label: p.preferredRoleCode || p.mainPosition,
      baseX: 50,
      baseY: 50,
      naturalPosition: p.mainPosition,
      familiarity: 'NATURAL',
      familiarityMultiplier: 1,
      instruction: null,
      stamina: startStamina,
      currentStamina: startStamina,
      computedOvr: calcPlayerOvr(p),
      uid: `${side}_B_${p.id || bIdx}`,
    };
  });
  const teamObj = {
    side,
    clubId,
    name,
    emblem: emblem || null,
    formation,
    tactics: { ...DEFAULT_TEAM_TACTICS, ...(tactics || {}) },
    talkEffect: { ...NEUTRAL_TALK_EFFECT },
    touchlineShout: null,
    starters: builtStarters,
    bench: builtBench,
    substitutedOut: [],
    subsLeft: MATCH_RULES.MAX_SUBSTITUTIONS,
    score: 0,
    teamMorale: 75,
    crowdMomentum: side === 'HOME' ? 65 : 50,
    stats: createEmptyStats(),
  };
  teamObj.avgOvr = calcTeamAvgOvr(teamObj);
  return teamObj;
}

function cloneTeam(team) {
  if (!team) return null;
  const cloned = {
    ...team,
    tactics: { ...team.tactics },
    talkEffect: { ...team.talkEffect },
    starters: team.starters.map((p) => ({ ...p })),
    bench: team.bench.map((p) => ({ ...p })),
    substitutedOut: [...team.substitutedOut],
    stats: { ...team.stats },
  };
  cloned.avgOvr = calcTeamAvgOvr(cloned);
  return cloned;
}

function aliveOf(team) {
  return (team?.starters || []).filter((p) => p && !p.isSentOff);
}

function makeEvent(minute, type, team, primary, secondary, description, isUserAction = false, isPenalty = false) {
  return {
    minute,
    type,
    team: team ? team.side : null,
    userPlayerId: primary ? (primary.userPlayerId ?? primary.playerId ?? primary.id) : null,
    playerId: primary ? (primary.playerId ?? primary.userPlayerId ?? primary.id) : null,
    primaryPlayerId: primary ? (primary.userPlayerId ?? primary.playerId ?? primary.id) : null,
    primaryPlayerName: primary ? getSafeName(primary) : null,
    secondaryPlayerId: secondary ? (secondary.userPlayerId ?? secondary.playerId ?? secondary.id) : null,
    secondaryPlayerName: secondary ? getSafeName(secondary) : null,
    description,
    isUserAction,
    isPenalty,
  };
}

function makeInfoEvent(minute, text) {
  return {
    minute,
    type: 'INFO',
    team: null,
    primaryPlayerId: null,
    primaryPlayerName: null,
    secondaryPlayerId: null,
    secondaryPlayerName: null,
    description: text,
    isUserAction: false,
  };
}

export function applyStaminaDrain(team, weatherMod = 1.0, opponentScore = 0) {
  const teamMod = getTeamStaminaMod(team.tactics);
  const goalDiff = (team.score || 0) - (opponentScore || 0);

  for (const p of aliveOf(team)) {
    const baseTickDrain = MATCH_RULES.BASE_TICK_DRAIN_MIN + Math.random() * MATCH_RULES.BASE_TICK_DRAIN_RANGE;
    const posMod = POSITION_STAMINA_DRAIN_MULTIPLIER[p.slotRoleCode] || DEFAULT_POSITION_DRAIN;
    const teamTacticMod = p.slotRoleCode === 'GK' ? 0.35 : teamMod;
    const playerInstMod = getInstructionDef(p.instruction).staminaMul;
    const finalDrain = baseTickDrain * posMod * teamTacticMod * playerInstMod * weatherMod * 0.85;
    p.currentStamina = Math.max(MATCH_RULES.MIN_STAMINA, Number((p.currentStamina - finalDrain).toFixed(2)));
    p.minutesPlayed = (p.minutesPlayed || 0) + 1;

    // 수비수(풀백/센터백)와 수비형 미드필더가 팀 리드 및 최소 실점을 유지할 때 평점이 5~6점대로 처지지 않도록 분당 기여도 반영
    if (p.slotRoleGroup === 'DF' || p.slotRoleCode === 'CDM') {
      let defTickBonus = 0.012;
      if (opponentScore === 0) defTickBonus += 0.012;
      if (goalDiff >= 2) defTickBonus += 0.015; // 다득점 리드 시 풀백/수비진 평점 동반 상승
      p.liveRating = Math.min(9.5, Number(((p.liveRating ?? 6.0) + defTickBonus).toFixed(2)));
      p.rating = p.liveRating;
    }
  }
}

function applyHalfTimeRecovery(team) {
  const recoveries = [];
  for (const p of aliveOf(team)) {
    const loss = 100 - p.currentStamina;
    if (loss <= 0) continue;
    const raw = loss * MATCH_RULES.HALF_TIME_RECOVERY_RATIO;
    const gain = Math.min(loss, Math.max(MATCH_RULES.HALF_TIME_RECOVERY_MIN, Math.min(MATCH_RULES.HALF_TIME_RECOVERY_MAX, raw)));
    const before = p.currentStamina;
    p.currentStamina = Number(Math.min(100, p.currentStamina + gain).toFixed(2));
    recoveries.push({ id: p.id, name: p.name, slotRoleCode: p.slotRoleCode, before, after: p.currentStamina });
  }
  return recoveries;
}

function midfieldPower(team) {
  const score = (p) => {
    const live = getLiveStats(p);
    const ovrBoost = Math.pow((calcPlayerOvr(p) || 75) / 75, 1.8);
    const moraleBoost = 0.85 + ((p.morale ?? 75) / 100) * 0.3;
    return (live.passing * 0.55 + live.dribbling * 0.3 + live.defense * 0.15) * ovrBoost * moraleBoost;
  };
  const field = aliveOf(team);
  const mids = field.filter((p) => p.slotRoleGroup === 'MF');
  if (mids.length > 0) return mids.reduce((sum, p) => sum + score(p), 0);
  if (field.length === 0) return 10;
  return (field.reduce((sum, p) => sum + score(p), 0) / field.length) * 2.5;
}

function possessionPower(team) {
  const t = team.tactics;
  const ovrFactor = Math.pow((team.avgOvr || 75) / 75, 2.2);
  return (
    midfieldPower(team) *
    ovrFactor *
    (getTacticEffect(t, 'passingStyle').possMul || 1) *
    (getTacticEffect(t, 'defensiveLine').possMul || 1) *
    (getTacticEffect(t, 'pressing').possMul || 1) *
    (team.talkEffect?.possMul || 1)
  );
}

function substitutePlayer(team, playerOut, playerIn) {
  const slotDef = getSlotOf(playerOut);
  const slotIdx = team.starters.findIndex((p) => p.id === playerOut.id);
  const incoming = applySlotToPlayer(
    {
      ...playerIn,
      currentStamina: playerIn.currentStamina ?? playerIn.stamina ?? 100,
      enteredAsSub: true,
      instruction: playerOut.instruction,
      morale: 82,
      liveRating: 6.0,
      rating: 6.0,
    },
    slotDef
  );
  incoming.slotIndex = slotIdx >= 0 ? slotIdx : playerOut.slotIndex;
  incoming.uid = `${team.side}_${incoming.slotIndex}`;
  incoming.computedOvr = calcPlayerOvr(incoming);
  if (slotIdx >= 0) team.starters[slotIdx] = incoming;
  team.bench = team.bench.filter((p) => p.id !== playerIn.id);
  team.substitutedOut = [...team.substitutedOut, playerOut];
  team.subsLeft--;
  team.avgOvr = calcTeamAvgOvr(team);
  return incoming;
}

function swapSlots(team, slotIndexA, slotIndexB) {
  const a = team.starters[slotIndexA];
  const b = team.starters[slotIndexB];
  const slotA = getSlotOf(a);
  const slotB = getSlotOf(b);
  const nextA = applySlotToPlayer(b, slotA);
  const nextB = applySlotToPlayer(a, slotB);
  nextA.slotIndex = slotIndexA;
  nextA.uid = `${team.side}_${slotIndexA}`;
  nextB.slotIndex = slotIndexB;
  nextB.uid = `${team.side}_${slotIndexB}`;
  team.starters[slotIndexA] = nextA;
  team.starters[slotIndexB] = nextB;
  team.avgOvr = calcTeamAvgOvr(team);
}

function rebuildStartersForFormation(team, newFormation) {
  const slots = getFormationSlots(newFormation, team.side);
  const alive = team.starters.filter((p) => !p.isSentOff);
  const dead = team.starters.filter((p) => p.isSentOff);
  const result = new Array(slots.length).fill(null);
  for (const d of dead) {
    let bestIndex = -1;
    let bestScore = -Infinity;
    slots.forEach((s, i) => {
      if (result[i]) return;
      const score =
        (normalizeRoleCode(s.label) === normalizeRoleCode(d.slotRoleCode) ? 3 : 0) +
        (s.role === d.slotRoleGroup ? 2 : 0) +
        (1 - Math.abs(s.baseX - d.baseX) / 100);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    });
    if (bestIndex >= 0) result[bestIndex] = applySlotToPlayer(d, slots[bestIndex]);
  }
  const freeIndexes = result.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  const assigned = assignPlayersByFamiliarity(
    alive,
    freeIndexes.map((i) => slots[i])
  );
  freeIndexes.forEach((slotIdx, k) => {
    if (assigned[k]) result[slotIdx] = applySlotToPlayer(assigned[k], slots[slotIdx]);
  });
  team.starters = result.filter(Boolean).map((p, idx) => ({
    ...p,
    slotIndex: idx,
    uid: `${team.side}_${idx}`,
  }));
  team.formation = newFormation;
  team.avgOvr = calcTeamAvgOvr(team);
}

/**
 * 상대 감독(AI)이 고정된 분이 아니라 경기 흐름(점수 차, 체력 급감, 평점 부진, 퇴장 발생)에 따라
 * 전반 36분~후반 88분 사이 언제든 유기적으로 선수 교체와 포메이션/전술 변경을 수행함
 */
function runAiPlanB(team, opponent, minute, events) {
  const liveDefenders = aliveOf(team).filter((p) => p.slotRoleGroup === 'DF');
  const benchDefenders = team.bench.filter((p) => p.mainPosition === 'DF');
  const liveForwards = aliveOf(team).filter((p) => p.slotRoleGroup === 'FW');
  const vacatedDefenderSlot = team.starters.find((p) => p.isSentOff && p.slotRoleGroup === 'DF');

  // 수비수 퇴장 발생 시 시간 무관 즉시 수비 보강 교체
  if (liveDefenders.length < 3 && team.subsLeft > 0 && benchDefenders.length > 0 && liveForwards.length >= 2 && vacatedDefenderSlot) {
    const playerOut = liveForwards.reduce((min, p) => (p.currentStamina < min.currentStamina ? p : min));
    const playerIn = benchDefenders.reduce((best, p) => (calcPlayerOvr(p) > calcPlayerOvr(best) ? p : best));
    const outSnapshot = { ...playerOut };
    const incomingAtForwardSlot = substitutePlayer(team, playerOut, playerIn);
    swapSlots(team, incomingAtForwardSlot.slotIndex, vacatedDefenderSlot.slotIndex);
    const incoming = team.starters[vacatedDefenderSlot.slotIndex];
    events.push(makeEvent(minute, 'SUBSTITUTION', team, incoming, outSnapshot, '수비수 퇴장 공백을 메우기 위한 즉시 수비 보강 교체'));
    if (team.tactics.mentality !== 'DEFENSIVE' && team.tactics.mentality !== 'PARK_THE_BUS') {
      team.tactics.mentality = 'DEFENSIVE';
      team.tactics.defensiveLine = 'DEEP';
      events.push(makeEvent(minute, 'TACTIC_CHANGE', team, null, null, '수적 열세를 극복하기 위해 두 줄 수비 블록을 형성함'));
    }
  }

  // 유기적 선수 교체: 38분 이후 부상자, 체력 저하(58% 이하), 또는 평점 부진(5.4 이하) 발생 시 확률적으로 즉시 교체
  if (minute >= 38 && team.subsLeft > 0) {
    const scoreDiff = team.score - opponent.score;
    const staminaThreshold = minute >= 72 ? 64 : minute >= 55 ? 58 : 48;
    const ratingThreshold = scoreDiff < 0 ? 5.7 : 5.4;

    const candidatesOut = aliveOf(team)
      .filter(
        (p) =>
          p.slotRoleGroup !== 'GK' &&
          (p.isInjured || p.currentStamina <= staminaThreshold || (minute >= 46 && (p.liveRating ?? 6.0) <= ratingThreshold))
      )
      .sort((a, b) => a.currentStamina - b.currentStamina || (a.liveRating ?? 6.0) - (b.liveRating ?? 6.0));

    if (candidatesOut.length > 0 && (candidatesOut[0].isInjured || Math.random() < 0.42)) {
      const playerOut = candidatesOut[0];
      const replacements = team.bench.filter((p) => p.mainPosition === playerOut.slotRoleGroup);
      if (replacements.length > 0) {
        const playerIn = replacements.reduce((best, p) => (calcPlayerOvr(p) > calcPlayerOvr(best) ? p : best));
        const outSnapshot = { ...playerOut };
        const incoming = substitutePlayer(team, playerOut, playerIn);
        const reason = outSnapshot.isInjured
          ? '부상 선수 보호 교체'
          : (outSnapshot.liveRating ?? 6.0) <= ratingThreshold
          ? '경기력 부진 타개를 위한 전술적 교체'
          : '기동력 유지를 위한 체력 안배 교체';
        events.push(makeEvent(minute, 'SUBSTITUTION', team, incoming, outSnapshot, `${team.name} 벤치: ${reason} (${incoming.name} 투입)`));
      }
    }
  }

  // 유기적 포메이션 및 전술 변경: 점수 차와 슈팅 열세에 따라 35분~86분 사이 언제든 동적으로 발동
  const lastAiTacticMin = team.lastAiTacticMin || 0;
  if (minute >= 35 && minute - lastAiTacticMin >= 14) {
    const scoreDiff = team.score - opponent.score;
    const shotDiff = (team.stats?.shots || 0) - (opponent.stats?.shots || 0);

    // 2골 차 이상 뒤지거나 후반 중반 이후 지고 있을 때 공격적 포메이션으로 전환
    if ((scoreDiff <= -2 || (minute >= 52 && scoreDiff < 0)) && Math.random() < 0.35) {
      const aggressiveForms = ['3-4-3', '4-2-4', '4-3-3'].filter((f) => FORMATIONS[f] && f !== team.formation);
      if (aggressiveForms.length > 0) {
        const prev = team.formation;
        const nextForm = aggressiveForms[Math.floor(Math.random() * aggressiveForms.length)];
        rebuildStartersForFormation(team, nextForm);
        team.tactics.mentality = minute >= 70 || scoreDiff <= -2 ? 'ALL_OUT_ATTACK' : 'ATTACKING';
        team.tactics.pressing = 'HIGH';
        team.tactics.tempo = 'FAST';
        team.lastAiTacticMin = minute;
        events.push(
          makeEvent(
            minute,
            'TACTIC_CHANGE',
            team,
            null,
            null,
            `${team.name} 감독이 흐름을 뒤집기 위해 포메이션을 ${prev}에서 ${nextForm}로 전격 변경함`
          )
        );
      }
    } else if (scoreDiff === 0 && shotDiff <= -4 && minute >= 48 && Math.random() < 0.3) {
      // 동점이지만 슈팅 수에서 밀릴 때 중원 강화 및 오프사이드 트랩 가동
      const midForms = ['4-2-3-1', '4-1-4-1', '3-5-2'].filter((f) => FORMATIONS[f] && f !== team.formation);
      if (midForms.length > 0) {
        const prev = team.formation;
        const nextForm = midForms[Math.floor(Math.random() * midForms.length)];
        rebuildStartersForFormation(team, nextForm);
        team.tactics.offsideTrap = 'ON';
        team.lastAiTacticMin = minute;
        events.push(
          makeEvent(
            minute,
            'TACTIC_CHANGE',
            team,
            null,
            null,
            `${team.name} 감독이 중원 싸움 우위를 위해 ${prev}에서 ${nextForm}로 전환하고 오프사이드 트랩을 가동함`
          )
        );
      }
    } else if (scoreDiff >= 1 && minute >= 68 && Math.random() < 0.35) {
      // 리드 상황에서 후반 중후반 수비 굳히기 전환
      const defForms = ['5-4-1', '5-3-2', '4-5-1'].filter((f) => FORMATIONS[f] && f !== team.formation);
      const nextForm = defForms.length > 0 ? defForms[0] : team.formation;
      const prev = team.formation;
      if (nextForm !== prev) rebuildStartersForFormation(team, nextForm);
      team.tactics.mentality = scoreDiff === 1 && minute >= 80 ? 'PARK_THE_BUS' : 'DEFENSIVE';
      team.tactics.defensiveLine = 'DEEP';
      team.tactics.offsideTrap = 'OFF';
      team.lastAiTacticMin = minute;
      events.push(
        makeEvent(
          minute,
          'TACTIC_CHANGE',
          team,
          null,
          null,
          `${team.name} 감독이 승리를 지키기 위해 수비 라인을 내리고 전술을 수비형으로 전환함`
        )
      );
    }
  }
}

export function simulateSingleMinuteTick(home, away, minute, weather) {
  const events = [];
  const weatherMod = weather?.staminaMod || 1.0;
  applyStaminaDrain(home, weatherMod, away.score);
  applyStaminaDrain(away, weatherMod, home.score);
  runAiPlanB(away, home, minute, events);

  const mHome = possessionPower(home) * MATCH_RULES.HOME_ADVANTAGE * (0.95 + (home.crowdMomentum || 60) / 1000);
  const mAway = possessionPower(away);
  const rawHome = mHome + mAway > 0 ? mHome / (mHome + mAway) : 0.5;
  const pHome = Math.max(0.2, Math.min(0.8, 0.5 + (rawHome - 0.5) * MATCH_RULES.POSSESSION_SENSITIVITY));
  const homeAttacks = Math.random() < pHome;
  const attacker = homeAttacks ? home : away;
  attacker.stats.possessionTicks++;

  const action = {
    minute,
    eventType: 'NORMAL',
    attackingTeam: attacker.side,
    setPieceType: null,
    ballCarrierId: null,
    passTargetId: null,
    cardType: null,
    cardPlayerId: null,
    foulerId: null,
    subInId: null,
  };

  return { events, action };
}

function sanitizeTimelineForServer(timelineEvents, homeTeam, awayTeam) {
  const allValid = [
    ...(homeTeam?.starters || []),
    ...(homeTeam?.substitutedOut || []),
    ...(awayTeam?.starters || []),
    ...(awayTeam?.substitutedOut || []),
  ].filter(Boolean);

  const idMap = new Map();
  for (const p of allValid) {
    if (p.userPlayerId !== undefined) idMap.set(String(p.userPlayerId), p);
    if (p.playerId !== undefined) idMap.set(String(p.playerId), p);
    if (p.id !== undefined) idMap.set(String(p.id), p);
    if (p.name) idMap.set(String(p.name).trim(), p);
  }

  return (timelineEvents || [])
    .filter((e) => e.type !== 'INFO')
    .map((evt) => {
      const isHome = evt.team !== 'AWAY';
      const pool = isHome
        ? [...(homeTeam?.starters || []), ...(homeTeam?.substitutedOut || [])]
        : [...(awayTeam?.starters || []), ...(awayTeam?.substitutedOut || [])];
      const fallbackPrimary = pool.find((p) => p && p.slotRoleCode !== 'GK') || pool[0];

      const matchedPrimary =
        (evt.primaryPlayerId !== null && evt.primaryPlayerId !== undefined && idMap.get(String(evt.primaryPlayerId))) ||
        (evt.primaryPlayerName && idMap.get(String(evt.primaryPlayerName).trim())) ||
        fallbackPrimary;

      let matchedSecondary =
        (evt.secondaryPlayerId !== null && evt.secondaryPlayerId !== undefined && idMap.get(String(evt.secondaryPlayerId))) ||
        (evt.secondaryPlayerName && idMap.get(String(evt.secondaryPlayerName).trim())) ||
        null;

      if (
        matchedSecondary &&
        matchedPrimary &&
        (matchedSecondary.userPlayerId === matchedPrimary.userPlayerId || matchedSecondary.slotRoleCode === 'GK')
      ) {
        matchedSecondary = null;
      }

      return {
        minute: evt.minute || 1,
        type: evt.type,
        team: evt.team,
        primaryPlayerId: matchedPrimary ? matchedPrimary.userPlayerId : null,
        primaryPlayerName: matchedPrimary ? getSafeName(matchedPrimary) : evt.primaryPlayerName,
        secondaryPlayerId: matchedSecondary ? matchedSecondary.userPlayerId : null,
        secondaryPlayerName: matchedSecondary ? getSafeName(matchedSecondary) : null,
        description: evt.description,
        isUserAction: Boolean(evt.isUserAction),
        isPenalty: Boolean(evt.isPenalty),
      };
    });
}

function buildFinishPayload(state) {
  const { homeTeam, awayTeam } = state;
  const totalTicks = Math.max(1, homeTeam.stats.possessionTicks + awayTeam.stats.possessionTicks);
  const homePossession = Math.round((homeTeam.stats.possessionTicks / totalTicks) * 100);
  const cleanEvents = sanitizeTimelineForServer(state.timelineEvents, homeTeam, awayTeam);

  const homeRedsCount = cleanEvents.filter((e) => e.team === 'HOME' && e.type === 'RED_CARD').length;
  const awayRedsCount = cleanEvents.filter((e) => e.team === 'AWAY' && e.type === 'RED_CARD').length;

  const toStats = (team, possession, exactRedCards) => {
    const safeShotsOnTarget = Math.max(team.score || 0, team.stats.shotsOnTarget || 0);
    const safeShots = Math.max(safeShotsOnTarget, team.stats.shots || 0);
    const passAcc =
      team.stats.passesAttempted > 0
        ? Math.round((team.stats.passesCompleted / team.stats.passesAttempted) * 100)
        : 84;
    return {
      possession,
      shots: safeShots,
      shotsOnTarget: safeShotsOnTarget,
      corners: team.stats.corners || 0,
      fouls: team.stats.fouls || 0,
      yellowCards: team.stats.yellowCards || 0,
      redCards: exactRedCards,
      passesAttempted: team.stats.passesAttempted || 0,
      passesCompleted: team.stats.passesCompleted || 0,
      passAccuracy: passAcc,
      tackles: team.stats.tackles || 0,
      saves: team.stats.saves || 0,
    };
  };

  const appeared = [...homeTeam.starters, ...homeTeam.substitutedOut];
  return {
    sessionId: state.sessionId,
    scoreHome: homeTeam.score,
    scoreAway: awayTeam.score,
    homeStats: toStats(homeTeam, homePossession, homeRedsCount),
    awayStats: toStats(awayTeam, 100 - homePossession, awayRedsCount),
    timelineEvents: cleanEvents,
    finalTactics: { ...homeTeam.tactics },
    lockerTalk: state.lockerTalk,
    playerStamina: appeared
      .filter((p) => p && p.userPlayerId > 0)
      .map((p) => {
        const playerGoals = p.goals || 0;
        const validSot = Math.max(playerGoals, p.shotsOnTarget || 0);
        const validShots = Math.max(validSot, p.shots || 0);
        return {
          userPlayerId: p.userPlayerId,
          stamina: Math.max(5, Math.min(100, Math.round(p.currentStamina))),
          minutesPlayed: Math.max(1, Math.min(90, p.minutesPlayed || 1)),
          enteredAsSub: Boolean(p.enteredAsSub),
          saves: p.saves || 0,
          shots: validShots,
          shotsOnTarget: validSot,
          liveRating: Number((p.liveRating ?? 6.0).toFixed(1)),
        };
      }),
  };
}

let tickTimer = null;
let tickerAttached = false;

function stopTicker() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

function syncTicker() {
  stopTicker();
  const state = useLiveMatchStore.getState();
  if (!tickerAttached || state.status !== 'live' || state.isPaused) return;
  tickTimer = setInterval(() => useLiveMatchStore.getState().advanceMinute(), TICK_BASE_MS / state.playbackSpeed);
}

const initialState = {
  status: 'idle',
  matchPhase: 'PRE_MATCH',
  minute: 0,
  addedTime: 0,
  firstHalfAdded: 2,
  secondHalfAdded: 3,
  inStoppageTime: false,
  stoppageElapsed: 0,
  isPaused: false,
  playbackSpeed: 1,
  weather: WEATHER_TYPES[0],
  lastGoalMinute: -10,
  homeTeam: null,
  awayTeam: null,
  currentTickAction: null,
  actionSeq: 0,
  timelineEvents: [],
  sessionId: null,
  context: null,
  scenario: null,
  isHalfTimeModalOpen: false,
  halfTimeSummary: null,
  lockerTalk: null,
  lastTouchlineShoutMinute: -10,
  finishState: { status: 'idle', message: null, report: null },
  lastGoalEvent: null,
  participatedPlayers: [],
};

export const useLiveMatchStore = create((set, get) => ({
  ...initialState,

  clearLastGoalEvent: () => set({ lastGoalEvent: null }),

  /**
   * 캔버스에서 변동된 실시간 평점(liveRating)과 추가 체력 소모(currentStamina)를 스토어의 선수 상태에 동기화함
   */
  syncCanvasPlayerState: (teamSide, slotIndex, { liveRating, currentStamina }) =>
    set((state) => {
      const key = teamSide === 'HOME' ? 'homeTeam' : 'awayTeam';
      const targetTeam = state[key];
      if (!targetTeam || !Array.isArray(targetTeam.starters) || !targetTeam.starters[slotIndex]) return {};
      const updatedStarters = targetTeam.starters.map((p, idx) => {
        if (idx !== slotIndex || !p) return p;
        return {
          ...p,
          liveRating: liveRating !== undefined ? liveRating : p.liveRating,
          rating: liveRating !== undefined ? liveRating : p.rating,
          currentStamina: currentStamina !== undefined ? currentStamina : p.currentStamina,
        };
      });
      return {
        [key]: {
          ...targetTeam,
          starters: updatedStarters,
        },
      };
    }),

  recordCanvasPass: (teamSide, isCompleted = true) =>
    set((state) => {
      const key = teamSide === 'HOME' ? 'homeTeam' : 'awayTeam';
      const targetTeam = state[key];
      if (!targetTeam) return {};
      const attempted = (targetTeam.stats?.passesAttempted || 0) + 1;
      const completed = (targetTeam.stats?.passesCompleted || 0) + (isCompleted ? 1 : 0);
      return {
        [key]: {
          ...targetTeam,
          stats: {
            ...targetTeam.stats,
            passesAttempted: attempted,
            passesCompleted: completed,
            passAccuracy: Math.round((completed / attempted) * 100),
          },
        },
      };
    }),

  recordCanvasTackle: (teamSide, tacklerSlotIndex) =>
    set((state) => {
      const key = teamSide === 'HOME' ? 'homeTeam' : 'awayTeam';
      const targetTeam = state[key];
      if (!targetTeam) return {};
      const updatedStarters = (targetTeam.starters || []).map((p, idx) =>
        idx === tacklerSlotIndex ? { ...p, tackles: (p.tackles || 0) + 1, morale: Math.min(100, (p.morale || 75) + 2) } : p
      );
      return {
        [key]: {
          ...targetTeam,
          starters: updatedStarters,
          stats: {
            ...targetTeam.stats,
            tackles: (targetTeam.stats?.tackles || 0) + 1,
          },
        },
      };
    }),

  recordCanvasCorner: (teamSide, takerName) =>
    set((state) => {
      const minute = Math.max(1, state.minute || 1);
      const key = teamSide === 'HOME' ? 'homeTeam' : 'awayTeam';
      const attTeam = state[key];
      if (!attTeam) return {};
      return {
        [key]: {
          ...attTeam,
          stats: {
            ...attTeam.stats,
            corners: (attTeam.stats?.corners || 0) + 1,
          },
        },
        timelineEvents: [
          ...(state.timelineEvents || []),
          makeInfoEvent(minute, `🚩 [코너킥] ${attTeam.name}의 ${takerName || '키커'} 선수가 코너 플래그에서 문전으로 크로스를 준비합니다.`),
        ],
      };
    }),

    recordCanvasOffside: (attackingSide, playerName) =>
        set((state) => {
          const minute = Math.max(1, state.minute || 1);
          const key = attackingSide === 'HOME' ? 'homeTeam' : 'awayTeam';
          const attTeam = state[key];
          if (!attTeam) return {};
          return {
            [key]: {
              ...attTeam,
              stats: {
                ...attTeam.stats,
                offsides: (attTeam.stats?.offsides || 0) + 1,
              },
            },
            timelineEvents: [
              ...(state.timelineEvents || []),
              makeInfoEvent(minute, `🚩 [오프사이드] ${attTeam.name} ${playerName || '공격수'} 선수의 침투가 오프사이드에 걸립니다.`),
            ],
          };
    }),

  /**
   * 태클 반칙, 경고/퇴장, 프리킥 및 페널티킥 판정을 타임라인과 통계에 기록함
   */
  recordCanvasFoulAndCard: ({ defenderTeamSide, foulerSlotIndex, victimName, isFromBehind, cardSeverity, setPieceResult }) =>
    set((state) => {
      const minute = Math.max(1, state.minute || 1);
      const isHomeDef = defenderTeamSide === 'HOME';
      const defKey = isHomeDef ? 'homeTeam' : 'awayTeam';
      const attKey = isHomeDef ? 'awayTeam' : 'homeTeam';
      const defTeam = cloneTeam(state[defKey]);
      const attTeam = cloneTeam(state[attKey]);
      if (!defTeam || !attTeam) return {};

      const fouler = defTeam.starters[foulerSlotIndex];
      if (!fouler || fouler.isSentOff) return {};

      defTeam.stats.fouls = (defTeam.stats.fouls || 0) + 1;
      if (setPieceResult === 'PENALTY') {
        attTeam.stats.penalties = (attTeam.stats.penalties || 0) + 1;
      } else {
        attTeam.stats.freeKicks = (attTeam.stats.freeKicks || 0) + 1;
      }

      const newEvents = [];
      const foulerName = getSafeName(fouler, '수비수');
      const tackleDesc = isFromBehind ? '위험한 백태클' : '깊숙한 태클';
      const spLabel = setPieceResult === 'PENALTY' ? '페널티킥이 선언됩니다!' : '반칙 지점에서 프리킥으로 재개됩니다.';

      if (cardSeverity === 'DIRECT_RED') {
        fouler.isSentOff = true;
        defTeam.stats.redCards = (defTeam.stats.redCards || 0) + 1;
        newEvents.push(
          makeEvent(
            minute,
            'RED_CARD',
            defTeam,
            fouler,
            null,
            `🟥 [다이렉트 퇴장] ${foulerName} 선수가 ${victimName || '상대 공격수'}에게 ${tackleDesc} 반칙을 범해 퇴장당합니다. (${spLabel})`
          )
        );
      } else if (cardSeverity === 'YELLOW') {
        fouler.yellowCards = (fouler.yellowCards || 0) + 1;
        defTeam.stats.yellowCards = (defTeam.stats.yellowCards || 0) + 1;
        if (fouler.yellowCards >= 2) {
          fouler.isSentOff = true;
          defTeam.stats.redCards = (defTeam.stats.redCards || 0) + 1;
          newEvents.push(
            makeEvent(
              minute,
              'RED_CARD',
              defTeam,
              fouler,
              null,
              `🟨🟥 [경고 누적 퇴장] ${foulerName} 선수가 ${tackleDesc} 반칙으로 두 번째 경고를 받고 퇴장당합니다. (${spLabel})`
            )
          );
        } else {
          newEvents.push(
            makeEvent(
              minute,
              'YELLOW_CARD',
              defTeam,
              fouler,
              null,
              `🟨 [경고] ${foulerName} 선수가 ${victimName || '상대 선수'}에게 ${tackleDesc} 반칙을 범해 옐로카드를 받습니다. (${spLabel})`
            )
          );
        }
      } else {
        newEvents.push(
          makeInfoEvent(minute, `📢 [반칙] ${defTeam.name} ${foulerName} 선수의 파울. ${spLabel}`)
        );
      }

      return {
        [defKey]: defTeam,
        [attKey]: attTeam,
        timelineEvents: [...(state.timelineEvents || []), ...newEvents],
      };
    }),

  recordCanvasShot: (teamSide, isOnTarget = true, shooterSlotIndex = null, resultText = null) =>
    set((state) => {
      const isHome = teamSide === 'HOME';
      const attKey = isHome ? 'homeTeam' : 'awayTeam';
      const defKey = isHome ? 'awayTeam' : 'homeTeam';
      const attTeam = state[attKey];
      const defTeam = state[defKey];
      if (!attTeam || !defTeam) return {};

      const updatedAttStarters = (attTeam.starters || []).map((p, idx) => {
        if (!p || (shooterSlotIndex !== null && idx !== shooterSlotIndex)) return p;
        return {
          ...p,
          shots: (p.shots || 0) + 1,
          shotsOnTarget: (p.shotsOnTarget || 0) + (isOnTarget ? 1 : 0),
        };
      });

      const updatedDefStarters = (defTeam.starters || []).map((p) => {
        if (!p || p.slotRoleCode !== 'GK') return p;
        return isOnTarget ? { ...p, saves: (p.saves || 0) + 1, morale: Math.min(100, (p.morale || 75) + 3) } : p;
      });

      const nextLogs = resultText
        ? [...(state.timelineEvents || []), makeInfoEvent(state.minute || 1, resultText)]
        : state.timelineEvents;

      return {
        [attKey]: {
          ...attTeam,
          starters: updatedAttStarters,
          stats: {
            ...attTeam.stats,
            shots: (attTeam.stats?.shots || 0) + 1,
            shotsOnTarget: (attTeam.stats?.shotsOnTarget || 0) + (isOnTarget ? 1 : 0),
          },
        },
        [defKey]: {
          ...defTeam,
          starters: updatedDefStarters,
          stats: {
            ...defTeam.stats,
            saves: (defTeam.stats?.saves || 0) + (isOnTarget ? 1 : 0),
          },
        },
        timelineEvents: nextLogs,
      };
    }),

  recordActualCanvasGoal: ({
    teamSide,
    shooterSlotIndex,
    scorerName,
    assisterSlotIndex,
    assisterName,
    goalStyle = 'NORMAL',
    isGkMistake = false,
  }) =>
    set((state) => {
      const minute = Math.max(1, state.minute || 1);
      const isHome = teamSide === 'HOME';
      const activeTeam = isHome ? state.homeTeam : state.awayTeam;
      const otherTeam = isHome ? state.awayTeam : state.homeTeam;
      const starters = activeTeam?.starters || [];

      const realScorer =
        starters.find((p, idx) => p && !p.isSentOff && (p.slotIndex === shooterSlotIndex || idx === shooterSlotIndex)) ||
        starters.find((p) => p && !p.isSentOff && (p.name === scorerName || p.safeName === scorerName)) ||
        starters.find((p) => p && !p.isSentOff && p.slotRoleCode !== 'GK') ||
        starters[0];

      // 골키퍼는 어시스트 대상에서 제외하고 단독 돌파로 처리
      let realAssister = null;
      if (!isGkMistake && (assisterSlotIndex !== null && assisterSlotIndex !== undefined || assisterName)) {
        const candidate =
          starters.find(
            (p, idx) => p && !p.isSentOff && p !== realScorer && (p.slotIndex === assisterSlotIndex || idx === assisterSlotIndex)
          ) ||
          starters.find((p) => p && !p.isSentOff && p !== realScorer && (p.name === assisterName || p.safeName === assisterName)) ||
          null;
        if (candidate && candidate.slotRoleCode !== 'GK' && candidate.mainPosition !== 'GK') {
          realAssister = candidate;
        }
      }

      const realScorerId = realScorer?.userPlayerId ?? realScorer?.playerId ?? realScorer?.id ?? 1;
      const realScorerName = getSafeName(realScorer, '스트라이커');
      const realAssisterId = realAssister ? (realAssister.userPlayerId ?? realAssister.playerId ?? realAssister.id) : null;
      const realAssisterName = realAssister ? getSafeName(realAssister, null) : null;

      const updatedStarters = starters.map((p) => {
        if (!p) return p;
        if (p === realScorer) {
          const nextGoals = (p.goals || 0) + 1;
          const nextSot = Math.max(nextGoals, (p.shotsOnTarget || 0) + 1);
          const nextShots = Math.max(nextSot, (p.shots || 0) + 1);
          return {
            ...p,
            goals: nextGoals,
            shotsOnTarget: nextSot,
            shots: nextShots,
            morale: Math.min(100, (p.morale || 75) + 10),
            matchParticipated: true,
          };
        }
        if (realAssister && p === realAssister) {
          return {
            ...p,
            assists: (p.assists || 0) + 1,
            morale: Math.min(100, (p.morale || 75) + 7),
            matchParticipated: true,
          };
        }
        return { ...p, matchParticipated: true };
      });

      const newHomeScore = isHome ? (state.homeTeam.score || 0) + 1 : state.homeTeam.score || 0;
      const newAwayScore = !isHome ? (state.awayTeam.score || 0) + 1 : state.awayTeam.score || 0;

      const styleLabel =
        isGkMistake
          ? '상대 키퍼 실책을 놓치지 않은 단독 돌파 득점'
          : goalStyle === 'PENALTY'
          ? '침착한 페널티킥 성공'
          : goalStyle === 'FREE_KICK'
          ? '예리한 직접 프리킥 득점'
          : goalStyle === 'HEADER'
          ? '높은 타점의 크로스 헤더 골'
          : goalStyle === 'CUT_INSIDE'
          ? '측면 컷인 감아차기 골'
          : goalStyle === 'LONG_SHOT'
          ? '중거리 슈팅 득점'
          : '침투 후 마무리 득점';

      const goalEvt = {
        eventId: `GOAL_${minute}_${Date.now()}`,
        minute,
        type: 'GOAL',
        team: teamSide,
        userPlayerId: realScorerId,
        playerId: realScorer?.playerId ?? realScorerId,
        primaryPlayerId: realScorerId,
        scorerId: realScorerId,
        primaryPlayerName: realScorerName,
        scorerName: realScorerName,
        secondaryPlayerId: realAssisterId,
        assisterId: realAssisterId,
        secondaryPlayerName: realAssisterName,
        assisterName: realAssisterName,
        assistDisplay: realAssisterName ? `🎯 어시스트: ${realAssisterName}` : `⚡ ${styleLabel}`,
        scoreHome: newHomeScore,
        scoreAway: newAwayScore,
        isPenalty: goalStyle === 'PENALTY',
        description: realAssisterName
          ? `⚽ [${minute}'] [${styleLabel}] ${realAssisterName}의 도움을 받은 ${realScorerName}(${realScorer?.slotRoleCode || 'FW'}) 선수가 득점합니다.`
          : `⚽ [${minute}'] [${styleLabel}] ${realScorerName}(${realScorer?.slotRoleCode || 'FW'}) 선수가 단독 돌파로 골망을 흔듭니다.`,
      };

      const updatedTeamStats = {
        ...activeTeam.stats,
        shots: Math.max((activeTeam.stats?.shots || 0) + 1, isHome ? newHomeScore : newAwayScore),
        shotsOnTarget: Math.max((activeTeam.stats?.shotsOnTarget || 0) + 1, isHome ? newHomeScore : newAwayScore),
      };

      const updatedActiveTeam = {
        ...activeTeam,
        score: isHome ? newHomeScore : newAwayScore,
        teamMorale: Math.min(100, (activeTeam.teamMorale || 75) + 8),
        crowdMomentum: Math.min(100, (activeTeam.crowdMomentum || 60) + (isHome ? 12 : 6)),
        starters: updatedStarters,
        stats: updatedTeamStats,
      };

      const updatedOtherTeam = {
        ...otherTeam,
        teamMorale: Math.max(40, (otherTeam.teamMorale || 75) - 6),
      };

      return {
        isPaused: false,
        lastGoalMinute: minute,
        homeTeam: isHome ? updatedActiveTeam : updatedOtherTeam,
        awayTeam: !isHome ? updatedActiveTeam : updatedOtherTeam,
        lastGoalEvent: goalEvt,
        timelineEvents: [...(state.timelineEvents || []), goalEvt],
      };
    }),

  initMatch: ({ home, away, sessionId, context, scenario = null }) => {
    stopTicker();
    const homeTeam = buildFieldTeam({ side: 'HOME', ...home });
    const awayTeam = buildFieldTeam({ side: 'AWAY', ...away });
    const weather = WEATHER_TYPES[Math.floor(Math.random() * WEATHER_TYPES.length)];
    const startMinute = scenario ? scenario.startMinute : 0;
    const firstHalfAdded = 1 + Math.floor(Math.random() * 4); // 전반 추가시간 1~4분 랜덤
    const secondHalfAdded = 2 + Math.floor(Math.random() * 4); // 후반 추가시간 2~5분 랜덤

    const logs = [
      makeInfoEvent(
        startMinute,
        `🏟️ 킥오프: ${homeTeam.name}(평균 OVR ${homeTeam.avgOvr}) vs ${awayTeam.name}(평균 OVR ${awayTeam.avgOvr}) · 날씨: ${weather.label}`
      ),
    ];

    if (scenario) {
      for (let m = 1; m <= startMinute; m++) {
        applyStaminaDrain(homeTeam, weather.staminaMod);
        applyStaminaDrain(awayTeam, weather.staminaMod);
        if (m === MATCH_RULES.HALF_TIME_MINUTE) {
          applyHalfTimeRecovery(homeTeam);
          applyHalfTimeRecovery(awayTeam);
        }
      }
      homeTeam.score = scenario.scoreHome;
      awayTeam.score = scenario.scoreAway;
      homeTeam.stats.shots = Math.max(scenario.scoreHome, 2);
      homeTeam.stats.shotsOnTarget = Math.max(scenario.scoreHome, 1);
      awayTeam.stats.shots = Math.max(scenario.scoreAway, 3);
      awayTeam.stats.shotsOnTarget = Math.max(scenario.scoreAway, 2);
      logs.push(makeInfoEvent(startMinute, `[시나리오] ${scenario.title} · ${startMinute}분 · ${scenario.scoreHome}:${scenario.scoreAway} 상황에서 시작함`));
      if (scenario.homeRedCard) {
        const victim =
          homeTeam.starters.find((p) => p.slotRoleGroup === 'DF' && /CB/.test(p.slotRoleCode)) ||
          homeTeam.starters.find((p) => p.slotRoleGroup === 'DF');
        if (victim) {
          victim.isSentOff = true;
          homeTeam.stats.redCards = 1;
          logs.push(makeEvent(Math.max(1, startMinute - 6), 'RED_CARD', homeTeam, victim, null, `${victim.name} 선수가 레드카드로 퇴장당한 상태임`));
        }
      }
    }

    const kickoffPlayer = homeTeam.starters.find((p) => !p.isSentOff && p.slotRoleGroup === 'MF') || homeTeam.starters.find((p) => !p.isSentOff);
    const isHalfTimeStart = startMinute === MATCH_RULES.HALF_TIME_MINUTE;
    const matchPhase = startMinute >= MATCH_RULES.HALF_TIME_MINUTE ? (isHalfTimeStart ? 'HALF_TIME' : 'SECOND_HALF') : 'FIRST_HALF';

    set({
      ...initialState,
      status: 'live',
      matchPhase,
      minute: startMinute,
      firstHalfAdded,
      secondHalfAdded,
      addedTime: firstHalfAdded,
      inStoppageTime: false,
      stoppageElapsed: 0,
      weather,
      lastGoalMinute: -10,
      isPaused: isHalfTimeStart,
      isHalfTimeModalOpen: isHalfTimeStart,
      halfTimeSummary: isHalfTimeStart
        ? {
            scoreHome: homeTeam.score,
            scoreAway: awayTeam.score,
            homeStats: { ...homeTeam.stats, possession: 50 },
            awayStats: { ...awayTeam.stats, possession: 50 },
            homeRecovery: aliveOf(homeTeam).map((p) => ({
              id: p.id,
              name: p.name,
              slotRoleCode: p.slotRoleCode,
              before: p.currentStamina,
              after: p.currentStamina,
            })),
          }
        : null,
      homeTeam,
      awayTeam,
      sessionId,
      context,
      scenario,
      participatedPlayers: [...homeTeam.starters],
      actionSeq: 1,
      currentTickAction: {
        seq: 1,
        minute: startMinute,
        eventType: 'NORMAL',
        attackingTeam: 'HOME',
        ballCarrierId: kickoffPlayer ? kickoffPlayer.id : null,
        passTargetId: null,
      },
      timelineEvents: logs,
    });
    syncTicker();
  },

  /**
   * 전/후반 정규시간 종료 후 랜덤 추가시간(Stoppage Time)을 진행한 뒤 종료함
   */
  advanceMinute: () => {
    const state = get();
    if (state.status !== 'live' || state.isPaused) return;
    if (state.matchPhase !== 'FIRST_HALF' && state.matchPhase !== 'SECOND_HALF') return;

    const home = cloneTeam(state.homeTeam);
    const away = cloneTeam(state.awayTeam);
    const logs = [...state.timelineEvents];
    const seq = state.actionSeq + 1;

    let nextMinute = state.minute;
    let inStoppage = state.inStoppageTime;
    let stoppageElapsed = state.stoppageElapsed;

    if (state.matchPhase === 'FIRST_HALF') {
      if (state.minute < MATCH_RULES.HALF_TIME_MINUTE) {
        nextMinute = state.minute + 1;
        if (nextMinute === MATCH_RULES.HALF_TIME_MINUTE) {
          inStoppage = true;
          stoppageElapsed = 0;
          logs.push(makeInfoEvent(45, `⏱️ 전반전 정규시간 종료 · 추가시간 ${state.firstHalfAdded}분이 적용됩니다.`));
        }
      } else {
        stoppageElapsed += 1;
      }
    } else if (state.matchPhase === 'SECOND_HALF') {
      if (state.minute < MATCH_RULES.MATCH_MINUTES) {
        nextMinute = state.minute + 1;
        if (nextMinute === MATCH_RULES.MATCH_MINUTES) {
          inStoppage = true;
          stoppageElapsed = 0;
          logs.push(makeInfoEvent(90, `⏱️ 후반전 정규시간 종료 · 추가시간 ${state.secondHalfAdded}분이 적용됩니다.`));
        }
      } else {
        stoppageElapsed += 1;
      }
    }

    const { events, action } = simulateSingleMinuteTick(home, away, nextMinute, state.weather);
    logs.push(...events);

    const patch = {
      minute: nextMinute,
      inStoppageTime: inStoppage,
      stoppageElapsed,
      homeTeam: home,
      awayTeam: away,
      actionSeq: seq,
      currentTickAction: { ...action, seq },
    };

    if (state.matchPhase === 'FIRST_HALF' && inStoppage && stoppageElapsed >= state.firstHalfAdded) {
      const homeRecovery = applyHalfTimeRecovery(home);
      applyHalfTimeRecovery(away);
      const totalTicks = Math.max(1, home.stats.possessionTicks + away.stats.possessionTicks);
      const homePossession = Math.round((home.stats.possessionTicks / totalTicks) * 100);
      logs.push(makeInfoEvent(45, `🔔 전반전 종료 (45+${state.firstHalfAdded}') · ${home.name} ${home.score} : ${away.score} ${away.name}`));
      Object.assign(patch, {
        matchPhase: 'HALF_TIME',
        inStoppageTime: false,
        stoppageElapsed: 0,
        addedTime: state.secondHalfAdded,
        isPaused: true,
        isHalfTimeModalOpen: true,
        halfTimeSummary: {
          scoreHome: home.score,
          scoreAway: away.score,
          homeStats: { ...home.stats, possession: homePossession },
          awayStats: { ...away.stats, possession: 100 - homePossession },
          homeRecovery,
        },
      });
    }

    if (state.matchPhase === 'SECOND_HALF' && inStoppage && stoppageElapsed >= state.secondHalfAdded) {
      logs.push(makeInfoEvent(90, `🏁 경기 종료 휘슬 (90+${state.secondHalfAdded}') · 최종 스코어 ${home.name} ${home.score} : ${away.score} ${away.name}`));
      Object.assign(patch, {
        status: 'finished',
        matchPhase: 'FULL_TIME',
        inStoppageTime: false,
        isPaused: true,
      });
    }

    patch.timelineEvents = logs;
    set(patch);
    syncTicker();
    if (patch.status === 'finished') get().submitResult();
  },

  pauseMatch: () => {
    if (get().status !== 'live') return;
    set({ isPaused: true });
    syncTicker();
  },

  resumeMatch: () => {
    const state = get();
    if (state.status !== 'live' || state.matchPhase === 'HALF_TIME') return;
    set({ isPaused: false });
    syncTicker();
  },

  togglePause: () => {
    if (get().isPaused) get().resumeMatch();
    else get().pauseMatch();
  },

  setPlaybackSpeed: (speed) => {
    set({ playbackSpeed: speed });
    syncTicker();
  },

  /**
   * 하프타임 라커룸 토크 선택 (후반 시작 전까지 다른 선택지로 언제든 변경 가능)
   */
  selectLockerTalk: (type) => {
    const state = get();
    if (state.matchPhase !== 'HALF_TIME') return { success: false, message: '하프타임에만 라커룸 토크를 선택할 수 있습니다.' };
    if (!LOCKER_TALKS[type]) return { success: false, message: '알 수 없는 라커룸 토크입니다.' };

    const team = cloneTeam(state.homeTeam);
    const away = state.awayTeam;
    const scoreDiff = team.score - away.score;
    const sternEffective = scoreDiff <= 1;

    team.talkEffect = getTalkEffect(type, sternEffective);
    team.teamMorale = Math.min(100, 78 + (sternEffective ? 12 : 8));
    const description = `[라커룸 토크] 🗣️ ${LOCKER_TALKS[type].label} 선택: ${LOCKER_TALKS[type].desc}`;

    // 기존 라커룸 토크 로그를 교체하거나 추가
    const filteredLogs = state.timelineEvents.filter((e) => !String(e.description || '').startsWith('[라커룸 토크]'));
    set({
      homeTeam: team,
      lockerTalk: type,
      timelineEvents: [...filteredLogs, makeEvent(state.minute, 'TACTIC_CHANGE', team, null, null, description, true)],
    });
    return { success: true, message: description };
  },

  /**
   * 경기 중 터치라인 지시 (사기 및 경기력 실시간 상승)
   */
  issueTouchlineShout: (shoutKey) => {
    const state = get();
    if (state.status !== 'live') return { success: false, message: '경기 진행 중에만 터치라인 지시를 내릴 수 있습니다.' };
    const shout = TOUCHLINE_SHOUTS[shoutKey];
    if (!shout) return { success: false, message: '유효하지 않은 터치라인 지시입니다.' };
    if (state.minute - (state.lastTouchlineShoutMinute ?? -10) < 5) {
      return { success: false, message: '터치라인 지시는 5분 간격으로 사용할 수 있습니다.' };
    }

    const team = cloneTeam(state.homeTeam);
    team.touchlineShout = shoutKey;
    team.teamMorale = Math.min(100, (team.teamMorale || 75) + shout.moraleBoost);
    team.talkEffect = {
      ...team.talkEffect,
      atkMul: (team.talkEffect?.atkMul || 1) * shout.atkMul,
      defMul: (team.talkEffect?.defMul || 1) * shout.defMul,
    };
    team.starters = team.starters.map((p) =>
      p && !p.isSentOff
        ? {
            ...p,
            morale: Math.min(100, (p.morale || 75) + shout.moraleBoost),
            liveRating: Math.min(10, Number(((p.liveRating ?? 6.0) + 0.1).toFixed(2))),
          }
        : p
    );

    const description = `[터치라인 지시] 📢 ${shout.label}: ${shout.desc}`;
    set({
      homeTeam: team,
      lastTouchlineShoutMinute: state.minute,
      timelineEvents: [...state.timelineEvents, makeEvent(state.minute, 'TACTIC_CHANGE', team, null, null, description, true)],
    });
    return { success: true, message: description };
  },

  startSecondHalf: () => {
    const state = get();
    if (state.matchPhase !== 'HALF_TIME') return;
    const kickoffPlayer = state.awayTeam.starters.find((p) => !p.isSentOff && p.slotRoleGroup === 'MF') || aliveOf(state.awayTeam)[0];
    const seq = state.actionSeq + 1;
    set({
      matchPhase: 'SECOND_HALF',
      inStoppageTime: false,
      stoppageElapsed: 0,
      isPaused: false,
      isHalfTimeModalOpen: false,
      actionSeq: seq,
      currentTickAction: {
        seq,
        minute: state.minute,
        eventType: 'KICKOFF',
        attackingTeam: 'AWAY',
        ballCarrierId: kickoffPlayer ? kickoffPlayer.id : null,
        passTargetId: null,
      },
      timelineEvents: [...state.timelineEvents, makeInfoEvent(state.minute, '⚽ 후반전 킥오프: 양 팀 선수들이 그라운드로 복귀합니다.')],
    });
    syncTicker();
  },

  makeUserSubstitution: (fieldSlotIndex, benchPlayerId) => {
    const state = get();
    if (state.status !== 'live') return { success: false, message: '진행 중인 경기가 아닙니다.' };
    const team = cloneTeam(state.homeTeam);
    if (team.subsLeft <= 0) {
      return { success: false, message: `교체 카드를 모두 사용했습니다 (최대 ${MATCH_RULES.MAX_SUBSTITUTIONS}장).` };
    }
    const playerOut = team.starters[fieldSlotIndex];
    if (!playerOut) return { success: false, message: '교체 아웃할 슬롯을 찾을 수 없습니다.' };
    if (playerOut.isSentOff) return { success: false, message: '퇴장당한 슬롯의 선수는 교체할 수 없습니다.' };
    const playerIn = team.bench.find((p) => p.id === benchPlayerId);
    if (!playerIn) return { success: false, message: '벤치에서 투입할 선수를 찾을 수 없습니다.' };
    const outSnapshot = { ...playerOut };
    const incoming = substitutePlayer(team, playerOut, playerIn);
    const description = `[유저 감독 지시] 🔄 교체 투입: IN ${incoming.name}(${incoming.slotRoleCode}, OVR ${incoming.computedOvr}) / OUT ${outSnapshot.name}`;
    const seq = state.actionSeq + 1;
    set({
      homeTeam: team,
      actionSeq: seq,
      participatedPlayers: [...(state.participatedPlayers || []), outSnapshot, incoming],
      currentTickAction: {
        ...(state.currentTickAction || {}),
        seq,
        minute: state.minute,
        eventType: 'SUB',
        subInId: incoming.id,
        shooterId: null,
        passTargetId: null,
      },
      timelineEvents: [...state.timelineEvents, makeEvent(state.minute, 'SUBSTITUTION', team, incoming, outSnapshot, description, true)],
    });
    return {
      success: true,
      message: `🔄 선수 교체 완료: IN ${incoming.name}(${incoming.slotRoleCode}, 체력 ${Math.round(incoming.currentStamina)}%) / OUT ${outSnapshot.name} (남은 교체 ${team.subsLeft}장)`,
    };
  },

  swapFieldPositions: (slotIndexA, slotIndexB) => {
    const state = get();
    if (state.status !== 'live') return { success: false, message: '진행 중인 경기가 아닙니다.' };
    if (slotIndexA === slotIndexB) return { success: false, message: '서로 다른 두 슬롯을 선택해주세요.' };
    const team = cloneTeam(state.homeTeam);
    const a = team.starters[slotIndexA];
    const b = team.starters[slotIndexB];
    if (!a || !b) return { success: false, message: '유효하지 않은 슬롯입니다.' };
    if (a.isSentOff && b.isSentOff) return { success: false, message: '퇴장 공석끼리는 위치를 바꿀 수 없습니다.' };
    swapSlots(team, slotIndexA, slotIndexB);
    const movedA = team.starters[slotIndexB];
    const movedB = team.starters[slotIndexA];
    let description;
    let message;
    if (a.isSentOff || b.isSentOff) {
      const alive = a.isSentOff ? movedB : movedA;
      const aliveBefore = a.isSentOff ? b : a;
      description = `[포지션 변경] 🔁 ${alive.name}(${aliveBefore.slotRoleCode} → ${alive.slotRoleCode}로 이동) 퇴장 공석 보강`;
      message = `🔁 퇴장 공석 보강: ${alive.name} → ${alive.slotRoleCode} (${FAMILIARITY_META[alive.familiarity].label})`;
    } else {
      description = `[포지션 변경] 🔁 ${a.name}(${movedA.slotRoleCode}) ↔ ${b.name}(${movedB.slotRoleCode}) 위치 스왑`;
      message = `🔁 포지션 맞교환 완료: ${a.name}(${movedA.slotRoleCode}) ↔ ${b.name}(${movedB.slotRoleCode})`;
    }
    set({
      homeTeam: team,
      timelineEvents: [...state.timelineEvents, makeEvent(state.minute, 'TACTIC_CHANGE', team, null, null, description, true)],
    });
    return { success: true, message };
  },

  changeFormation: (newFormation) => {
    const state = get();
    if (state.status !== 'live') return { success: false, message: '진행 중인 경기가 아닙니다.' };
    if (!FORMATIONS[newFormation]) return { success: false, message: '지원하지 않는 포메이션입니다.' };
    if (newFormation === state.homeTeam.formation) return { success: false, message: '이미 적용된 포메이션입니다.' };
    const team = cloneTeam(state.homeTeam);
    const previous = team.formation;
    rebuildStartersForFormation(team, newFormation);
    const description = `[유저 감독 지시] ⚙️ 포메이션 변경: ${previous} → ${newFormation}`;
    set({
      homeTeam: team,
      timelineEvents: [...state.timelineEvents, makeEvent(state.minute, 'TACTIC_CHANGE', team, null, null, description, true)],
    });
    return { success: true, message: description };
  },

  updateTeamTactics: (partial) => {
    const state = get();
    if (state.status !== 'live') return { success: false, message: '진행 중인 경기가 아닙니다.' };
    const team = cloneTeam(state.homeTeam);
    const changes = [];
    for (const group of TEAM_TACTIC_GROUPS) {
      const next = partial[group.key];
      if (next === undefined || next === team.tactics[group.key]) continue;
      if (!group.options.some((o) => o.value === next)) return { success: false, message: `${group.label} 값이 올바르지 않습니다.` };
      changes.push(`${group.label} ${TEAM_TACTIC_LABELS[group.key][team.tactics[group.key]]} → ${TEAM_TACTIC_LABELS[group.key][next]}`);
      team.tactics[group.key] = next;
    }
    if (changes.length === 0) return { success: false, message: '변경된 내용이 없습니다.' };
    const description = `[유저 감독 지시] ⚙️ 팀 전술 변경: ${changes.join(' / ')}`;
    set({
      homeTeam: team,
      timelineEvents: [...state.timelineEvents, makeEvent(state.minute, 'TACTIC_CHANGE', team, null, null, description, true)],
    });
    return { success: true, message: description };
  },

  setPlayerInstruction: (slotIndex, instruction) => {
    const state = get();
    if (state.status !== 'live') return { success: false, message: '진행 중인 경기가 아닙니다.' };
    const team = cloneTeam(state.homeTeam);
    const player = team.starters[slotIndex];
    if (!player) return { success: false, message: '유효하지 않은 슬롯입니다.' };
    if (player.isSentOff) return { success: false, message: '퇴장당한 선수에게는 지침을 줄 수 없습니다.' };
    if (!isValidInstruction(player.slotRoleCode, instruction)) {
      return { success: false, message: `${getInstructionCategory(player.slotRoleCode)} 포지션에서 사용할 수 없는 지침입니다.` };
    }
    if (player.instruction === instruction) return { success: false, message: '이미 적용된 지침입니다.' };
    const description = `[개인 지침] 🎯 ${player.name}(${player.slotRoleCode}): ${INSTRUCTION_DEFS[player.instruction]?.label || '기본'} → ${INSTRUCTION_DEFS[instruction].label}`;
    team.starters[slotIndex] = { ...player, instruction };
    set({
      homeTeam: team,
      timelineEvents: [...state.timelineEvents, makeEvent(state.minute, 'TACTIC_CHANGE', team, null, null, description, true)],
    });
    return { success: true, message: description };
  },

  submitResult: async () => {
    const state = get();
    if (state.finishState.status === 'saving' || state.finishState.status === 'saved') return;
    if (state.status !== 'finished') return;
    set({ finishState: { status: 'saving', message: null, report: null } });
    try {
      const report = await finishLiveMatch(buildFinishPayload(state));
      set({ finishState: { status: 'saved', message: null, report } });
    } catch (err) {
      set({ finishState: { status: 'error', message: errorMessage(err, '서버에 결과를 저장하지 못했습니다.'), report: null } });
    }
  },

  attachTicker: () => {
    tickerAttached = true;
    syncTicker();
  },

  detachTicker: () => {
    tickerAttached = false;
    stopTicker();
  },

  resetMatch: () => {
    stopTicker();
    set({ ...initialState });
  },
}));

export default useLiveMatchStore;