import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import useLiveMatchStore from './store/useLiveMatchStore.js';
import PitchCanvas2D from './components/domain/liveMatch/PitchCanvas2D.jsx';

const POS = ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'MF', 'FW', 'FW'];
const stats = { speed: 78, shooting: 82, passing: 78, dribbling: 78, defense: 75, physical: 76, gkReflexes: 70 };
const mk = (prefix, off) =>
  POS.map((pos, i) => ({
    id: off + i,
    userPlayerId: off + i,
    name: `${prefix}${i + 1}`,
    mainPosition: pos,
    preferredRoleCode: pos === 'GK' ? 'GK' : pos === 'DF' ? 'CB' : pos === 'MF' ? 'CM' : 'ST',
    overall: 78,
    baseStats: stats,
    effectiveStats: stats,
  }));
const team = (name, off) => ({ clubId: off, name, emblem: null, formation: '4-4-2', tactics: {}, starters: mk(name[0], off), bench: [] });

useLiveMatchStore.getState().initMatch({ home: team('KOR', 1), away: team('ENG', 100), sessionId: 'x', context: { mode: 'WORLD_CUP' } });
{
  const st = useLiveMatchStore.getState();
  for (const t of [st.homeTeam, st.awayTeam]) for (const p of t.starters) p.effectiveStats = p.effectiveStats || stats;
}
window.store = useLiveMatchStore;
useLiveMatchStore.getState().attachTicker();
ReactDOM.createRoot(document.getElementById('root')).render(<PitchCanvas2D />);
