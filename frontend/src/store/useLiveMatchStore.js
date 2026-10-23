import { create } from 'zustand';
import { FORMATIONS, getFormationSlots } from '../constants/formations.js';
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
  { code: 'SUNNY', label: '☀️ 맑음 (쾌적한 잔디)', passMod: 1.0, speedMod: 1.0, staminaMod: 1.0, longShotMod: 1.0 },
  { code: 'RAINY', label: '🌧️ 우천 (미끄러운 잔디 · 슬라이딩 태클 빈도↑)', passMod: 0.92, speedMod: 0.95, staminaMod: 1.1, longShotMod: 1.15 },
  { code: 'WINDY', label: '💨 강풍 (롱패스 변칙 궤적)', passMod: 0.95, speedMod: 0.98, staminaMod: 1.04, longShotMod: 1.08 },
  { code: 'NIGHT_CLEAR', label: '🌙 야간 경기 (최상의 집중력)', passMod: 1.03, speedMod: 1.02, staminaMod: 0.97, longShotMod: 1.02 },
];

export function getSafeName(player, fallback = '출전 선수') {
  if (!player) return fallback;
  if (typeof player === 'string') {
    const s = player.trim();
    return s && !s.toLowerCase().includes('undefined') && !s.toLowerCase().includes('null') ? s : fallback;
  }
  const rawName = player.name || player.safeName || player.playerName || player.koreanName || player.label;
  if (!rawName || String(rawName).toLowerCase().includes('undefined') || String(rawName).trim() === '') {
    return `${player.slotRoleCode || player.mainPosition || 'FW'} #${player.backNumber || 9}`;
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
  };
  const builtStarters = starters.map((p, i) => {
    const slot = slots[i] || { baseX: 50, baseY: 50, label: 'CM', role: 'MF' };
    const player = applySlotToPlayer(
      { ...p, ...matchState, currentStamina: p.stamina ?? 100, instruction: p.instruction || undefined },
      slot
    );
    player.uid = `${side}_${i}`;
    player.slotIndex = i;
    player.computedOvr = calcPlayerOvr(player);
    return player;
  });
  const builtBench = (bench || []).map((p, bIdx) => ({
    ...p,
    ...matchState,
    slotIndex: null,
    slotRoleGroup: p.mainPosition,
    slotRoleCode: p.mainPosition,
    role: p.mainPosition,
    label: p.mainPosition,
    baseX: 50,
    baseY: 50,
    naturalPosition: p.mainPosition,
    familiarity: 'NATURAL',
    familiarityMultiplier: 1,
    instruction: null,
    currentStamina: p.stamina ?? 100,
    computedOvr: calcPlayerOvr(p),
    uid: `${side}_B_${p.id || bIdx}`,
  }));
  const teamObj = {
    side,
    clubId,
    name,
    emblem: emblem || null,
    formation,
    tactics: { ...DEFAULT_TEAM_TACTICS, ...(tactics || {}) },
    talkEffect: { ...NEUTRAL_TALK_EFFECT },
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

function randomPick(arr) {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
}

function makeEvent(minute, type, team, primary, secondary, description, isUserAction = false) {
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

export function applyStaminaDrain(team, weatherMod = 1.0) {
  const teamMod = getTeamStaminaMod(team.tactics);
  for (const p of aliveOf(team)) {
    const baseTickDrain = MATCH_RULES.BASE_TICK_DRAIN_MIN + Math.random() * MATCH_RULES.BASE_TICK_DRAIN_RANGE;
    const posMod = POSITION_STAMINA_DRAIN_MULTIPLIER[p.slotRoleCode] || DEFAULT_POSITION_DRAIN;
    const teamTacticMod = p.slotRoleCode === 'GK' ? 0.35 : teamMod;
    const playerInstMod = getInstructionDef(p.instruction).staminaMul;
    const finalDrain = baseTickDrain * posMod * teamTacticMod * playerInstMod * weatherMod;
    p.currentStamina = Math.max(MATCH_RULES.MIN_STAMINA, Number((p.currentStamina - finalDrain).toFixed(2)));
    p.minutesPlayed = (p.minutesPlayed || 0) + 1;
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
    getTacticEffect(t, 'passingStyle').possMul *
    getTacticEffect(t, 'defensiveLine').possMul *
    getTacticEffect(t, 'pressing').possMul *
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

function runAiPlanB(team, opponent, minute, events) {
  const liveDefenders = aliveOf(team).filter((p) => p.slotRoleGroup === 'DF');
  const benchDefenders = team.bench.filter((p) => p.mainPosition === 'DF');
  const liveForwards = aliveOf(team).filter((p) => p.slotRoleGroup === 'FW');
  const vacatedDefenderSlot = team.starters.find((p) => p.isSentOff && p.slotRoleGroup === 'DF');
  if (liveDefenders.length < 3 && team.subsLeft > 0 && benchDefenders.length > 0 && liveForwards.length >= 2 && vacatedDefenderSlot) {
    const playerOut = liveForwards.reduce((min, p) => (p.currentStamina < min.currentStamina ? p : min));
    const playerIn = benchDefenders.reduce((best, p) => (calcPlayerOvr(p) > calcPlayerOvr(best) ? p : best));
    const outSnapshot = { ...playerOut };
    const incomingAtForwardSlot = substitutePlayer(team, playerOut, playerIn);
    swapSlots(team, incomingAtForwardSlot.slotIndex, vacatedDefenderSlot.slotIndex);
    const incoming = team.starters[vacatedDefenderSlot.slotIndex];
    events.push(makeEvent(minute, 'SUBSTITUTION', team, incoming, outSnapshot, '수비수 퇴장 공백을 메우기 위한 전술적 수비 보강 교체'));
    if (team.tactics.mentality !== 'DEFENSIVE' && team.tactics.mentality !== 'PARK_THE_BUS') {
      team.tactics.mentality = 'DEFENSIVE';
      team.tactics.defensiveLine = 'DEEP';
      events.push(makeEvent(minute, 'TACTIC_CHANGE', team, null, null, '수적 열세를 극복하기 위해 두 줄 수비 블록을 형성합니다.'));
    }
  }
  if (minute >= MATCH_RULES.PLAN_B_ROTATION_MINUTE && team.subsLeft > 0) {
    const exhausted = aliveOf(team).filter((p) => p.currentStamina <= MATCH_RULES.PLAN_B_ROTATION_STAMINA || p.isInjured);
    for (const playerOut of exhausted) {
      if (team.subsLeft <= 0) break;
      const replacements = team.bench.filter((p) => p.mainPosition === playerOut.slotRoleGroup);
      if (replacements.length === 0) continue;
      const playerIn = replacements.reduce((best, p) => (calcPlayerOvr(p) > calcPlayerOvr(best) ? p : best));
      const outSnapshot = { ...playerOut };
      const incoming = substitutePlayer(team, playerOut, playerIn);
      events.push(makeEvent(minute, 'SUBSTITUTION', team, incoming, outSnapshot, '체력 저하 및 부상 방지를 위한 로테이션 교체'));
    }
  }
  if (minute === MATCH_RULES.ALL_IN_MINUTE) {
    const deficit = opponent.score - team.score;
    if (deficit >= 1 && deficit <= 2 && team.tactics.mentality !== 'ALL_OUT_ATTACK') {
      team.tactics.mentality = 'ALL_OUT_ATTACK';
      events.push(makeEvent(minute, 'TACTIC_CHANGE', team, null, null, '패배 위기! 라인을 최대로 끌어올려 총공세(All-Out Attack)를 지시합니다!'));
    }
  }
}

export function simulateSingleMinuteTick(home, away, minute, weather) {
  const events = [];
  const weatherMod = weather?.staminaMod || 1.0;
  applyStaminaDrain(home, weatherMod);
  applyStaminaDrain(away, weatherMod);
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

  if (Math.random() < 0.04) {
    const spRoll = Math.random();
    if (spRoll < 0.5) {
      attacker.stats.corners++;
      action.eventType = 'SET_PIECE';
      action.setPieceType = 'CORNER';
      events.push(makeInfoEvent(minute, `🚩 [코너킥] ${attacker.name}의 측면 돌파가 수비 맞고 나가며 코너킥 찬스를 얻습니다.`));
    } else {
      attacker.stats.freeKicks = (attacker.stats.freeKicks || 0) + 1;
      action.eventType = 'SET_PIECE';
      action.setPieceType = 'FREE_KICK';
      events.push(makeInfoEvent(minute, `🎯 [프리킥 찬스] ${attacker.name}, 위험 지역에서 프리킥 기회를 잡습니다.`));
    }
  }

  return { events, action };
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
  const assigned = assignPlayersByFamiliarity(alive, freeIndexes.map((i) => slots[i]));
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

      if (matchedSecondary && matchedPrimary && matchedSecondary.userPlayerId === matchedPrimary.userPlayerId) {
        matchedSecondary = null;
      }

      return {
        minute: evt.minute || 1,
        type: evt.type,
        team: evt.team,
        primaryPlayerId: matchedPrimary ? matchedPrimary.userPlayerId : null,
        primaryPlayerName: matchedPrimary ? matchedPrimary.name : evt.primaryPlayerName,
        secondaryPlayerId: matchedSecondary ? matchedSecondary.userPlayerId : null,
        secondaryPlayerName: matchedSecondary ? matchedSecondary.name : null,
        description: evt.description,
        isUserAction: Boolean(evt.isUserAction),
      };
    });
}

function buildFinishPayload(state) {
  const { homeTeam, awayTeam } = state;
  const totalTicks = Math.max(1, homeTeam.stats.possessionTicks + awayTeam.stats.possessionTicks);
  const homePossession = Math.round((homeTeam.stats.possessionTicks / totalTicks) * 100);
  const cleanEvents = sanitizeTimelineForServer(state.timelineEvents, homeTeam, awayTeam);

  // 레드카드 이벤트 수와 팀 레드카드 통계를 정확히 일치시켜 서버 검증 통과 보장
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
          stamina: Math.max(0, Math.min(100, Math.round(p.currentStamina))),
          minutesPlayed: Math.max(1, Math.min(MATCH_RULES.MATCH_MINUTES, p.minutesPlayed || 1)),
          enteredAsSub: Boolean(p.enteredAsSub),
          saves: p.saves || 0,
          shots: validShots,
          shotsOnTarget: validSot,
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
  finishState: { status: 'idle', message: null, report: null },
  lastGoalEvent: null,
  participatedPlayers: [],
};

export const useLiveMatchStore = create((set, get) => ({
  ...initialState,

  clearLastGoalEvent: () => set({ lastGoalEvent: null }),

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

  /**
   * [신규 핵심 액션] 캔버스에서 슬라이딩 태클 파울 및 백태클(악의성 기반 경고/다이렉트 퇴장) 발생 시 즉시 반영
   */
  recordCanvasFoulAndCard: ({ defenderTeamSide, foulerSlotIndex, victimName, isFromBehind, cardSeverity }) =>
    set((state) => {
      const minute = Math.max(1, state.minute || 1);
      const isHomeDef = defenderTeamSide === 'HOME';
      const defKey = isHomeDef ? 'homeTeam' : 'awayTeam';
      const defTeam = cloneTeam(state[defKey]);
      if (!defTeam) return {};

      const fouler = defTeam.starters[foulerSlotIndex];
      if (!fouler || fouler.isSentOff) return {};

      defTeam.stats.fouls = (defTeam.stats.fouls || 0) + 1;
      const newEvents = [];
      const foulerName = getSafeName(fouler, '수비수');
      const tackleDesc = isFromBehind ? '위험한 뒤쪽 백태클(Back Tackle)' : '깊숙한 슬라이딩 태클';

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
            `🟥 [다이렉트 퇴장!] ${foulerName} 선수가 ${victimName || '상대 공격수'}에게 악의적인 ${tackleDesc}을 가해 주심이 지체 없이 레드카드를 꺼내듭니다!`
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
              `🟨🟥 [경고 누적 퇴장!] ${foulerName} 선수가 거친 ${tackleDesc}로 두 번째 옐로카드를 받고 퇴장당합니다!`
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
              `🟨 [경고] ${foulerName} 선수, 돌파하던 ${victimName || '상대 선수'}를 향한 ${tackleDesc} 반칙으로 옐로카드를 받습니다.`
            )
          );
        }
      } else {
        newEvents.push(makeInfoEvent(minute, `📢 [파울] ${defTeam.name} ${foulerName} 선수의 슬라이딩 태클 반칙이 선언됩니다.`));
      }

      return {
        [defKey]: defTeam,
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
            corners: (attTeam.stats?.corners || 0) + (isOnTarget && Math.random() < 0.35 ? 1 : 0),
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

  recordActualCanvasGoal: ({ teamSide, shooterSlotIndex, scorerName, assisterSlotIndex, assisterName, goalStyle = 'NORMAL' }) =>
    set((state) => {
      const minute = Math.max(1, state.minute || 1);
      const isHome = teamSide === 'HOME';
      const activeTeam = isHome ? state.homeTeam : state.awayTeam;
      const otherTeam = isHome ? state.awayTeam : state.homeTeam;
      const starters = activeTeam?.starters || [];

      let realScorer =
        starters.find((p, idx) => p && !p.isSentOff && (p.slotIndex === shooterSlotIndex || idx === shooterSlotIndex)) ||
        starters.find((p) => p && !p.isSentOff && (p.name === scorerName || p.safeName === scorerName)) ||
        starters.find((p) => p && !p.isSentOff && p.slotRoleCode !== 'GK') ||
        starters[0];

      let realAssister = null;
      if (assisterSlotIndex !== undefined || assisterName) {
        realAssister =
          starters.find((p, idx) => p && !p.isSentOff && p !== realScorer && (p.slotIndex === assisterSlotIndex || idx === assisterSlotIndex)) ||
          starters.find((p) => p && !p.isSentOff && p !== realScorer && (p.name === assisterName || p.safeName === assisterName)) ||
          null;
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
        goalStyle === 'CUT_INSIDE'
          ? '인사이드 포워드 측면 컷인 감아차기 골!'
          : goalStyle === 'LONG_SHOT'
          ? '환상적인 중거리 대포알 원더골!'
          : goalStyle === 'TIKI_TAKA'
          ? '티키타카 패스 워크에 이은 마무리!'
          : '날카로운 침투에 이은 마무리 슈팅 득점!';

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
        description: realAssisterName
          ? `⚽ [${minute}'] [${styleLabel}] ${realAssisterName}의 패스를 받은 ${realScorerName}(${realScorer?.slotRoleCode || 'FW'}) 선수가 골망을 흔듭니다!`
          : `⚽ [${minute}'] [${styleLabel}] ${realScorerName}(${realScorer?.slotRoleCode || 'FW'}) 선수가 단독 돌파 후 득점합니다!`,
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
    const logs = [
      makeInfoEvent(
        startMinute,
        `🏟️ 킥오프! ${homeTeam.name}(평균 OVR ${homeTeam.avgOvr}) vs ${awayTeam.name}(평균 OVR ${awayTeam.avgOvr}) · 날씨: ${weather.label}`
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
      logs.push(makeInfoEvent(startMinute, `[시나리오] ${scenario.title} · ${startMinute}분 · ${scenario.scoreHome}:${scenario.scoreAway} 상황에서 시작합니다.`));
      if (scenario.homeRedCard) {
        const victim =
          homeTeam.starters.find((p) => p.slotRoleGroup === 'DF' && /CB/.test(p.slotRoleCode)) ||
          homeTeam.starters.find((p) => p.slotRoleGroup === 'DF');
        if (victim) {
          victim.isSentOff = true;
          homeTeam.stats.redCards = 1;
          logs.push(makeEvent(Math.max(1, startMinute - 6), 'RED_CARD', homeTeam, victim, null, `${victim.name} 선수가 레드카드로 퇴장당했습니다!`));
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

  advanceMinute: () => {
    const state = get();
    if (state.status !== 'live' || state.isPaused) return;
    if (state.matchPhase !== 'FIRST_HALF' && state.matchPhase !== 'SECOND_HALF') return;

    const minute = state.minute + 1;
    const home = cloneTeam(state.homeTeam);
    const away = cloneTeam(state.awayTeam);
    const { events, action } = simulateSingleMinuteTick(home, away, minute, state.weather);
    const logs = [...state.timelineEvents, ...events];
    const seq = state.actionSeq + 1;

    const patch = {
      minute,
      homeTeam: home,
      awayTeam: away,
      actionSeq: seq,
      currentTickAction: { ...action, seq },
    };

    if (minute === MATCH_RULES.HALF_TIME_MINUTE && state.matchPhase === 'FIRST_HALF') {
      const homeRecovery = applyHalfTimeRecovery(home);
      applyHalfTimeRecovery(away);
      const totalTicks = Math.max(1, home.stats.possessionTicks + away.stats.possessionTicks);
      const homePossession = Math.round((home.stats.possessionTicks / totalTicks) * 100);
      logs.push(makeInfoEvent(minute, `🔔 전반전 종료 (하프타임) · ${home.name} ${home.score} : ${away.score} ${away.name}`));
      Object.assign(patch, {
        matchPhase: 'HALF_TIME',
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

    if (minute >= MATCH_RULES.MATCH_MINUTES) {
      logs.push(makeInfoEvent(minute, `🏁 경기 종료 휘슬! 최종 스코어 ${home.name} ${home.score} : ${away.score} ${away.name}`));
      Object.assign(patch, { status: 'finished', matchPhase: 'FULL_TIME', isPaused: true });
    }

    patch.timelineEvents = logs;
    set(patch);
    syncTicker();
    if (minute >= MATCH_RULES.MATCH_MINUTES) get().submitResult();
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

  selectLockerTalk: (type) => {
    const state = get();
    if (state.matchPhase !== 'HALF_TIME') return { success: false, message: '하프타임에만 라커룸 토크를 할 수 있습니다.' };
    if (state.lockerTalk) return { success: false, message: '라커룸 토크는 하프타임에 한 번만 할 수 있습니다.' };
    if (!LOCKER_TALKS[type]) return { success: false, message: '알 수 없는 라커룸 토크입니다.' };
    const team = cloneTeam(state.homeTeam);
    const isLosing = team.score < state.awayTeam.score;
    team.talkEffect = getTalkEffect(type, isLosing);
    team.teamMorale = Math.min(100, (team.teamMorale || 75) + 12);
    const note = type === 'STERN' && !isLosing ? ' (앞서거나 비기고 있어 효과가 반감됩니다)' : '';
    const description = `[라커룸 토크] 🗣️ ${LOCKER_TALKS[type].label}: ${LOCKER_TALKS[type].desc}${note}`;
    set({
      homeTeam: team,
      lockerTalk: type,
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
      timelineEvents: [...state.timelineEvents, makeInfoEvent(state.minute, '⚽ 후반전 킥오프! 양 팀 선수들이 그라운드로 돌아옵니다.')],
    });
    syncTicker();
  },

  makeUserSubstitution: (fieldSlotIndex, benchPlayerId) => {
    const state = get();
    if (state.status !== 'live') return { success: false, message: '진행 중인 경기가 아닙니다.' };
    const team = cloneTeam(state.homeTeam);
    if (team.subsLeft <= 0) {
      return { success: false, message: '교체 카드를 모두 사용했습니다 (최대 3장).' };
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
      message: `🔄 선수 교체 완료: IN ${incoming.name}(${incoming.slotRoleCode}, 체력 ${incoming.currentStamina}%) / OUT ${outSnapshot.name} (남은 교체 ${team.subsLeft}장)`,
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