import { useEffect, useRef, useState } from 'react';
import useLiveMatchStore, { calcPlayerOvr, calcTeamAvgOvr } from '../../../store/useLiveMatchStore.js';
import { FAMILIARITY_META } from '../../../constants/tacticsConfig.js';

const WIDTH = 900;
const HEIGHT = 540;
const MARGIN = 28;
const CELEBRATION_MS = 1800;
const SHOT_SPEED = 2.75;
const SHOT_TIMEOUT_FRAMES = 55;
const PASS_TIMEOUT_FRAMES = 50;

const STRIKER_ROLES = ['ST', 'LST', 'RST', 'FW', 'CF'];
const MIDFIELDER_ROLES = ['CAM', 'LAM', 'RAM', 'CM', 'LCM', 'RCM', 'CDM', 'LDM', 'RDM', 'LM', 'RM'];
const FULLBACK_ROLES = ['LB', 'RB', 'LWB', 'RWB'];

const LONG_SHOT_COOLDOWN_MS = 3200;
const POST_GOAL_COOLDOWN_MS = 5200;
// [1번 이슈 해결] 슈팅 직후 최소 2.2초 동안은 골키퍼 앞 연속 리바운드/비비기 슈팅 절대 금지!
const ANY_SHOT_MIN_INTERVAL_MS = 2200;

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
      targetX: 50,
      targetY: 50,
      ownerUid: 'HOME_6',
      targetUid: null,
      isShot: false,
      isKillerPass: false,
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
    nextAnyShotAllowedAt: 0,
    nextLongShotAllowedAt: 0,
    postGoalWaitUntil: 0,
    lastScorerUid: null,
    touchCounts: new Map(),
    slidingEffects: [],
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

      if (!agent) {
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
          isInjured: Boolean(p.isInjured),
          baseX: bx,
          baseY: by,
          x: bx,
          y: by,
          targetX: bx,
          targetY: by,
          vx: 0,
          vy: 0,
          stamina: p.currentStamina ?? 100,
          currentStamina: p.currentStamina ?? 100,
          speedStat: speedVal,
          hasBall: false,
          yellowCards: p.yellowCards || 0,
          isSentOff: Boolean(p.isSentOff),
          stunUntil: 0,
          burstUntil: 0,
          slideUntil: 0,
          slideAngle: 0,
          isOverlapping: false,
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
        agent.stamina = p.currentStamina ?? agent.stamina;
        agent.currentStamina = p.currentStamina ?? agent.currentStamina;
        agent.speedStat = speedVal;
        agent.yellowCards = p.yellowCards || 0;
        agent.isSentOff = Boolean(p.isSentOff);

        if (isReplacedPlayer) {
          agent.flash = { type: 'SUB', until: now + 2000 };
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
    p.isOverlapping = false;
  }

  ball.x = 50;
  ball.y = 50;
  ball.targetX = 50;
  ball.targetY = 50;
  ball.vx = 0;
  ball.vy = 0;
  ball.isShot = false;
  ball.isKillerPass = false;
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
    (p) => p.team === concededTeam && (p.role === 'MF' || p.role === 'FW') && p.roleCode !== 'GK'
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
  engine.nextAnyShotAllowedAt = now + ANY_SHOT_MIN_INTERVAL_MS / clamp(speed, 1, 2.5);
}

function setupSetPiecePosition(engine, setPieceType, attackingTeam, now) {
  const { ball, agents } = engine;
  const active = [...agents.values()].filter((p) => !p.isSentOff && p.team === attackingTeam && p.roleCode !== 'GK');
  if (active.length === 0) return;

  const nearestMates = [...active].sort((a, b) => distance(a, ball) - distance(b, ball));
  const kicker = nearestMates[0];
  if (!kicker) return;

  if (setPieceType === 'CORNER') {
    kicker.flash = { type: 'CORNER', until: now + 1300 };
  } else if (setPieceType === 'FREE_KICK') {
    kicker.flash = { type: 'FREEKICK', until: now + 1300 };
  }
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
    return;
  }

  if (action.eventType === 'SET_PIECE' && action.setPieceType) {
    setupSetPiecePosition(engine, action.setPieceType, action.attackingTeam || 'HOME', now);
    return;
  }
}

/**
 * [1번 이슈 완벽 해결]
 * 골키퍼가 공을 잡았거나 슈팅이 발생한 직후, 상대 공격수들이 골키퍼와 비비지 못하도록
 * 페널티 박스 바깥쪽으로 즉시 물러나게(Retreat) 처리하는 헬퍼 함수
 */
function pushAttackersAwayFromKeeper(engine, attackingSide, now) {
  const isHomeAtt = attackingSide === 'HOME';
  for (const a of engine.agents.values()) {
    if (a.team !== attackingSide || a.isSentOff || a.role === 'GK') continue;
    const tooDeep = isHomeAtt ? a.x >= 76 : a.x <= 24;
    if (tooDeep) {
      a.targetX = isHomeAtt ? 64 + Math.random() * 6 : 36 - Math.random() * 6;
      a.x = isHomeAtt ? Math.min(a.x, 76) : Math.max(a.x, 24);
      a.stunUntil = Math.max(a.stunUntil || 0, now + 950);
    }
  }
}

function triggerShot(engine, shooter, state, now, shotStyle = 'NORMAL') {
  const speed = clamp(state.playbackSpeed || 1, 1, 2.5);
  // 연속 슈팅 원천 차단 쿨다운 설정
  engine.nextAnyShotAllowedAt = now + ANY_SHOT_MIN_INTERVAL_MS / speed;
  engine.nextLongShotAllowedAt = now + LONG_SHOT_COOLDOWN_MS / speed;

  // 슈터가 슈팅을 때린 직후 골키퍼에게 달려들어 비비지 않도록 반동(Stun) 및 후퇴 목표 부여
  const isHome = shooter.team === 'HOME';
  shooter.stunUntil = now + 1150 / speed;
  shooter.targetX = isHome ? Math.min(shooter.x - 8, 72) : Math.max(shooter.x + 8, 28);

  const store = useLiveMatchStore.getState();
  const ball = engine.ball;
  const defendSide = isHome ? 'AWAY' : 'HOME';
  const attTeamObj = isHome ? state.homeTeam : state.awayTeam;
  const defTeamObj = isHome ? state.awayTeam : state.homeTeam;

  const keeper = [...engine.agents.values()].find(
    (a) => a.team === defendSide && (a.role === 'GK' || a.roleCode === 'GK') && !a.isSentOff
  );
  const nearbyDefenders = [...engine.agents.values()].filter(
    (a) => a.team === defendSide && !a.isSentOff && a.role !== 'GK' && distance(a, shooter) <= 8.5
  );

  const isMid = MIDFIELDER_ROLES.includes(shooter.slotRoleCode);
  const shooterShoot = shooter.baseStats?.shooting || 76;
  const shooterPass = shooter.baseStats?.passing || 75;
  const shooterTech = shooter.baseStats?.dribbling || 74;

  const baseAttackStat = isMid
    ? shooterShoot * 0.55 + shooterPass * 0.25 + shooterTech * 0.2
    : shooterShoot * 0.7 + shooterTech * 0.3;

  const staminaFactor = shooter.stamina < 35 ? 0.75 : shooter.stamina < 60 ? 0.9 : 1.0;
  const injuryFactor = shooter.isInjured ? 0.78 : 1.0;
  const moraleFactor = 0.88 + ((shooter.morale ?? 75) / 100) * 0.24;
  const weatherLongMod = shotStyle === 'LONG_SHOT' ? (state.weather?.longShotMod || 1.05) : 1.0;
  const killerPassBonus = ball.isKillerPass ? 1.16 : 1.0;
  const midBonus = isMid ? 1.12 : 1.0;

  const effectiveAttack =
    baseAttackStat * staminaFactor * injuryFactor * moraleFactor * weatherLongMod * killerPassBonus * midBonus;

  const keeperReflex = keeper ? (keeper.baseStats?.gkReflexes || 75) : 72;
  const defPressure = nearbyDefenders.reduce((acc, d) => acc + (d.baseStats?.defense || 75) * 0.14, 0);
  const effectiveDefense = keeperReflex + defPressure;

  const attTeamOvr = attTeamObj?.avgOvr || calcTeamAvgOvr(attTeamObj);
  const defTeamOvr = defTeamObj?.avgOvr || calcTeamAvgOvr(defTeamObj);
  const ovrGapMultiplier = clamp(Math.pow(attTeamOvr / Math.max(45, defTeamOvr), 2.3), 0.35, 1.55);

  const shooterPrevGoals = attTeamObj?.starters?.[shooter.slotIndex]?.goals || 0;
  const monopolyDampener = shooterPrevGoals >= 2 ? 0.52 : shooterPrevGoals === 1 ? 0.8 : 1.0;
  const postGoalDampener = now < engine.postGoalWaitUntil ? 0.25 : 1.0;

  const rawRatio = effectiveAttack / Math.max(1, effectiveAttack + effectiveDefense);
  const goalProb = clamp(rawRatio * 0.45 * ovrGapMultiplier * monopolyDampener * postGoalDampener, 0.06, 0.38);

  const roll = Math.random();
  let outcome = 'MISS';
  if (roll < goalProb) {
    outcome = 'GOAL';
  } else if (roll < goalProb + 0.52) {
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
    if (keeper) {
      keeper.targetY = cornerY > 50 ? 46 : 54;
    }
  } else if (outcome === 'SAVED') {
    const saveY = 47 + Math.random() * 6;
    ball.targetX = keeper ? keeper.x : isHome ? 93 : 7;
    ball.targetY = saveY;
    if (keeper) {
      keeper.targetY = saveY;
    }
    if (typeof store.recordCanvasShot === 'function') {
      store.recordCanvasShot(
        shooter.team,
        true,
        shooter.slotIndex,
        `🧤 [슈퍼 세이브!] ${attTeamObj?.name} ${ball.shooterName}(${shooter.slotRoleCode}) 선수의 슈팅을 골키퍼 ${keeper?.name || 'GK'} 선수가 막아냅니다!`
      );
    }
  } else {
    ball.targetX = isHome ? 99 : 1;
    ball.targetY = Math.random() < 0.5 ? 36 : 64;
    if (typeof store.recordCanvasShot === 'function') {
      store.recordCanvasShot(
        shooter.team,
        false,
        shooter.slotIndex,
        `💨 [아쉬운 슈팅] ${attTeamObj?.name} ${ball.shooterName}(${shooter.slotRoleCode}) 선수의 슈팅이 골문을 살짝 벗어납니다.`
      );
    }
  }
}

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

  if (isKillerThroughBall && now) {
    const leadX = clamp(target.x + dir * 7.5, 10, 90);
    const leadY = clamp(target.y + (50 - target.y) * 0.25, 14, 86);
    target.targetX = leadX;
    target.targetY = leadY;
    target.burstUntil = now + 950;
  }

  const intoBox = isHome ? target.x >= 72 : target.x <= 28;

  ball.mode = 'PASS';
  ball.isShot = false;
  ball.isKillerPass = isKillerThroughBall;
  ball.isGkClearance = isGkKick; // 골키퍼가 차낸 공은 코앞 공격수에게 즉시 인터셉트되지 않도록 보호!
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
  ball.passTrail = isKillerThroughBall ? [{ x: carrier.x, y: carrier.y }] : [];
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
  const opponents = agents.filter((a) => a.team !== owner.team && !a.isSentOff);
  const inAttackingThird = isHome ? owner.x >= 64 : owner.x <= 36;
  const carrierIsStriker = STRIKER_ROLES.includes(owner.slotRoleCode);

  let best = null;
  let bestScore = -Infinity;

  for (const mate of mates) {
    const mateIsStriker = STRIKER_ROLES.includes(mate.slotRoleCode);
    if (carrierIsStriker && mateIsStriker) continue;
    if (ball.lastPasserUid && mate.uid === ball.lastPasserUid) continue;

    const dist = distance(mate, owner);
    if (dist < 5 || dist > 52) continue;

    const forwardProgress = (mate.x - owner.x) * dir;
    if (inAttackingThird && forwardProgress < 0) continue;
    if (preferKillerThrough && forwardProgress < 4) continue;

    let score = forwardProgress * (preferKillerThrough ? 2.8 : 2.1) - Math.max(0, dist - 36) * 1.3;
    if (!opponents.some((o) => distance(o, mate) < 9.5)) score += 48;

    if (FULLBACK_ROLES.includes(mate.slotRoleCode) && (mate.instruction === 'OVERLAP' || mate.isOverlapping)) {
      score += 46;
    }
    if (MIDFIELDER_ROLES.includes(mate.slotRoleCode) && (isHome ? mate.x >= 60 : mate.x <= 40)) {
      score += 42;
    }

    if (preferKillerThrough && ['ST', 'LST', 'RST', 'LW', 'RW', 'CAM', 'CM'].includes(mate.slotRoleCode)) {
      score += 50;
    } else if (['LW', 'RW', 'CAM', 'LM', 'RM'].includes(mate.slotRoleCode)) {
      score += 26;
    }

    const touches = engine.touchCounts.get(mate.uid) || 0;
    score -= touches * 5;
    if (engine.lastScorerUid === mate.uid) score -= 30;

    if (passingStyle === 'SHORT') score += Math.max(0, 26 - dist) * 0.9;
    else if (passingStyle === 'DIRECT_LONG') score += forwardProgress > 14 ? 22 : 0;

    score += (Math.random() - 0.5) * 20;

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
  const enemyGoalX = isHome ? 96 : 4;
  const distToGoal = Math.hypot(enemyGoalX - carrier.x, 50 - carrier.y);

  ball.holdFrames = (ball.holdFrames || 0) + 1;

  // [1번 이슈 해결] 골키퍼가 공을 잡고 있을 때는 상대 공격수를 뒤로 물리고, 안전한 중원/풀백 동료에게 롱킥 또는 빌드업 패스!
  if (carrier.role === 'GK' || carrier.roleCode === 'GK') {
    const enemySide = isHome ? 'AWAY' : 'HOME';
    pushAttackersAwayFromKeeper(engine, enemySide, now);

    if (ball.holdFrames >= 10) {
      const safeTeammates = all
        .filter((p) => p.team === carrier.team && !p.isSentOff && p.uid !== carrier.uid && p.role !== 'GK')
        .sort((a, b) => {
          // 전방 미드필더나 측면 풀백에게 우선 배급 (골문 앞 위험 지역 패스 방지)
          const distA = Math.abs(a.x - carrier.x);
          const distB = Math.abs(b.x - carrier.x);
          return distB - distA;
        });

      if (safeTeammates.length > 0) {
        const topCandidates = safeTeammates.slice(0, Math.min(5, safeTeammates.length));
        const target = topCandidates[Math.floor(Math.random() * topCandidates.length)];
        executePassToPlayer(engine, carrier, target, state, now, false, true);
      }
    }
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

  if (FULLBACK_ROLES.includes(carrier.slotRoleCode)) {
    const deepInFlank = isHome ? carrier.x >= 72 : carrier.x <= 28;
    if (deepInFlank && ball.holdFrames >= 6) {
      const boxTarget = selectBestPassTarget(engine, carrier, 'SHORT', ball, true);
      if (boxTarget && Math.random() < 0.72) {
        carrier.flash = { type: 'KILLER_PASS', until: now + 900 };
        executePassToPlayer(engine, carrier, boxTarget, state, now, true);
        return;
      }
      if (!engine.bannerActive && now >= engine.nextAnyShotAllowedAt) {
        triggerShot(engine, carrier, state, now, 'CUT_INSIDE');
        return;
      }
    }
  }

  const isWinger = ['LW', 'RW', 'LM', 'RM'].includes(carrier.slotRoleCode);
  // [1번 이슈 해결] 공격수가 골키퍼 코앞(X=94)까지 파고들며 골키퍼와 비비지 않도록 드리블 목표 지점을 X=82 / 18 로 제한!
  if (isWinger && (isHome ? carrier.x >= 58 : carrier.x <= 42)) {
    carrier.targetX = isHome ? 82 : 18;
    carrier.targetY = carrier.y + (50 - carrier.y) * 0.65;
  } else {
    carrier.targetX = isHome ? 83 : 17;
    carrier.targetY = carrier.y + (50 - carrier.y) * 0.35;
  }

  // [1번 이슈 핵심 해결] 페널티 박스 진입 또는 골키퍼와 1:1 거리 도달 시 골키퍼와 부딪히기 전에 즉시 깔끔하게 1회 슈팅!
  const inBoxZone = isHome ? carrier.x >= 74 : carrier.x <= 26;
  if (inBoxZone || distToGoal <= 24) {
    if (ball.holdFrames >= 3 && !engine.bannerActive) {
      if (now >= engine.nextAnyShotAllowedAt) {
        const style = isWinger ? 'CUT_INSIDE' : ball.teamPassChain >= 3 ? 'TIKI_TAKA' : 'NORMAL';
        triggerShot(engine, carrier, state, now, style);
        return;
      }
      // 만약 방금 슈팅이 나왔던 직후라면 골키퍼에게 달려들지 않고 즉시 뒤쪽 동료에게 컷백 패스!
      const mate = selectBestPassTarget(engine, carrier, 'SHORT', ball, false);
      if (mate) {
        executePassToPlayer(engine, carrier, mate, state, now, false);
        return;
      }
    }
    return;
  }

  const isMidfielder = MIDFIELDER_ROLES.includes(carrier.slotRoleCode);
  const inMidShootZone = isHome ? carrier.x >= 58 && carrier.x < 74 : carrier.x <= 42 && carrier.x > 26;
  if (
    isMidfielder &&
    inMidShootZone &&
    ball.holdFrames >= 8 &&
    now >= engine.nextLongShotAllowedAt &&
    now >= engine.nextAnyShotAllowedAt &&
    !engine.bannerActive
  ) {
    const wantsToShoot =
      carrier.instruction === 'GET_FORWARD' ||
      carrier.instruction === 'BOX_TO_BOX' ||
      (carrier.baseStats?.shooting || 72) >= 74;
    if (Math.random() < (wantsToShoot ? 0.62 : 0.45)) {
      triggerShot(engine, carrier, state, now, 'LONG_SHOT');
      return;
    }
  }

  const isMaestro = isMaestroPlaymaker(carrier);
  if (isMaestro && ball.holdFrames >= 11) {
    const teamObj = isHome ? state.homeTeam : state.awayTeam;
    const killerTarget = selectBestPassTarget(
      engine,
      carrier,
      teamObj?.tactics?.passingStyle || 'BALANCED',
      ball,
      true
    );
    if (killerTarget && Math.random() < 0.65) {
      carrier.flash = { type: 'KILLER_PASS', until: now + 950 };
      executePassToPlayer(engine, carrier, killerTarget, state, now, true);
      return;
    }
  }

  if (ball.holdFrames >= 15) {
    const teamObj = isHome ? state.homeTeam : state.awayTeam;
    const passingStyle = teamObj?.tactics?.passingStyle || 'BALANCED';
    const bestMate = selectBestPassTarget(engine, carrier, passingStyle, ball, isMaestro);

    if (bestMate) {
      if (isMaestro) carrier.flash = { type: 'KILLER_PASS', until: now + 900 };
      executePassToPlayer(engine, carrier, bestMate, state, now, isMaestro);
      return;
    }

    if (distToGoal <= 40 && !engine.bannerActive && now >= engine.nextAnyShotAllowedAt) {
      triggerShot(engine, carrier, state, now, 'LONG_SHOT');
    }
  }
}

function resolveOneOnOneDuel(engine, owner, chaser, state, now) {
  // 골키퍼는 필드 플레이어와 1:1 태클 비비기를 하지 않도록 보호
  if (owner.role === 'GK' || owner.roleCode === 'GK' || chaser.role === 'GK' || chaser.roleCode === 'GK') {
    return;
  }

  const { ball } = engine;
  const store = useLiveMatchStore.getState();
  const isOwnerHome = owner.team === 'HOME';
  const attackDir = isOwnerHome ? 1 : -1;

  const dribStat =
    (owner.baseStats?.dribbling || 75) * 0.6 +
    (owner.baseStats?.speed || 75) * 0.25 +
    (owner.baseStats?.physical || 75) * 0.15;
  const passStat = owner.baseStats?.passing || 75;
  const defStat =
    (chaser.baseStats?.defense || 75) * 0.6 +
    (chaser.baseStats?.physical || 75) * 0.25 +
    (chaser.baseStats?.speed || 75) * 0.15;

  const defTeamObj = chaser.team === 'HOME' ? state.homeTeam : state.awayTeam;
  const attTeamObj = isOwnerHome ? state.homeTeam : state.awayTeam;
  const isAggressivePress = defTeamObj?.tactics?.pressing === 'GEGENPRESS' || defTeamObj?.tactics?.pressing === 'HIGH';
  const effectiveDefPressure = defStat + (isAggressivePress ? 8 : 0);

  const inBox = isOwnerHome ? owner.x >= 73 : owner.x <= 27;

  if (!inBox) {
    if (isMaestroPlaymaker(owner)) {
      const killerTarget =
        selectBestPassTarget(engine, owner, 'DIRECT_LONG', ball, true) ||
        selectBestPassTarget(engine, owner, 'SHORT', ball, false);

      const maestroSkill = passStat * 0.65 + dribStat * 0.35;
      const killerSuccessProb = clamp((maestroSkill / (maestroSkill + effectiveDefPressure * 0.55)) * 1.2, 0.58, 0.92);

      if (killerTarget && Math.random() < killerSuccessProb) {
        owner.flash = { type: 'KILLER_PASS', until: now + 1000 };
        chaser.stunUntil = now + 900;
        executePassToPlayer(engine, owner, killerTarget, state, now, true);
        return;
      }
    }

    const statDeficit = effectiveDefPressure - dribStat;
    const isPassFirstRole = ['CM', 'LCM', 'RCM', 'CDM', 'LDM', 'RDM', 'CB', 'LCB', 'RCB', 'LB', 'RB'].includes(
      owner.slotRoleCode
    );
    const isShortPassTactic = attTeamObj?.tactics?.passingStyle === 'SHORT';

    let passDesireUnderPressure = 0.45 + clamp(statDeficit * 0.03, -0.3, 0.35);
    if (isPassFirstRole) passDesireUnderPressure += 0.18;
    if (isShortPassTactic) passDesireUnderPressure += 0.12;
    if (owner.stamina < 40) passDesireUnderPressure += 0.15;

    if (Math.random() < clamp(passDesireUnderPressure, 0.15, 0.88)) {
      const escapeTarget = selectBestPassTarget(
        engine,
        owner,
        attTeamObj?.tactics?.passingStyle || 'SHORT',
        ball,
        false
      );
      const quickReleaseSuccessProb = clamp((passStat / (passStat + effectiveDefPressure * 0.65)) * 1.15, 0.45, 0.9);

      if (escapeTarget && Math.random() < quickReleaseSuccessProb) {
        owner.flash = { type: 'QUICK_PASS', until: now + 850 };
        chaser.stunUntil = now + 750;
        executePassToPlayer(engine, owner, escapeTarget, state, now, false);
        return;
      }
    }
  }

  const relativeX = (chaser.x - owner.x) * attackDir;
  const isFromBehind = relativeX < -1.8;
  const alreadyBooked = (chaser.yellowCards || 0) >= 1;

  const cleanStealProb = clamp((defStat / (defStat + dribStat)) * (isFromBehind ? 0.42 : 0.56), 0.25, 0.64);
  const foulOnTackleProb = alreadyBooked ? 0.008 : isFromBehind ? 0.06 : 0.025;

  const slideAngle = Math.atan2(owner.y - chaser.y, owner.x - chaser.x);
  chaser.slideUntil = now + 480;
  chaser.slideAngle = slideAngle;
  engine.slidingEffects.push({
    x: chaser.x,
    y: chaser.y,
    tx: owner.x,
    ty: owner.y,
    color: chaser.team === 'HOME' ? '#38bdf8' : '#fb7185',
    until: now + 520,
  });

  const roll = Math.random();

  if (roll < foulOnTackleProb) {
    const maliceScore = (isFromBehind ? 35 : 5) + (isAggressivePress ? 10 : 0) + Math.random() * 55;

    let cardSeverity = 'FOUL_ONLY';
    const teamRedCount = defTeamObj?.stats?.redCards || 0;
    if (isFromBehind && maliceScore >= 96 && teamRedCount === 0) {
      cardSeverity = 'DIRECT_RED';
      chaser.flash = { type: 'RED', until: now + 2400 };
    } else if (maliceScore >= 68 && !alreadyBooked) {
      cardSeverity = 'YELLOW';
      chaser.flash = { type: 'YELLOW', until: now + 2000 };
    } else {
      chaser.flash = { type: 'FOUL', until: now + 1200 };
    }

    if (isFromBehind && Math.random() < 0.22 && !owner.isInjured) {
      owner.isInjured = true;
      const attKey = isOwnerHome ? 'homeTeam' : 'awayTeam';
      const teamClone = useLiveMatchStore.getState()[attKey];
      if (teamClone && teamClone.starters[owner.slotIndex]) {
        teamClone.starters[owner.slotIndex].isInjured = true;
      }
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

    chaser.stunUntil = now + 1100;
    chaser.x = clamp(chaser.x - Math.cos(slideAngle) * 3.8, 5, 95);
    chaser.y = clamp(chaser.y - Math.sin(slideAngle) * 3.8, 8, 92);
    owner.burstUntil = now + 700;
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

    chaser.flash = { type: 'SLIDE_STEAL', until: now + 1000 };
    chaser.burstUntil = now + 600;
    engine.attackTeam = chaser.team;

    owner.stunUntil = now + 950;
    owner.x = clamp(owner.x - attackDir * 3.2, 5, 95);

    if (typeof store.recordCanvasTackle === 'function') {
      store.recordCanvasTackle(chaser.team, chaser.slotIndex);
    }
    return;
  }

  owner.flash = { type: 'DRIBBLE_WIN', until: now + 950 };
  owner.burstUntil = now + 850;

  owner.x = clamp(owner.x + attackDir * 3.4, 5, 95);
  chaser.stunUntil = now + 1050;
  chaser.x = clamp(chaser.x - attackDir * 2.8, 5, 95);
  chaser.y = clamp(chaser.y + (chaser.y >= owner.y ? 2.5 : -2.5), 8, 92);

  if (!inBox && (isMaestroPlaymaker(owner) || Math.random() < 0.45)) {
    const isMaestro = isMaestroPlaymaker(owner);
    const mate = selectBestPassTarget(
      engine,
      owner,
      attTeamObj?.tactics?.passingStyle || 'BALANCED',
      ball,
      isMaestro
    );
    if (mate) {
      if (isMaestro) owner.flash = { type: 'KILLER_PASS', until: now + 950 };
      executePassToPlayer(engine, owner, mate, state, now, isMaestro);
    }
  }
}

function updateBallPhysics(engine, activePlayers, playbackSpeed = 1, now) {
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

        // [1번 이슈 완벽 해결] 골키퍼가 세이브하거나 골킥을 잡는 순간 상대 공격수들을 즉시 박스 바깥으로 퇴거!
        pushAttackersAwayFromKeeper(engine, attackSide, now);

        if (enemyGk && ball.shotOutcome === 'SAVED') {
          ball.mode = 'LOCKED';
          ball.ownerUid = enemyGk.uid;
          ball.holdFrames = 0;
          ball.teamPassChain = 0;
          ball.x = enemyGk.x;
          ball.y = enemyGk.y;
          ball.keeperSaveFlashEnd = now + 900;
          ball.keeperSaveText = '🧤 SUPER SAVE!';
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
      ball.isKillerPass = false;
      ball.isGkClearance = false;
      ball.passTrail = [];
      ball.targetUid = null;
      ball.passFrames = 0;
      ball.vx = 0;
      ball.vy = 0;
    } else {
      // [1번 이슈 해결] 골키퍼가 차낸 볼(isGkClearance)은 상대 공격수가 골문 앞에서 가로채지 못하도록 보호!
      if (!ball.isGkClearance) {
        const interceptors = activePlayers.filter(
          (p) =>
            p.team !== receiver.team &&
            p.role !== 'GK' &&
            now >= (p.stunUntil || 0) &&
            distance(p, ball) <= 2.2
        );
        const interceptChance = ball.isKillerPass ? 0.04 : 0.15;
        if (interceptors.length > 0 && Math.random() < interceptChance) {
          const interceptor = interceptors[0];
          ball.mode = 'LOCKED';
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
          interceptor.flash = { type: 'SLIDE_STEAL', until: now + 900 };
          engine.attackTeam = interceptor.team;
          const store = useLiveMatchStore.getState();
          if (typeof store.recordCanvasTackle === 'function') {
            store.recordCanvasTackle(interceptor.team, interceptor.slotIndex);
          }
          return;
        }
      }

      const dx = receiver.x - ball.x;
      const dy = receiver.y - ball.y;
      const dist = Math.hypot(dx, dy);
      const passSpeed = (ball.isGkClearance ? 2.3 : ball.isKillerPass ? 2.15 : 1.65) * simSpeed;
      if (dist <= passSpeed + 1.5) {
        ball.mode = 'LOCKED';
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
        if (ball.isKillerPass) {
          ball.passTrail.push({ x: ball.x, y: ball.y });
          if (ball.passTrail.length > 14) ball.passTrail.shift();
        }
      }
    }
    return;
  }

  ball.mode = 'LOOSE';
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
    if (minDist <= 3.2) {
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

  ball.x = clamp(ball.x, 2, 98);
  ball.y = clamp(ball.y, 4, 96);
}

function updateBallAndMatchFlow(engine, state, now, setGoalBanner) {
  const { ball, agents } = engine;
  const speed = state.playbackSpeed || 1;
  const activePlayers = [...agents.values()].filter((a) => !a.isSentOff);

  updateBallPhysics(engine, activePlayers, speed, now);

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

function movePlayerConstantSpeed(player, playbackSpeed, isCarrierOrSprinting, weatherSpeedMod = 1.0, now = 0) {
  if (player.stunUntil && now < player.stunUntil) {
    return;
  }

  const dx = player.targetX - player.x;
  const dy = player.targetY - player.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.35) {
    player.x = player.targetX;
    player.y = player.targetY;
    return;
  }
  const speedStat = player.speedStat || 80;
  const staminaMod = player.stamina < 30 ? 0.68 : player.stamina < 55 ? 0.85 : 1.0;
  const injuryMod = player.isInjured ? 0.72 : 1.0;
  const overlapBoost = player.isOverlapping ? 1.35 : 1.0;
  const burstMod = player.burstUntil && now < player.burstUntil ? 1.65 : isCarrierOrSprinting ? 1.32 : overlapBoost;

  const step = Math.min(
    1.15,
    0.28 * (speedStat / 80) * staminaMod * injuryMod * weatherSpeedMod * burstMod * clamp(playbackSpeed || 1, 1, 2.5)
  );

  if (dist <= step) {
    player.x = player.targetX;
    player.y = player.targetY;
  } else {
    player.x += (dx / dist) * step;
    player.y += (dy / dist) * step;
  }
}

function updatePlayerPositions(engine, state, playbackSpeed, now) {
  const { ball, agents } = engine;
  const all = [...agents.values()];
  const active = all.filter((a) => !a.isSentOff);
  const weatherSpeedMod = state.weather?.speedMod || 1.0;

  for (const a of all) {
    a.hasBall = ball.mode === 'LOCKED' && a.uid === ball.ownerUid;
  }

  const owner = ball.ownerUid ? getAgentByUid(engine, ball.ownerUid) : null;
  const ownerIsGk = owner && (owner.role === 'GK' || owner.roleCode === 'GK');
  const attackingTeam = owner ? owner.team : ball.x < 50 ? 'AWAY' : 'HOME';
  const defendingTeam = attackingTeam === 'HOME' ? 'AWAY' : 'HOME';
  const defTeamObj = defendingTeam === 'HOME' ? state.homeTeam : state.awayTeam;
  const isHighPress = defTeamObj?.tactics?.pressing === 'GEGENPRESS' || defTeamObj?.tactics?.pressing === 'HIGH';

  // [1번 이슈 해결] 골키퍼가 공을 잡고 있을 때(ownerIsGk)는 상대 선수가 골키퍼에게 달려들지 않도록 압박자(Chaser) 지정을 해제!
  const defCandidates = ownerIsGk
    ? []
    : active
        .filter((p) => p.team === defendingTeam && p.role !== 'GK' && p.roleCode !== 'GK' && now >= (p.stunUntil || 0))
        .filter((p) => Math.hypot(ball.x - p.baseX, ball.y - p.baseY) <= (isHighPress ? 48 : 38))
        .sort((a, b) => distance(a, ball) - distance(b, ball));

  const primaryChaserUid = defCandidates[0]?.uid || null;
  const secondaryChaserUid = defCandidates[1]?.uid || null;

  if (owner && !ownerIsGk && primaryChaserUid) {
    const chaser = getAgentByUid(engine, primaryChaserUid);
    if (chaser && now >= (chaser.stunUntil || 0) && distance(chaser, owner) <= 3.2) {
      resolveOneOnOneDuel(engine, owner, chaser, state, now);
    }
  }

  for (const p of all) {
    if (p.isSentOff) {
      p.targetX = p.x;
      p.targetY = p.y < 50 ? -8 : 108;
      movePlayerConstantSpeed(p, playbackSpeed, false, weatherSpeedMod, now);
      continue;
    }

    const isCarrier = ball.mode === 'LOCKED' && ball.ownerUid === p.uid;
    const isChaser = p.uid === primaryChaserUid || p.uid === secondaryChaserUid;
    const dir = p.team === 'HOME' ? 1 : -1;
    const isMyTeamAttacking = p.team === attackingTeam;
    const teamObj = p.team === 'HOME' ? state.homeTeam : state.awayTeam;
    const isAttackingMentality = ['ATTACKING', 'ALL_OUT_ATTACK'].includes(teamObj?.tactics?.mentality);

    p.isOverlapping = false;

    if (p.role === 'GK' || p.roleCode === 'GK') {
      p.targetX = p.baseX;
      p.targetY = 50 + clamp((ball.y - 50) * 0.16, -5.5, 5.5);
    } else if (isCarrier) {
      // handleCarrierDecision에서 설정된 드리블 방향 유지
    } else if (ball.mode === 'PASS' && ball.targetUid === p.uid) {
      p.targetX = ball.targetX;
      p.targetY = ball.targetY;
    } else if (p.uid === primaryChaserUid) {
      p.targetX = ball.x;
      p.targetY = ball.y;
    } else if (p.uid === secondaryChaserUid) {
      const goalX = p.team === 'HOME' ? 6 : 94;
      p.targetX = ball.x + (goalX - ball.x) * 0.16;
      p.targetY = ball.y + (50 - ball.y) * 0.18;
    } else {
      const isFullback = FULLBACK_ROLES.includes(p.slotRoleCode);
      const shouldOverlap =
        isFullback &&
        isMyTeamAttacking &&
        p.instruction !== 'STAY_BACK' &&
        (p.instruction === 'OVERLAP' || ['LWB', 'RWB'].includes(p.slotRoleCode) || isAttackingMentality);

      if (shouldOverlap) {
        p.isOverlapping = true;
        p.targetX = p.team === 'HOME' ? clamp(Math.max(ball.x + 10, 74), 60, 82) : clamp(Math.min(ball.x - 10, 26), 18, 40);
        p.targetY = p.baseY < 50 ? 9 : 91;
      } else if (MIDFIELDER_ROLES.includes(p.slotRoleCode)) {
        const waveY = Math.sin(now / 650 + p.slotIndex * 1.7) * 5.5;
        if (isMyTeamAttacking) {
          const pushForward =
            p.instruction === 'GET_FORWARD' || p.slotRoleCode === 'CAM'
              ? 22
              : p.instruction === 'HOLD_MIDFIELD'
              ? 10
              : 16;
          p.targetX = clamp(p.baseX + pushForward * dir + (ball.x - 50) * 0.35, 20, 80);
          p.targetY = clamp(p.baseY + (ball.y - p.baseY) * 0.32 + waveY, 12, 88);
        } else {
          p.targetX = clamp(p.baseX - 14 * dir + (ball.x - 50) * 0.35, 18, 82);
          p.targetY = clamp(p.baseY + (ball.y - p.baseY) * 0.42 + waveY * 0.5, 14, 86);
        }
      } else if (p.role === 'DF') {
        const enemyAttackers = active.filter(
          (e) => e.team !== p.team && (e.role === 'FW' || e.slotRoleCode === 'CAM')
        );
        const nearestEnemy = enemyAttackers.sort((a, b) => distance(a, p) - distance(b, p))[0];

        if (!isMyTeamAttacking && nearestEnemy && distance(nearestEnemy, p) <= 16) {
          const goalX = p.team === 'HOME' ? 10 : 90;
          p.targetX = nearestEnemy.x + (goalX - nearestEnemy.x) * 0.22;
          p.targetY = nearestEnemy.y + (50 - nearestEnemy.y) * 0.12;
        } else {
          const lineShift = isMyTeamAttacking ? 8 * dir : -6 * dir;
          p.targetX = clamp(p.baseX + lineShift + (ball.x - 50) * 0.25, 14, 86);
          p.targetY = clamp(p.baseY + (ball.y - 50) * 0.22, 12, 88);
        }
      } else {
        // 공격수(FW)가 상대 골키퍼 위치(X=92 이상 또는 X=8 이하)까지 깊숙이 들어가 겹치지 않도록 최대 침투선을 X=20~80으로 제한!
        const teamShiftX = clamp((ball.x - 50) * 0.28, -12, 12);
        const roleOffsetX = isMyTeamAttacking ? 6 * dir : -6 * dir;
        const waveY = Math.cos(now / 700 + p.slotIndex) * 4;
        p.targetX = clamp(p.baseX + teamShiftX + roleOffsetX, 20, 80);
        p.targetY = clamp(p.baseY + (ball.y - 50) * 0.18 + waveY, 12, 88);
      }
    }

    for (const other of active) {
      if (other.uid === p.uid || other.team !== p.team) continue;
      const dist = distance(p, other);
      if (dist < 7.2 && dist > 0.01) {
        p.targetX += ((p.x - other.x) / dist) * 1.6;
        p.targetY += ((p.y - other.y) / dist) * 1.6;
      }
    }

    p.targetX = clamp(p.targetX, 6, 94);
    p.targetY = clamp(p.targetY, 6, 94);
    movePlayerConstantSpeed(p, playbackSpeed, isCarrier || isChaser || p.isOverlapping, weatherSpeedMod, now);
  }
}

function staminaColor(stamina) {
  if (stamina > 60) return '#22c55e';
  if (stamina > 30) return '#eab308';
  return '#ef4444';
}

function drawFlash(ctx, agent, px, py, now) {
  if (agent.isOverlapping && (!agent.flash || now >= agent.flash.until)) {
    ctx.save();
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('🏃 OVERLAP!', px, py - 22);
    ctx.restore();
    return;
  }
  if (!agent.flash || now >= agent.flash.until) return;
  const remaining = agent.flash.until - now;
  const alpha = Math.min(1, remaining / 350);
  const bob = Math.sin(now / 120) * 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (agent.flash.type === 'YELLOW' || agent.flash.type === 'RED') {
    ctx.fillStyle = agent.flash.type === 'YELLOW' ? '#facc15' : '#ef4444';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 1.5;
    ctx.fillRect(px - 6, py - 44 + bob, 12, 17);
    ctx.strokeRect(px - 6, py - 44 + bob, 12, 17);
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(agent.flash.type === 'RED' ? '🟥 퇴장!' : '🟨 경고!', px, py - 50 + bob);
  } else if (agent.flash.type === 'SLIDE_STEAL') {
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('💨 SLIDING TACKLE!', px, py - 24 + bob);
  } else if (agent.flash.type === 'DRIBBLE_WIN') {
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#a3e635';
    ctx.fillText('⚡ 돌파 성공!', px, py - 24 + bob);
  } else if (agent.flash.type === 'KILLER_PASS') {
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#2dd4bf';
    ctx.fillText('🎯 킬패스!', px, py - 25 + bob);
  } else if (agent.flash.type === 'QUICK_PASS') {
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#34d399';
    ctx.fillText('⚡ 탈압박 패스!', px, py - 24 + bob);
  } else if (agent.flash.type === 'CORNER' || agent.flash.type === 'FREEKICK') {
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(agent.flash.type === 'CORNER' ? '🚩 CORNER' : '🎯 FREEKICK', px, py - 24 + bob);
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

function drawSlidingEffects(ctx, engine, now) {
  engine.slidingEffects = (engine.slidingEffects || []).filter((ef) => now < ef.until);
  for (const ef of engine.slidingEffects) {
    const alpha = clamp((ef.until - now) / 520, 0, 1);
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
}

function drawPlayersAndBall(ctx, engine, now) {
  const agents = [...engine.agents.values()]
    .filter((a) => !(a.isSentOff && (a.y < -4 || a.y > 104)))
    .sort((a, b) => a.y - b.y);

  for (const a of agents) {
    const px = toPx(a.x);
    const py = toPy(a.y);
    const isSliding = a.slideUntil && now < a.slideUntil;

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(px + 2, py + 6, isSliding ? 17 : 12, 5, isSliding ? a.slideAngle : 0, 0, Math.PI * 2);
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
      ctx.strokeStyle = a.isOverlapping ? '#38bdf8' : '#ffffff';
      ctx.lineWidth = a.isOverlapping ? 2.8 : 2;
      ctx.beginPath();
      ctx.arc(px, py, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isGK && a.team === 'HOME' ? '#1f2937' : '#ffffff';
    ctx.fillText(String(a.backNumber), px, py + 0.5);

    ctx.font = '11px sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(a.name, px, py + 25);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(a.name, px, py + 25);

    const barWidth = 26;
    const stamina = clamp(a.stamina ?? 100, 0, 100);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(px - barWidth / 2, py + 31, barWidth, 4);
    ctx.fillStyle = staminaColor(stamina);
    ctx.fillRect(px - barWidth / 2, py + 31, (barWidth * stamina) / 100, 4);

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
  const by = toPy(ball.y);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(bx + 1.5, by + 4, 5, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  if (ball.isShot || ball.mode === 'SHOT') {
    ctx.save();
    ctx.shadowColor = '#fde047';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#fef9c3';
    ctx.beginPath();
    ctx.arc(bx, by, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (ball.isKillerPass && ball.mode === 'PASS') {
    ctx.save();
    ctx.shadowColor = '#2dd4bf';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#99f6e4';
    ctx.beginPath();
    ctx.arc(bx, by, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(bx, by, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawShotAndKillerPassTrail(ctx, ball) {
  if (ball.isKillerPass && ball.passTrail && ball.passTrail.length >= 2) {
    ctx.save();
    ctx.strokeStyle = '#2dd4bf';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]);
    ctx.shadowColor = '#2dd4bf';
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
  drawSlidingEffects(ctx, engine, now);
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