import { useEffect, useRef, useState } from 'react';
import useLiveMatchStore, { calcPlayerOvr, calcTeamAvgOvr } from '../../../store/useLiveMatchStore.js';
import { FAMILIARITY_META } from '../../../constants/tacticsConfig.js';

const WIDTH = 900;
const HEIGHT = 540;
const MARGIN = 28;
const CELEBRATION_MS = 1800;
const SHOT_SPEED = 2.65;
const SHOT_TIMEOUT_FRAMES = 55;
const PASS_TIMEOUT_FRAMES = 50;
const STRIKER_ROLES = ['ST', 'LST', 'RST', 'FW', 'CF'];

// [밸런스 핵심] 무분별한 기관총 슈팅 및 야구 스코어를 막기 위한 쿨다운 상수
const BASE_SHOT_COOLDOWN_MS = 5200; // 최소 5.2초(배속 보정) 간격으로만 슈팅 발생 -> 전후반 적정 슈팅 수 유지
const POST_GOAL_COOLDOWN_MS = 9500; // 골 터진 직후 약 9.5초 동안 중원 탐색전 강제 (1~2분 만의 즉각 동점골 방지)

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
      mode: 'LOCKED', // 'LOCKED' | 'PASS' | 'SHOT' | 'LOOSE'
      shotOutcome: null, // 'GOAL' | 'SAVED' | 'MISS'
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
      shotSpeed: SHOT_SPEED,
      shooterFlashEnd: 0,
      keeperSaveFlashEnd: 0,
      keeperSaveText: '🧤 SAVE!',
      isGoalOutcome: false,
    },
    lastSeq: -1,
    bannerUntil: 0,
    bannerActive: false,
    attackTeam: 'HOME',
    initialized: false,
    nextShotAllowedAt: 0,
    lastScorerUid: null,
    touchCounts: new Map(), // 특정 선수 1명 볼 독점 방지용 카운터
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
      const statsObj = p.effectiveStats || p.baseStats || { speed: 78, shooting: 75, passing: 75, dribbling: 75, defense: 75, physical: 75, gkReflexes: 76 };
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
          flash: engine.initialized ? { type: 'SUB', until: now + 1800 } : null,
        };
        engine.agents.set(expectedUid, agent);
      } else {
        // [요구사항 24 완벽 반영] 경기 중 선수 교체 시 새 선수의 ID, 이름, 능력치(baseStats/OVR), 체력이 즉시 100% 반영!
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
  }

  ball.x = 50;
  ball.y = 50;
  ball.targetX = 50;
  ball.targetY = 50;
  ball.vx = 0;
  ball.vy = 0;
  ball.isShot = false;
  ball.isGoalOutcome = false;
  ball.shotOutcome = null;
  ball.shotTrail = [];
  ball.holdFrames = 0;
  ball.passFrames = 0;
  ball.shotFrames = 0;
  ball.boxPassCount = 0;
  ball.teamPassChain = 0;
  ball.lastPasserUid = null;

  // [몰빵 방지] 킥오프 키커를 매번 똑같은 선수만 하지 않고 실점 팀의 미드필더/공격진 중 랜덤 배정
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

  // [요구사항 2 & 9 해결] 골 직후 최소 9.5초(배속 반영) 동안 양 팀 슈팅 금지 -> 1~2분 만의 연속골 원천 차단!
  engine.nextShotAllowedAt = now + POST_GOAL_COOLDOWN_MS / clamp(speed, 1, 2.5);
}

function setupSetPiecePosition(engine, setPieceType, attackingTeam, now) {
  const { ball, agents } = engine;
  const active = [...agents.values()].filter((p) => !p.isSentOff);
  const isHome = attackingTeam === 'HOME';
  const mates = active.filter((p) => p.team === attackingTeam && p.roleCode !== 'GK');
  if (mates.length === 0) return;

  // 세트피스 전담 키커 선정 (패스 스탯 최상위 선수)
  const kicker = [...mates].sort((a, b) => (b.baseStats?.passing || 75) - (a.baseStats?.passing || 75))[0];

  if (setPieceType === 'CORNER') {
    const cornerX = isHome ? 96 : 4;
    const cornerY = Math.random() < 0.5 ? 6 : 94;
    kicker.x = cornerX;
    kicker.y = cornerY;
    ball.x = cornerX;
    ball.y = cornerY;
    ball.mode = 'LOCKED';
    ball.ownerUid = kicker.uid;
    ball.holdFrames = 10;
    kicker.flash = { type: 'CORNER', until: now + 1400 };
    // 장신 센터백(CB) 및 공격수들을 페널티 박스 안으로 집결
    for (const m of mates) {
      if (m.uid === kicker.uid) continue;
      if (['CB', 'LCB', 'RCB', 'ST', 'LST', 'RST'].includes(m.slotRoleCode)) {
        m.targetX = isHome ? 86 + Math.random() * 6 : 14 - Math.random() * 6;
        m.targetY = 38 + Math.random() * 24;
      }
    }
  } else if (setPieceType === 'FREE_KICK') {
    const fkX = isHome ? 74 : 26;
    const fkY = 35 + Math.random() * 30;
    kicker.x = fkX;
    kicker.y = fkY;
    ball.x = fkX;
    ball.y = fkY;
    ball.mode = 'LOCKED';
    ball.ownerUid = kicker.uid;
    ball.holdFrames = 12;
    kicker.flash = { type: 'FREEKICK', until: now + 1400 };
  } else if (setPieceType === 'THROW_IN') {
    const fullbacks = mates.filter((p) => ['LB', 'RB', 'LWB', 'RWB'].includes(p.slotRoleCode));
    const thrower = fullbacks[0] || kicker;
    thrower.x = clamp(ball.x, 20, 80);
    thrower.y = ball.y < 50 ? 4 : 96;
    ball.x = thrower.x;
    ball.y = thrower.y;
    ball.mode = 'LOCKED';
    ball.ownerUid = thrower.uid;
    ball.holdFrames = 10;
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

  if (action.eventType === 'CARD' && action.cardPlayerId) {
    for (const a of agents.values()) {
      if (a.uid === action.cardPlayerId || a.id === action.cardPlayerId) {
        a.flash = { type: action.cardType, until: now + 2200 };
        break;
      }
    }
  } else if (action.eventType === 'FOUL' && action.foulerId) {
    for (const a of agents.values()) {
      if (a.uid === action.foulerId || a.id === action.foulerId) {
        a.flash = { type: 'FOUL', until: now + 1200 };
        break;
      }
    }
  }
}

/**
 * [요구사항 3, 5, 11, 12, 15, 36, 38 완벽 반영]
 * OVR 격차, 체력/피로도, 심리 상태, 날씨, 수비 압박도를 모두 반영한 정밀 슈팅 판정 함수
 */
function triggerShot(engine, shooter, state, now, shotStyle = 'NORMAL') {
  const speed = clamp(state.playbackSpeed || 1, 1, 2.5);
  // 슈팅 쿨다운 설정 (기관총 슈팅 원천 방지)
  engine.nextShotAllowedAt = now + BASE_SHOT_COOLDOWN_MS / speed;

  const store = useLiveMatchStore.getState();
  const ball = engine.ball;
  const isHome = shooter.team === 'HOME';
  const defendSide = isHome ? 'AWAY' : 'HOME';
  const attTeamObj = isHome ? state.homeTeam : state.awayTeam;
  const defTeamObj = isHome ? state.awayTeam : state.homeTeam;

  const keeper = [...engine.agents.values()].find(
    (a) => a.team === defendSide && (a.role === 'GK' || a.roleCode === 'GK') && !a.isSentOff
  );
  const nearbyDefenders = [...engine.agents.values()].filter(
    (a) => a.team === defendSide && !a.isSentOff && a.role !== 'GK' && distance(a, shooter) <= 9
  );

  // 1. 선수 개인 능력치 + 체력/부상 + 심리 상태(자신감) 반영
  const shooterShoot = shooter.baseStats?.shooting || 75;
  const shooterTech = shooter.baseStats?.dribbling || 74;
  const staminaFactor = shooter.stamina < 35 ? 0.72 : shooter.stamina < 60 ? 0.88 : 1.0;
  const injuryFactor = shooter.isInjured ? 0.78 : 1.0;
  const moraleFactor = 0.88 + ((shooter.morale ?? 75) / 100) * 0.24;
  const weatherLongMod = shotStyle === 'LONG_SHOT' ? (state.weather?.longShotMod || 1.0) : 1.0;

  const effectiveAttack = (shooterShoot * 0.7 + shooterTech * 0.3) * staminaFactor * injuryFactor * moraleFactor * weatherLongMod;

  // 2. 골키퍼 반사신경 + 수비진 압박 + 양 팀 평균 OVR 격차(매우 중요: OVR 90 vs 50 역전 방지!)
  const keeperReflex = keeper ? (keeper.baseStats?.gkReflexes || 75) : 72;
  const defPressure = nearbyDefenders.reduce((acc, d) => acc + ((d.baseStats?.defense || 75) * 0.12), 0);
  const effectiveDefense = keeperReflex + defPressure;

  const attTeamOvr = attTeamObj?.avgOvr || calcTeamAvgOvr(attTeamObj);
  const defTeamOvr = defTeamObj?.avgOvr || calcTeamAvgOvr(defTeamObj);
  // OVR 차이가 20 이상 나면 강팀은 결정력이 1.45배 상승하고 약팀은 0.38배로 대폭 감소!
  const ovrGapMultiplier = clamp(Math.pow(attTeamOvr / Math.max(45, defTeamOvr), 2.4), 0.32, 1.55);

  // 한 선수가 이미 2골 이상 넣었으면 다른 동료에게 기회가 가도록 독점 방지 감쇠
  const shooterPrevGoals = (attTeamObj?.starters?.[shooter.slotIndex]?.goals) || 0;
  const monopolyDampener = shooterPrevGoals >= 2 ? 0.55 : shooterPrevGoals === 1 ? 0.82 : 1.0;

  // 기본 슈팅 당 득점 확률 약 18~24% (실제 축구 평균 전환율)
  const rawRatio = effectiveAttack / Math.max(1, effectiveAttack + effectiveDefense);
  const goalProb = clamp(rawRatio * 0.44 * ovrGapMultiplier * monopolyDampener, 0.05, 0.36);

  const roll = Math.random();
  let outcome = 'MISS';
  if (roll < goalProb) {
    outcome = 'GOAL';
  } else if (roll < goalProb + 0.48) {
    outcome = 'SAVED'; // 골키퍼 슈퍼 세이브 (유효슈팅)
  } else {
    outcome = 'MISS'; // 골대 살짝 벗어남
  }

  const validAssisterName =
    ball.lastPasserName && ball.lastPasserName !== shooter.name ? ball.lastPasserName : null;
  const validAssisterSlot =
    validAssisterName && ball.lastPasserSlotIndex !== shooter.slotIndex ? ball.lastPasserSlotIndex : null;
  const validAssisterId =
    validAssisterName && ball.lastPasserId !== shooter.id ? ball.lastPasserId : null;

  ball.mode = 'SHOT';
  ball.isShot = true;
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
  ball.shotFrames = 0;
  ball.holdFrames = 0;
  ball.shooterFlashEnd = now + 750;
  engine.attackTeam = shooter.team;
  engine.lastScorerUid = shooter.uid;

  // [요구사항 12 해결] 결과(GOAL / SAVED / MISS)에 따라 공의 도착 좌표와 골키퍼 모션을 100% 일치시킴!
  if (outcome === 'GOAL') {
    // 골일 때는 골키퍼가 미치지 못하는 골문 구석 그물로 정확히 빨려 들어감
    const cornerY = Math.random() < 0.5 ? 44.5 : 55.5;
    ball.targetX = isHome ? 98.4 : 1.6;
    ball.targetY = cornerY;
    if (keeper) {
      // 골키퍼 역동작 표현
      keeper.targetY = cornerY > 50 ? 46 : 54;
    }
  } else if (outcome === 'SAVED') {
    // 골키퍼 선방일 때만 골키퍼 위치로 공이 가고, 스토어에 유효슈팅+선방 즉시 기록
    const saveY = 47 + Math.random() * 6;
    ball.targetX = keeper ? keeper.x : isHome ? 93 : 7;
    ball.targetY = saveY;
    if (keeper) {
      keeper.targetY = saveY;
      keeper.y = saveY;
    }
    if (typeof store.recordCanvasShot === 'function') {
      store.recordCanvasShot(
        shooter.team,
        true,
        shooter.slotIndex,
        `🧤 [슈퍼 세이브!] ${attTeamObj?.name} ${ball.shooterName} 선수의 날카로운 슈팅을 골키퍼 ${keeper?.name || 'GK'} 선수가 동물적인 반사신경으로 쳐냅니다!`
      );
    }
  } else {
    // 빗나간 슈팅 (골포스트 외곽)
    ball.targetX = isHome ? 99 : 1;
    ball.targetY = Math.random() < 0.5 ? 36 : 64;
    if (typeof store.recordCanvasShot === 'function') {
      store.recordCanvasShot(
        shooter.team,
        false,
        shooter.slotIndex,
        `💨 [아쉬운 슈팅] ${attTeamObj?.name} ${ball.shooterName}(${shooter.slotRoleCode}) 선수의 과감한 슈팅이 골문을 살짝 벗어납니다.`
      );
    }
  }
}

function executePassToPlayer(engine, carrier, target, state) {
  const ball = engine.ball;
  const isHome = carrier.team === 'HOME';
  const intoBox = isHome ? target.x >= 72 : target.x <= 28;

  // 날씨 및 패스 능력치에 따른 패스 성공 판정 통계를 스토어에 실시간 기록
  const store = useLiveMatchStore.getState();
  const passStat = carrier.baseStats?.passing || 75;
  const weatherPassMod = state.weather?.passMod || 1.0;
  const staminaMod = carrier.stamina < 35 ? 0.82 : 1.0;
  const isSuccess = Math.random() < clamp((passStat / 100) * weatherPassMod * staminaMod + 0.12, 0.65, 0.96);

  if (typeof store.recordCanvasPass === 'function') {
    store.recordCanvasPass(carrier.team, isSuccess);
  }

  ball.mode = 'PASS';
  ball.isShot = false;
  ball.targetUid = target.uid;
  ball.ownerUid = null;
  ball.targetX = target.x;
  ball.targetY = target.y;
  ball.lastPasserUid = carrier.uid;
  ball.lastPasserId = carrier.userPlayerId ?? carrier.playerId ?? carrier.id;
  ball.lastPasserName = sanitizeName(carrier.name);
  ball.lastPasserSlotIndex = carrier.slotIndex;
  ball.holdFrames = 0;
  ball.passFrames = 0;
  ball.boxPassCount = intoBox ? (ball.boxPassCount || 0) + 1 : 0;
  ball.teamPassChain = (ball.teamPassChain || 0) + 1;

  // 특정 선수 터치 편중 방지 카운트 기록
  const prevTouches = engine.touchCounts.get(target.uid) || 0;
  engine.touchCounts.set(target.uid, prevTouches + 1);
}

/**
 * [요구사항 1 & 5 완벽 해결]
 * 한 선수에게 패스/어시스트가 몰리지 않고 좌우 윙어, 2선 미드필더, 풀백, 스트라이커가
 * 현대 축구 전술(인사이드 포워드 컷인, 스루패스, 티키타카, 반대 전환)에 맞춰 유기적으로 공을 주고받음
 */
function selectBestPassTarget(engine, owner, passingStyle, ball) {
  const isHome = owner.team === 'HOME';
  const dir = isHome ? 1 : -1;
  const agents = [...engine.agents.values()];
  const mates = agents.filter(
    (a) => a.team === owner.team && a.uid !== owner.uid && !a.isSentOff && a.role !== 'GK' && a.roleCode !== 'GK'
  );
  const opponents = agents.filter((a) => a.team !== owner.team && !a.isSentOff);
  const inAttackingThird = isHome ? owner.x >= 66 : owner.x <= 34;
  const carrierIsStriker = STRIKER_ROLES.includes(owner.slotRoleCode);

  let best = null;
  let bestScore = -Infinity;

  for (const mate of mates) {
    const mateIsStriker = STRIKER_ROLES.includes(mate.slotRoleCode);
    // 투톱 간 의미 없는 핑퐁 패스 차단
    if (carrierIsStriker && mateIsStriker) continue;
    // 직전 패서에게 즉시 되돌려주기 금지 (1명 어시스트 독식 차단!)
    if (ball.lastPasserUid && mate.uid === ball.lastPasserUid) continue;

    const dist = distance(mate, owner);
    if (dist < 5) continue;

    const forwardProgress = (mate.x - owner.x) * dir;
    if (inAttackingThird && forwardProgress < -2) continue;

    let score = forwardProgress * 1.9 - Math.max(0, dist - 38) * 1.3;

    // 노마크 공간 침투 동료 우대
    if (!opponents.some((o) => distance(o, mate) < 9.5)) score += 42;

    // [현대 축구 루트 1] 인사이드 포워드(LW/RW) 및 2선 공미(CAM/CM)에게 다변화 배급
    if (['LW', 'RW', 'CAM', 'LM', 'RM'].includes(mate.slotRoleCode)) {
      score += 28;
    }
    // [현대 축구 루트 2] 오버래핑 풀백/윙백 측면 공간 패스
    if (['LB', 'RB', 'LWB', 'RWB'].includes(mate.slotRoleCode) && (mate.y < 24 || mate.y > 76)) {
      score += 24;
    }
    // 측면에서 중앙 2선으로 내주는 컷백(Cut-back)
    const carrierOnWing = owner.y < 24 || owner.y > 76;
    const mateInCutbackZone =
      (isHome ? mate.x >= 64 && mate.x <= 84 : mate.x >= 16 && mate.x <= 36) &&
      mate.y >= 26 &&
      mate.y <= 74;
    if (carrierOnWing && mateInCutbackZone) score += 52;

    // [핵심: 몰빵 방지] 이미 공을 너무 많이 만진 선수나 직전 슈터에게는 페널티를 주어 모든 선수가 고르게 관여!
    const touches = engine.touchCounts.get(mate.uid) || 0;
    score -= touches * 6;
    if (engine.lastScorerUid === mate.uid) score -= 35;

    if (passingStyle === 'SHORT') score += Math.max(0, 26 - dist) * 0.9;
    else if (passingStyle === 'DIRECT_LONG') score += forwardProgress > 14 ? 22 : 0;

    score += (Math.random() - 0.5) * 26; // 다양한 선수에게 패스가 분산되도록 변동성 부여

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

  // 1. 골키퍼(GK) 빌드업 전개
  if (carrier.role === 'GK' || carrier.roleCode === 'GK') {
    if (ball.holdFrames >= 14) {
      const teammates = all.filter(
        (p) => p.team === carrier.team && !p.isSentOff && p.uid !== carrier.uid && p.role !== 'GK'
      );
      if (teammates.length > 0) {
        const target = teammates[Math.floor(Math.random() * teammates.length)];
        executePassToPlayer(engine, carrier, target, state);
      }
    }
    return;
  }

  // 포지션 및 지침에 따른 드리블 방향 차별화 (요구사항 5 & 19 반영)
  const isWinger = ['LW', 'RW', 'LM', 'RM'].includes(carrier.slotRoleCode);
  if (isWinger && (isHome ? carrier.x >= 60 : carrier.x <= 40)) {
    // 인사이드 포워드: 측면에서 페널티 박스 중앙 안쪽으로 대각선 컷인(Cut-Inside) 드리블!
    carrier.targetX = isHome ? 88 : 12;
    carrier.targetY = carrier.y + (50 - carrier.y) * 0.65;
  } else {
    carrier.targetX = isHome ? 93 : 7;
    carrier.targetY = carrier.y + (50 - carrier.y) * 0.3;
  }

  const canShootNow = now >= engine.nextShotAllowedAt && !engine.bannerActive;

  // 2. 문전 결정적 슈팅 구역 (홈 x >= 76, 원정 x <= 24)
  const inBoxZone = isHome ? carrier.x >= 76 : carrier.x <= 24;
  if (inBoxZone || distToGoal <= 23) {
    if (ball.holdFrames >= 10) {
      if (canShootNow) {
        const style =
          isWinger
            ? 'CUT_INSIDE'
            : ball.teamPassChain >= 4
            ? 'TIKI_TAKA'
            : 'NORMAL';
        triggerShot(engine, carrier, state, now, style);
        return;
      }
      // 쿨다운 중일 때는 티키타카 컷백 패스로 수비 흔들기
      const teamObj = isHome ? state.homeTeam : state.awayTeam;
      const mate = selectBestPassTarget(engine, carrier, teamObj?.tactics?.passingStyle || 'SHORT', ball);
      if (mate) {
        executePassToPlayer(engine, carrier, mate, state);
        return;
      }
    }
    return;
  }

  // 3. 2선 미드필더/윙어/풀백의 중거리 슛 구역 (홈 62~76, 원정 24~38)
  const inLongShotRange = isHome ? carrier.x >= 62 && carrier.x < 76 : carrier.x <= 38 && carrier.x > 24;
  if (inLongShotRange && ball.holdFrames >= 16 && canShootNow) {
    const isSecondLine = ['CAM', 'CM', 'CDM', 'LCM', 'RCM', 'LW', 'RW', 'LM', 'RM', 'LB', 'RB', 'LWB', 'RWB'].includes(
      carrier.slotRoleCode
    );
    const shootDesire = isSecondLine ? 0.38 : 0.22;
    if (Math.random() < shootDesire) {
      triggerShot(engine, carrier, state, now, isWinger ? 'CUT_INSIDE' : 'LONG_SHOT');
      return;
    }
  }

  // 4. 중원 스루패스 및 빌드업 패스 전개
  if (ball.holdFrames >= 18) {
    const teamObj = isHome ? state.homeTeam : state.awayTeam;
    const passingStyle = teamObj?.tactics?.passingStyle || 'BALANCED';
    const bestMate = selectBestPassTarget(engine, carrier, passingStyle, ball);

    if (bestMate) {
      executePassToPlayer(engine, carrier, bestMate, state);
      return;
    }

    if (distToGoal <= 36 && canShootNow) {
      triggerShot(engine, carrier, state, now, 'LONG_SHOT');
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
        // [요구사항 12 해결] 선방(SAVED)이면 정확히 골키퍼가 잡아내고 SAVE 이펙트 표시!
        const defendSide = ball.shotTeam === 'HOME' ? 'AWAY' : 'HOME';
        const enemyGk = activePlayers.find(
          (p) => p.team === defendSide && (p.role === 'GK' || p.roleCode === 'GK') && !p.isSentOff
        );
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
        } else {
          // 빗나간 슛은 골킥을 위해 골키퍼에게 소유권 전환
          if (enemyGk) {
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
      ball.targetUid = null;
      ball.passFrames = 0;
      ball.vx = 0;
      ball.vy = 0;
    } else {
      // 패스 이동 중 상대 수비수의 패스 경로 차단(인터셉트) 체크!
      const interceptors = activePlayers.filter(
        (p) => p.team !== receiver.team && p.role !== 'GK' && distance(p, ball) <= 2.1
      );
      if (interceptors.length > 0 && Math.random() < 0.14) {
        const interceptor = interceptors[0];
        ball.mode = 'LOCKED';
        ball.ownerUid = interceptor.uid;
        ball.targetUid = null;
        ball.holdFrames = 0;
        ball.teamPassChain = 0;
        ball.lastPasserUid = null;
        ball.lastPasserName = null;
        interceptor.flash = { type: 'TACKLE', until: now + 900 };
        engine.attackTeam = interceptor.team;
        const store = useLiveMatchStore.getState();
        if (typeof store.recordCanvasTackle === 'function') {
          store.recordCanvasTackle(interceptor.team, interceptor.slotIndex);
        }
        return;
      }

      const dx = receiver.x - ball.x;
      const dy = receiver.y - ball.y;
      const dist = Math.hypot(dx, dy);
      const passSpeed = 1.6 * simSpeed;
      if (dist <= passSpeed + 1.5) {
        ball.mode = 'LOCKED';
        ball.ownerUid = receiver.uid;
        ball.targetUid = null;
        ball.x = receiver.x;
        ball.y = receiver.y;
        ball.holdFrames = 0;
        ball.passFrames = 0;
      } else {
        ball.x += (dx / dist) * passSpeed;
        ball.y += (dy / dist) * passSpeed;
      }
    }
    return;
  }

  ball.mode = 'LOOSE';
  ball.vx *= 0.75;
  ball.vy *= 0.75;
  if (Math.abs(ball.vx) < 0.05) ball.vx = 0;
  if (Math.abs(ball.vy) < 0.05) ball.vy = 0;
  ball.x += ball.vx;
  ball.y += ball.vy;

  let nearestPlayer = null;
  let minDist = Infinity;
  for (const p of activePlayers) {
    if (p.isSentOff) continue;
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

    const prevScore = scoringTeam === 'HOME' ? state.homeTeam.score : state.awayTeam.score;
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
    const afterState = useLiveMatchStore.getState();
    const afterScore = scoringTeam === 'HOME' ? afterState.homeTeam.score : afterState.awayTeam.score;

    // 스토어에서 쿨다운을 통과해 실제 득점이 인정된 경우에만 골 배너 표시!
    if (afterScore > prevScore) {
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
    }

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

function movePlayerConstantSpeed(player, playbackSpeed, isCarrierOrSprinting, weatherSpeedMod = 1.0) {
  const dx = player.targetX - player.x;
  const dy = player.targetY - player.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.35) {
    player.x = player.targetX;
    player.y = player.targetY;
    return;
  }
  const speedStat = player.speedStat || 80;
  // [요구사항 25 & 29 반영] 체력 저하 및 부상에 따른 실제 이동 속도 감속
  const staminaMod = player.stamina < 30 ? 0.68 : player.stamina < 55 ? 0.85 : 1.0;
  const injuryMod = player.isInjured ? 0.75 : 1.0;
  let step = 0.27 * (speedStat / 80) * staminaMod * injuryMod * weatherSpeedMod * clamp(playbackSpeed || 1, 1, 2.5);
  if (isCarrierOrSprinting) step *= 1.32;

  if (dist <= step) {
    player.x = player.targetX;
    player.y = player.targetY;
  } else {
    player.x += (dx / dist) * step;
    player.y += (dy / dist) * step;
  }
}

/**
 * [요구사항 16, 28, 37, 45 완벽 해결]
 * 수비 시 놀고 있지 않고 전방 압박(Primary & Secondary Presser) 2명이 적극적으로 달라붙어
 * 수비 능력치(defense/physical)에 비례해 태클로 공을 탈취하고 `🛡️ TACKLE!` 액션을 보여줌
 */
function updatePlayerPositions(engine, state, playbackSpeed, now) {
  const { ball, agents } = engine;
  const all = [...agents.values()];
  const active = all.filter((a) => !a.isSentOff);
  const weatherSpeedMod = state.weather?.speedMod || 1.0;

  for (const a of all) {
    a.hasBall = ball.mode === 'LOCKED' && a.uid === ball.ownerUid;
  }

  const owner = ball.ownerUid ? getAgentByUid(engine, ball.ownerUid) : null;
  const attackingTeam = owner ? owner.team : ball.x < 50 ? 'AWAY' : 'HOME';
  const defendingTeam = attackingTeam === 'HOME' ? 'AWAY' : 'HOME';
  const defTeamObj = defendingTeam === 'HOME' ? state.homeTeam : state.awayTeam;
  const isHighPress = defTeamObj?.tactics?.pressing === 'GEGENPRESS' || defTeamObj?.tactics?.mentality === 'ALL_OUT_ATTACK';

  // 수비팀에서 공과 가장 가까운 필드 플레이어 최대 2명(제1 압박자 + 제2 협력 수비수) 선정
  const defCandidates = active
    .filter((p) => p.team === defendingTeam && p.role !== 'GK' && p.roleCode !== 'GK')
    .filter((p) => Math.hypot(ball.x - p.baseX, ball.y - p.baseY) <= (isHighPress ? 42 : 32))
    .sort((a, b) => distance(a, ball) - distance(b, ball));

  const primaryChaserUid = defCandidates[0]?.uid || null;
  const secondaryChaserUid = isHighPress && defCandidates[1] ? defCandidates[1].uid : null;

  // [요구사항 16 & 37 해결] 압박 수비수가 볼 보유자에게 접근했을 때 수비/피지컬 스탯 대 드리블 스탯 비교로 적극적 태클 탈취!
  if (owner && primaryChaserUid && owner.role !== 'GK' && owner.roleCode !== 'GK') {
    const chaser = getAgentByUid(engine, primaryChaserUid);
    if (chaser && distance(chaser, owner) <= 2.6) {
      const defStat = (chaser.baseStats?.defense || 75) * 0.65 + (chaser.baseStats?.physical || 75) * 0.35;
      const dribStat = (owner.baseStats?.dribbling || 75) * 0.65 + (owner.baseStats?.physical || 75) * 0.35;
      const tackleProb = clamp((defStat / (defStat + dribStat)) * 0.24, 0.06, 0.22);

      if (Math.random() < tackleProb) {
        ball.ownerUid = chaser.uid;
        ball.holdFrames = 0;
        ball.boxPassCount = 0;
        ball.teamPassChain = 0;
        ball.lastPasserUid = null;
        ball.lastPasserName = null;
        chaser.flash = { type: 'TACKLE', until: now + 950 };
        engine.attackTeam = chaser.team;
        const store = useLiveMatchStore.getState();
        if (typeof store.recordCanvasTackle === 'function') {
          store.recordCanvasTackle(chaser.team, chaser.slotIndex);
        }
      }
    }
  }

  for (const p of all) {
    if (p.isSentOff) {
      p.targetX = p.x;
      p.targetY = p.y < 50 ? -8 : 108;
      movePlayerConstantSpeed(p, playbackSpeed, false, weatherSpeedMod);
      continue;
    }

    const isCarrier = ball.mode === 'LOCKED' && ball.ownerUid === p.uid;
    const isChaser = p.uid === primaryChaserUid || p.uid === secondaryChaserUid;

    if (p.role === 'GK' || p.roleCode === 'GK') {
      p.targetX = p.baseX;
      p.targetY = 50 + clamp((ball.y - 50) * 0.16, -5.5, 5.5);
    } else if (isCarrier) {
      // handleCarrierDecision에서 설정한 드리블 타겟 유지
    } else if (ball.mode === 'PASS' && ball.targetUid === p.uid) {
      p.targetX = ball.targetX;
      p.targetY = ball.targetY;
    } else if (p.uid === primaryChaserUid) {
      // 제1 압박 수비수: 공을 가진 상대에게 직접 돌진하여 태클 시도
      p.targetX = ball.x;
      p.targetY = ball.y;
    } else if (p.uid === secondaryChaserUid) {
      // 제2 협력 수비수: 패스 길목과 돌파 동선 커버
      const goalX = p.team === 'HOME' ? 6 : 94;
      p.targetX = ball.x + (goalX - ball.x) * 0.18;
      p.targetY = ball.y + (50 - ball.y) * 0.2;
    } else {
      const teamShiftX = clamp((ball.x - 50) * 0.28, -14, 14);
      const teamShiftY = clamp((ball.y - 50) * 0.14, -6, 6);
      let roleOffsetX = 0;
      let roleOffsetY = 0;
      const dir = p.team === 'HOME' ? 1 : -1;

      if (p.team === attackingTeam) {
        if (['LW', 'RW'].includes(p.slotRoleCode)) {
          // 인사이드 포워드 공간 침투
          roleOffsetX = 9 * dir;
          roleOffsetY = (50 - p.baseY) * 0.25;
        } else if (['ST', 'LST', 'RST', 'CAM'].includes(p.slotRoleCode)) {
          roleOffsetX = 8 * dir;
        } else if (['LB', 'RB', 'LWB', 'RWB'].includes(p.slotRoleCode)) {
          // 풀백 오버래핑
          roleOffsetX = 10 * dir;
        }
      } else {
        // 수비 시 간격 좁히기 (Compact Defense Block)
        roleOffsetX = -5 * dir;
        roleOffsetY = (ball.y - p.baseY) * 0.15;
      }

      const desiredX = p.baseX + teamShiftX + roleOffsetX;
      const desiredY = p.baseY + teamShiftY + roleOffsetY;
      const maxOffsetX = ['CB', 'LCB', 'RCB'].includes(p.slotRoleCode) ? 11 : 18;
      const maxOffsetY = 11;
      p.targetX = clamp(desiredX, p.baseX - maxOffsetX, p.baseX + maxOffsetX);
      p.targetY = clamp(desiredY, p.baseY - maxOffsetY, p.baseY + maxOffsetY);
    }

    // 동료 간 겹침 방지 척력
    for (const other of active) {
      if (other.uid === p.uid || other.team !== p.team) continue;
      const dist = distance(p, other);
      if (dist < 7.2 && dist > 0.01) {
        p.targetX += ((p.x - other.x) / dist) * 1.6;
        p.targetY += ((p.y - other.y) / dist) * 1.6;
      }
    }

    p.targetX = clamp(p.targetX, 4, 96);
    p.targetY = clamp(p.targetY, 6, 94);
    movePlayerConstantSpeed(p, playbackSpeed, isCarrier || isChaser, weatherSpeedMod);
  }
}

function staminaColor(stamina) {
  if (stamina > 60) return '#22c55e';
  if (stamina > 30) return '#eab308';
  return '#ef4444';
}

function drawFlash(ctx, agent, px, py, now) {
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
    ctx.fillRect(px - 6, py - 42 + bob, 12, 17);
    ctx.strokeRect(px - 6, py - 42 + bob, 12, 17);
  } else if (agent.flash.type === 'TACKLE') {
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('🛡️ TACKLE!', px, py - 24 + bob);
  } else if (agent.flash.type === 'CORNER' || agent.flash.type === 'FREEKICK') {
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(agent.flash.type === 'CORNER' ? '🚩 CORNER' : '🎯 FREEKICK', px, py - 24 + bob);
  } else {
    const label = agent.flash.type === 'SUB' ? '🔄 SUB IN' : 'FOUL';
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

function drawPlayersAndBall(ctx, engine, now) {
  const agents = [...engine.agents.values()]
    .filter((a) => !(a.isSentOff && (a.y < -4 || a.y > 104)))
    .sort((a, b) => a.y - b.y);

  for (const a of agents) {
    const px = toPx(a.x);
    const py = toPy(a.y);

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(px + 2, py + 6, 12, 5, 0, 0, Math.PI * 2);
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

    ctx.fillStyle = fill;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

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
      ctx.font = '10px sans-serif';
      ctx.fillText('🩹', px - 12, py - 12);
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
  }

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(bx, by, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawShotTrail(ctx, ball) {
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
  drawPlayersAndBall(ctx, engine, now);
  drawShotTrail(ctx, engine.ball);
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