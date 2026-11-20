import { useEffect, useRef, useState } from 'react';
import useLiveMatchStore, { calcPlayerOvr, calcTeamAvgOvr, getSafeName } from '../../../store/useLiveMatchStore.js';
import { FAMILIARITY_META } from '../../../constants/tacticsConfig.js';

const WIDTH = 900;
const HEIGHT = 540;
const MARGIN = 28;
const CELEBRATION_MS = 10000;
const POST_GOAL_SHOT_LOCK_MS = 1800;
const REPLAY_WINDOW_MS = 5000;
const REPLAY_SAMPLE_MS = 33;
const REPLAY_RATE = 0.4;
const REPLAY_HOLD_MS = 1200;
const REPLAY_MIN_FRAMES = 8;
const SHOT_SPEED = 2.85;
const SHOT_TIMEOUT_FRAMES = 48;
const PASS_TIMEOUT_FRAMES = 46;

const STRIKER_ROLES = ['ST', 'LST', 'RST', 'FW', 'CF'];
const WINGER_ROLES = ['LW', 'RW', 'LM', 'RM', 'LAM', 'RAM'];
const ATTACKER_ROLES = [...STRIKER_ROLES, ...WINGER_ROLES];
const MIDFIELDER_ROLES = ['CAM', 'CM', 'LCM', 'RCM', 'CDM', 'LDM', 'RDM'];
const FULLBACK_ROLES = ['LB', 'RB', 'LWB', 'RWB'];
const CENTERBACK_ROLES = ['CB', 'LCB', 'RCB'];

const POST_GOAL_COOLDOWN_MS = 4500;
// 코너킥 직후 공격 팀이 공을 잃었을 때 전원 복귀를 유지하는 경기 시간(ms, 재생 배속 반영)
const CORNER_TRANSITION_SIM_MS = 11000;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function toPx(x) {
  return MARGIN + (clamp(x, 0, 100) / 100) * (WIDTH - MARGIN * 2);
}

function toPy(y) {
  return MARGIN + (clamp(y, 0, 100) / 100) * (HEIGHT - MARGIN * 2);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distToSegment(p, a, b) {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 === 0) return distance(p, a);
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = clamp(t, 0, 1);
  return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
}

function getAgentByUid(engine, uid) {
  if (!uid) return null;
  for (const a of engine.agents.values()) {
    if (a.uid === uid || a.id === uid || a.playerId === uid || a.userPlayerId === uid) {
      return a;
    }
  }
  return null;
}

/**
 * 실시간 평점(liveRating: 3.0 ~ 10.0) 및 실제 움직임 기반 추가 체력 소모(staminaDrain) 동기화
 */
function adjustPlayerLiveStat(
  engine,
  agent,
  { ratingDelta = 0, staminaDrain = 0, flashText = null, flashColor = '#facc15', now = 0 }
) {
  if (!agent) return;

  let adjustedDelta = ratingDelta;
  if (FULLBACK_ROLES.includes(agent.slotRoleCode)) {
    adjustedDelta = ratingDelta < 0 ? ratingDelta * 0.5 : ratingDelta * 1.25;
  }

  let ratingChanged = false;
  if (adjustedDelta !== 0) {
    agent.liveRating = clamp(Number(((agent.liveRating ?? 6.0) + adjustedDelta).toFixed(2)), 4.5, 10.0);
    ratingChanged = true;
  }

  if (staminaDrain > 0) {
    agent.stamina = clamp(Number(((agent.stamina ?? 100) - staminaDrain).toFixed(2)), 5, 100);
    agent.currentStamina = agent.stamina;
  }

  if (flashText && now > 0) {
    agent.flash = { type: 'CUSTOM', text: flashText, color: flashColor, until: now + 950 };
  }

  if (ratingChanged || Math.random() < 0.25) {
    const store = useLiveMatchStore.getState();
    if (typeof store.syncCanvasPlayerState === 'function') {
      store.syncCanvasPlayerState(agent.team, agent.slotIndex, {
        liveRating: agent.liveRating,
        currentStamina: agent.stamina,
      });
    }
  }
}

function isMaestroPlaymaker(player) {
  if (!player) return false;
  const passStat = player.baseStats?.passing || 72;
  const dribStat = player.baseStats?.dribbling || 72;
  const hasTag = Array.isArray(player.tags) && player.tags.includes('PLAYMAKER');
  const isMidRole = MIDFIELDER_ROLES.includes(player.slotRoleCode);

  if (hasTag || player.instruction === 'PLAYMAKER') return true;
  if (passStat >= 84 && passStat >= dribStat - 5) return true;
  if (isMidRole && passStat >= 79 && passStat >= dribStat - 2) return true;
  return false;
}

function isOffsideTrapEnabled(state, defendingSide) {
  const teamObj = defendingSide === 'HOME' ? state?.homeTeam : state?.awayTeam;
  return teamObj?.tactics?.offsideTrap === 'ON';
}

function getLastDefenderLineX(activePlayers, defendingSide) {
  const fieldDefenders = activePlayers.filter(
    (p) => p.team === defendingSide && !p.isSentOff && p.role !== 'GK' && p.roleCode !== 'GK'
  );
  if (fieldDefenders.length === 0) return defendingSide === 'HOME' ? 15 : 85;
  if (defendingSide === 'HOME') {
    return Math.min(...fieldDefenders.map((d) => d.x));
  }
  return Math.max(...fieldDefenders.map((d) => d.x));
}

function createEngine() {
  return {
    agents: new Map(),
    ball: {
      x: 50,
      y: 50,
      z: 0,
      startX: 50,
      startY: 50,
      targetX: 50,
      targetY: 50,
      ownerUid: 'HOME_6',
      targetUid: null,
      isShot: false,
      isKillerPass: false,
      isAerial: false,
      isCornerCross: false,
      aerialContestResolved: false,
      isGkClearance: false,
      mode: 'LOCKED',
      shotOutcome: null,
      shotTeam: null,
      goalStyle: 'NORMAL',
      shooterId: null,
      shooterName: null,
      shooterSlotIndex: 0,
      assisterId: null,
      assisterName: null,
      assisterSlotIndex: null,
      vx: 0,
      vy: 0,
      lastPasserId: null,
      lastPasserUid: null,
      lastPasserName: null,
      lastPasserSlotIndex: null,
      lastPasserRole: null,
      boxPassCount: 0,
      teamPassChain: 0,
      holdFrames: 0,
      passFrames: 0,
      shotFrames: 0,
      shotTrail: [],
      passTrail: [],
      shotSpeed: SHOT_SPEED,
      shooterFlashEnd: 0,
      keeperSaveFlashEnd: 0,
      keeperSaveText: '🧤 SAVE!',
      isGoalOutcome: false,
      mustPassAfterSteal: false,
      setPieceState: null,
    },
    lastSeq: -1,
    bannerUntil: 0,
    bannerActive: false,
    attackTeam: 'HOME',
    initialized: false,
    postGoalWaitUntil: 0,
    lastDuelAt: 0,
    lastOffsideAt: 0,
    offsideVisual: null,
    cornerTransition: null,
    cornerPrelude: null,
    lastScorerUid: null,
    sequence: null,
    replayFrames: [],
    touchCounts: new Map(),
    slidingEffects: [],
    headerEffects: [],
  };
}

export function drawPitch(ctx, width, height, weatherCode = 'SUNNY') {
  const pw = width - MARGIN * 2;
  const ph = height - MARGIN * 2;
  const mx = pw / 105;
  const my = ph / 68;
  const cx = MARGIN + pw / 2;
  const cy = MARGIN + ph / 2;

  ctx.fillStyle = weatherCode === 'RAINY' ? '#134e32' : '#1b5e20';
  ctx.fillRect(0, 0, width, height);

  const stripes = 14;
  const stripeWidth = pw / stripes;
  for (let i = 0; i < stripes; i++) {
    if (weatherCode === 'RAINY') {
      ctx.fillStyle = i % 2 === 0 ? '#1e603c' : '#267048';
    } else {
      ctx.fillStyle = i % 2 === 0 ? '#2e7d32' : '#3b9140';
    }
    ctx.fillRect(MARGIN + i * stripeWidth, MARGIN, stripeWidth + 0.5, ph);
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.72)';
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.lineWidth = 2;
  ctx.strokeRect(MARGIN, MARGIN, pw, ph);

  ctx.beginPath();
  ctx.moveTo(cx, MARGIN);
  ctx.lineTo(cx, MARGIN + ph);
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(cx, cy, 9.15 * mx, 9.15 * my, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();

  const boxDepth = 16.5 * mx;
  const boxHeight = 40.32 * my;
  const sixDepth = 5.5 * mx;
  const sixHeight = 18.32 * my;
  const arcAngle = Math.acos((16.5 - 11) / 9.15);

  for (const side of ['left', 'right']) {
    const isLeft = side === 'left';
    const lineX = isLeft ? MARGIN : MARGIN + pw;
    const boxX = isLeft ? lineX : lineX - boxDepth;
    const sixX = isLeft ? lineX : lineX - sixDepth;
    const spotX = isLeft ? lineX + 11 * mx : lineX - 11 * mx;

    ctx.strokeRect(boxX, cy - boxHeight / 2, boxDepth, boxHeight);
    ctx.strokeRect(sixX, cy - sixHeight / 2, sixDepth, sixHeight);

    ctx.beginPath();
    ctx.arc(spotX, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    if (isLeft) ctx.ellipse(spotX, cy, 9.15 * mx, 9.15 * my, 0, -arcAngle, arcAngle);
    else ctx.ellipse(spotX, cy, 9.15 * mx, 9.15 * my, 0, Math.PI - arcAngle, Math.PI + arcAngle);
    ctx.stroke();

    const goalDepth = 2.4 * mx;
    const goalHeight = 7.32 * my;
    const goalX = isLeft ? lineX - goalDepth : lineX;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(goalX, cy - goalHeight / 2, goalDepth, goalHeight);
    ctx.strokeRect(goalX, cy - goalHeight / 2, goalDepth, goalHeight);
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
  }
}

function syncAgents(engine, state, now) {
  const seen = new Set();
  const teams = [
    { data: state.homeTeam, side: 'HOME' },
    { data: state.awayTeam, side: 'AWAY' },
  ];

  for (const { data: team, side } of teams) {
    const starters = team?.starters || [];
    for (let idx = 0; idx < starters.length; idx++) {
      const p = starters[idx];
      if (!p) continue;
      const expectedUid = `${side}_${idx}`;
      seen.add(expectedUid);

      let agent = engine.agents.get(expectedUid);
      const bx = Number.isFinite(p.baseX) ? p.baseX : side === 'HOME' ? 30 : 70;
      const by = Number.isFinite(p.baseY) ? p.baseY : 50;
      const cleanName = getSafeName(p, `${p.slotRoleCode || 'FW'} 선수`);
      const statsObj = p.effectiveStats || p.baseStats || {
        speed: 78,
        shooting: 75,
        passing: 75,
        dribbling: 75,
        defense: 75,
        physical: 75,
        gkReflexes: 76,
      };
      const ovrVal = calcPlayerOvr(p);
      const speedVal = (statsObj.speed || 78) * (p.familiarityMultiplier || 1);
      const phaseSeed = ((p.userPlayerId || idx + 1) * 1.73 + idx * 2.41) % (Math.PI * 2);

      if (!agent) {
        const initRating = Number.isFinite(p.liveRating) ? p.liveRating : 6.0;
        p.liveRating = initRating;
        agent = {
          id: p.id ?? expectedUid,
          playerId: p.playerId ?? p.id ?? idx + 1,
          userPlayerId: p.userPlayerId ?? p.id ?? idx + 1,
          slotIndex: idx,
          uid: expectedUid,
          name: cleanName,
          backNumber: p.backNumber ?? idx + 1,
          team: side,
          role: p.slotRoleGroup || (p.slotRoleCode === 'GK' ? 'GK' : 'MF'),
          roleCode: p.slotRoleCode || p.mainPosition || 'CM',
          slotRoleCode: p.slotRoleCode || p.mainPosition || 'CM',
          instruction: p.instruction || 'BALANCED',
          familiarity: p.familiarity || 'NATURAL',
          baseStats: statsObj,
          tags: p.tags || [],
          ovr: ovrVal,
          morale: p.morale ?? 75,
          liveRating: initRating,
          phaseSeed,
          distanceMoved: 0,
          isInjured: Boolean(p.isInjured),
          baseX: bx,
          baseY: by,
          x: bx,
          y: by,
          targetX: bx,
          targetY: by,
          vx: 0,
          vy: 0,
          stamina: p.currentStamina ?? p.stamina ?? 100,
          currentStamina: p.currentStamina ?? p.stamina ?? 100,
          speedStat: speedVal,
          hasBall: false,
          yellowCards: p.yellowCards || 0,
          isSentOff: Boolean(p.isSentOff),
          stunUntil: 0,
          burstUntil: 0,
          slideUntil: 0,
          slideAngle: 0,
          jumpUntil: 0,
          isOverlapping: false,
          isPressing: false,
          isMakingRun: false,
          isSteppingUpTrap: false,
          markingTargetUid: null,
          flash: engine.initialized ? { type: 'SUB', until: now + 1800 } : null,
        };
        engine.agents.set(expectedUid, agent);
      } else {
        const isReplacedPlayer = agent.userPlayerId !== (p.userPlayerId ?? p.id);
        agent.id = p.id ?? expectedUid;
        agent.playerId = p.playerId ?? p.id ?? idx + 1;
        agent.userPlayerId = p.userPlayerId ?? p.id ?? idx + 1;
        agent.slotIndex = idx;
        agent.uid = expectedUid;
        agent.name = cleanName;
        agent.backNumber = p.backNumber ?? idx + 1;
        agent.team = side;
        agent.role = p.slotRoleGroup || (p.slotRoleCode === 'GK' ? 'GK' : 'MF');
        agent.roleCode = p.slotRoleCode || p.mainPosition || agent.roleCode;
        agent.slotRoleCode = p.slotRoleCode || p.mainPosition || agent.slotRoleCode;
        agent.instruction = p.instruction || 'BALANCED';
        agent.familiarity = p.familiarity || 'NATURAL';
        agent.baseStats = statsObj;
        agent.tags = p.tags || agent.tags || [];
        agent.ovr = ovrVal;
        agent.morale = p.morale ?? agent.morale;
        agent.isInjured = Boolean(p.isInjured);
        agent.baseX = bx;
        agent.baseY = by;
        agent.speedStat = speedVal;
        agent.yellowCards = p.yellowCards || 0;
        agent.isSentOff = Boolean(p.isSentOff);

        const storeStamina = p.currentStamina ?? p.stamina ?? 100;
        agent.stamina = storeStamina;
        agent.currentStamina = storeStamina;

        if (isReplacedPlayer) {
          agent.liveRating = 6.0;
          p.liveRating = 6.0;
          agent.flash = { type: 'SUB', until: now + 2000 };
        } else if (Number.isFinite(p.liveRating)) {
          agent.liveRating = p.liveRating;
        }

        if (!Number.isFinite(agent.x) || !Number.isFinite(agent.y)) {
          agent.x = bx;
          agent.y = by;
          agent.targetX = bx;
          agent.targetY = by;
        }
      }
    }
  }

  for (const key of [...engine.agents.keys()]) {
    if (!seen.has(key)) {
      engine.agents.delete(key);
    }
  }
  engine.initialized = true;
}

function resetPositionsForKickoff(engine, concededTeam, now, speed = 1) {
  const { ball, agents } = engine;
  const activePlayers = [...agents.values()].filter((p) => !p.isSentOff);
  engine.cornerTransition = null;
  engine.cornerPrelude = null;
  engine.replayFrames = [];

  for (const p of activePlayers) {
    p.x = p.baseX;
    p.y = p.baseY;
    p.targetX = p.baseX;
    p.targetY = p.baseY;
    p.vx = 0;
    p.vy = 0;
    p.stunUntil = 0;
    p.burstUntil = 0;
    p.jumpUntil = 0;
    p.isOverlapping = false;
    p.isPressing = false;
    p.isMakingRun = false;
    p.isSteppingUpTrap = false;
    p.markingTargetUid = null;
  }

  ball.x = 50;
  ball.y = 50;
  ball.z = 0;
  ball.targetX = 50;
  ball.targetY = 50;
  ball.vx = 0;
  ball.vy = 0;
  ball.isShot = false;
  ball.isKillerPass = false;
  ball.isAerial = false;
  ball.isCornerCross = false;
  ball.aerialContestResolved = false;
  ball.isGkClearance = false;
  ball.setPieceState = null;
  ball.cornerWaiting = false;
  ball.isGoalOutcome = false;
  ball.shotOutcome = null;
  ball.shotTrail = [];
  ball.passTrail = [];
  ball.holdFrames = 0;
  ball.passFrames = 0;
  ball.shotFrames = 0;
  ball.boxPassCount = 0;
  ball.teamPassChain = 0;
  ball.lastPasserUid = null;
  ball.lastPasserRole = null;
  ball.mustPassAfterSteal = false;

  const kickoffCandidates = activePlayers.filter(
    (p) => p.team === concededTeam && p.role === 'MF' && p.roleCode !== 'GK'
  );
  const kicker =
    kickoffCandidates.length > 0
      ? kickoffCandidates[Math.floor(Math.random() * kickoffCandidates.length)]
      : activePlayers[0];

  if (kicker) {
    kicker.x = 50;
    kicker.y = 50;
    kicker.targetX = 50;
    kicker.targetY = 50;
    ball.mode = 'LOCKED';
    ball.ownerUid = kicker.uid;
    ball.targetUid = null;
    engine.attackTeam = kicker.team;
  } else {
    ball.mode = 'LOOSE';
    ball.ownerUid = null;
  }

  engine.postGoalWaitUntil = now + POST_GOAL_COOLDOWN_MS / clamp(speed, 1, 2.5);
}

const CORNER_PRELUDE_MIN_MS = 600;
const CORNER_PRELUDE_MAX_MS = 1500;
// 코너킥 때 공이 놓이는 코너 지점과 키커의 위치 (정확히 코너 플래그 근처)
const CORNER_BALL_X = 99.6;
const CORNER_BALL_Y = 1;
const CORNER_KICKER_X = 98.4;
const CORNER_KICKER_Y = 2.4;

/**
 * 슈팅이 막히거나 선방에 걸려 공이 골라인 밖으로 나가는 장면을 먼저 보여준 뒤 코너킥을 세팅함
 */
function startCornerPrelude(engine, attackingTeam, now) {
  const { ball } = engine;
  const toX = attackingTeam === 'HOME' ? CORNER_BALL_X : 100 - CORNER_BALL_X;
  const toY = ball.y < 50 ? CORNER_BALL_Y : 100 - CORNER_BALL_Y;
  const dist = Math.hypot(toX - ball.x, toY - ball.y);

  ball.mode = 'LOOSE';
  ball.ownerUid = null;
  ball.targetUid = null;
  ball.isShot = false;
  ball.isKillerPass = false;
  ball.isAerial = false;
  ball.isCornerCross = false;
  ball.shotTrail = [];
  ball.passTrail = [];
  ball.vx = 0;
  ball.vy = 0;
  ball.setPieceState = 'CORNER_PRELUDE';
  ball.cornerWaiting = false;
  engine.attackTeam = attackingTeam;
  engine.cornerPrelude = {
    team: attackingTeam,
    fromX: ball.x,
    fromY: ball.y,
    toX,
    toY,
    startedAt: now,
    durationMs: clamp(dist * 30, CORNER_PRELUDE_MIN_MS, CORNER_PRELUDE_MAX_MS),
  };
}

function advanceCornerPrelude(engine, now, speed) {
  const prelude = engine.cornerPrelude;
  const { ball } = engine;
  const t = clamp(((now - prelude.startedAt) * clamp(speed, 1, 2.5)) / prelude.durationMs, 0, 1);
  ball.x = prelude.fromX + (prelude.toX - prelude.fromX) * t;
  ball.y = prelude.fromY + (prelude.toY - prelude.fromY) * t;
  ball.z = Math.sin(t * Math.PI) * 6;
  if (t < 1) return;

  engine.cornerPrelude = null;
  ball.z = 0;
  ball.setPieceState = null;
  setupCornerKickPlay(engine, prelude.team, now);
  if (!ball.setPieceState) ball.mode = 'LOOSE';
}

function setupCornerKickPlay(engine, attackingTeam, now) {
  const { ball, agents } = engine;
  const state = useLiveMatchStore.getState();
  const defendingTeam = attackingTeam === 'HOME' ? 'AWAY' : 'HOME';
  const attTeamObj = attackingTeam === 'HOME' ? state.homeTeam : state.awayTeam;
  const tactics = attTeamObj?.tactics || {};
  const isHomeAtt = attackingTeam === 'HOME';

  const allActive = [...agents.values()].filter((p) => !p.isSentOff);
  for (const p of allActive) {
    p.cornerRole = null;
    p.cornerX = null;
    p.cornerY = null;
  }

  const mates = allActive.filter((p) => p.team === attackingTeam && p.role !== 'GK');
  const defenders = allActive.filter((p) => p.team === defendingTeam && p.role !== 'GK');
  if (mates.length === 0) return;

  const kickerPref = tactics.cornerKicker || 'BEST_PASSER';
  let kickerPool = mates;
  if (kickerPref === 'WINGER_CAM') {
    const filtered = mates.filter((m) => WINGER_ROLES.includes(m.slotRoleCode) || m.slotRoleCode === 'CAM');
    if (filtered.length > 0) kickerPool = filtered;
  } else if (kickerPref === 'FULLBACK') {
    const filtered = mates.filter((m) => FULLBACK_ROLES.includes(m.slotRoleCode));
    if (filtered.length > 0) kickerPool = filtered;
  }

  // 키커는 공이 놓인 코너 바로 옆(코너 아크 안쪽)에 선다
  const cornerX = isHomeAtt ? CORNER_KICKER_X : 100 - CORNER_KICKER_X;
  const cornerY = ball.y < 50 ? CORNER_KICKER_Y : 100 - CORNER_KICKER_Y;
  // 공이 놓인 코너 지점에서 멀리 있는 선수가 키커가 되면 오래 달려야 하므로 패스 능력과 거리를 함께 고려함
  const kickerScore = (m) => (m.baseStats?.passing || 75) - Math.hypot(m.x - cornerX, m.y - cornerY) * 0.25;
  const kicker = [...kickerPool].sort((a, b) => kickerScore(b) - kickerScore(a))[0];
  kicker.cornerRole = 'KICKER';
  kicker.cornerX = cornerX;
  kicker.cornerY = cornerY;
  kicker.targetX = cornerX;
  kicker.targetY = cornerY;
  kicker.stunUntil = 0;

  const stayBackRule = tactics.cornerDefense || 'FULLBACKS';

  // 수비 팀의 역습 대기 공격수(아웃렛): 기본 1명, 공격적인 수비 팀은 2명을 중원에 남겨 두므로 그에 맞춰 잔류 인원을 늘림
  const defTeamObj = defendingTeam === 'HOME' ? state.homeTeam : state.awayTeam;
  const outletCount = ['ATTACKING', 'ALL_OUT_ATTACK'].includes(defTeamObj?.tactics?.mentality) ? 2 : 1;
  const speedOf = (p) => p.baseStats?.speed || 70;
  const strikers = defenders.filter((d) => STRIKER_ROLES.includes(d.slotRoleCode)).sort((a, b) => speedOf(b) - speedOf(a));
  const wideForwards = defenders
    .filter((d) => !STRIKER_ROLES.includes(d.slotRoleCode) && (WINGER_ROLES.includes(d.slotRoleCode) || d.role === 'FW'))
    .sort((a, b) => speedOf(b) - speedOf(a));
  const outlets = [...strikers, ...wideForwards].slice(0, outletCount);

  // 잔류 인원: 역습 공격수 수 + 2(커버 2명)를 기본으로 하고, 소극적 전술이면 +1, 전원 공격이면 -1 (최소 2, 최대 5)
  const defensiveMentality = ['DEFENSIVE', 'PARK_THE_BUS'].includes(tactics.mentality);
  const allOutMentality = tactics.mentality === 'ALL_OUT_ATTACK';
  const requiredBack = clamp(Math.max(1, outlets.length) + 2 + (defensiveMentality ? 1 : 0) - (allOutMentality ? 1 : 0), 2, 5);
  const stayCap = stayBackRule === 'CDM_AND_FB' ? Math.max(requiredBack, 3) : requiredBack;

  const inRuleGroup = (m) => {
    if (stayBackRule === 'CDM_AND_FB') {
      return FULLBACK_ROLES.includes(m.slotRoleCode) || ['CDM', 'LDM', 'RDM'].includes(m.slotRoleCode);
    }
    if (stayBackRule === 'CENTERBACKS') return CENTERBACK_ROLES.includes(m.slotRoleCode);
    return FULLBACK_ROLES.includes(m.slotRoleCode);
  };
  const defenseScore = (m) => (m.baseStats?.defense || 70) + (m.baseStats?.speed || 70) * 0.3;
  const eligible = mates.filter((m) => m.uid !== kicker.uid);
  const stayBacks = eligible.filter(inRuleGroup).sort((a, b) => defenseScore(b) - defenseScore(a)).slice(0, stayCap);
  if (stayBacks.length < requiredBack) {
    // 선택한 잔류 그룹만으로 인원이 부족하면 수비수 → 수비형 미드필더 순으로 보충함
    const fillers = eligible
      .filter((m) => !stayBacks.includes(m) && (m.role === 'DF' || ['CDM', 'LDM', 'RDM'].includes(m.slotRoleCode)))
      .sort((a, b) => defenseScore(b) - defenseScore(a));
    stayBacks.push(...fillers.slice(0, requiredBack - stayBacks.length));
  }

  // 아웃렛(x=44/56)보다 12칸 뒤에 라인을 서고, 상대 역습이 중앙으로 들어오므로 좁게(중앙 밀집) 폭을 나눔
  const stayLineX = isHomeAtt ? 42 : 58;
  const stayYSlots = {
    1: [50],
    2: [43, 57],
    3: [38, 50, 62],
    4: [33, 44, 56, 67],
    5: [30, 40, 50, 60, 70],
  }[Math.min(5, Math.max(1, stayBacks.length))];
  const stayBackSlot = new Map(
    [...stayBacks].sort((a, b) => (a.baseY ?? 50) - (b.baseY ?? 50)).map((m, i) => [m.uid, stayYSlots[i]])
  );

  const attBoxSpots = isHomeAtt
    ? [
        [91.5, 43],
        [92.0, 50],
        [91.0, 57],
        [88.0, 46],
        [88.5, 54],
        [85.5, 39],
        [85.5, 61],
        [81.0, 50],
      ]
    : [
        [8.5, 43],
        [8.0, 50],
        [9.0, 57],
        [12.0, 46],
        [11.5, 54],
        [14.5, 39],
        [14.5, 61],
        [19.0, 50],
      ];

  let boxIdx = 0;

  for (const m of mates) {
    if (m.uid === kicker.uid) continue;

    if (stayBackSlot.has(m.uid)) {
      const sy = stayBackSlot.get(m.uid);
      m.cornerRole = 'STAY_BACK';
      m.cornerX = stayLineX;
      m.cornerY = sy;
      m.x = stayLineX;
      m.y = sy;
      m.targetX = stayLineX;
      m.targetY = sy;
    } else {
      const spot = attBoxSpots[boxIdx % attBoxSpots.length];
      const tx = spot[0] + (Math.random() - 0.5) * 1.5;
      const ty = spot[1] + (Math.random() - 0.5) * 2.0;
      m.cornerRole = 'BOX_ATTACK';
      m.cornerX = tx;
      m.cornerY = ty;
      m.x = tx;
      m.y = ty;
      m.targetX = tx;
      m.targetY = ty;
      boxIdx++;
    }
  }

  const defBoxSpots = isHomeAtt
    ? [
        [94.0, 45],
        [94.5, 50],
        [94.0, 55],
        [91.0, 42],
        [91.5, 49],
        [91.0, 56],
        [87.5, 44],
        [87.5, 55],
        [83.5, 50],
      ]
    : [
        [6.0, 45],
        [5.5, 50],
        [6.0, 55],
        [9.0, 42],
        [8.5, 49],
        [9.0, 56],
        [12.5, 44],
        [12.5, 55],
        [16.5, 50],
      ];

  let defBoxIdx = 0;
  const outletYSlots = outlets.length >= 2 ? [42, 58] : [50];

  for (const d of defenders) {
    const outletIdx = outlets.indexOf(d);
    if (outletIdx >= 0) {
      const cx = isHomeAtt ? 56 : 44;
      const cy = outletYSlots[outletIdx];
      d.cornerRole = 'COUNTER_OUTLET';
      d.cornerX = cx;
      d.cornerY = cy;
      d.x = cx;
      d.y = cy;
      d.targetX = cx;
      d.targetY = cy;
    } else {
      const spot = defBoxSpots[defBoxIdx % defBoxSpots.length];
      const dx = spot[0] + (Math.random() - 0.5) * 1.2;
      const dy = spot[1] + (Math.random() - 0.5) * 1.8;
      d.cornerRole = 'BOX_DEFEND';
      d.cornerX = dx;
      d.cornerY = dy;
      d.x = dx;
      d.y = dy;
      d.targetX = dx;
      d.targetY = dy;
      defBoxIdx++;
    }
  }

  ball.mode = 'LOCKED';
  ball.ownerUid = kicker.uid;
  ball.x = isHomeAtt ? CORNER_BALL_X : 100 - CORNER_BALL_X;
  ball.y = cornerY < 50 ? CORNER_BALL_Y : 100 - CORNER_BALL_Y;
  ball.z = 0;
  ball.holdFrames = 0;
  ball.setPieceState = 'CORNER';
  // 키커가 공이 놓인 코너 지점까지 걸어/뛰어올 때까지 공은 그 자리에 정지해 있음
  ball.cornerWaiting = true;
  ball.cornerKickerUid = kicker.uid;
  engine.attackTeam = attackingTeam;
  // 크로스가 끝난 뒤 공을 잃으면 공격 팀 전원이 복귀하는 전환 구간(updatePlayerPositions)을 시작함
  engine.cornerTransition = { team: attackingTeam, startedAt: now };

  adjustPlayerLiveStat(engine, kicker, {
    flashText: `🚩 코너킥 (${kicker.name})`,
    flashColor: '#fbbf24',
    now,
  });

  const store = useLiveMatchStore.getState();
  if (typeof store.recordCanvasCorner === 'function') {
    store.recordCanvasCorner(attackingTeam, kicker.name);
  }
}

function setupFoulRestartPlay(engine, attackingTeam, foulX, foulY, isPenalty, now) {
  const { ball, agents } = engine;
  const state = useLiveMatchStore.getState();
  const teamObj = attackingTeam === 'HOME' ? state.homeTeam : state.awayTeam;
  const tactics = teamObj?.tactics || {};
  const isHome = attackingTeam === 'HOME';

  const mates = [...agents.values()].filter((p) => p.team === attackingTeam && !p.isSentOff && p.role !== 'GK');
  if (mates.length === 0) return;

  const fkPref = tactics.freeKickKicker || 'BEST_SHOOTER';
  let kickerPool = mates;
  if (!isPenalty) {
    if (fkPref === 'FORWARD') {
      const filtered = mates.filter((m) => ATTACKER_ROLES.includes(m.slotRoleCode));
      if (filtered.length > 0) kickerPool = filtered;
    } else if (fkPref === 'MIDFIELDER') {
      const filtered = mates.filter((m) => MIDFIELDER_ROLES.includes(m.slotRoleCode));
      if (filtered.length > 0) kickerPool = filtered;
    }
  }
  const kicker = [...kickerPool].sort(
    (a, b) => (b.baseStats?.shooting || 75) - (a.baseStats?.shooting || 75)
  )[0];

  const restartX = isPenalty ? (isHome ? 88.5 : 11.5) : clamp(foulX, 12, 88);
  const restartY = isPenalty ? 50 : clamp(foulY, 10, 90);

  kicker.x = restartX;
  kicker.y = restartY;
  kicker.targetX = restartX;
  kicker.targetY = restartY;
  kicker.stunUntil = 0;

  for (const p of agents.values()) {
    if (p.team !== attackingTeam && p.role !== 'GK' && !p.isSentOff && distance(p, kicker) < 10) {
      p.x = clamp(p.x + (isHome ? 10 : -10), 8, 92);
      p.targetX = p.x;
      p.stunUntil = now + 700;
    }
  }

  ball.mode = 'LOCKED';
  ball.ownerUid = kicker.uid;
  ball.x = restartX;
  ball.y = restartY;
  ball.z = 0;
  ball.holdFrames = 0;
  ball.setPieceState = isPenalty ? 'PENALTY' : 'FREE_KICK';
  engine.attackTeam = attackingTeam;

  adjustPlayerLiveStat(engine, kicker, {
    flashText: isPenalty
      ? `🎯 페널티킥 (${kicker.name})`
      : `🎯 프리킥 (${kicker.name} · 슛 ${Math.round(kicker.baseStats?.shooting || 75)})`,
    flashColor: '#fde047',
    now,
  });
}

function applyAction(engine, action, now) {
  if (!action) return;
  const { agents } = engine;

  if (action.eventType === 'SUB') {
    for (const a of agents.values()) {
      if (a.uid === action.subInId || a.id === action.subInId) {
        a.flash = { type: 'SUB', until: now + 1800 };
        break;
      }
    }
    return;
  }

  if (action.eventType === 'KICKOFF') {
    resetPositionsForKickoff(engine, action.attackingTeam || 'HOME', now, 1);
  }
}

function pushAttackersAwayFromKeeper(engine, attackingSide) {
  const isHomeAtt = attackingSide === 'HOME';
  for (const a of engine.agents.values()) {
    if (a.team !== attackingSide || a.isSentOff || a.role === 'GK') continue;
    const inDeepBox = isHomeAtt ? a.x >= 70 : a.x <= 30;
    if (inDeepBox) {
      a.targetX = a.baseX;
      a.targetY = a.baseY;
      a.stunUntil = 0;
    }
  }
}

function triggerShot(engine, shooter, state, now, shotStyle = 'NORMAL') {
  const isHome = shooter.team === 'HOME';
  shooter.targetX = shooter.baseX;
  shooter.targetY = shooter.baseY;
  adjustPlayerLiveStat(engine, shooter, { staminaDrain: 0.35 });

  const store = useLiveMatchStore.getState();
  const ball = engine.ball;
  const defendSide = isHome ? 'AWAY' : 'HOME';
  const attTeamObj = isHome ? state.homeTeam : state.awayTeam;
  const defTeamObj = isHome ? state.awayTeam : state.homeTeam;

  const keeper = [...engine.agents.values()].find(
    (a) => a.team === defendSide && (a.role === 'GK' || a.roleCode === 'GK') && !a.isSentOff
  );
  const nearbyDefenders = [...engine.agents.values()].filter(
    (a) => a.team === defendSide && !a.isSentOff && a.role !== 'GK' && distance(a, shooter) <= 9.0
  );

  const shooterShoot = shooter.baseStats?.shooting || 76;
  const shooterPass = shooter.baseStats?.passing || 75;
  const shooterTech = shooter.baseStats?.dribbling || 74;
  const shooterSpeed = shooter.baseStats?.speed || 75;
  const isPenaltyShot = shotStyle === 'PENALTY';
  const isFreeKickShot = shotStyle === 'FREE_KICK';

  if (!isPenaltyShot) {
    const frontBlockers = nearbyDefenders.filter(
      (d) => distance(d, shooter) <= 5.2 && (isHome ? d.x >= shooter.x - 1.5 : d.x <= shooter.x + 1.5)
    );
    if (frontBlockers.length > 0) {
      const bestBlocker = frontBlockers.sort(
        (a, b) => (b.baseStats?.defense || 75) - (a.baseStats?.defense || 75)
      )[0];
      const defPower = (bestBlocker.baseStats?.defense || 75) * 0.65 + (bestBlocker.baseStats?.physical || 75) * 0.35;
      const attRelease = shooterTech * 0.55 + shooterSpeed * 0.45;
      const blockProb = clamp(((defPower - attRelease + 25) / 80) * 0.62, 0.15, 0.62);

      if (Math.random() < blockProb) {
        bestBlocker.jumpUntil = now + 450;
        adjustPlayerLiveStat(engine, bestBlocker, {
          ratingDelta: +0.35,
          staminaDrain: 0.25,
          flashText: '🧱 육탄블록! (+0.3)',
          flashColor: '#38bdf8',
          now,
        });
        adjustPlayerLiveStat(engine, shooter, {
          ratingDelta: -0.25,
          flashText: '❌ 슈팅막힘 (-0.2)',
          flashColor: '#f87171',
          now,
        });

        if (Math.random() < 0.3) {
          startCornerPrelude(engine, shooter.team, now);
          return;
        }

        ball.mode = 'LOCKED';
        ball.z = 0;
        ball.isAerial = false;
        ball.ownerUid = bestBlocker.uid;
        ball.holdFrames = 0;
        ball.teamPassChain = 0;
        ball.mustPassAfterSteal = true;
        engine.attackTeam = bestBlocker.team;
        if (typeof store.recordCanvasTackle === 'function') {
          store.recordCanvasTackle(bestBlocker.team, bestBlocker.slotIndex);
        }
        return;
      }
    }
  }

  const isMid = MIDFIELDER_ROLES.includes(shooter.slotRoleCode);
  const baseAttackStat = isMid
    ? shooterShoot * 0.55 + shooterPass * 0.25 + shooterTech * 0.2
    : shooterShoot * 0.7 + shooterTech * 0.3;

  const staminaFactor = shooter.stamina < 35 ? 0.72 : shooter.stamina < 60 ? 0.88 : 1.0;
  const injuryFactor = shooter.isInjured ? 0.78 : 1.0;
  const moraleFactor = 0.88 + ((shooter.morale ?? 75) / 100) * 0.24;
  const talkAtkMod = attTeamObj?.talkEffect?.atkMul || 1.0;
  const weatherLongMod = shotStyle === 'LONG_SHOT' ? (state.weather?.longShotMod || 1.05) : 1.0;
  const killerPassBonus = ball.isKillerPass || shotStyle === 'HEADER' ? 1.15 : 1.0;
  // 프리킥 슛일 때 키커의 슈팅 능력치가 높을수록 득점 성공률 부스트 부여
  const fkBonus = isFreeKickShot ? clamp((shooterShoot - 65) * 0.025 + 1.0, 1.0, 1.65) : 1.0;

  const effectiveAttack =
    baseAttackStat * staminaFactor * injuryFactor * moraleFactor * talkAtkMod * weatherLongMod * killerPassBonus * fkBonus;

  const keeperReflex = keeper ? (keeper.baseStats?.gkReflexes || 75) : 72;
  const defPressure = isPenaltyShot || isFreeKickShot ? 0 : nearbyDefenders.reduce((acc, d) => acc + (d.baseStats?.defense || 75) * 0.16, 0);
  const effectiveDefense = keeperReflex + defPressure;

  const attTeamOvr = attTeamObj?.avgOvr || calcTeamAvgOvr(attTeamObj);
  const defTeamOvr = defTeamObj?.avgOvr || calcTeamAvgOvr(defTeamObj);
  const ovrGapMultiplier = clamp(Math.pow(attTeamOvr / Math.max(45, defTeamOvr), 2.3), 0.35, 1.55);

  const shooterPrevGoals = attTeamObj?.starters?.[shooter.slotIndex]?.goals || 0;
  const monopolyDampener = shooterPrevGoals >= 2 ? 0.52 : shooterPrevGoals === 1 ? 0.8 : 1.0;
  const postGoalDampener = now < engine.postGoalWaitUntil ? 0.25 : 1.0;

  const rawRatio = effectiveAttack / Math.max(1, effectiveAttack + effectiveDefense);
  const goalProb = isPenaltyShot
    ? 0.78
    : isFreeKickShot
    ? clamp(rawRatio * 0.55 * fkBonus, 0.12, 0.52)
    : clamp(rawRatio * 0.44 * ovrGapMultiplier * monopolyDampener * postGoalDampener, 0.06, 0.38);

  const roll = Math.random();
  let outcome = 'MISS';
  if (roll < goalProb) {
    outcome = 'GOAL';
  } else if (roll < goalProb + 0.5) {
    outcome = 'SAVED';
  } else {
    outcome = 'MISS';
  }

  const isPasserGk = ball.lastPasserRole === 'GK';
  const validAssisterName =
    !isPenaltyShot && !isFreeKickShot && !isPasserGk && ball.lastPasserName && ball.lastPasserName !== shooter.name
      ? ball.lastPasserName
      : null;
  const validAssisterSlot =
    validAssisterName && ball.lastPasserSlotIndex !== shooter.slotIndex ? ball.lastPasserSlotIndex : null;
  const validAssisterId =
    validAssisterName && ball.lastPasserId !== shooter.id ? ball.lastPasserId : null;

  ball.mode = 'SHOT';
  ball.isShot = true;
  ball.z = 0;
  ball.isAerial = false;
  ball.isCornerCross = false;
  ball.setPieceState = null;
  ball.isKillerPass = false;
  ball.isGkClearance = false;
  ball.mustPassAfterSteal = false;
  ball.ownerUid = null;
  ball.targetUid = null;
  ball.shotTeam = shooter.team;
  ball.goalStyle = shotStyle;
  ball.isGkMistake = isPasserGk;
  ball.shooterId = shooter.userPlayerId ?? shooter.playerId ?? shooter.id;
  ball.shooterName = getSafeName(shooter, '스트라이커');
  ball.shooterSlotIndex = shooter.slotIndex ?? 0;
  ball.assisterId = validAssisterId;
  ball.assisterName = validAssisterName;
  ball.assisterSlotIndex = validAssisterSlot;
  ball.isGoalOutcome = outcome === 'GOAL';
  ball.shotOutcome = outcome;
  ball.shotTrail = [];
  ball.passTrail = [];
  ball.shotFrames = 0;
  ball.holdFrames = 0;
  ball.shooterFlashEnd = now + 750;
  engine.attackTeam = shooter.team;
  engine.lastScorerUid = shooter.uid;

  if (outcome === 'GOAL') {
    const cornerY = Math.random() < 0.5 ? 44.5 : 55.5;
    ball.targetX = isHome ? 98.4 : 1.6;
    ball.targetY = cornerY;
    if (keeper) keeper.targetY = cornerY > 50 ? 46 : 54;

    adjustPlayerLiveStat(engine, shooter, { ratingDelta: +1.2, flashText: '⚽ GOAL! (+1.2)', flashColor: '#fde047', now });
    if (ball.lastPasserUid && validAssisterName) {
      const assisterAgent = getAgentByUid(engine, ball.lastPasserUid);
      if (assisterAgent && assisterAgent.team === shooter.team && assisterAgent.uid !== shooter.uid) {
        adjustPlayerLiveStat(engine, assisterAgent, { ratingDelta: +0.8, flashText: '🎯 ASSIST! (+0.8)', flashColor: '#34d399', now });
      }
    }
    for (const d of engine.agents.values()) {
      if (d.team === defendSide && !d.isSentOff && (d.role === 'DF' || d.role === 'GK')) {
        const penalty = d.role === 'GK' && isPasserGk ? -0.75 : -0.35;
        adjustPlayerLiveStat(engine, d, {
          ratingDelta: penalty,
          flashText: d.role === 'GK' && isPasserGk ? '📉 키퍼 치명적 실책 (-0.7)' : null,
          flashColor: '#ef4444',
          now,
        });
      }
    }
  } else if (outcome === 'SAVED') {
    const saveY = 47 + Math.random() * 6;
    ball.targetX = keeper ? keeper.x : isHome ? 93 : 7;
    ball.targetY = saveY;
    if (keeper) {
      keeper.targetY = saveY;
      adjustPlayerLiveStat(engine, keeper, { ratingDelta: +0.45, staminaDrain: 0.2 });
    }
    adjustPlayerLiveStat(engine, shooter, { ratingDelta: +0.1 });

    if (typeof store.recordCanvasShot === 'function') {
      store.recordCanvasShot(
        shooter.team,
        true,
        shooter.slotIndex,
        `🧤 [슈퍼 세이브!] ${attTeamObj?.name} ${ball.shooterName}(${shooter.slotRoleCode}) 선수의 결정적 슈팅을 골키퍼 ${keeper?.name || 'GK'} 선수가 막아냅니다!`
      );
    }
  } else {
    ball.targetX = isHome ? 99 : 1;
    ball.targetY = Math.random() < 0.5 ? 36 : 64;
    adjustPlayerLiveStat(engine, shooter, {
      ratingDelta: -0.25,
      flashText: '💨 찬스 무산 (-0.2)',
      flashColor: '#f87171',
      now,
    });

    if (typeof store.recordCanvasShot === 'function') {
      store.recordCanvasShot(
        shooter.team,
        false,
        shooter.slotIndex,
        `💨 [찬스 무산] ${attTeamObj?.name} ${ball.shooterName}(${shooter.slotRoleCode}) 선수의 슈팅이 골문을 벗어납니다.`
      );
    }
  }
}

function checkAndHandleOffsideOnPass(engine, carrier, target, state, now) {
  if (!carrier || !target || carrier.role === 'GK' || target.role === 'GK') return false;
  if (now - (engine.lastOffsideAt || 0) < 3500) return false;

  const isHomeAtt = carrier.team === 'HOME';
  const defendSide = isHomeAtt ? 'AWAY' : 'HOME';
  const activePlayers = [...engine.agents.values()].filter((p) => !p.isSentOff);

  const inEnemyHalf = isHomeAtt ? target.x > 52 : target.x < 48;
  const aheadOfBall = isHomeAtt ? target.x > carrier.x + 2.5 : target.x < carrier.x - 2.5;
  if (!inEnemyHalf || !aheadOfBall) return false;

  const trapActive = isOffsideTrapEnabled(state, defendSide);
  const fieldDefenders = activePlayers.filter(
    (p) => p.team === defendSide && p.role !== 'GK' && p.roleCode !== 'GK'
  );
  if (fieldDefenders.length === 0) return false;

  const lastDefX = getLastDefenderLineX(activePlayers, defendSide);
  const avgDefStat =
    fieldDefenders.reduce((sum, d) => sum + (d.baseStats?.defense || 75), 0) / fieldDefenders.length;
  const trapStepBonus = trapActive ? clamp((avgDefStat - 60) * 0.14, 1.5, 4.8) : 0;

  const effectiveOffsideLineX = isHomeAtt ? lastDefX - trapStepBonus : lastDefX + trapStepBonus;
  const isBeyondLine = isHomeAtt
    ? target.x > effectiveOffsideLineX + 0.6
    : target.x < effectiveOffsideLineX - 0.6;

  if (!isBeyondLine) return false;

  // 오프사이드 위치로 침투한 공격수에게 패스가 나가도 일부만 부심이 놓치도록 낮은 확률로 허용함 (실제 경기에서 오프사이드는 대부분 선언됨)
  const attSpeed = target.baseStats?.speed || 76;
  const lineBreakChance = trapActive
    ? clamp((attSpeed - avgDefStat) * 0.004 + 0.06, 0.03, 0.12)
    : clamp((attSpeed - avgDefStat) * 0.005 + 0.1, 0.04, 0.2);

  if (Math.random() < lineBreakChance) {
    target.x = isHomeAtt ? effectiveOffsideLineX - 0.5 : effectiveOffsideLineX + 0.5;
    target.burstUntil = now + 950;
    adjustPlayerLiveStat(engine, target, {
      ratingDelta: +0.25,
      flashText: '⚡ 라인 브레이킹! (+0.2)',
      flashColor: '#a3e635',
      now,
    });
    return false;
  }

  engine.lastOffsideAt = now;
  engine.offsideVisual = {
    lineX: effectiveOffsideLineX,
    attackerX: target.x,
    attackerY: target.y,
    attackerName: target.name,
    defendingSide: defendSide,
    trapActive,
    until: now + 1500,
  };

  adjustPlayerLiveStat(engine, target, {
    ratingDelta: -0.25,
    flashText: '🚩 OFFSIDE! (-0.2)',
    flashColor: '#ef4444',
    now,
  });

  const store = useLiveMatchStore.getState();
  if (typeof store.recordCanvasOffside === 'function') {
    store.recordCanvasOffside(carrier.team, target.name);
  }

  const backLineDefenders = fieldDefenders.filter((d) => d.role === 'DF');
  for (const d of backLineDefenders) {
    adjustPlayerLiveStat(engine, d, {
      ratingDelta: trapActive ? +0.25 : +0.15,
      staminaDrain: trapActive ? 0.22 : 0.08,
      flashText: trapActive ? '🪤 오프사이드 트랩 성공! (+0.2)' : '🚩 오프사이드 유도!',
      flashColor: '#38bdf8',
      now,
    });
  }

  const fkTaker =
    backLineDefenders.sort((a, b) => distance(a, target) - distance(b, target))[0] || fieldDefenders[0];
  const ball = engine.ball;
  ball.mode = 'LOCKED';
  ball.z = 0;
  ball.isAerial = false;
  ball.isKillerPass = false;
  ball.ownerUid = fkTaker.uid;
  ball.targetUid = null;
  ball.x = fkTaker.x;
  ball.y = fkTaker.y;
  ball.holdFrames = 0;
  ball.teamPassChain = 0;
  ball.mustPassAfterSteal = true;
  engine.attackTeam = defendSide;

  target.targetX = isHomeAtt ? Math.min(target.baseX, effectiveOffsideLineX - 6) : Math.max(target.baseX, effectiveOffsideLineX + 6);
  target.stunUntil = now + 800;

  return true;
}

function executePassToPlayer(engine, carrier, target, state, now, isKillerThroughBall = false, isGkKick = false, isCornerOrCross = false) {
  if (!isGkKick && !isCornerOrCross && checkAndHandleOffsideOnPass(engine, carrier, target, state, now)) {
    return;
  }

  const ball = engine.ball;
  const isHome = carrier.team === 'HOME';
  const dir = isHome ? 1 : -1;

  const store = useLiveMatchStore.getState();
  const passStat = carrier.baseStats?.passing || 75;
  const weatherPassMod = state.weather?.passMod || 1.0;
  const staminaMod = carrier.stamina < 35 ? 0.82 : 1.0;
  const isSuccess = isGkKick
    ? true
    : Math.random() < clamp((passStat / 100) * weatherPassMod * staminaMod + 0.14, 0.68, 0.98);

  if (typeof store.recordCanvasPass === 'function') {
    store.recordCanvasPass(carrier.team, isSuccess);
  }

  adjustPlayerLiveStat(engine, carrier, {
    ratingDelta: isKillerThroughBall || isCornerOrCross ? +0.14 : +0.02,
    staminaDrain: 0.14,
  });

  if (isKillerThroughBall && now && !isCornerOrCross) {
    const leadX = clamp(target.x + dir * 5.5, 22, 78);
    const leadY = clamp(target.y + (50 - target.y) * 0.2, 14, 86);
    target.targetX = leadX;
    target.targetY = leadY;
    target.burstUntil = now + 800;
  }

  const passDist = distance(carrier, target);
  const intoBox = isHome ? target.x >= 70 : target.x <= 30;
  const fromFlank = carrier.y < 24 || carrier.y > 76;
  const isAerialBall = isCornerOrCross || isGkKick || passDist >= 22 || (intoBox && (fromFlank || passDist >= 15));

  ball.mode = 'PASS';
  ball.isShot = false;
  ball.isKillerPass = isKillerThroughBall;
  ball.isAerial = isAerialBall;
  ball.isCornerCross = isCornerOrCross;
  ball.setPieceState = null;
  ball.aerialContestResolved = false;
  ball.z = 0;
  ball.startX = carrier.x;
  ball.startY = carrier.y;
  ball.isGkClearance = isGkKick;
  ball.mustPassAfterSteal = false;
  ball.targetUid = target.uid;
  ball.ownerUid = null;
  ball.targetX = target.targetX || target.x;
  ball.targetY = target.targetY || target.y;
  ball.lastPasserUid = carrier.uid;
  ball.lastPasserId = carrier.userPlayerId ?? carrier.playerId ?? carrier.id;
  ball.lastPasserName = getSafeName(carrier);
  ball.lastPasserSlotIndex = carrier.slotIndex;
  ball.lastPasserRole = carrier.role;
  ball.holdFrames = 0;
  ball.passFrames = 0;
  ball.passTrail = isKillerThroughBall || isAerialBall ? [{ x: carrier.x, y: carrier.y }] : [];
  ball.boxPassCount = intoBox ? (ball.boxPassCount || 0) + 1 : 0;
  ball.teamPassChain = (ball.teamPassChain || 0) + 1;

  const prevTouches = engine.touchCounts.get(target.uid) || 0;
  engine.touchCounts.set(target.uid, prevTouches + 1);
}

function selectBestPassTarget(engine, owner, passingStyle, ball, preferKillerThrough = false) {
  const isHome = owner.team === 'HOME';
  const dir = isHome ? 1 : -1;
  const agents = [...engine.agents.values()];
  const mates = agents.filter(
    (a) => a.team === owner.team && a.uid !== owner.uid && !a.isSentOff && a.role !== 'GK' && a.roleCode !== 'GK'
  );
  const opponents = agents.filter((a) => a.team !== owner.team && !a.isSentOff && a.role !== 'GK');
  const oppLineX = getLastDefenderLineX(agents, isHome ? 'AWAY' : 'HOME');

  const inAttackingHalf = isHome ? owner.x >= 50 : owner.x <= 50;
  const carrierIsAttacker = ATTACKER_ROLES.includes(owner.slotRoleCode);
  const ownerPassStat = owner.baseStats?.passing || 75;

  let best = null;
  let bestScore = -Infinity;

  for (const mate of mates) {
    if (ball.lastPasserUid && mate.uid === ball.lastPasserUid && mates.length > 2) continue;

    const mateIsAttacker = ATTACKER_ROLES.includes(mate.slotRoleCode);
    const ownerOnExtremeWing = owner.y < 18 || owner.y > 82;
    if (inAttackingHalf && carrierIsAttacker && mateIsAttacker && !ownerOnExtremeWing) {
      continue;
    }

    const dist = distance(mate, owner);
    const maxRange = 36 + Math.max(0, ownerPassStat - 70) * 0.7;
    if (dist < 6 || dist > maxRange) continue;

    const forwardProgress = (mate.x - owner.x) * dir;
    if (forwardProgress < 3) continue;

    let score = forwardProgress * 2.5;

    if (MIDFIELDER_ROLES.includes(mate.slotRoleCode)) {
      score += 36;
    }
    if (inAttackingHalf && ['ST', 'LST', 'RST', 'LW', 'RW', 'CAM'].includes(mate.slotRoleCode)) {
      score += 52;
    } else if (FULLBACK_ROLES.includes(mate.slotRoleCode) && mate.isOverlapping) {
      score += 38;
    }

    const closestDefenderDist = Math.min(...opponents.map((o) => distance(o, mate)));
    if (closestDefenderDist < 5.5) score -= 55;
    else if (closestDefenderDist > 9.5) score += 38;

    const laneBlocked = opponents.some(
      (o) => distance(o, owner) > 3 && distance(o, mate) > 3 && distToSegment(o, owner, mate) < 3.4
    );
    if (laneBlocked) score -= 48;

    // 수비 라인 근처(라인 앞뒤)에서 침투하는 공격수에게 스루패스를 시도함
    if (inAttackingHalf && STRIKER_ROLES.includes(mate.slotRoleCode) && Math.abs(mate.x - oppLineX) <= 4.5) {
      score += 24;
    }
    score += (Math.random() - 0.5) * 14;

    if (score > bestScore) {
      bestScore = score;
      best = mate;
    }
  }

  return best;
}

function handleCarrierDecision(engine, carrier, state, now) {
  const ball = engine.ball;
  const all = [...engine.agents.values()];
  const isHome = carrier.team === 'HOME';
  const dir = isHome ? 1 : -1;
  const enemyGoalX = isHome ? 96 : 4;
  const distToGoal = Math.hypot(enemyGoalX - carrier.x, 50 - carrier.y);

  ball.holdFrames = (ball.holdFrames || 0) + 1;

  if (ball.setPieceState === 'PENALTY') {
    if (ball.holdFrames >= 10) {
      triggerShot(engine, carrier, state, now, 'PENALTY');
    }
    return;
  }

  if (ball.setPieceState === 'CORNER') {
    if (ball.cornerWaiting) {
      const arrived =
        Math.hypot(carrier.x - carrier.targetX, carrier.y - carrier.targetY) < 2.5 || ball.holdFrames > 600;
      if (arrived) {
        ball.cornerWaiting = false;
        ball.holdFrames = 0;
      }
      return;
    }
    if (ball.holdFrames >= 25) {
      const boxTargets = all.filter(
        (p) =>
          p.team === carrier.team &&
          !p.isSentOff &&
          p.uid !== carrier.uid &&
          (isHome ? p.x >= 72 : p.x <= 28)
      );
      const target =
        boxTargets.length > 0
          ? boxTargets[Math.floor(Math.random() * boxTargets.length)]
          : selectBestPassTarget(engine, carrier, 'DIRECT_LONG', ball, true);

      if (target) {
        adjustPlayerLiveStat(engine, carrier, {
          flashText: '🚩 코너킥 크로스!',
          flashColor: '#fbbf24',
          now,
        });
        executePassToPlayer(engine, carrier, target, state, now, true, false, true);
      } else {
        ball.setPieceState = null;
      }
    }
    return;
  }

  if (ball.setPieceState === 'FREE_KICK') {
    if (ball.holdFrames >= 10) {
      if (distToGoal <= 32 && Math.random() < 0.65) {
        triggerShot(engine, carrier, state, now, 'FREE_KICK');
      } else {
        const target = selectBestPassTarget(engine, carrier, 'DIRECT_LONG', ball, true);
        if (target) {
          executePassToPlayer(engine, carrier, target, state, now, true, false, true);
        } else {
          ball.setPieceState = null;
        }
      }
    }
    return;
  }

  if (carrier.role === 'GK' || carrier.roleCode === 'GK') {
    const enemySide = isHome ? 'AWAY' : 'HOME';
    pushAttackersAwayFromKeeper(engine, enemySide);

    if (ball.holdFrames >= 5) {
      const targets = all
        .filter(
          (p) =>
            p.team === carrier.team &&
            !p.isSentOff &&
            p.uid !== carrier.uid &&
            (p.role === 'DF' || MIDFIELDER_ROLES.includes(p.slotRoleCode))
        )
        .sort((a, b) => distance(a, carrier) - distance(b, carrier));

      if (targets.length > 0) {
        const target = targets[Math.floor(Math.random() * Math.min(4, targets.length))];
        executePassToPlayer(engine, carrier, target, state, now, false, true);
      }
    }
    return;
  }

  if (ball.lastPasserUid && (isHome ? carrier.x >= 72 : carrier.x <= 28) && ball.holdFrames >= 2 && !engine.bannerActive) {
    const isHeaderFinish = Math.random() < 0.6;
    if (isHeaderFinish) carrier.jumpUntil = now + 500;
    triggerShot(engine, carrier, state, now, isHeaderFinish ? 'HEADER' : 'NORMAL');
    return;
  }

  const inFlankOrHalfSpace =
    (isHome ? carrier.x >= 62 : carrier.x <= 38) && (carrier.y < 26 || carrier.y > 74);

  if (inFlankOrHalfSpace && ball.holdFrames >= 5) {
    const boxMates = all.filter(
      (p) =>
        p.team === carrier.team &&
        !p.isSentOff &&
        p.uid !== carrier.uid &&
        (isHome ? p.x >= 68 : p.x <= 32) &&
        p.y >= 26 &&
        p.y <= 74
    );

    const passStat = carrier.baseStats?.passing || 75;
    const shootStat = carrier.baseStats?.shooting || 74;
    const crossDesire =
      (carrier.instruction === 'STAY_WIDE' || carrier.instruction === 'OVERLAP' ? 0.78 : 0.55) +
      (passStat - shootStat) * 0.01;

    if (boxMates.length > 0 && Math.random() < clamp(crossDesire, 0.25, 0.85)) {
      const target = boxMates[Math.floor(Math.random() * boxMates.length)];
      adjustPlayerLiveStat(engine, carrier, {
        flashText: '🎯 얼리 크로스!',
        flashColor: '#38bdf8',
        now,
      });
      executePassToPlayer(engine, carrier, target, state, now, true, false, true);
      return;
    }
  }

  const inBox = (isHome ? carrier.x >= 72 : carrier.x <= 28) || distToGoal <= 25;
  if (inBox && !engine.bannerActive) {
    const onExtremeWing = carrier.y < 17 || carrier.y > 83;
    if (onExtremeWing && ball.holdFrames >= 4) {
      const boxTarget = selectBestPassTarget(engine, carrier, 'DIRECT_LONG', ball, true);
      if (boxTarget) {
        executePassToPlayer(engine, carrier, boxTarget, state, now, true);
        return;
      }
    }

    if (ball.holdFrames >= 4) {
      const isWinger = WINGER_ROLES.includes(carrier.slotRoleCode);
      const style = isWinger ? 'CUT_INSIDE' : ball.teamPassChain >= 3 ? 'TIKI_TAKA' : 'NORMAL';
      triggerShot(engine, carrier, state, now, style);
      return;
    }

    carrier.targetX = isHome ? 80 : 20;
    carrier.targetY = carrier.y + (50 - carrier.y) * 0.4;
    return;
  }

  if (ball.mustPassAfterSteal && ball.holdFrames >= 4) {
    const teamObj = isHome ? state.homeTeam : state.awayTeam;
    const target = selectBestPassTarget(engine, carrier, teamObj?.tactics?.passingStyle || 'DIRECT_LONG', ball, false);
    if (target) {
      executePassToPlayer(engine, carrier, target, state, now, false);
      return;
    }
    ball.mustPassAfterSteal = false;
  }

  const isWinger = WINGER_ROLES.includes(carrier.slotRoleCode);
  const isAttacker = ATTACKER_ROLES.includes(carrier.slotRoleCode);

  if (isWinger) {
    const cutInFactor = (isHome ? carrier.x >= 54 : carrier.x <= 46) ? 0.52 : 0.15;
    carrier.targetX = isHome ? 78 : 22;
    carrier.targetY = carrier.y + (50 - carrier.y) * cutInFactor;
  } else if (isAttacker) {
    carrier.targetX = isHome ? 79 : 21;
    carrier.targetY = carrier.y + (50 - carrier.y) * 0.38;
    return;
  } else {
    carrier.targetX = clamp(carrier.x + dir * 20, 18, 76);
    carrier.targetY = carrier.y + (50 - carrier.y) * 0.2;
  }

  const isMidfielder = MIDFIELDER_ROLES.includes(carrier.slotRoleCode);
  const inMidShootZone = isHome ? carrier.x >= 60 && carrier.x < 72 : carrier.x <= 40 && carrier.x > 28;
  if (isMidfielder && inMidShootZone && ball.holdFrames >= 9 && !engine.bannerActive) {
    const shootStat = carrier.baseStats?.shooting || 74;
    const midShootChance = clamp((shootStat - 60) * 0.018, 0.18, 0.55);
    if (Math.random() < midShootChance) {
      triggerShot(engine, carrier, state, now, 'LONG_SHOT');
      return;
    }
  }

  const holdLimit = carrier.role === 'DF' ? 8 : 14;
  if (ball.holdFrames >= holdLimit) {
    const teamObj = isHome ? state.homeTeam : state.awayTeam;
    const passingStyle = teamObj?.tactics?.passingStyle || 'BALANCED';
    const isMaestro = isMaestroPlaymaker(carrier);
    const bestMate = selectBestPassTarget(engine, carrier, passingStyle, ball, isMaestro);

    if (bestMate) {
      if (isMaestro && (isHome ? bestMate.x - carrier.x >= 12 : carrier.x - bestMate.x >= 12)) {
        carrier.flash = { type: 'KILLER_PASS', until: now + 900 };
        executePassToPlayer(engine, carrier, bestMate, state, now, true);
      } else {
        executePassToPlayer(engine, carrier, bestMate, state, now, false);
      }
    }
  }
}

function resolveOneOnOneDuel(engine, owner, chaser, state, now) {
  if (owner.role === 'GK' || owner.roleCode === 'GK' || chaser.role === 'GK' || chaser.roleCode === 'GK') {
    return;
  }
  if (now - (engine.lastDuelAt || 0) < 480) return;
  engine.lastDuelAt = now;

  const { ball } = engine;
  const store = useLiveMatchStore.getState();
  const isOwnerHome = owner.team === 'HOME';
  const attackDir = isOwnerHome ? 1 : -1;

  adjustPlayerLiveStat(engine, owner, { staminaDrain: 0.28 });
  adjustPlayerLiveStat(engine, chaser, { staminaDrain: 0.30 });

  const dribStat =
    (owner.baseStats?.dribbling || 75) * 0.55 +
    (owner.baseStats?.speed || 75) * 0.25 +
    (owner.baseStats?.physical || 75) * 0.20;
  const passStat = owner.baseStats?.passing || 75;
  const defStat =
    (chaser.baseStats?.defense || 75) * 0.60 +
    (chaser.baseStats?.physical || 75) * 0.25 +
    (chaser.baseStats?.speed || 75) * 0.15;

  const defTeamObj = chaser.team === 'HOME' ? state.homeTeam : state.awayTeam;
  const isAggressivePress = defTeamObj?.tactics?.pressing === 'GEGENPRESS' || defTeamObj?.tactics?.pressing === 'HIGH';
  const effectiveDefPressure = defStat + (isAggressivePress ? 6 : 0);

  if (MIDFIELDER_ROLES.includes(owner.slotRoleCode)) {
    const escapeTarget = selectBestPassTarget(engine, owner, 'DIRECT_LONG', ball, true);
    const passAdvantage = (passStat - effectiveDefPressure) * 0.02;
    const quickReleaseProb = clamp(0.42 + passAdvantage, 0.2, 0.78);

    if (escapeTarget && Math.random() < quickReleaseProb) {
      adjustPlayerLiveStat(engine, owner, {
        ratingDelta: +0.18,
        flashText: '🎯 탈압박 패스! (+0.2)',
        flashColor: '#2dd4bf',
        now,
      });
      chaser.stunUntil = now + 500;
      executePassToPlayer(engine, owner, escapeTarget, state, now, true);
      return;
    }
  }

  const relativeX = (chaser.x - owner.x) * attackDir;
  const isFromBehind = relativeX < -1.8;
  const alreadyBooked = (chaser.yellowCards || 0) >= 1;

  const statDiff = effectiveDefPressure - dribStat;
  const cleanStealProb = clamp(0.50 + statDiff * 0.018 - (isFromBehind ? 0.1 : 0), 0.18, 0.78);
  const foulOnTackleProb = alreadyBooked ? 0.08 : isFromBehind ? 0.24 : 0.16;

  const slideAngle = Math.atan2(owner.y - chaser.y, owner.x - chaser.x);
  chaser.slideUntil = now + 420;
  chaser.slideAngle = slideAngle;
  engine.slidingEffects.push({
    x: chaser.x,
    y: chaser.y,
    tx: owner.x,
    ty: owner.y,
    color: chaser.team === 'HOME' ? '#38bdf8' : '#fb7185',
    until: now + 450,
  });

  const roll = Math.random();

  if (roll < foulOnTackleProb) {
    const maliceScore = (isFromBehind ? 35 : 10) + (isAggressivePress ? 10 : 0) + Math.random() * 55;
    const inPenaltyBox =
      (isOwnerHome ? owner.x >= 83 : owner.x <= 17) && owner.y >= 22 && owner.y <= 78;

    let cardSeverity = 'FOUL_ONLY';
    const teamRedCount = defTeamObj?.stats?.redCards || 0;
    if (isFromBehind && maliceScore >= 92 && teamRedCount === 0) {
      cardSeverity = 'DIRECT_RED';
      adjustPlayerLiveStat(engine, chaser, { ratingDelta: -1.5, flashText: '🟥 퇴장! (-1.5)', flashColor: '#ef4444', now });
    } else if (maliceScore >= 62 && (!alreadyBooked || maliceScore >= 85)) {
      cardSeverity = 'YELLOW';
      adjustPlayerLiveStat(engine, chaser, { ratingDelta: -0.4, flashText: '🟨 경고 (-0.4)', flashColor: '#facc15', now });
    } else {
      adjustPlayerLiveStat(engine, chaser, { ratingDelta: -0.15, flashText: '📢 반칙 (-0.1)', flashColor: '#fb923c', now });
    }

    const isPenaltyAwarded = inPenaltyBox && (isFromBehind || maliceScore >= 45);
    const setPieceResult = isPenaltyAwarded ? 'PENALTY' : 'FREE_KICK';

    if (typeof store.recordCanvasFoulAndCard === 'function') {
      store.recordCanvasFoulAndCard({
        defenderTeamSide: chaser.team,
        foulerSlotIndex: chaser.slotIndex,
        victimName: owner.name,
        isFromBehind,
        cardSeverity,
        setPieceResult,
      });
    }

    setupFoulRestartPlay(engine, owner.team, owner.x, owner.y, isPenaltyAwarded, now);
    return;
  }

  if (roll < foulOnTackleProb + cleanStealProb) {
    ball.ownerUid = chaser.uid;
    ball.holdFrames = 0;
    ball.boxPassCount = 0;
    ball.teamPassChain = 0;
    ball.lastPasserUid = null;
    ball.lastPasserName = null;
    ball.mustPassAfterSteal = true;

    const isMidBattle = MIDFIELDER_ROLES.includes(chaser.slotRoleCode);
    adjustPlayerLiveStat(engine, chaser, {
      ratingDelta: +0.35,
      flashText: isMidBattle ? '⚔️ 중원장악! (+0.3)' : '🛡️ 태클성공! (+0.3)',
      flashColor: '#38bdf8',
      now,
    });
    adjustPlayerLiveStat(engine, owner, {
      ratingDelta: -0.3,
      flashText: isMidBattle ? '📉 중원패배 (-0.3)' : '📉 돌파막힘 (-0.3)',
      flashColor: '#f87171',
      now,
    });

    chaser.burstUntil = now + 600;
    engine.attackTeam = chaser.team;
    owner.stunUntil = now + 750;

    if (typeof store.recordCanvasTackle === 'function') {
      store.recordCanvasTackle(chaser.team, chaser.slotIndex);
    }
    return;
  }

  adjustPlayerLiveStat(engine, owner, {
    ratingDelta: +0.3,
    flashText: '⚡ 돌파성공! (+0.3)',
    flashColor: '#a3e635',
    now,
  });
  adjustPlayerLiveStat(engine, chaser, {
    ratingDelta: -0.35,
    flashText: '📉 수비뚫림 (-0.3)',
    flashColor: '#f87171',
    now,
  });

  owner.burstUntil = now + 850;
  chaser.stunUntil = now + 800;
}

function updateBallPhysics(engine, activePlayers, state, playbackSpeed = 1, now) {
  const { ball } = engine;
  const simSpeed = clamp(playbackSpeed || 1, 1, 2.5);

  if (ball.mode === 'SHOT') {
    ball.shotFrames = (ball.shotFrames || 0) + 1;
    const dx = ball.targetX - ball.x;
    const dy = ball.targetY - ball.y;
    const dist = Math.hypot(dx, dy);
    const shotSpeed = (ball.shotSpeed || SHOT_SPEED) * simSpeed;

    if (dist <= shotSpeed + 1.8 || ball.shotFrames > SHOT_TIMEOUT_FRAMES) {
      ball.x = ball.targetX;
      ball.y = ball.targetY;
      ball.z = 0;
      ball.shotFrames = 0;
      ball.isShot = false;

      if (ball.isGoalOutcome && ball.shotOutcome === 'GOAL') {
        ball.mode = 'GOAL_NET';
      } else {
        const defendSide = ball.shotTeam === 'HOME' ? 'AWAY' : 'HOME';
        const attackSide = ball.shotTeam || 'HOME';
        const enemyGk = activePlayers.find(
          (p) => p.team === defendSide && (p.role === 'GK' || p.roleCode === 'GK') && !p.isSentOff
        );

        pushAttackersAwayFromKeeper(engine, attackSide);

        if (enemyGk && ball.shotOutcome === 'SAVED') {
          if (Math.random() < 0.35) {
            startCornerPrelude(engine, attackSide, now);
            return;
          }
          ball.mode = 'LOCKED';
          ball.ownerUid = enemyGk.uid;
          ball.holdFrames = 0;
          ball.teamPassChain = 0;
          ball.x = enemyGk.x;
          ball.y = enemyGk.y;
          ball.keeperSaveFlashEnd = now + 900;
          ball.keeperSaveText = '🧤 SUPER SAVE! (+0.4)';
          engine.attackTeam = defendSide;
        } else if (enemyGk) {
          ball.mode = 'LOCKED';
          ball.ownerUid = enemyGk.uid;
          ball.holdFrames = 0;
          ball.teamPassChain = 0;
          ball.x = enemyGk.x;
          ball.y = enemyGk.y;
          engine.attackTeam = defendSide;
        } else {
          ball.mode = 'LOOSE';
          ball.ownerUid = null;
        }
      }
    } else {
      ball.x += (dx / dist) * shotSpeed;
      ball.y += (dy / dist) * shotSpeed;
    }

    ball.shotTrail.push({ x: ball.x, y: ball.y, t: now });
    if (ball.shotTrail.length > 16) ball.shotTrail.shift();
    return;
  }

  if (ball.mode === 'LOCKED') {
    ball.z = 0;
    ball.isAerial = false;
    const owner = ball.ownerUid
      ? activePlayers.find((p) => p.uid === ball.ownerUid && !p.isSentOff)
      : null;
    if (!owner) {
      ball.mode = 'LOOSE';
      ball.ownerUid = null;
      ball.vx = 0;
      ball.vy = 0;
    } else if (ball.setPieceState === 'CORNER' && owner.uid === ball.cornerKickerUid) {
      // 코너킥을 차기 전까지 공은 코너 지점에 그대로 둠
      ball.vx = 0;
      ball.vy = 0;
    } else {
      const dirX = owner.team === 'HOME' ? 1.25 : -1.25;
      ball.x = owner.x + dirX;
      ball.y = owner.y;
      ball.targetX = ball.x;
      ball.targetY = ball.y;
      ball.vx = 0;
      ball.vy = 0;
    }
    return;
  }

  if (ball.mode === 'PASS') {
    ball.passFrames = (ball.passFrames || 0) + 1;
    const receiver = ball.targetUid
      ? activePlayers.find((p) => p.uid === ball.targetUid && !p.isSentOff)
      : null;

    if (!receiver || ball.passFrames > PASS_TIMEOUT_FRAMES) {
      ball.mode = 'LOOSE';
      ball.z = 0;
      ball.isAerial = false;
      ball.isKillerPass = false;
      ball.isGkClearance = false;
      ball.passTrail = [];
      ball.targetUid = null;
      ball.passFrames = 0;
      ball.vx = 0;
      ball.vy = 0;
      return;
    }

    const totalDist = Math.max(1, Math.hypot(receiver.x - (ball.startX ?? ball.x), receiver.y - (ball.startY ?? ball.y)));
    const remainDist = Math.hypot(receiver.x - ball.x, receiver.y - ball.y);
    const flightProgress = clamp(1 - remainDist / totalDist, 0, 1);

    if (ball.isAerial) {
      ball.z = Math.sin(flightProgress * Math.PI) * 18;
    } else {
      ball.z = 0;
    }

    if (ball.isAerial && !ball.aerialContestResolved && (flightProgress >= 0.65 || remainDist <= 7.5)) {
      const aerialDefenders = activePlayers
        .filter(
          (p) =>
            p.team !== receiver.team &&
            p.role !== 'GK' &&
            now >= (p.stunUntil || 0) &&
            (distance(p, ball) <= 6.2 || distance(p, receiver) <= 6.2)
        )
        .sort((a, b) => distance(a, ball) - distance(b, ball));

      if (aerialDefenders.length > 0) {
        ball.aerialContestResolved = true;
        const defender = aerialDefenders[0];
        const defAerialPower =
          (defender.baseStats?.physical || 76) * 0.55 + (defender.baseStats?.defense || 76) * 0.45;
        const attAerialPower =
          (receiver.baseStats?.physical || 74) * 0.55 + (receiver.baseStats?.shooting || 74) * 0.45;

        const roleBonus = CENTERBACK_ROLES.includes(defender.slotRoleCode) || defender.slotRoleCode === 'CDM' ? 8 : 0;
        const headerWinProb = clamp(0.52 + (defAerialPower + roleBonus - attAerialPower) * 0.018, 0.25, 0.82);

        defender.jumpUntil = now + 520;
        receiver.jumpUntil = now + 520;

        if (Math.random() < headerWinProb) {
          const passer = ball.lastPasserUid ? getAgentByUid(engine, ball.lastPasserUid) : null;
          const isInBox = defender.team === 'HOME' ? ball.x <= 32 : ball.x >= 68;

          adjustPlayerLiveStat(engine, defender, {
            ratingDelta: +0.35,
            staminaDrain: 0.28,
            flashText: isInBox ? '💥 문전 헤딩 커팅! (+0.3)' : '💥 중원 헤딩 커팅! (+0.3)',
            flashColor: '#38bdf8',
            now,
          });
          if (passer) {
            adjustPlayerLiveStat(engine, passer, {
              ratingDelta: -0.2,
              flashText: '📉 크로스 차단됨 (-0.2)',
              flashColor: '#f87171',
              now,
            });
          }

          engine.headerEffects.push({
            x: defender.x,
            y: defender.y,
            color: defender.team === 'HOME' ? '#38bdf8' : '#fb7185',
            until: now + 550,
          });

          const store = useLiveMatchStore.getState();
          if (typeof store.recordCanvasTackle === 'function') {
            store.recordCanvasTackle(defender.team, defender.slotIndex);
          }

          const clearDir = defender.team === 'HOME' ? 1 : -1;
          const clearMates = activePlayers
            .filter(
              (m) =>
                m.team === defender.team &&
                m.uid !== defender.uid &&
                m.role !== 'GK' &&
                (m.x - defender.x) * clearDir > 4
            )
            .sort((a, b) => distance(a, defender) - distance(b, defender));

          if (clearMates.length > 0) {
            const clearTarget = clearMates[Math.floor(Math.random() * Math.min(3, clearMates.length))];
            ball.startX = defender.x;
            ball.startY = defender.y;
            ball.x = defender.x;
            ball.y = defender.y;
            ball.targetUid = clearTarget.uid;
            ball.targetX = clearTarget.x;
            ball.targetY = clearTarget.y;
            ball.lastPasserUid = defender.uid;
            ball.lastPasserName = defender.name;
            ball.lastPasserSlotIndex = defender.slotIndex;
            ball.lastPasserRole = defender.role;
            ball.passFrames = 0;
            ball.teamPassChain = 1;
            ball.isKillerPass = false;
            ball.isAerial = true;
            ball.aerialContestResolved = true;
            engine.attackTeam = defender.team;
          } else {
            ball.mode = 'LOCKED';
            ball.z = 0;
            ball.isAerial = false;
            ball.ownerUid = defender.uid;
            ball.targetUid = null;
            ball.holdFrames = 0;
            ball.mustPassAfterSteal = true;
            engine.attackTeam = defender.team;
          }
          return;
        }
      }
    }

    if (!ball.isAerial && !ball.isGkClearance) {
      const interceptors = activePlayers
        .filter(
          (p) =>
            p.team !== receiver.team &&
            p.role !== 'GK' &&
            now >= (p.stunUntil || 0) &&
            distance(p, ball) <= 3.0
        )
        .sort((a, b) => distance(a, ball) - distance(b, ball));

      if (interceptors.length > 0) {
        const interceptor = interceptors[0];
        const defStat = interceptor.baseStats?.defense || 75;
        const passer = ball.lastPasserUid ? getAgentByUid(engine, ball.lastPasserUid) : null;
        const passStat = passer?.baseStats?.passing || 75;

        const interceptChance = clamp(0.28 + (defStat - passStat) * 0.012, 0.12, 0.52);
        if (Math.random() < interceptChance) {
          adjustPlayerLiveStat(engine, interceptor, {
            ratingDelta: +0.3,
            staminaDrain: 0.2,
            flashText: '🛡️ 패스차단! (+0.3)',
            flashColor: '#60a5fa',
            now,
          });
          if (passer) {
            adjustPlayerLiveStat(engine, passer, {
              ratingDelta: -0.2,
              flashText: '📉 패스미스 (-0.2)',
              flashColor: '#f87171',
              now,
            });
          }

          ball.mode = 'LOCKED';
          ball.z = 0;
          ball.isKillerPass = false;
          ball.isGkClearance = false;
          ball.passTrail = [];
          ball.ownerUid = interceptor.uid;
          ball.targetUid = null;
          ball.holdFrames = 0;
          ball.teamPassChain = 0;
          ball.lastPasserUid = null;
          ball.lastPasserName = null;
          ball.mustPassAfterSteal = true;
          interceptor.stunUntil = 0;
          engine.attackTeam = interceptor.team;
          const store = useLiveMatchStore.getState();
          if (typeof store.recordCanvasTackle === 'function') {
            store.recordCanvasTackle(interceptor.team, interceptor.slotIndex);
          }
          return;
        }
      }
    }

    const dx = receiver.x - ball.x;
    const dy = receiver.y - ball.y;
    const dist = Math.hypot(dx, dy);
    const passSpeed = (ball.isGkClearance ? 2.2 : ball.isKillerPass ? 2.1 : 1.75) * simSpeed;
    if (dist <= passSpeed + 1.5) {
      ball.mode = 'LOCKED';
      ball.z = 0;
      ball.isAerial = false;
      ball.isGkClearance = false;
      ball.ownerUid = receiver.uid;
      ball.targetUid = null;
      ball.x = receiver.x;
      ball.y = receiver.y;
      ball.holdFrames = 0;
      ball.passFrames = 0;
      ball.passTrail = [];
    } else {
      ball.x += (dx / dist) * passSpeed;
      ball.y += (dy / dist) * passSpeed;
      if (ball.isKillerPass || ball.isAerial) {
        ball.passTrail.push({ x: ball.x, y: ball.y });
        if (ball.passTrail.length > 14) ball.passTrail.shift();
      }
    }
    return;
  }

  ball.mode = 'LOOSE';
  ball.z = 0;
  ball.isAerial = false;
  ball.isKillerPass = false;
  ball.isGkClearance = false;
  ball.passTrail = [];
  ball.vx *= 0.75;
  ball.vy *= 0.75;
  if (Math.abs(ball.vx) < 0.05) ball.vx = 0;
  if (Math.abs(ball.vy) < 0.05) ball.vy = 0;
  ball.x += ball.vx;
  ball.y += ball.vy;

  let nearestPlayer = null;
  let minDist = Infinity;
  for (const p of activePlayers) {
    if (p.isSentOff || now < (p.stunUntil || 0)) continue;
    const d = Math.hypot(p.x - ball.x, p.y - ball.y);
    if (d < minDist) {
      minDist = d;
      nearestPlayer = p;
    }
  }

  if (nearestPlayer) {
    if (minDist <= 3.5) {
      ball.mode = 'LOCKED';
      ball.ownerUid = nearestPlayer.uid;
      ball.targetUid = null;
      ball.holdFrames = 0;
      engine.attackTeam = nearestPlayer.team;
    } else {
      nearestPlayer.targetX = ball.x;
      nearestPlayer.targetY = ball.y;
    }
  }

  ball.x = clamp(ball.x, 4, 96);
  ball.y = clamp(ball.y, 6, 94);
}

function updateBallAndMatchFlow(engine, state, now, setGoalBanner) {
  const { ball, agents } = engine;
  const speed = state.playbackSpeed || 1;
  const activePlayers = [...agents.values()].filter((a) => !a.isSentOff);

  if (engine.cornerPrelude) {
    advanceCornerPrelude(engine, now, speed);
    return;
  }

  updateBallPhysics(engine, activePlayers, state, speed, now);

  if (ball.mode === 'GOAL_NET') {
    const store = useLiveMatchStore.getState();
    const scoringTeam = ball.shotTeam || 'HOME';
    const cleanScorer = ball.shooterName || '스트라이커';
    const cleanAssister =
      ball.assisterName && ball.assisterName !== cleanScorer ? ball.assisterName : null;

    if (typeof store.recordActualCanvasGoal === 'function') {
      store.recordActualCanvasGoal({
        teamSide: scoringTeam,
        shooterSlotIndex: ball.shooterSlotIndex,
        scorerId: ball.shooterId,
        scorerName: cleanScorer,
        assisterSlotIndex: ball.assisterSlotIndex,
        assisterId: ball.assisterId,
        assisterName: cleanAssister,
        goalStyle: ball.goalStyle,
        isGkMistake: Boolean(ball.isGkMistake),
      });
    }

    startGoalSequence(engine, now, scoringTeam);
    store.setGoalSequence('CELEBRATION');

    const minute = state.minute || 1;
    setGoalBanner({
      id: `${minute}_${now}`,
      minute,
      team: scoringTeam,
      scorerName: cleanScorer,
      assistDisplay: cleanAssister
        ? `🎯 어시스트: ${cleanAssister}`
        : ball.isGkMistake
        ? '⚡ 상대 키퍼 실책을 틈탄 단독 돌파 골!'
        : '⚡ 단독 돌파 원더골!',
    });
    return;
  }

  if (ball.mode === 'LOCKED') {
    const owner = ball.ownerUid ? getAgentByUid(engine, ball.ownerUid) : null;
    if (!owner || owner.isSentOff) {
      const heir = activePlayers
        .filter((a) => a.team === engine.attackTeam && a.role !== 'GK')
        .sort((a, b) => distance(a, ball) - distance(b, ball))[0];
      if (heir) {
        ball.ownerUid = heir.uid;
        ball.holdFrames = 0;
      } else {
        ball.mode = 'LOOSE';
        ball.ownerUid = null;
      }
      return;
    }
    handleCarrierDecision(engine, owner, state, now);
  }
}

function movePlayerSmooth(engine, player, playbackSpeed, isSprinting, weatherSpeedMod = 1.0, now = 0) {
  if (player.stunUntil && now < player.stunUntil) {
    player.vx *= 0.55;
    player.vy *= 0.55;
    return;
  }

  const dx = player.targetX - player.x;
  const dy = player.targetY - player.y;
  const dist = Math.hypot(dx, dy);

  if (dist < 0.25) {
    player.vx *= 0.5;
    player.vy *= 0.5;
    return;
  }

  const speedStat = player.speedStat || 80;
  const staminaMod = player.stamina < 30 ? 0.72 : player.stamina < 55 ? 0.88 : 1.0;
  const injuryMod = player.isInjured ? 0.75 : 1.0;
  const boost =
    player.burstUntil && now < player.burstUntil
      ? 1.55
      : isSprinting
      ? 1.38
      : player.isOverlapping || player.isMakingRun
      ? 1.32
      : 1.0;

  const maxStep = Math.min(
    1.05,
    0.28 * (speedStat / 80) * staminaMod * injuryMod * weatherSpeedMod * boost * clamp(playbackSpeed || 1, 1, 2.5)
  );

  const desiredSpeed = dist < 2.8 ? maxStep * (dist / 2.8) : maxStep;
  const desiredVx = (dx / dist) * desiredSpeed;
  const desiredVy = (dy / dist) * desiredSpeed;

  player.vx = (player.vx || 0) * 0.76 + desiredVx * 0.24;
  player.vy = (player.vy || 0) * 0.76 + desiredVy * 0.24;

  player.x += player.vx;
  player.y += player.vy;

  const actualMoved = Math.hypot(player.vx, player.vy);
  player.distanceMoved = (player.distanceMoved || 0) + actualMoved;

  if (player.role !== 'GK' && actualMoved > 0.12) {
    const roleDrainMod = FULLBACK_ROLES.includes(player.slotRoleCode) ? 0.65 : 1.0;
    const sprintFactor = isSprinting || player.isOverlapping || player.isMakingRun ? 1.65 : 0.45;
    const extraMoveDrain = actualMoved * 0.0055 * sprintFactor * roleDrainMod;
    adjustPlayerLiveStat(engine, player, { staminaDrain: extraMoveDrain });
  }
}

function updatePlayerPositions(engine, state, playbackSpeed, now) {
  const { ball, agents } = engine;
  const all = [...agents.values()];
  const active = all.filter((a) => !a.isSentOff);
  const weatherSpeedMod = state.weather?.speedMod || 1.0;

  for (const a of all) {
    a.hasBall = ball.mode === 'LOCKED' && a.uid === ball.ownerUid;
    a.isPressing = false;
    a.isMakingRun = false;
    a.isSteppingUpTrap = false;
    a.markingTargetUid = null;
  }

  const owner = ball.ownerUid ? getAgentByUid(engine, ball.ownerUid) : null;
  const ownerIsGk = owner && (owner.role === 'GK' || owner.roleCode === 'GK');

  // 코너킥 크로스가 끝난 뒤 코너를 찬 팀이 공을 갖고 있지 않으면(상대 소유 또는 주인 없는 공) 역습 대응(복귀) 구간으로 처리함
  const cornerDeliveryActive = ball.setPieceState === 'CORNER' || (ball.mode === 'PASS' && ball.isCornerCross);
  const cornerTransition = engine.cornerTransition;
  const cornerTransitionOn =
    Boolean(cornerTransition) &&
    !cornerDeliveryActive &&
    !ball.setPieceState &&
    (now - cornerTransition.startedAt) * Math.max(1, playbackSpeed || 1) < CORNER_TRANSITION_SIM_MS &&
    (owner ? owner.team !== cornerTransition.team : true);

  let attackingTeam = owner ? owner.team : ball.x < 50 ? 'AWAY' : 'HOME';
  // 주인 없는 공이 박스 근처에 있어도 이 구간에는 코너를 찬 팀을 '수비 중'으로 간주해 공격 가담을 멈추고 복귀시킴
  if (cornerTransitionOn && !owner) attackingTeam = cornerTransition.team === 'HOME' ? 'AWAY' : 'HOME';
  const defendingTeam = attackingTeam === 'HOME' ? 'AWAY' : 'HOME';
  const defTrapEnabled = isOffsideTrapEnabled(state, defendingTeam);

  const ballInMidfieldZone = ball.x >= 30 && ball.x <= 70;
  const triggerTrapStepUp = defTrapEnabled && !ownerIsGk && ballInMidfieldZone && ball.mode === 'LOCKED';

  const synchronizedTrapLineX =
    defendingTeam === 'HOME'
      ? clamp(28 + (ball.x - 50) * 0.35 + (triggerTrapStepUp ? 6.0 : 0), 22, 46)
      : clamp(72 + (ball.x - 50) * 0.35 - (triggerTrapStepUp ? 6.0 : 0), 54, 78);

  const defCandidates = ownerIsGk
    ? []
    : active
        .filter((p) => p.team === defendingTeam && p.role !== 'GK' && p.roleCode !== 'GK' && now >= (p.stunUntil || 0))
        .filter((p) => Math.hypot(ball.x - p.baseX, ball.y - p.baseY) <= 40)
        .sort((a, b) => distance(a, ball) - distance(b, ball));

  const primaryChaserUid = defCandidates[0]?.uid || null;
  const secondaryChaserUid =
    defCandidates[1] && distance(defCandidates[1], ball) <= 22 ? defCandidates[1].uid : null;

  if (owner && !ownerIsGk && primaryChaserUid && !ball.setPieceState) {
    const chaser = getAgentByUid(engine, primaryChaserUid);
    if (chaser && now >= (chaser.stunUntil || 0) && distance(chaser, owner) <= 3.3) {
      resolveOneOnOneDuel(engine, owner, chaser, state, now);
    }
  }

  const enemyAttackers = active.filter(
    (p) => p.team === attackingTeam && (ATTACKER_ROLES.includes(p.slotRoleCode) || p.slotRoleCode === 'CAM')
  );
  const assignedAttackers = new Set();

  if (!defTrapEnabled) {
    for (const def of active) {
      if (
        def.team !== defendingTeam ||
        (def.role !== 'DF' && def.slotRoleCode !== 'CDM') ||
        def.uid === primaryChaserUid
      ) {
        continue;
      }
      const threat = enemyAttackers
        .filter((att) => !assignedAttackers.has(att.uid) && Math.abs(att.y - def.baseY) <= 24)
        .sort((a, b) => distance(a, def) - distance(b, def))[0];

      if (threat) {
        def.markingTargetUid = threat.uid;
        assignedAttackers.add(threat.uid);
      }
    }
  }

  for (const p of all) {
    if (p.isSentOff) {
      p.targetX = p.x;
      p.targetY = p.y < 50 ? -8 : 108;
      movePlayerSmooth(engine, p, playbackSpeed, false, weatherSpeedMod, now);
      continue;
    }

    const isCarrier = ball.mode === 'LOCKED' && ball.ownerUid === p.uid;
    const isChaser = p.uid === primaryChaserUid || p.uid === secondaryChaserUid;
    const dir = p.team === 'HOME' ? 1 : -1;
    const isMyTeamAttacking = p.team === attackingTeam;
    const teamObj = p.team === 'HOME' ? state.homeTeam : state.awayTeam;
    const isAttackingMentality = ['ATTACKING', 'ALL_OUT_ATTACK'].includes(teamObj?.tactics?.mentality);

    const isBallSide = Math.abs(ball.y - p.baseY) <= 28;
    const individualWaveX = Math.sin(now / 950 + p.phaseSeed) * 5.0;
    const individualWaveY = Math.cos(now / 1100 + p.phaseSeed) * 4.0;

    const isCornerSituation = cornerDeliveryActive;

    const isCornerTeamPlayer = cornerTransitionOn && p.team === cornerTransition.team && p.role !== 'GK' && p.roleCode !== 'GK';
    const isStayBackCover = isCornerTeamPlayer && p.cornerRole === 'STAY_BACK';
    const isBallAhead = dir === 1 ? p.x > ball.x - 4 : p.x < ball.x + 4;
    const isRecoveryRunner = isCornerTeamPlayer && !isStayBackCover && isBallAhead;
    // 전환 구간에는 코너를 찬 팀 선수 전원이 전력으로 복귀함
    const isRecovering = isCornerTeamPlayer;

    p.isOverlapping = false;
    p.isPressing = isChaser;

    if (p.role === 'GK' || p.roleCode === 'GK') {
      p.targetX = p.baseX;
      p.targetY = 50 + clamp((ball.y - 50) * 0.14, -5.0, 5.0);
    } else if (isCornerSituation && p.cornerRole && Number.isFinite(p.cornerX)) {
      if (p.cornerRole === 'KICKER' || p.cornerRole === 'STAY_BACK' || p.cornerRole === 'COUNTER_OUTLET') {
        p.targetX = p.cornerX;
        p.targetY = p.cornerY;
      } else {
        const jostleX = Math.sin(now / 180 + p.phaseSeed) * 1.4;
        const jostleY = Math.cos(now / 180 + p.phaseSeed) * 1.6;
        if (ball.mode === 'PASS' && ball.isCornerCross) {
          p.targetX = p.cornerX * 0.4 + ball.targetX * 0.6 + jostleX;
          p.targetY = p.cornerY * 0.4 + ball.targetY * 0.6 + jostleY;
        } else {
          p.targetX = p.cornerX + jostleX;
          p.targetY = p.cornerY + jostleY;
        }
        p.isPressing = p.cornerRole === 'BOX_DEFEND';
        p.isMakingRun = p.cornerRole === 'BOX_ATTACK';
      }
    } else if (isCarrier) {
      // handleCarrierDecision에서 설정된 드리블 목표 유지
    } else if (ball.mode === 'PASS' && ball.targetUid === p.uid) {
      p.targetX = ball.targetX;
      p.targetY = ball.targetY;
      p.isMakingRun = true;
    } else if (
      ball.mode === 'PASS' &&
      ball.isAerial &&
      p.team === defendingTeam &&
      (p.role === 'DF' || MIDFIELDER_ROLES.includes(p.slotRoleCode)) &&
      Math.hypot(ball.targetX - p.x, ball.targetY - p.y) <= 16
    ) {
      p.targetX = ball.targetX;
      p.targetY = ball.targetY;
      p.isPressing = true;
    } else if (p.uid === primaryChaserUid) {
      p.targetX = ball.x;
      p.targetY = ball.y;
    } else if (p.uid === secondaryChaserUid) {
      const goalX = p.team === 'HOME' ? 10 : 90;
      p.targetX = ball.x + (goalX - ball.x) * 0.18;
      p.targetY = clamp(ball.y + (p.baseY < ball.y ? -5 : 5), 10, 90);
    } else if (isStayBackCover) {
      // 잔류 수비수: 물러나기만 하면 공 소유자와 접촉이 없어 그대로 슈팅까지 허용하므로, 자기 자리를 지키며
      // 공 소유자 쪽 중앙으로 좁혀 들어가 경로를 막고, 가까워지면 한 발 앞으로 나와 순차적으로 1:1 경합을 만듦
      const holdX = Number.isFinite(p.cornerX) ? p.cornerX : p.team === 'HOME' ? 42 : 58;
      const closeIn = clamp(1 - Math.abs(ball.x - holdX) / 26, 0, 1) * 0.45;
      p.targetX = p.team === 'HOME' ? clamp(holdX + (ball.x - holdX) * closeIn, 14, 48) : clamp(holdX + (ball.x - holdX) * closeIn, 52, 86);
      p.targetY = clamp((Number.isFinite(p.cornerY) ? p.cornerY : 50) * 0.35 + ball.y * 0.65, 22, 78);
      p.isPressing = false;
    } else if (isRecoveryRunner) {
      // 박스에 올라가 있던 선수: 공보다 앞선 위치에서 공 뒤쪽(자기 골대 쪽)으로 포지션별 깊이를 두고 전력 복귀함
      const depth = [...FULLBACK_ROLES, ...CENTERBACK_ROLES].includes(p.slotRoleCode)
        ? 10
        : MIDFIELDER_ROLES.includes(p.slotRoleCode)
        ? 7
        : 3;
      p.targetX = dir === 1 ? Math.min(ball.x - depth, 60) : Math.max(ball.x + depth, 40);
      p.targetY = clamp(p.baseY * 0.55 + ball.y * 0.45, 12, 88);
      p.isPressing = false;
      p.isMakingRun = false;
    } else if (!isMyTeamAttacking && p.role === 'DF' && defTrapEnabled) {
      p.targetX = synchronizedTrapLineX;
      p.targetY = clamp(p.baseY + (ball.y - 50) * 0.12, 12, 88);
      p.isSteppingUpTrap = triggerTrapStepUp;
    } else if (!isMyTeamAttacking && p.markingTargetUid) {
      const markTarget = getAgentByUid(engine, p.markingTargetUid);
      if (markTarget) {
        const goalSideOffset = p.team === 'HOME' ? -3.8 : 3.8;
        const maxForwardLine = p.team === 'HOME' ? 40 : 60;
        const rawX = markTarget.x + goalSideOffset;
        p.targetX = p.team === 'HOME' ? clamp(rawX, 12, maxForwardLine) : clamp(rawX, maxForwardLine, 88);
        p.targetY = clamp(markTarget.y * 0.7 + p.baseY * 0.3, 10, 90);
        p.isPressing = distance(p, markTarget) <= 9;
      }
    } else {
      const teamShiftX = clamp((ball.x - 50) * 0.36, -16, 16);
      const teamShiftY = clamp((ball.y - 50) * 0.18, -8, 8);

      const isFullback = FULLBACK_ROLES.includes(p.slotRoleCode);
      const shouldOverlap =
        isFullback &&
        isMyTeamAttacking &&
        isBallSide &&
        p.instruction !== 'STAY_BACK' &&
        (p.instruction === 'OVERLAP' || ['LWB', 'RWB'].includes(p.slotRoleCode) || isAttackingMentality);

      if (shouldOverlap) {
        p.isOverlapping = true;
        p.targetX = p.team === 'HOME' ? clamp(Math.max(ball.x + 10, 66), 52, 76) : clamp(Math.min(ball.x - 10, 34), 24, 48);
        p.targetY = p.baseY < 50 ? 9 : 91;
      } else if (CENTERBACK_ROLES.includes(p.slotRoleCode)) {
        const cbPush = isMyTeamAttacking ? 6 * dir : -6 * dir;
        const rawCbX = p.baseX + teamShiftX * 0.55 + cbPush;
        p.targetX = p.team === 'HOME' ? clamp(rawCbX, 14, 36) : clamp(rawCbX, 64, 86);
        p.targetY = clamp(p.baseY + teamShiftY * 0.7, 16, 84);
      } else if (isFullback) {
        const fbPush = isMyTeamAttacking ? 8 * dir : -6 * dir;
        const rawFbX = p.baseX + teamShiftX * 0.7 + fbPush;
        p.targetX = p.team === 'HOME' ? clamp(rawFbX, 16, 48) : clamp(rawFbX, 52, 84);
        p.targetY = clamp(p.baseY + teamShiftY * 0.8, 10, 90);
      } else if (WINGER_ROLES.includes(p.slotRoleCode)) {
        if (isMyTeamAttacking) {
          p.isMakingRun = isBallSide;
          const runDepth = isBallSide ? 16 * dir : 10 * dir;
          const cutInY = isBallSide ? p.baseY : p.baseY + (50 - p.baseY) * 0.38;
          p.targetX = clamp(p.baseX + teamShiftX + runDepth + individualWaveX, 22, 80);
          p.targetY = clamp(cutInY + individualWaveY, 10, 90);
        } else {
          p.targetX = clamp(p.baseX + teamShiftX * 0.7 - 8 * dir, 20, 80);
          p.targetY = clamp(p.baseY + teamShiftY, 12, 88);
        }
      } else if (MIDFIELDER_ROLES.includes(p.slotRoleCode)) {
        if (isMyTeamAttacking) {
          const surge = p.slotRoleCode === 'CAM' ? 14 * dir : p.slotRoleCode === 'CDM' ? 3 * dir : (isBallSide ? 12 : 6) * dir;
          p.isMakingRun = isBallSide && p.slotRoleCode !== 'CDM';
          p.targetX = clamp(p.baseX + teamShiftX + surge + individualWaveX, 20, 76);
          p.targetY = clamp(p.baseY + teamShiftY + individualWaveY, 12, 88);
        } else {
          p.targetX = clamp(p.baseX + teamShiftX - 10 * dir, 18, 82);
          p.targetY = clamp(p.baseY + teamShiftY + (ball.y - p.baseY) * 0.22, 14, 86);
        }
      } else {
        p.isMakingRun = isMyTeamAttacking;
        const strikerPush = isMyTeamAttacking ? 12 * dir : -6 * dir;
        p.targetX = clamp(p.baseX + teamShiftX + strikerPush + individualWaveX, 22, 80);
        p.targetY = clamp(p.baseY + teamShiftY + individualWaveY * 1.2, 18, 82);

        // 공격수는 상대 수비 라인 앞뒤를 오가며 침투를 시도하므로 라인을 넘는 오프사이드 위치에 서기도 함
        const ballInAttackingHalf = p.team === 'HOME' ? ball.x >= 42 : ball.x <= 58;
        if (isMyTeamAttacking && ballInAttackingHalf && p.slotRoleCode !== 'CAM') {
          const oppLineX = getLastDefenderLineX(all, defendingTeam);
          const lineGamble = Math.sin(now / 1300 + p.phaseSeed * 1.7) * 3.6 + 1.2;
          p.targetX = clamp(oppLineX + dir * lineGamble, 30, 94);
        }
      }
    }

    const isCornerKicker = isCornerSituation && p.cornerRole === 'KICKER';
    if (!isCornerKicker) {
      p.targetX = clamp(p.targetX, 8, 92);
      p.targetY = clamp(p.targetY, 8, 92);
    }
    movePlayerSmooth(engine, p, playbackSpeed, isCarrier || isChaser || isRecovering, weatherSpeedMod, now);
  }
}

function staminaColor(stamina) {
  if (stamina > 60) return '#22c55e';
  if (stamina > 30) return '#eab308';
  return '#ef4444';
}

function ratingColor(rating) {
  if (rating >= 7.5) return '#fde047';
  if (rating >= 6.5) return '#4ade80';
  if (rating >= 5.8) return '#94a3b8';
  return '#f87171';
}

function drawFlash(ctx, agent, px, py, now) {
  if (!agent.flash || now >= agent.flash.until) {
    if (agent.isOverlapping) {
      ctx.save();
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('🏃 OVERLAP', px, py - 22);
      ctx.restore();
    } else if (agent.isSteppingUpTrap) {
      ctx.save();
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#2dd4bf';
      ctx.fillText('🪤 TRAP LINE', px, py - 21);
      ctx.restore();
    } else if (agent.isPressing && !agent.hasBall) {
      ctx.save();
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fb923c';
      ctx.fillText('⚔️ 압박', px, py - 21);
      ctx.restore();
    }
    return;
  }

  const remaining = agent.flash.until - now;
  const alpha = Math.min(1, remaining / 350);
  const bob = Math.sin(now / 120) * 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (agent.flash.type === 'CUSTOM') {
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = agent.flash.color || '#fde047';
    ctx.fillText(agent.flash.text, px, py - 26 + bob);
  } else if (agent.flash.type === 'KILLER_PASS') {
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#2dd4bf';
    ctx.fillText('🎯 킬패스', px, py - 25 + bob);
  } else {
    const label = agent.flash.type === 'SUB' ? '🔄 SUB IN' : '📢 FOUL';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = agent.flash.type === 'SUB' ? '#16a34a' : '#f97316';
    const w = ctx.measureText(label).width + 12;
    ctx.fillRect(px - w / 2, py - 40 + bob, w, 18);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, px, py - 31 + bob);
  }
  ctx.restore();
}

function drawOffsideAndTrapLines(ctx, engine, state, now) {
  const active = [...engine.agents.values()].filter((a) => !a.isSentOff);

  for (const side of ['HOME', 'AWAY']) {
    if (isOffsideTrapEnabled(state, side)) {
      const lineX = getLastDefenderLineX(active, side);
      const px = toPx(lineX);
      ctx.save();
      ctx.strokeStyle = 'rgba(45, 212, 191, 0.45)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(px, MARGIN);
      ctx.lineTo(px, HEIGHT - MARGIN);
      ctx.stroke();
      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = 'rgba(45, 212, 191, 0.85)';
      ctx.textAlign = 'center';
      ctx.fillText('🪤 OFFSIDE TRAP LINE', px, MARGIN + 12);
      ctx.restore();
    }
  }

  if (engine.offsideVisual && now < engine.offsideVisual.until) {
    const ov = engine.offsideVisual;
    const linePx = toPx(ov.lineX);
    const attPx = toPx(ov.attackerX);
    const attPy = toPy(ov.attackerY);

    ctx.save();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.8;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(linePx, MARGIN);
    ctx.lineTo(linePx, HEIGHT - MARGIN);
    ctx.stroke();

    ctx.fillStyle = 'rgba(239, 68, 68, 0.88)';
    ctx.fillRect(linePx - 75, MARGIN + 18, 150, 22);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      ov.trapActive ? `🚩 오프사이드 트랩 적중 (${ov.attackerName})` : `🚩 OFFSIDE (${ov.attackerName})`,
      linePx,
      MARGIN + 29
    );

    ctx.beginPath();
    ctx.arc(attPx, attPy, 19, 0, Math.PI * 2);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
  }
}

function drawSlidingAndHeaderEffects(ctx, engine, now) {
  engine.slidingEffects = (engine.slidingEffects || []).filter((ef) => now < ef.until);
  for (const ef of engine.slidingEffects) {
    const alpha = clamp((ef.until - now) / 450, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha * 0.85;
    ctx.strokeStyle = ef.color;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(toPx(ef.x), toPy(ef.y));
    ctx.lineTo(toPx(ef.tx), toPy(ef.ty));
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(toPx(ef.tx), toPy(ef.ty), 16 * (1.2 - alpha), 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  engine.headerEffects = (engine.headerEffects || []).filter((ef) => now < ef.until);
  for (const ef of engine.headerEffects) {
    const alpha = clamp((ef.until - now) / 550, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha * 0.9;
    ctx.strokeStyle = ef.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(toPx(ef.x), toPy(ef.y) - 10, 22 * (1.15 - alpha), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawPlayersAndBall(ctx, engine, now) {
  const agents = [...engine.agents.values()]
    .filter((a) => !(a.isSentOff && (a.y < -4 || a.y > 104)))
    .sort((a, b) => a.y - b.y);

  for (const a of agents) {
    const px = toPx(a.x);
    const isJumping = a.jumpUntil && now < a.jumpUntil;
    const jumpOffset = isJumping ? -11 * Math.sin(((a.jumpUntil - now) / 520) * Math.PI) : 0;
    const py = toPy(a.y) + jumpOffset;
    const isSliding = a.slideUntil && now < a.slideUntil;

    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(
      px + 2,
      toPy(a.y) + 6,
      isSliding ? 17 : isJumping ? 9 : 12,
      isJumping ? 3.5 : 5,
      isSliding ? a.slideAngle : 0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    if (a.hasBall) {
      ctx.save();
      ctx.shadowColor = '#facc15';
      ctx.shadowBlur = 14;
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(px, py, 17, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const isGK = a.role === 'GK' || a.roleCode === 'GK';
    const fill = isGK
      ? a.team === 'HOME'
        ? '#facc15'
        : '#22c55e'
      : a.team === 'HOME'
      ? '#2563eb'
      : '#e11d48';

    ctx.save();
    if (isSliding) {
      ctx.translate(px, py);
      ctx.rotate(a.slideAngle || 0);
      ctx.fillStyle = fill;
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, 16, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.fillStyle = fill;
      ctx.strokeStyle = isJumping ? '#fde047' : a.isOverlapping ? '#38bdf8' : a.isPressing ? '#fb923c' : '#ffffff';
      ctx.lineWidth = isJumping || a.isOverlapping || a.isPressing ? 2.8 : 2;
      ctx.beginPath();
      ctx.arc(px, py, isJumping ? 13.5 : 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isGK && a.team === 'HOME' ? '#1f2937' : '#ffffff';
    ctx.fillText(String(a.backNumber), px, py + 0.5);

    const liveRatingStr = (a.liveRating ?? 6.0).toFixed(1);
    const labelText = `${a.name} ★${liveRatingStr}`;
    ctx.font = 'bold 10px sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(labelText, px, toPy(a.y) + 24);
    ctx.fillStyle = ratingColor(a.liveRating ?? 6.0);
    ctx.fillText(labelText, px, toPy(a.y) + 24);

    const barWidth = 26;
    const stamina = clamp(a.stamina ?? 100, 0, 100);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(px - barWidth / 2, toPy(a.y) + 31, barWidth, 4);
    ctx.fillStyle = staminaColor(stamina);
    ctx.fillRect(px - barWidth / 2, toPy(a.y) + 31, (barWidth * stamina) / 100, 4);

    if (a.team === 'HOME' && a.familiarity && a.familiarity !== 'NATURAL' && FAMILIARITY_META?.[a.familiarity]) {
      ctx.fillStyle = FAMILIARITY_META[a.familiarity].color;
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px - 11, py - 11, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    if (a.yellowCards === 1) {
      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 1;
      ctx.fillRect(px + 8, py - 18, 6, 9);
      ctx.strokeRect(px + 8, py - 18, 6, 9);
    }

    if (a.isInjured) {
      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = '#f87171';
      ctx.fillText('🚑부상', px, py - 18);
    }

    drawFlash(ctx, a, px, py, now);
  }

  const { ball } = engine;
  const bx = toPx(ball.x);
  const groundBy = toPy(ball.y);
  const airOffset = ball.z || 0;
  const by = groundBy - airOffset;

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(bx + 1.5, groundBy + 4, Math.max(3, 5 - airOffset * 0.12), 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  const ballRadius = 5 + airOffset * 0.12;

  if (ball.isShot || ball.mode === 'SHOT') {
    ctx.save();
    ctx.shadowColor = '#fde047';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#fef9c3';
    ctx.beginPath();
    ctx.arc(bx, by, ballRadius + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if ((ball.isKillerPass || ball.isAerial) && ball.mode === 'PASS') {
    ctx.save();
    ctx.shadowColor = ball.isAerial ? '#38bdf8' : '#2dd4bf';
    ctx.shadowBlur = 14;
    ctx.fillStyle = ball.isAerial ? '#bae6fd' : '#99f6e4';
    ctx.beginPath();
    ctx.arc(bx, by, ballRadius + 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(bx, by, ballRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawShotAndKillerPassTrail(ctx, ball) {
  if ((ball.isKillerPass || ball.isAerial) && ball.passTrail && ball.passTrail.length >= 2) {
    ctx.save();
    ctx.strokeStyle = ball.isAerial ? '#38bdf8' : '#2dd4bf';
    ctx.lineWidth = 2.2;
    ctx.setLineDash([6, 4]);
    ctx.shadowColor = ball.isAerial ? '#38bdf8' : '#2dd4bf';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(toPx(ball.passTrail[0].x), toPy(ball.passTrail[0].y));
    for (let i = 1; i < ball.passTrail.length; i++) {
      ctx.lineTo(toPx(ball.passTrail[i].x), toPy(ball.passTrail[i].y));
    }
    ctx.stroke();
    ctx.restore();
  }

  if (!ball.shotTrail || ball.shotTrail.length < 2) return;
  ctx.save();
  ctx.strokeStyle = '#fde047';
  ctx.lineWidth = 3;
  ctx.shadowColor = '#fde047';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(toPx(ball.shotTrail[0].x), toPy(ball.shotTrail[0].y));
  for (let i = 1; i < ball.shotTrail.length; i++) {
    ctx.lineTo(toPx(ball.shotTrail[i].x), toPy(ball.shotTrail[i].y));
  }
  ctx.stroke();
  ctx.restore();
}

function drawActionFlashes(ctx, engine, now) {
  const ball = engine.ball;
  if (engine.cornerPrelude || ball.cornerWaiting) {
    const px = clamp(toPx(ball.x), 70, WIDTH - 70);
    const py = clamp(toPy(ball.y) + (ball.y < 50 ? 26 : -26), 20, HEIGHT - 20);
    ctx.save();
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(engine.cornerPrelude ? '⛔ 아웃! 코너킥' : '🚩 코너킥 준비', px, py);
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(engine.cornerPrelude ? '⛔ 아웃! 코너킥' : '🚩 코너킥 준비', px, py);
    ctx.restore();
  }
  if (ball.shooterFlashEnd && now < ball.shooterFlashEnd) {
    const shooter = [...engine.agents.values()].find(
      (a) => a.team === ball.shotTeam && a.name === ball.shooterName
    );
    if (shooter) {
      const px = toPx(shooter.x);
      const py = toPy(shooter.y);
      ctx.save();
      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('💥 SHOOT', px, py - 22);
      ctx.restore();
    }
  }

  if (ball.keeperSaveFlashEnd && now < ball.keeperSaveFlashEnd) {
    const defSide = ball.shotTeam === 'HOME' ? 'AWAY' : 'HOME';
    const gk = [...engine.agents.values()].find((a) => a.team === defSide && (a.role === 'GK' || a.roleCode === 'GK'));
    if (gk) {
      const px = toPx(gk.x);
      const py = toPy(gk.y);
      ctx.save();
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(ball.keeperSaveText || '🧤 SAVE', px, py - 22);
      ctx.restore();
    }
  }
}

const lerp = (a, b, k) => a + (b - a) * k;

/**
 * 다시보기용 프레임(전 선수/공 위치 스냅샷)을 일정 간격으로 기록하고 최근 REPLAY_WINDOW_MS만 유지함
 */
function recordReplayFrame(engine, now, force = false) {
  const frames = engine.replayFrames;
  const last = frames[frames.length - 1];
  if (!force && last && now - last.t < REPLAY_SAMPLE_MS) return;

  const agents = new Map();
  for (const [key, a] of engine.agents) {
    agents.set(key, {
      x: a.x,
      y: a.y,
      hasBall: a.hasBall,
      jumpUntil: a.jumpUntil,
      slideUntil: a.slideUntil,
      slideAngle: a.slideAngle,
      isPressing: a.isPressing,
      isOverlapping: a.isOverlapping,
      isSteppingUpTrap: a.isSteppingUpTrap,
      flash: a.flash,
    });
  }
  const b = engine.ball;
  frames.push({
    t: now,
    agents,
    ball: {
      x: b.x,
      y: b.y,
      z: b.z || 0,
      mode: b.mode,
      isShot: b.isShot,
      isKillerPass: b.isKillerPass,
      isAerial: b.isAerial,
      shotTrail: b.shotTrail.slice(),
      passTrail: b.passTrail.slice(),
      shotTeam: b.shotTeam,
      shooterName: b.shooterName,
      shooterFlashEnd: b.shooterFlashEnd,
      keeperSaveFlashEnd: b.keeperSaveFlashEnd,
      keeperSaveText: b.keeperSaveText,
    },
  });
  while (frames.length > 0 && now - frames[0].t > REPLAY_WINDOW_MS) frames.shift();
}

function findScorerAgent(engine, team) {
  const byUid = engine.lastScorerUid ? engine.agents.get(engine.lastScorerUid) : null;
  if (byUid && byUid.team === team) return byUid;
  return [...engine.agents.values()].find((a) => a.team === team && a.name === engine.ball.shooterName) || null;
}

/**
 * 득점 직후 세레머니(10초) → 슬로우 모션 다시보기 순서로 진행되는 연출을 시작함
 */
function startGoalSequence(engine, now, scoringTeam) {
  const { ball } = engine;
  recordReplayFrame(engine, now, true);

  // 일시정지 등으로 생긴 시간 공백은 다시보기에서 짧게 압축
  const frames = engine.replayFrames;
  let rt = 0;
  frames.forEach((f, i) => {
    if (i > 0) rt += Math.min(f.t - frames[i - 1].t, REPLAY_SAMPLE_MS * 3);
    f.rt = rt;
  });

  const scorer = findScorerAgent(engine, scoringTeam);
  const isHome = scoringTeam === 'HOME';
  ball.shotTrail = [];
  ball.passTrail = [];
  ball.isShot = false;

  for (const a of engine.agents.values()) {
    a.hasBall = false;
    a.isPressing = false;
    a.isOverlapping = false;
    a.isSteppingUpTrap = false;
  }
  if (scorer) {
    scorer.flash = { type: 'CUSTOM', text: '⚽ GOAL!', color: '#fde047', until: now + CELEBRATION_MS };
  }

  engine.sequence = {
    phase: 'CELEBRATION',
    team: scoringTeam,
    scorerUid: scorer?.uid || null,
    startedAt: now,
    lastNow: now,
    spot: { x: isHome ? 94 : 6, y: scorer && scorer.y >= 50 ? 92 : 8 },
    frames: frames.slice(),
    totalRt: rt,
    playhead: 0,
    skip: false,
    confetti: [],
  };
  engine.replayFrames = [];
}

function stepToward(a, tx, ty, speed, dt) {
  const dx = tx - a.x;
  const dy = ty - a.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.4) return true;
  const step = Math.min(dist, speed * dt);
  a.x += (dx / dist) * step;
  a.y += (dy / dist) * step;
  return dist - step < 1.2;
}

function updateConfetti(seq, now, dt) {
  const elapsed = now - seq.startedAt;
  if (elapsed < CELEBRATION_MS * 0.7) {
    const spawn = Math.ceil(dt * 110) + (elapsed < 400 ? 18 : 0);
    const colors = ['#fde047', '#f97316', '#38bdf8', '#4ade80', '#f472b6', '#ffffff'];
    for (let i = 0; i < spawn; i++) {
      seq.confetti.push({
        x: Math.random() * WIDTH,
        y: -10 - Math.random() * 40,
        vx: (Math.random() - 0.5) * 60,
        vy: 70 + Math.random() * 110,
        w: 4 + Math.random() * 4,
        h: 6 + Math.random() * 6,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 9,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }
  for (const p of seq.confetti) {
    p.x += p.vx * dt + Math.sin(now / 250 + p.rot * 5) * 0.5;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
  }
  seq.confetti = seq.confetti.filter((p) => p.y < HEIGHT + 12);
}

function updateCelebration(engine, seq, now, dt) {
  const scorer = seq.scorerUid ? engine.agents.get(seq.scorerUid) : null;
  const mates = [...engine.agents.values()]
    .filter((a) => a.team === seq.team && a !== scorer && !a.isSentOff && a.role !== 'GK' && a.roleCode !== 'GK')
    .sort((a, b) => a.uid.localeCompare(b.uid));

  const jump = (a, stagger = 0) => {
    if (!a.jumpUntil || now > a.jumpUntil + 120 + stagger) a.jumpUntil = now + 520;
  };

  let anchor = { x: seq.spot.x, y: seq.spot.y };
  if (scorer) {
    const arrived = stepToward(scorer, seq.spot.x, seq.spot.y, 22, dt);
    anchor = { x: scorer.x, y: scorer.y };
    if (arrived) jump(scorer);
  }

  mates.forEach((a, i) => {
    const angle = (i / Math.max(1, mates.length)) * Math.PI * 2 + 0.6;
    const ring = 1 + (i % 2) * 0.55;
    const tx = clamp(anchor.x + Math.cos(angle) * 5 * ring, 2, 98);
    const ty = clamp(anchor.y + Math.sin(angle) * 8 * ring, 4, 96);
    if (stepToward(a, tx, ty, 17, dt)) jump(a, (i % 4) * 140);
  });

  updateConfetti(seq, now, dt);
}

function drawConfetti(ctx, confetti) {
  for (const p of confetti) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  }
}

function endGoalSequence(engine, now, speed) {
  const seq = engine.sequence;
  if (!seq) return;
  engine.sequence = null;
  resetPositionsForKickoff(engine, seq.team === 'HOME' ? 'AWAY' : 'HOME', now, speed);
  engine.bannerActive = true;
  engine.bannerUntil = now + POST_GOAL_SHOT_LOCK_MS;
  useLiveMatchStore.getState().setGoalSequence(null);
}

/**
 * 세레머니 → 다시보기 → 킥오프 복귀 단계 전환을 처리함
 */
function updateGoalSequence(engine, state, now, setGoalBanner) {
  const seq = engine.sequence;
  const dt = clamp((now - seq.lastNow) / 1000, 0, 0.1);
  seq.lastNow = now;
  const speed = state.playbackSpeed || 1;

  if (seq.phase === 'CELEBRATION') {
    updateCelebration(engine, seq, now, dt);
    if (now - seq.startedAt >= CELEBRATION_MS) {
      setGoalBanner(null);
      const store = useLiveMatchStore.getState();
      if (typeof store.clearLastGoalEvent === 'function') store.clearLastGoalEvent();
      if (seq.frames.length < REPLAY_MIN_FRAMES) {
        endGoalSequence(engine, now, speed);
        return;
      }
      seq.phase = 'REPLAY';
      seq.playhead = 0;
      seq.confetti = [];
      store.setGoalSequence('REPLAY');
    }
    return;
  }

  seq.playhead += dt * 1000 * REPLAY_RATE;
  if (seq.skip || seq.playhead >= seq.totalRt + REPLAY_HOLD_MS * REPLAY_RATE) {
    endGoalSequence(engine, now, speed);
  }
}

/**
 * 기록된 프레임 사이를 보간해 슬로우 모션 다시보기 화면을 그림
 */
function renderReplay(ctx, engine, state) {
  const seq = engine.sequence;
  const { frames, totalRt } = seq;
  const head = clamp(seq.playhead, 0, totalRt);
  let i = 0;
  while (i < frames.length - 2 && frames[i + 1].rt <= head) i++;
  const fa = frames[i];
  const fb = frames[Math.min(i + 1, frames.length - 1)];
  const span = fb.rt - fa.rt;
  const k = span > 0 ? clamp((head - fa.rt) / span, 0, 1) : 0;

  const agents = new Map();
  for (const [key, sa] of fa.agents) {
    const base = engine.agents.get(key);
    if (!base) continue;
    const sb = fb.agents.get(key) || sa;
    agents.set(key, { ...base, ...sa, x: lerp(sa.x, sb.x, k), y: lerp(sa.y, sb.y, k) });
  }
  const view = {
    agents,
    ball: { ...fa.ball, x: lerp(fa.ball.x, fb.ball.x, k), y: lerp(fa.ball.y, fb.ball.y, k), z: lerp(fa.ball.z, fb.ball.z, k) },
    slidingEffects: [],
    headerEffects: [],
    offsideVisual: null,
  };
  render(ctx, view, state, fa.t);

  const scorer = seq.scorerUid ? agents.get(seq.scorerUid) : null;
  if (scorer) {
    ctx.save();
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(toPx(scorer.x), toPy(scorer.y), 19, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.strokeStyle = 'rgba(56,189,248,0.7)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, WIDTH - 4, HEIGHT - 4);
  ctx.fillStyle = 'rgba(2,6,23,0.7)';
  ctx.fillRect(12, 12, 190, 30);
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`⏪ REPLAY · SLOW ${REPLAY_RATE}x`, 22, 27);
  ctx.fillStyle = 'rgba(148,163,184,0.35)';
  ctx.fillRect(12, HEIGHT - 10, WIDTH - 24, 4);
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(12, HEIGHT - 10, (WIDTH - 24) * (head / Math.max(1, totalRt)), 4);
  ctx.restore();
}

function render(ctx, engine, state, now) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawPitch(ctx, WIDTH, HEIGHT, state.weather?.code);
  if (!state.homeTeam || !state.awayTeam) return;
  drawOffsideAndTrapLines(ctx, engine, state, now);
  drawSlidingAndHeaderEffects(ctx, engine, now);
  drawShotAndKillerPassTrail(ctx, engine.ball);
  drawPlayersAndBall(ctx, engine, now);
  drawActionFlashes(ctx, engine, now);

  if (state.isPaused && state.status === 'live') {
    ctx.fillStyle = 'rgba(2,6,23,0.55)';
    ctx.fillRect(WIDTH / 2 - 120, 10, 240, 30);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Paused', WIDTH / 2, 25);
  }
}

export default function PitchCanvas2D() {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const [goalBanner, setGoalBanner] = useState(null);
  const goalSequence = useLiveMatchStore((s) => s.goalSequence);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const engine = createEngine();
    engineRef.current = engine;
    window.__engine = engine;
    window.__corner = (team) => startCornerPrelude(engine, team, performance.now());
    let rafId = 0;

    // 이전 마운트에서 끝나지 못한 연출 상태가 타이머를 멈춘 채 남지 않도록 정리
    useLiveMatchStore.getState().setGoalSequence(null);

    const loop = (now) => {
      try {
        const state = useLiveMatchStore.getState();
        const speed = state.playbackSpeed || 1;

        if (engine.bannerActive && now >= engine.bannerUntil) {
          engine.bannerActive = false;
        }

        if (state.homeTeam && state.awayTeam) {
          syncAgents(engine, state, now);

          const action = state.currentTickAction;
          if (action && action.seq !== engine.lastSeq) {
            engine.lastSeq = action.seq;
            applyAction(engine, action, now);
          }

          const isHalted =
            Boolean(state.isPaused) ||
            state.matchPhase === 'HALF_TIME' ||
            state.matchPhase === 'FULL_TIME' ||
            state.matchPhase === 'PRE_MATCH';

          if (engine.sequence) {
            updateGoalSequence(engine, state, now, setGoalBanner);
          } else {
            if (state.goalSequence) state.setGoalSequence(null);
            if (!isHalted) {
              updateBallAndMatchFlow(engine, state, now, setGoalBanner);
              updatePlayerPositions(engine, state, speed, now);
              if (!engine.sequence && state.status === 'live') recordReplayFrame(engine, now);
            }
          }
        }

        if (engine.sequence?.phase === 'REPLAY') {
          renderReplay(ctx, engine, state);
        } else {
          render(ctx, engine, state, now);
          if (engine.sequence) drawConfetti(ctx, engine.sequence.confetti);
        }
      } catch (err) {
        console.error('[PitchCanvas2D] loop error:', err);
      }
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafId);
      useLiveMatchStore.getState().setGoalSequence(null);
    };
  }, []);

  const skipReplay = () => {
    const seq = engineRef.current?.sequence;
    if (seq?.phase === 'REPLAY') seq.skip = true;
  };

  return (
    <div className="relative w-full">
      <canvas
        ref={canvasRef}
        className="w-full rounded-xl border border-slate-700 shadow-2xl"
        style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
      />
      {goalBanner && goalSequence === 'CELEBRATION' && (
        <div className="absolute inset-x-0 top-4 z-30 flex justify-center pointer-events-none">
          <div className="animate-fade-in-up rounded-2xl border-2 border-amber-400 bg-slate-900/90 px-8 py-3 text-center shadow-2xl">
            <div className="mb-1 text-3xl font-black tracking-widest text-amber-400">
              ⚽ GOAL ({goalBanner.minute}&apos;)
            </div>
            <div className="text-xl font-extrabold text-white">득점: {goalBanner.scorerName}</div>
            <div className="text-sm font-semibold text-emerald-300">{goalBanner.assistDisplay}</div>
          </div>
        </div>
      )}
      {goalSequence === 'REPLAY' && (
        <button
          type="button"
          onClick={skipReplay}
          className="absolute bottom-6 right-4 z-30 rounded-lg border border-sky-400/70 bg-slate-900/90 px-4 py-2 text-sm font-bold text-sky-200 shadow-lg transition hover:bg-slate-800"
        >
          ⏭ 다시보기 건너뛰기
        </button>
      )}
    </div>
  );
}