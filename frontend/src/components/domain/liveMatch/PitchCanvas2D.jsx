import { useEffect, useRef, useState } from 'react';
import useLiveMatchStore, { calcPlayerOvr, calcTeamAvgOvr } from '../../../store/useLiveMatchStore.js';
import { FAMILIARITY_META } from '../../../constants/tacticsConfig.js';

const WIDTH = 900;
const HEIGHT = 540;
const MARGIN = 28;
const CELEBRATION_MS = 1800;
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

function sanitizeName(rawVal) {
  if (!rawVal) return null;
  const str = String(rawVal).trim();
  if (
    str === '' ||
    str.toLowerCase() === 'undefined' ||
    str.toLowerCase() === 'null' ||
    str.toLowerCase().includes('undefined') ||
    str.toLowerCase().includes('nan')
  ) {
    return null;
  }
  return str;
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

  if (ratingDelta !== 0) {
    const nextRating = clamp(Number(((agent.liveRating ?? 6.0) + ratingDelta).toFixed(2)), 3.0, 10.0);
    agent.liveRating = nextRating;
  }

  if (flashText && now > 0) {
    agent.flash = { type: 'CUSTOM', text: flashText, color: flashColor, until: now + 950 };
  }

  const state = useLiveMatchStore.getState();
  const teamKey = agent.team === 'HOME' ? 'homeTeam' : 'awayTeam';
  const teamObj = state[teamKey];
  if (teamObj && Array.isArray(teamObj.starters) && teamObj.starters[agent.slotIndex]) {
    const targetPlayer = teamObj.starters[agent.slotIndex];
    targetPlayer.liveRating = agent.liveRating;
    targetPlayer.rating = agent.liveRating;

    if (staminaDrain > 0) {
      const currentVal = targetPlayer.currentStamina ?? targetPlayer.stamina ?? 100;
      const nextStamina = clamp(currentVal - staminaDrain, 5, 100);
      targetPlayer.currentStamina = nextStamina;
      agent.stamina = nextStamina;
      agent.currentStamina = nextStamina;
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

function createEngine() {
  return {
    agents: new Map(),
    ball: {
      x: 50,
      y: 50,
      z: 0, // 공의 높이 (공중볼 크로스/롱패스 표현용)
      startX: 50,
      startY: 50,
      targetX: 50,
      targetY: 50,
      ownerUid: 'HOME_6',
      targetUid: null,
      isShot: false,
      isKillerPass: false,
      isAerial: false, // 공중볼 여부 (문전 크로스 / 롱패스)
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
    },
    lastSeq: -1,
    bannerUntil: 0,
    bannerActive: false,
    attackTeam: 'HOME',
    initialized: false,
    postGoalWaitUntil: 0,
    lastDuelAt: 0,
    lastScorerUid: null,
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
      const cleanName = sanitizeName(p.name || p.safeName || p.playerName) || `${side === 'HOME' ? 'H' : 'A'}#${idx + 1}`;
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
          jumpUntil: 0, // 헤딩 점프 모션 타이머
          isOverlapping: false,
          isPressing: false,
          isMakingRun: false,
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

        // 스토어의 분당 체력 소모를 그대로 수용
        const storeStamina = p.currentStamina ?? p.stamina ?? 100;
        agent.stamina = storeStamina;
        agent.currentStamina = storeStamina;

        if (isReplacedPlayer) {
          agent.liveRating = 6.0;
          p.liveRating = 6.0;
          agent.flash = { type: 'SUB', until: now + 2000 };
        } else {
          p.liveRating = agent.liveRating;
          p.rating = agent.liveRating;
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
  ball.aerialContestResolved = false;
  ball.isGkClearance = false;
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

/**
 * [능력치 차이 기반 슈팅 & 수비 블로킹 판정]
 * - 인위적인 슈팅 횟수 쿨다운 없이, 수비수의 수비력/피지컬이 높으면 슈팅 각도를 좁혀 육탄 방어(Block)하고,
 *   공격수의 결정력/스피드/드리블이 압도적이면 수비를 뚫고 슈팅을 마음껏 시도합니다.
 */
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

  // 1. 능력치 비교 기반 수비수 슈팅 블로킹 판정:
  //    슈터 앞(거리 5.2 이내)에 있는 수비수의 (defense + physical) 대 슈터의 (dribbling + speed)를 비교!
  const frontBlockers = nearbyDefenders.filter(
    (d) => distance(d, shooter) <= 5.2 && (isHome ? d.x >= shooter.x - 1.5 : d.x <= shooter.x + 1.5)
  );
  if (frontBlockers.length > 0) {
    const bestBlocker = frontBlockers.sort(
      (a, b) => (b.baseStats?.defense || 75) - (a.baseStats?.defense || 75)
    )[0];
    const defPower = (bestBlocker.baseStats?.defense || 75) * 0.65 + (bestBlocker.baseStats?.physical || 75) * 0.35;
    const attRelease = shooterTech * 0.55 + shooterSpeed * 0.45;
    // 수비 능력이 공격수보다 높을수록 블로킹 확률이 최대 62%까지 상승! (능력치 기반 슈팅 억제)
    const blockProb = clamp(((defPower - attRelease + 25) / 80) * 0.65, 0.15, 0.62);

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

  const isMid = MIDFIELDER_ROLES.includes(shooter.slotRoleCode);
  const baseAttackStat = isMid
    ? shooterShoot * 0.55 + shooterPass * 0.25 + shooterTech * 0.2
    : shooterShoot * 0.7 + shooterTech * 0.3;

  const staminaFactor = shooter.stamina < 35 ? 0.72 : shooter.stamina < 60 ? 0.88 : 1.0;
  const injuryFactor = shooter.isInjured ? 0.78 : 1.0;
  const moraleFactor = 0.88 + ((shooter.morale ?? 75) / 100) * 0.24;
  const weatherLongMod = shotStyle === 'LONG_SHOT' ? (state.weather?.longShotMod || 1.05) : 1.0;
  const killerPassBonus = ball.isKillerPass ? 1.15 : 1.0;

  const effectiveAttack =
    baseAttackStat * staminaFactor * injuryFactor * moraleFactor * weatherLongMod * killerPassBonus;

  const keeperReflex = keeper ? (keeper.baseStats?.gkReflexes || 75) : 72;
  const defPressure = nearbyDefenders.reduce((acc, d) => acc + (d.baseStats?.defense || 75) * 0.16, 0);
  const effectiveDefense = keeperReflex + defPressure;

  const attTeamOvr = attTeamObj?.avgOvr || calcTeamAvgOvr(attTeamObj);
  const defTeamOvr = defTeamObj?.avgOvr || calcTeamAvgOvr(defTeamObj);
  const ovrGapMultiplier = clamp(Math.pow(attTeamOvr / Math.max(45, defTeamOvr), 2.3), 0.35, 1.55);

  const shooterPrevGoals = attTeamObj?.starters?.[shooter.slotIndex]?.goals || 0;
  const monopolyDampener = shooterPrevGoals >= 2 ? 0.52 : shooterPrevGoals === 1 ? 0.8 : 1.0;
  const postGoalDampener = now < engine.postGoalWaitUntil ? 0.25 : 1.0;

  const rawRatio = effectiveAttack / Math.max(1, effectiveAttack + effectiveDefense);
  const goalProb = clamp(rawRatio * 0.44 * ovrGapMultiplier * monopolyDampener * postGoalDampener, 0.06, 0.38);

  const roll = Math.random();
  let outcome = 'MISS';
  if (roll < goalProb) {
    outcome = 'GOAL';
  } else if (roll < goalProb + 0.5) {
    outcome = 'SAVED';
  } else {
    outcome = 'MISS';
  }

  const validAssisterName =
    ball.lastPasserName && ball.lastPasserName !== shooter.name ? ball.lastPasserName : null;
  const validAssisterSlot =
    validAssisterName && ball.lastPasserSlotIndex !== shooter.slotIndex ? ball.lastPasserSlotIndex : null;
  const validAssisterId =
    validAssisterName && ball.lastPasserId !== shooter.id ? ball.lastPasserId : null;

  ball.mode = 'SHOT';
  ball.isShot = true;
  ball.z = 0;
  ball.isAerial = false;
  ball.isKillerPass = false;
  ball.isGkClearance = false;
  ball.mustPassAfterSteal = false;
  ball.ownerUid = null;
  ball.targetUid = null;
  ball.shotTeam = shooter.team;
  ball.goalStyle = shotStyle;
  ball.shooterId = shooter.userPlayerId ?? shooter.playerId ?? shooter.id;
  ball.shooterName = sanitizeName(shooter.name) || '스트라이커';
  ball.shooterSlotIndex = shooter.slotIndex ?? 0;
  ball.assisterId = validAssisterId;
  ball.assisterName = sanitizeName(validAssisterName);
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
    if (ball.lastPasserUid) {
      const assisterAgent = getAgentByUid(engine, ball.lastPasserUid);
      if (assisterAgent && assisterAgent.team === shooter.team && assisterAgent.uid !== shooter.uid) {
        adjustPlayerLiveStat(engine, assisterAgent, { ratingDelta: +0.8, flashText: '🎯 ASSIST! (+0.8)', flashColor: '#34d399', now });
      }
    }
    for (const d of engine.agents.values()) {
      if (d.team === defendSide && !d.isSentOff && (d.role === 'DF' || d.role === 'GK')) {
        adjustPlayerLiveStat(engine, d, { ratingDelta: -0.35 });
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

/**
 * 패스 실행 (거리 22 이상이거나 문전으로 올리는 크로스일 경우 공중볼 `isAerial = true`로 판정!)
 */
function executePassToPlayer(engine, carrier, target, state, now, isKillerThroughBall = false, isGkKick = false) {
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
    ratingDelta: isKillerThroughBall ? +0.12 : +0.02,
    staminaDrain: 0.14,
  });

  if (isKillerThroughBall && now) {
    const leadX = clamp(target.x + dir * 5.5, 22, 78);
    const leadY = clamp(target.y + (50 - target.y) * 0.2, 14, 86);
    target.targetX = leadX;
    target.targetY = leadY;
    target.burstUntil = now + 800;
  }

  const passDist = distance(carrier, target);
  const intoBox = isHome ? target.x >= 70 : target.x <= 30;
  const fromFlank = carrier.y < 24 || carrier.y > 76;

  // [공중볼(Aerial Ball) 판정]
  // 문전으로 날아오는 크로스/롱볼이거나 거리 22 이상의 롱패스, 골키퍼 킥은 공중으로 띄워서 날아갑니다!
  const isAerialBall = isGkKick || passDist >= 22 || (intoBox && (fromFlank || passDist >= 15));

  ball.mode = 'PASS';
  ball.isShot = false;
  ball.isKillerPass = isKillerThroughBall;
  ball.isAerial = isAerialBall;
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
  ball.lastPasserName = sanitizeName(carrier.name);
  ball.lastPasserSlotIndex = carrier.slotIndex;
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

  const inAttackingHalf = isHome ? owner.x >= 50 : owner.x <= 50;
  const carrierIsAttacker = ATTACKER_ROLES.includes(owner.slotRoleCode);
  const ownerPassStat = owner.baseStats?.passing || 75;

  let best = null;
  let bestScore = -Infinity;

  for (const mate of mates) {
    if (ball.lastPasserUid && mate.uid === ball.lastPasserUid && mates.length > 2) continue;

    // 3톱끼리 상대 진영에서 쓸데없이 패스를 주고받으며 시간을 끄는 현상 차단 (측면 크로스 상황만 예외)
    const mateIsAttacker = ATTACKER_ROLES.includes(mate.slotRoleCode);
    const ownerOnExtremeWing = owner.y < 18 || owner.y > 82;
    if (inAttackingHalf && carrierIsAttacker && mateIsAttacker && !ownerOnExtremeWing) {
      continue;
    }

    const dist = distance(mate, owner);
    // 패스 능력치(ownerPassStat)가 높은 선수일수록 더 먼 거리의 롱패스/전환 패스를 정확히 찔러줄 수 있음!
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

    score += (Math.random() - 0.5) * 14;

    if (score > bestScore) {
      bestScore = score;
      best = mate;
    }
  }

  return best;
}

/**
 * [능력치 기반 볼 운반 & 슈팅 결정]
 * - 고정된 슈팅 쿨다운을 제거하여, 공격진 능력치가 뛰어나 수비를 제치고 문전(홈 X>=72, 원정 X<=28)에 진입하면
 *   언제든 즉시 슈팅을 때릴 수 있습니다!
 * - 반대로 수비진의 능력치가 높으면 문전에 도달하기 전에 태클/인터셉트/헤딩 커팅에 막혀 슈팅 횟수가 자연스럽게 줄어듭니다.
 */
function handleCarrierDecision(engine, carrier, state, now) {
  const ball = engine.ball;
  const all = [...engine.agents.values()];
  const isHome = carrier.team === 'HOME';
  const dir = isHome ? 1 : -1;
  const enemyGoalX = isHome ? 96 : 4;
  const distToGoal = Math.hypot(enemyGoalX - carrier.x, 50 - carrier.y);

  ball.holdFrames = (ball.holdFrames || 0) + 1;

  // 1. 골키퍼 빌드업 또는 롱킥
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

  // 2. 문전 슈팅 구역 (홈 X >= 72, 원정 X <= 28, 또는 골대 거리 25 이내) 진입 시:
  //    측면 끝(크로스 구역)이면 문전으로 공중볼 크로스를 올리고, 중앙이면 패스 미루지 않고 즉시 슈팅!
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

  // 3. 공 탈취 직후 빠른 역습 패스
  if (ball.mustPassAfterSteal && ball.holdFrames >= 4) {
    const teamObj = isHome ? state.homeTeam : state.awayTeam;
    const target = selectBestPassTarget(engine, carrier, teamObj?.tactics?.passingStyle || 'DIRECT_LONG', ball, false);
    if (target) {
      executePassToPlayer(engine, carrier, target, state, now, false);
      return;
    }
    ball.mustPassAfterSteal = false;
  }

  // 4. 포지션별 과감한 전진 드리블 돌파
  const isWinger = WINGER_ROLES.includes(carrier.slotRoleCode);
  const isAttacker = ATTACKER_ROLES.includes(carrier.slotRoleCode);

  if (isWinger) {
    const cutInFactor = (isHome ? carrier.x >= 54 : carrier.x <= 46) ? 0.52 : 0.15;
    carrier.targetX = isHome ? 78 : 22;
    carrier.targetY = carrier.y + (50 - carrier.y) * cutInFactor;
  } else if (isAttacker) {
    carrier.targetX = isHome ? 79 : 21;
    carrier.targetY = carrier.y + (50 - carrier.y) * 0.38;
    return; // 스트라이커는 옆으로 패스하지 않고 직접 수비 라인을 향해 돌파 시도!
  } else {
    carrier.targetX = clamp(carrier.x + dir * 20, 18, 76);
    carrier.targetY = carrier.y + (50 - carrier.y) * 0.2;
  }

  // 5. 미드필더의 아크 정면 중거리 슛 (슈팅 능력치가 높을수록 더 자주 위협적인 중거리 슛 시도!)
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

  // 6. 전방 침투 스루패스 / 크로스 연결
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

  // 미드필더의 패스 능력치가 수비 압박보다 높으면 유연하게 탈압박 패스 성공!
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

  // [100% 능력치 격차 기반 태클 성공률]
  // 수비수의 defStat과 공격수의 dribStat 차이를 직접 반영하여,
  // 수비수가 강하면 75% 확률로 뺏어내고, 공격수가 월드클래스(예: OVR 90 vs 수비 70)이면 80% 확률로 수비를 뚫고 지나갑니다!
  const statDiff = effectiveDefPressure - dribStat;
  const cleanStealProb = clamp(0.50 + statDiff * 0.018 - (isFromBehind ? 0.1 : 0), 0.18, 0.78);
  const foulOnTackleProb = alreadyBooked ? 0.008 : isFromBehind ? 0.045 : 0.018;

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
    const maliceScore = (isFromBehind ? 35 : 5) + (isAggressivePress ? 10 : 0) + Math.random() * 55;

    let cardSeverity = 'FOUL_ONLY';
    const teamRedCount = defTeamObj?.stats?.redCards || 0;
    if (isFromBehind && maliceScore >= 96 && teamRedCount === 0) {
      cardSeverity = 'DIRECT_RED';
      adjustPlayerLiveStat(engine, chaser, { ratingDelta: -1.5, flashText: '🟥 퇴장! (-1.5)', flashColor: '#ef4444', now });
    } else if (maliceScore >= 68 && !alreadyBooked) {
      cardSeverity = 'YELLOW';
      adjustPlayerLiveStat(engine, chaser, { ratingDelta: -0.4, flashText: '🟨 경고 (-0.4)', flashColor: '#facc15', now });
    } else {
      adjustPlayerLiveStat(engine, chaser, { ratingDelta: -0.15, flashText: '📢 파울 (-0.1)', flashColor: '#fb923c', now });
    }

    if (typeof store.recordCanvasFoulAndCard === 'function') {
      store.recordCanvasFoulAndCard({
        defenderTeamSide: chaser.team,
        foulerSlotIndex: chaser.slotIndex,
        victimName: owner.name,
        isFromBehind,
        cardSeverity,
      });
    }

    chaser.stunUntil = now + 700;
    owner.burstUntil = now + 600;
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

/**
 * [신규 핵심 기능: 문전 및 중원 공중볼 수비/미드필더 헤딩 커팅(Aerial Header Clearance) 포함 볼 물리 엔진]
 */
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

    // 공중볼일 경우 포물선 궤적(z 높이: 최고 18px) 계산
    if (ball.isAerial) {
      ball.z = Math.sin(flightProgress * Math.PI) * 18;
    } else {
      ball.z = 0;
    }

    // 1) [공중볼(크로스/롱패스) 수비수·미드필더 점프 헤딩 커팅 판정!]
    //    공중볼이 낙하 지점 근처(비행 진행률 65% 이상 또는 리시버까지 거리 7.5 이내)에 내려올 때,
    //    주변의 수비수/미드필더가 달려들어 공격수와 점프 헤딩 경합(physical + defense)을 벌입니다!
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

        // 센터백(CB)이나 수비형 미드필더(CDM)는 제공권 보너스 부여
        const roleBonus = CENTERBACK_ROLES.includes(defender.slotRoleCode) || defender.slotRoleCode === 'CDM' ? 8 : 0;
        const headerWinProb = clamp(0.52 + (defAerialPower + roleBonus - attAerialPower) * 0.018, 0.25, 0.82);

        defender.jumpUntil = now + 520;
        receiver.jumpUntil = now + 520;

        if (Math.random() < headerWinProb) {
          // 수비수/미드필더가 점프 헤딩 커팅 승리! -> 전방 아군 미드필더 쪽으로 머리로 강하게 받아쳐 클리어링!
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

          // 헤딩으로 걷어낸 공을 전방의 아군 미드필더/공격수에게 즉시 연결!
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
            ball.passFrames = 0;
            ball.teamPassChain = 1;
            ball.isKillerPass = false;
            ball.isAerial = true;
            ball.aerialContestResolved = true; // 연쇄 헤딩 핑퐁 방지
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

    // 2) 낮게 깔려가는 땅볼 패스(isAerial === false)일 때 수비수/미드필더의 발밑 인터셉트 판정
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

        // 패서의 패스 능력치 vs 수비수의 수비 능력치 차이로 인터셉트 확률 계산
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

  updateBallPhysics(engine, activePlayers, state, speed, now);

  if (ball.mode === 'GOAL_NET') {
    const store = useLiveMatchStore.getState();
    const scoringTeam = ball.shotTeam || 'HOME';
    const cleanScorer = sanitizeName(ball.shooterName) || '스트라이커';
    const cleanAssister =
      sanitizeName(ball.assisterName) && sanitizeName(ball.assisterName) !== cleanScorer
        ? sanitizeName(ball.assisterName)
        : null;

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
      });
    }

    const minute = state.minute || 1;
    setGoalBanner({
      id: `${minute}_${now}`,
      minute,
      team: scoringTeam,
      scorerName: cleanScorer,
      assistDisplay: cleanAssister ? `🎯 어시스트: ${cleanAssister}` : '⚡ 단독 돌파 원더골!',
    });
    engine.bannerUntil = now + CELEBRATION_MS;
    engine.bannerActive = true;

    const concededTeam = scoringTeam === 'HOME' ? 'AWAY' : 'HOME';
    resetPositionsForKickoff(engine, concededTeam, now, speed);
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

  // 스토어 기본 체력 감소 + 실제 이동 거리 및 스프린트 여부에 따른 차등 체력 감소 합산!
  if (player.role !== 'GK' && actualMoved > 0.12) {
    const sprintFactor = isSprinting || player.isOverlapping || player.isMakingRun ? 1.65 : 0.45;
    const extraMoveDrain = actualMoved * 0.0055 * sprintFactor;
    adjustPlayerLiveStat(engine, player, { staminaDrain: extraMoveDrain });
  }
}

/**
 * [수비 뒷공간 사수(Deep Cover) + 침투 공격수 1:1 마킹 + 공중볼 낙하지점 선점]
 */
function updatePlayerPositions(engine, state, playbackSpeed, now) {
  const { ball, agents } = engine;
  const all = [...agents.values()];
  const active = all.filter((a) => !a.isSentOff);
  const weatherSpeedMod = state.weather?.speedMod || 1.0;

  for (const a of all) {
    a.hasBall = ball.mode === 'LOCKED' && a.uid === ball.ownerUid;
    a.isPressing = false;
    a.isMakingRun = false;
    a.markingTargetUid = null;
  }

  const owner = ball.ownerUid ? getAgentByUid(engine, ball.ownerUid) : null;
  const ownerIsGk = owner && (owner.role === 'GK' || owner.roleCode === 'GK');
  const attackingTeam = owner ? owner.team : ball.x < 50 ? 'AWAY' : 'HOME';
  const defendingTeam = attackingTeam === 'HOME' ? 'AWAY' : 'HOME';

  // 1. 볼 보유자를 향해 달려드는 수비팀 압박자 (제1 압박자 + 제2 중원 압박자)
  const defCandidates = ownerIsGk
    ? []
    : active
        .filter((p) => p.team === defendingTeam && p.role !== 'GK' && p.roleCode !== 'GK' && now >= (p.stunUntil || 0))
        .filter((p) => Math.hypot(ball.x - p.baseX, ball.y - p.baseY) <= 40)
        .sort((a, b) => distance(a, ball) - distance(b, ball));

  const primaryChaserUid = defCandidates[0]?.uid || null;
  const secondaryChaserUid =
    defCandidates[1] && distance(defCandidates[1], ball) <= 22 ? defCandidates[1].uid : null;

  if (owner && !ownerIsGk && primaryChaserUid) {
    const chaser = getAgentByUid(engine, primaryChaserUid);
    if (chaser && now >= (chaser.stunUntil || 0) && distance(chaser, owner) <= 3.3) {
      resolveOneOnOneDuel(engine, owner, chaser, state, now);
    }
  }

  // 2. 수비수(DF)와 수비형 미드필더(CDM)에게 침투하는 상대 공격수 1:1 대인 마킹 할당 (뒷공간 뚫림 원천 차단!)
  const enemyAttackers = active.filter(
    (p) => p.team === attackingTeam && (ATTACKER_ROLES.includes(p.slotRoleCode) || p.slotRoleCode === 'CAM')
  );
  const assignedAttackers = new Set();

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

    p.isOverlapping = false;
    p.isPressing = isChaser;

    if (p.role === 'GK' || p.roleCode === 'GK') {
      p.targetX = p.baseX;
      p.targetY = 50 + clamp((ball.y - 50) * 0.14, -5.0, 5.0);
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
      // [공중볼 헤딩 커팅 준비] 문전이나 중원으로 공중볼이 날아오면 근처 수비수/미드필더가 낙하지점으로 빠르게 이동!
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
    } else if (!isMyTeamAttacking && p.markingTargetUid) {
      // [뒷공간 방어 핵심] 침투하는 상대 공격수보다 항상 우리 골문 쪽으로 3.5m 더 깊숙이 위치(Goal-side Shadow Marking)하여 뒷공간 완벽 차단!
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
        // 센터백(CB)은 공격 시에도 하프라인 너머로 올라가지 않고 뒷공간(HOME: 최대 36, AWAY: 최소 64)을 철저히 사수!
        const cbPush = isMyTeamAttacking ? 6 * dir : -6 * dir;
        const rawCbX = p.baseX + teamShiftX * 0.55 + cbPush;
        p.targetX = p.team === 'HOME' ? clamp(rawCbX, 14, 36) : clamp(rawCbX, 64, 86);
        p.targetY = clamp(p.baseY + teamShiftY * 0.7, 16, 84);
      } else if (isFullback) {
        // 오버래핑하지 않는 반대편 풀백도 수비 밸런스를 위해 후방 라인 유지
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
        // 스트라이커(ST)
        p.isMakingRun = isMyTeamAttacking;
        const strikerPush = isMyTeamAttacking ? 12 * dir : -6 * dir;
        p.targetX = clamp(p.baseX + teamShiftX + strikerPush + individualWaveX, 22, 80);
        p.targetY = clamp(p.baseY + teamShiftY + individualWaveY * 1.2, 18, 82);
      }
    }

    p.targetX = clamp(p.targetX, 8, 92);
    p.targetY = clamp(p.targetY, 8, 92);
    movePlayerSmooth(engine, p, playbackSpeed, isCarrier || isChaser, weatherSpeedMod, now);
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
      ctx.fillText('🏃 OVERLAP!', px, py - 22);
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
    ctx.fillText('🎯 킬패스!', px, py - 25 + bob);
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

  // 공중볼 헤딩 커팅 충격파 이펙트 렌더링
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

    // 그림자는 바닥(toPy(a.y))에 고정하여 점프 시 입체감 표현
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

  // 공 그림자 (공중볼일 때는 땅에 그림자가 남고 공은 위로 떠올라 포물선 비행)
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
      ctx.fillText('💥 SHOOT!', px, py - 22);
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
      ctx.fillText(ball.keeperSaveText || '🧤 SAVE!', px, py - 22);
      ctx.restore();
    }
  }
}

function render(ctx, engine, state, now) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawPitch(ctx, WIDTH, HEIGHT, state.weather?.code);
  if (!state.homeTeam || !state.awayTeam) return;
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
  const [goalBanner, setGoalBanner] = useState(null);

  useEffect(() => {
    if (!goalBanner) return undefined;
    const timer = setTimeout(() => {
      setGoalBanner(null);
      const store = useLiveMatchStore.getState();
      if (typeof store.clearLastGoalEvent === 'function') {
        store.clearLastGoalEvent();
      }
    }, CELEBRATION_MS);
    return () => clearTimeout(timer);
  }, [goalBanner]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const engine = createEngine();
    let rafId = 0;

    const loop = (now) => {
      const state = useLiveMatchStore.getState();
      const speed = state.playbackSpeed || 1;

      if (engine.bannerActive && now >= engine.bannerUntil) {
        engine.bannerActive = false;
        setGoalBanner(null);
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

        if (!isHalted) {
          updateBallAndMatchFlow(engine, state, now, setGoalBanner);
          updatePlayerPositions(engine, state, speed, now);
        }
      }

      render(ctx, engine, state, now);
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div className="relative w-full">
      <canvas
        ref={canvasRef}
        className="w-full rounded-xl border border-slate-700 shadow-2xl"
        style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
      />
      {goalBanner && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-sm z-30 pointer-events-none">
          <div className="bg-slate-900/95 border-2 border-amber-400 rounded-2xl px-10 py-6 text-center shadow-2xl">
            <div className="text-amber-400 font-black text-4xl tracking-widest mb-2">
              ⚽ GOAL!! ({goalBanner.minute}&apos;)
            </div>
            <div className="text-white font-extrabold text-2xl mb-1">
              득점: {goalBanner.scorerName}
            </div>
            <div className="text-emerald-300 font-semibold text-base">
              {goalBanner.assistDisplay}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}