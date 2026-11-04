import { useLiveMatchStore } from './src/store/useLiveMatchStore.js';
import { normalizePlayer } from './src/store/useSquadStore.js';
import { __t } from './src/components/domain/liveMatch/PitchCanvas2D.jsx';

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.requestAnimationFrame = () => 0;

const FORMATION_HOME = process.env.HOME_FORM || process.env.FORM || '4-3-3';
const FORMATION_AWAY = process.env.AWAY_FORM || process.env.FORM || '4-3-3';
const MATCHES = Number(process.env.MATCHES || 14);
const HOME_TACTICS = process.env.HOME_CD ? { cornerDefense: process.env.HOME_CD } : {};
const AWAY_TACTICS = process.env.AWAY_MENT ? { mentality: process.env.AWAY_MENT } : {};
const EARLY_FRAMES = 150;

const POS = ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'FW', 'FW', 'FW'];
const ROLE = ['GK', 'LB', 'CB', 'CB', 'RB', 'CM', 'CM', 'CAM', 'LW', 'ST', 'RW'];
const mk = (side, i) =>
  normalizePlayer(
    {
      userPlayerId: side === 'HOME' ? 100 + i : 0,
      playerId: i,
      name: `${side}${i}`,
      mainPosition: POS[i % 11],
      preferredRoleCode: ROLE[i % 11],
      level: 1,
      stamina: 100,
      baseStats: { speed: 74, shooting: 75, passing: 74, dribbling: 72, defense: 72, physical: 72, gkReflexes: 72, staminaMax: 90 },
      overall: 75,
    },
    side,
    i + 1
  );
const team = (side, tactics) => ({
  clubId: side === 'HOME' ? 1 : 0,
  name: side,
  formation: side === 'HOME' ? FORMATION_HOME : FORMATION_AWAY,
  tactics,
  starters: Array.from({ length: 11 }, (_, i) => mk(side, i)),
  bench: Array.from({ length: 11 }, (_, i) => mk(side, i + 11)),
});

const s = useLiveMatchStore;
const rows = [];
const dist = __t.distance;

for (let m = 0; m < MATCHES; m++) {
  s.getState().resetMatch();
  s.getState().initMatch({
    home: team('HOME', HOME_TACTICS),
    away: team('AWAY', AWAY_TACTICS),
    sessionId: 'x',
    context: { mode: 'LEAGUE', ref: 'L:1:1', label: 't' },
  });
  const engine = __t.createEngine();
  let now = 1000;
  let frames = 0;
  let nextTick = now + 500;
  let cur = null; // 진행 중인 코너킥 추적
  let prevState = null;

  while (s.getState().status === 'live' && frames++ < 200000) {
    now += 1000 / 60;
    const st = s.getState();
    if (st.matchPhase === 'HALF_TIME') {
      st.startSecondHalf();
      continue;
    }
    if (now >= nextTick) {
      nextTick = now + 500;
      st.advanceMinute();
    }
    const state = s.getState();
    if (!state.homeTeam) break;
    __t.syncAgents(engine, state, now);
    const action = state.currentTickAction;
    if (action && action.seq !== engine.lastSeq) {
      engine.lastSeq = action.seq;
      __t.applyAction(engine, action, now);
    }
    if (state.isPaused || state.matchPhase === 'HALF_TIME') continue;
    __t.updateBallAndMatchFlow(engine, state, now, () => {});
    __t.updatePlayerPositions(engine, state, 1, now);

    const ball = engine.ball;
    const agents = [...engine.agents.values()].filter((a) => !a.isSentOff);

    if (ball.setPieceState === 'CORNER' && prevState !== 'CORNER') {
      cur = { team: engine.attackTeam, start: frames, turnover: null, shotAfter: null, goalAfter: null, m };
      cur.stayCount = agents.filter((a) => a.team === cur.team && a.cornerRole === 'STAY_BACK').length;
      cur.boxCount = agents.filter((a) => a.team === cur.team && a.cornerRole === 'BOX_ATTACK').length;
      rows.push(cur);
    }
    prevState = ball.setPieceState;

    if (cur && cur.turnover === null && ball.setPieceState !== 'CORNER' && !(ball.mode === 'PASS' && ball.isCornerCross)) {
      const owner = ball.ownerUid ? agents.find((a) => a.uid === ball.ownerUid) : null;
      if (owner && owner.team !== cur.team && owner.role !== 'GK') {
        const dirC = cur.team === 'HOME' ? 1 : -1;
        const outfield = agents.filter((a) => a.team === cur.team && a.role !== 'GK');
        const goalSide = outfield.filter((a) => (cur.team === 'HOME' ? a.x < ball.x : a.x > ball.x));
        const sprinters = outfield.filter((a) => a.x * dirC > 70 * dirC && cur.team === 'HOME' ? a.x > 70 : cur.team === 'AWAY' && a.x < 30);
        cur.turnover = frames;
        cur.goalSideCount = goalSide.length;
        cur.deepCount = sprinters.length;
        cur.ballX = Math.round(ball.x);
        cur.owner = owner.name;
        const oppGoalX = cur.team === 'HOME' ? 4 : 96;
        cur.ownerNearestDefender = Math.round(
          Math.min(...outfield.map((a) => dist(a, owner)))
        );
      }
    }
    if (cur && cur.turnover !== null && frames - cur.turnover <= 150 && (frames - cur.turnover) % 15 === 0) {
      const dirT = cur.team === 'HOME' ? 1 : -1;
      const owner0 = ball.ownerUid ? agents.find((a) => a.uid === ball.ownerUid) : null;
      const stays = agents.filter((a) => a.team === cur.team && a.cornerRole === 'STAY_BACK');
      const fmt = (a) => `${a.slotRoleCode}(${Math.round(a.x)},${Math.round(a.y)})`;
      cur.trace = cur.trace || [];
      cur.trace.push(
        `  t+${frames - cur.turnover} ball(${Math.round(ball.x)},${Math.round(ball.y)}) mode=${ball.mode} owner=${owner0 ? owner0.team + ':' + owner0.slotRoleCode + '(' + Math.round(owner0.x) + ',' + Math.round(owner0.y) + ')' : '-'} ` +
          `stays=[${stays.map(fmt).join(' ')}] stunned=${stays.filter((a) => now < (a.stunUntil || 0)).length} trans=${Boolean(engine.cornerTransition)}`
      );
    }
    if (cur && cur.turnover !== null && cur.shotAfter === null && frames - cur.turnover <= 420) {
      if (ball.mode === 'SHOT' && ball.shotTeam && ball.shotTeam !== cur.team) {
        cur.shotAfter = frames - cur.turnover;
        const shooter0 = agents.find((a) => a.name === ball.shooterName);
        cur.shooterRole = shooter0 ? shooter0.cornerRole : '?';
        cur.shooterPos = shooter0 ? shooter0.slotRoleCode : '?';
        cur.shotStartX = Math.round(ball.startX ?? ball.x);
        cur.shotStyle = ball.goalStyle;
        cur.shotX0 = shooter0 ? Math.round(shooter0.x) : -1;
        cur.sameAsTurnoverOwner = shooter0 ? shooter0.name === cur.owner : false;
        const outfield2 = agents.filter((a) => a.team === cur.team && a.role !== 'GK');
        cur.nearDefAtShot = shooter0 ? Math.round(Math.min(...outfield2.map((a) => Math.hypot(a.x - shooter0.x, a.y - shooter0.y)))) : -1;
        cur.goalSideAtShot = outfield2.filter((a) => (cur.team === 'HOME' ? a.x < (shooter0 ? shooter0.x : ball.x) : a.x > (shooter0 ? shooter0.x : ball.x))).length;
      }
      if (ball.mode === 'GOAL_NET' && ball.shotTeam !== cur.team) cur.goalAfter = frames - cur.turnover;
    }
    if (cur && frames - cur.start > 900) cur = null;
  }
}

const done = rows.filter((r) => r.turnover !== null);
const byTeam = (t) => done.filter((r) => r.team === t);
const summarize = (arr) => {
  if (arr.length === 0) return 'n/a';
  const avg = (k) => (arr.reduce((a, r) => a + (r[k] || 0), 0) / arr.length).toFixed(1);
  const early = arr.filter((r) => r.shotAfter !== null && r.shotAfter <= EARLY_FRAMES).length;
  const any = arr.filter((r) => r.shotAfter !== null).length;
  const zeroBack = rows.filter((r) => r.team === arr[0].team && r.stayCount === 0).length;
  return `turnovers ${arr.length}, avg stay-back ${avg('stayCount')}, corners with 0 stay-back ${zeroBack}, early(<=2.5s) counter shots ${early}/${arr.length}, any shot<=7s ${any}/${arr.length}`;
};
console.log('total corners', rows.length, 'turnovers', done.length);
let shownTraces = 0;
for (const r of done) {
  if (r.shotAfter !== null && r.shotAfter <= EARLY_FRAMES && r.goalSideAtShot === 0 && shownTraces < 3) {
    shownTraces++;
    console.log(`TRACE ${r.team} corner, shot +${r.shotAfter}f by ${r.shooterPos}/${r.shooterRole}`);
    for (const line of r.trace || []) console.log(line);
  }
}
console.log('HOME corners:', summarize(byTeam('HOME')));
console.log('AWAY corners:', summarize(byTeam('AWAY')));
process.exit(0);
