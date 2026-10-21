import { useEffect, useState } from 'react';
import { Loader2, Globe, Search, Shield, Trophy, X } from 'lucide-react';
import useAuthStore from '../store/useAuthStore.js';
import useCompetitionStore from '../store/useCompetitionStore.js';
import useNavStore from '../store/useNavStore.js';
import Panel from '../components/common/Panel.jsx';
import Notice from '../components/common/Notice.jsx';
import { StandingsTable } from '../components/domain/liveMatch/FullTimeReportModal.jsx';
import { MODE_META, MODE_ORDER, formatNumber } from '../constants/gameConfig.js';

// [요구사항 6 해결] 월드컵 모드 참가 국가 선택 목록 (12개 주요 국가대표팀)
const WORLD_CUP_NATIONS = [
  { code: 'KOR', name: '🇰🇷 대한민국', ovr: 84, stars: ['손흥민 (LW · 91)', '김민재 (CB · 88)', '이강인 (CAM · 86)', '황희찬 (ST · 83)', '조현우 (GK · 85)'] },
  { code: 'ARG', name: '🇦🇷 아르헨티나', ovr: 91, stars: ['리오넬 메시 (RW · 92)', '라우타로 마르티네스 (ST · 89)', '엔소 페르난데스 (CM · 86)', '에밀리아노 마르티네스 (GK · 89)'] },
  { code: 'FRA', name: '🇫🇷 프랑스', ovr: 92, stars: ['킬리안 음바페 (ST · 92)', '앙투안 그리에즈만 (CAM · 88)', '윌리엄 살리바 (CB · 89)', '마이크 메냥 (GK · 87)'] },
  { code: 'ENG', name: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 잉글랜드', ovr: 91, stars: ['해리 케인 (ST · 91)', '주드 벨링엄 (CAM · 90)', '부카요 사카 (RW · 88)', '데클란 라이스 (CDM · 88)'] },
  { code: 'BRA', name: '🇧🇷 브라질', ovr: 90, stars: ['비니시우스 주니오르 (LW · 91)', '호드리구 (RW · 87)', '마르키뉴스 (CB · 87)', '알리송 베케르 (GK · 89)'] },
  { code: 'ESP', name: '🇪🇸 스페인', ovr: 91, stars: ['로드리 (CDM · 91)', '라민 야말 (RW · 88)', '페드리 (CM · 88)', '니코 윌리엄스 (LW · 86)'] },
  { code: 'GER', name: '🇩🇪 독일', ovr: 89, stars: ['자말 무시알라 (CAM · 89)', '플로리안 비르츠 (CAM · 89)', '안토니오 뤼디거 (CB · 88)', '마누엘 노이어 (GK · 86)'] },
  { code: 'POR', name: '🇵🇹 포르투갈', ovr: 89, stars: ['크리스티아누 호날두 (ST · 87)', '브루노 페르난데스 (CAM · 88)', '베르나르두 실바 (CM · 88)', '후벵 디아스 (CB · 89)'] },
  { code: 'JPN', name: '🇯🇵 일본', ovr: 83, stars: ['쿠보 다케후사 (RW · 84)', '미토마 가오루 (LW · 83)', '엔도 와타루 (CDM · 82)', '도미야스 다케히로 (CB · 82)'] },
  { code: 'USA', name: '🇺🇸 미국', ovr: 81, stars: ['크리스티안 풀리식 (LW · 83)', '웨스턴 맥케니 (CM · 80)', '안토니 로빈슨 (LB · 81)'] },
];

// [요구사항 21 & 48 해결] 상대 팀 전력 및 실제 소속 스타 선수 데이터베이스
const OPPONENT_SCOUT_DB = {
  default: { formation: '4-3-3', avgOvr: 82, style: '밸런스 빌드업', recentForm: ['W', 'D', 'W', 'L', 'W'], keyPlayers: ['마커스 래시포드 (FW · 83)', '브루노 기마랑이스 (MF · 85)', '크리스티안 로메로 (DF · 86)'] },
  맨체스터: { formation: '4-2-3-1', avgOvr: 89, style: '게겐프레싱 & 포제션', recentForm: ['W', 'W', 'W', 'D', 'W'], keyPlayers: ['엘링 홀란드 (ST · 92)', '케빈 더 브라위너 (CAM · 91)', '로드리 (CDM · 91)', '후벵 디아스 (CB · 89)'] },
  마드리드: { formation: '4-3-3', avgOvr: 91, style: '초고속 카운터 & 컷인', recentForm: ['W', 'W', 'W', 'W', 'D'], keyPlayers: ['킬리안 음바페 (ST · 92)', '비니시우스 주니오르 (LW · 91)', '주드 벨링엄 (CAM · 90)', '티보 쿠르투아 (GK · 90)'] },
  런던: { formation: '4-3-3', avgOvr: 86, style: '하이 라인 & 측면 돌파', recentForm: ['W', 'L', 'W', 'W', 'D'], keyPlayers: ['손흥민 (LW · 91)', '부카요 사카 (RW · 88)', '제임스 매디슨 (CAM · 85)', '미키 판 더 펜 (CB · 85)'] },
  뮌헨: { formation: '4-2-3-1', avgOvr: 89, style: '전방 압박 & 측면 크로스', recentForm: ['W', 'W', 'D', 'W', 'W'], keyPlayers: ['해리 케인 (ST · 91)', '자말 무시알라 (CAM · 89)', '김민재 (CB · 88)', '조슈아 키미히 (CM · 88)'] },
  파리: { formation: '4-3-3', avgOvr: 87, style: '점유율 & 측면 오버래핑', recentForm: ['W', 'D', 'W', 'W', 'L'], keyPlayers: ['이강인 (CAM · 86)', '우스만 뎀벨레 (RW · 86)', '아슈라프 하키미 (RB · 87)', '비티냐 (CM · 86)'] },
};

function getOpponentScoutInfo(teamObjOrName) {
  const name = typeof teamObjOrName === 'string' ? teamObjOrName : teamObjOrName?.name || '상대 구단';
  const matchedKey = Object.keys(OPPONENT_SCOUT_DB).find((k) => name.includes(k));
  const info = matchedKey ? OPPONENT_SCOUT_DB[matchedKey] : OPPONENT_SCOUT_DB.default;
  const strength = teamObjOrName?.strength || teamObjOrName?.avgOvr || info.avgOvr;
  return { name, ...info, avgOvr: strength };
}

function teamName(state, id, clubName, selectedNation) {
  if (id === 'USER') return selectedNation ? selectedNation.name : clubName;
  return state?.teams?.[id]?.name || id || '미정';
}

function OpponentScoutModal({ teamInfo, onClose }) {
  if (!teamInfo) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Opponent Tactical Report</p>
            <h3 className="text-lg font-black text-white">{teamInfo.name} 전력 분석</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg bg-slate-800 p-1.5 text-slate-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl bg-slate-950 p-2.5">
            <p className="text-slate-400">평균 OVR</p>
            <p className="mt-1 text-xl font-black text-emerald-400">{teamInfo.avgOvr}</p>
          </div>
          <div className="rounded-xl bg-slate-950 p-2.5">
            <p className="text-slate-400">주 포메이션</p>
            <p className="mt-1 text-base font-black text-white">{teamInfo.formation}</p>
          </div>
          <div className="rounded-xl bg-slate-950 p-2.5">
            <p className="text-slate-400">최근 5경기 폼</p>
            <div className="mt-1 flex justify-center gap-1">
              {teamInfo.recentForm.map((f, i) => (
                <span
                  key={i}
                  className={`rounded px-1 text-[10px] font-black ${
                    f === 'W' ? 'bg-emerald-600 text-white' : f === 'D' ? 'bg-slate-600 text-white' : 'bg-rose-600 text-white'
                  }`}
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs">
          <p className="font-bold text-slate-300">전술 스타일: <span className="text-amber-300">{teamInfo.style}</span></p>
          <p className="mt-2 font-bold text-slate-300">주요 핵심 선수 (Key Players):</p>
          <ul className="mt-1.5 space-y-1 text-slate-200">
            {teamInfo.keyPlayers.map((kp) => (
              <li key={kp} className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-blue-400" /> {kp}
              </li>
            ))}
          </ul>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-blue-600 py-2 text-xs font-bold text-white hover:bg-blue-500"
        >
          확인 완료
        </button>
      </div>
    </div>
  );
}

function Bracket({ state, clubName, selectedNation, onInspectTeam }) {
  const names = state.roundNames || [];
  const columns = names.map((name, i) => ({ name, matches: state.rounds?.[i]?.matches || null }));
  return (
    <div className="flex gap-4 overflow-x-auto pb-2" data-testid="bracket">
      {columns.map((col) => (
        <div key={col.name} className="min-w-[190px] flex-1">
          <h4 className="mb-2 text-center text-[11px] font-bold uppercase tracking-wider text-slate-400">{col.name}</h4>
          <ul className="space-y-2">
            {col.matches ? (
              col.matches.map((m, i) => {
                const played = m.ga !== null && m.ga !== undefined;
                const aWon = m.winner === m.a;
                const bWon = m.winner === m.b;
                const hasUser = m.a === 'USER' || m.b === 'USER';
                const nameA = teamName(state, m.a, clubName, selectedNation);
                const nameB = teamName(state, m.b, clubName, selectedNation);
                return (
                  <li
                    key={i}
                    className={`rounded-lg border p-2 text-xs ${
                      hasUser ? 'border-blue-400/70 bg-blue-500/10' : 'border-slate-800 bg-slate-950/50'
                    }`}
                  >
                    <div
                      onClick={() => m.a !== 'USER' && onInspectTeam(nameA)}
                      className={`flex cursor-pointer justify-between hover:text-blue-300 ${
                        aWon ? 'font-black text-white' : 'text-slate-400'
                      }`}
                    >
                      <span className="truncate">{nameA}</span>
                      <span>{played ? m.ga : '-'}</span>
                    </div>
                    <div
                      onClick={() => m.b !== 'USER' && onInspectTeam(nameB)}
                      className={`flex cursor-pointer justify-between hover:text-blue-300 ${
                        bWon ? 'font-black text-white' : 'text-slate-400'
                      }`}
                    >
                      <span className="truncate">{nameB}</span>
                      <span>{played ? m.gb : '-'}</span>
                    </div>
                  </li>
                );
              })
            ) : (
              <li className="rounded-lg border border-dashed border-slate-800 p-3 text-center text-[11px] text-slate-600">
                대기 중
              </li>
            )}
          </ul>
        </div>
      ))}
    </div>
  );
}

function LeagueView({ detail, clubName, onInspectTeam }) {
  const state = detail.state;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Panel
        title={`${state.division}부 리그 · 시즌 ${state.season}`}
        className="lg:col-span-2"
        right={<span className="text-[11px] text-amber-300">🏆 우승 보상: 15,000 G + 300 캐시</span>}
      >
        <p className="mb-2 text-[11px] text-slate-400">
          상위 2팀 승격 🔺 · 하위 2팀 강등 🔻 · 현재 {Math.min(state.round, state.totalRounds)}/{state.totalRounds} 라운드 ·{' '}
          <b className="text-sky-300">아래 팀을 클릭하면 상대 전력을 분석합니다.</b>
        </p>
        <StandingsTable rows={detail.standings} />
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
          {detail.standings
            .filter((r) => r.id !== 'USER')
            .map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onInspectTeam(r.name)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-[11px] text-slate-200 hover:border-blue-400 hover:text-white"
              >
                <Search className="h-3 w-3 text-blue-400" /> {r.name} 전력확인
              </button>
            ))}
        </div>
      </Panel>
      <Panel title="지난 라운드 결과">
        {state.lastRound ? (
          <ul className="space-y-1 text-xs text-slate-300">
            <li className="mb-1 text-[11px] font-bold text-slate-500">{state.lastRound.round}라운드</li>
            {state.lastRound.results.map((r) => (
              <li
                key={`${r.h}-${r.a}`}
                className={`flex justify-between rounded px-2 py-1 ${
                  r.h === 'USER' || r.a === 'USER' ? 'bg-blue-500/10 font-bold text-white' : ''
                }`}
              >
                <span className="truncate">{teamName(state, r.h, clubName)}</span>
                <span className="px-2">
                  {r.hg} : {r.ag}
                </span>
                <span className="truncate text-right">{teamName(state, r.a, clubName)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500">아직 치른 경기가 없습니다.</p>
        )}
      </Panel>
    </div>
  );
}

function WorldCupView({ detail, clubName, selectedNation, onSelectNation, onInspectTeam }) {
  const state = detail.state;
  return (
    <div className="space-y-4">
      {/* [요구사항 6 완벽 해결] 월드컵 모드 참가 국가 선택 패널 */}
      <Panel
        title="🌍 내셔널 월드컵 참가 국가대표팀 선택"
        right={<span className="text-xs font-bold text-emerald-300">현재 선택: {selectedNation.name} (OVR {selectedNation.ovr})</span>}
      >
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {WORLD_CUP_NATIONS.map((nat) => (
            <button
              key={nat.code}
              type="button"
              onClick={() => onSelectNation(nat)}
              className={`rounded-xl border p-2.5 text-left transition ${
                selectedNation.code === nat.code
                  ? 'border-amber-400 bg-amber-500/20 text-white'
                  : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black">{nat.name}</span>
                <span className="text-[11px] font-bold text-emerald-400">{nat.ovr}</span>
              </div>
              <p className="mt-1 truncate text-[10px] text-slate-400">{nat.stars.slice(0, 2).join(', ')}</p>
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="월드컵 조별리그 순위표">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Object.entries(detail.groupStandings).map(([group, rows]) => (
            <div key={group} className={group === 'A' ? 'rounded-lg border border-blue-500/40 p-2' : 'p-2'}>
              <h4 className="mb-1 text-xs font-bold text-slate-300">
                {group}조 {group === 'A' && `(${selectedNation.name} 소속 조)`}
              </h4>
              <StandingsTable
                rows={rows.map((r) => ({ ...r, name: teamName(state, r.id, clubName, selectedNation) }))}
                limit={4}
              />
            </div>
          ))}
        </div>
      </Panel>
      {state.phase === 'KNOCKOUT' && (
        <Panel title="토너먼트">
          <Bracket state={state} clubName={clubName} selectedNation={selectedNation} onInspectTeam={onInspectTeam} />
        </Panel>
      )}
    </div>
  );
}

function TowerView({ detail, onChallenge, onInspectTeam }) {
  const cleared = detail.state.cleared;
  return (
    <Panel
      title="챌린지 타워"
      right={
        <span className="text-xs text-slate-400">
          {cleared.length}/{detail.stages.length} 클리어 · 시도 {detail.state.attempts}회
        </span>
      }
    >
      <ul className="space-y-3">
        {detail.stages.map((stage) => {
          const isCleared = cleared.includes(stage.id);
          const unlocked = stage.id <= cleared.length + 1;
          return (
            <li
              key={stage.id}
              className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${
                isCleared ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-800 bg-slate-950/50'
              }`}
              data-testid={`tower-stage-${stage.id}`}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-sm font-black text-white">
                {stage.id}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white">
                  {stage.title} {isCleared && <span className="text-emerald-300">✓ 클리어</span>}
                </p>
                <p className="text-xs text-slate-400">{stage.description}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  상대 {stage.opponent.name} (전력 {stage.opponent.strength}) · 목표: {stage.objective.text} · 첫 클리어 보상{' '}
                  {formatNumber(stage.reward.gold)}G + 캐시 {stage.reward.cashFree}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onInspectTeam({ name: stage.opponent.name, strength: stage.opponent.strength })}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700"
              >
                🔍 상대 전력
              </button>
              <button
                type="button"
                disabled={!unlocked}
                onClick={() => onChallenge(stage.id)}
                data-testid={`tower-challenge-${stage.id}`}
                className="rounded-lg bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                {unlocked ? (isCleared ? '재도전' : '도전') : '🔒 잠김'}
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function RankedView({ detail }) {
  const { state, tiers } = detail;
  const currentIndex = tiers.reduce((idx, t, i) => (state.rp >= t.minRp ? i : idx), 0);
  const tier = tiers[currentIndex];
  const next = tiers[currentIndex + 1];
  const pct = next ? Math.round(((state.rp - tier.minRp) / (next.minRp - tier.minRp)) * 100) : 100;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel title="내 랭크">
        <p className="text-3xl font-black text-white" data-testid="ranked-rp">
          {tier.label} <span className="text-lg text-slate-400">{state.rp} RP</span>
        </p>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-700">
          <div className="h-full bg-gradient-to-r from-rose-500 to-amber-400" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          {next ? `다음 티어 ${next.label} 까지 ${next.minRp - state.rp} RP` : '최고 티어입니다'}
        </p>
        <p className="mt-3 text-sm text-slate-300">
          {state.wins}승 {state.draws}무 {state.losses}패{' '}
          {state.streak >= 2 && <span className="text-amber-300">· 🔥 {state.streak}연승</span>}
        </p>
      </Panel>
      <Panel title="최근 경기">
        {state.history.length === 0 ? (
          <p className="text-xs text-slate-500">아직 랭크 경기를 치르지 않았습니다.</p>
        ) : (
          <ul className="space-y-1 text-xs text-slate-300">
            {state.history.map((h, i) => (
              <li key={i} className="flex justify-between rounded bg-slate-950/50 px-2 py-1">
                <span className="truncate">{h.opponent}</span>
                <span>{h.score}</span>
                <span className={h.delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                  {h.delta >= 0 ? '+' : ''}
                  {h.delta} RP
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

export default function GameModeSelectPage() {
  const club = useAuthStore((s) => s.club);
  const params = useNavStore((s) => s.params);
  const go = useNavStore((s) => s.go);
  const list = useCompetitionStore((s) => s.list);
  const details = useCompetitionStore((s) => s.details);
  const loadList = useCompetitionStore((s) => s.loadList);
  const loadDetail = useCompetitionStore((s) => s.loadDetail);
  const startMode = useCompetitionStore((s) => s.startMode);
  const prepareNextMatch = useCompetitionStore((s) => s.prepareNextMatch);

  const [mode, setMode] = useState(params.mode || 'LEAGUE');
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selectedNation, setSelectedNation] = useState(WORLD_CUP_NATIONS[0]);
  const [scoutTarget, setScoutTarget] = useState(null);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    loadDetail(mode);
  }, [mode, loadDetail]);

  const detail = details[mode];
  const meta = MODE_META[mode];
  const status = detail?.status || 'NONE';
  const isPersistent = mode === 'CHALLENGE_TOWER' || mode === 'RANKED';

  const goToPreMatch = async (stageId = null) => {
    const result = await prepareNextMatch(mode, stageId);
    if (!result.ok) {
      setNotice({ type: 'error', text: result.message });
      return;
    }
    go('prematch', { mode, nation: mode === 'WORLD_CUP' ? selectedNation : null });
  };

  const handleStart = async (restart = false) => {
    setBusy(true);
    setNotice(null);
    if (restart && !window.confirm('진행 중인 대회를 포기하고 새로 시작할까요? 진행 상황이 사라집니다.')) {
      setBusy(false);
      return;
    }
    if (status === 'NONE' || status === 'FINISHED' || restart) {
      const result = await startMode(mode, restart || status === 'FINISHED');
      if (!result.ok) {
        setNotice({ type: 'error', text: result.message });
        setBusy(false);
        return;
      }
    }
    if (mode === 'CHALLENGE_TOWER') {
      setBusy(false);
      return;
    }
    await goToPreMatch();
    setBusy(false);
  };

  const handleChallenge = async (stageId) => {
    setBusy(true);
    await goToPreMatch(stageId);
    setBusy(false);
  };

  const startLabel =
    status === 'ACTIVE'
      ? mode === 'RANKED'
        ? '랭크 매치 시작'
        : '이어하기 (다음 경기)'
      : status === 'FINISHED'
      ? mode === 'LEAGUE'
        ? '다음 시즌 시작'
        : '새 대회 시작'
      : mode === 'CHALLENGE_TOWER'
      ? '챌린지 시작'
      : mode === 'RANKED'
      ? '랭크 시작'
      : '대회 시작';

  return (
    <div className="space-y-4" data-testid="modes-page">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {MODE_ORDER.map((key) => {
          const m = MODE_META[key];
          const row = list.find((c) => c.mode === key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              data-testid={`mode-${key}`}
              className={`rounded-xl border-2 bg-gradient-to-br p-3 text-left transition ${m.accent} ${
                mode === key ? 'ring-2 ring-white/70' : 'opacity-80 hover:opacity-100'
              }`}
            >
              <span className="text-2xl">{m.icon}</span>
              <p className="mt-1 text-xs font-black text-white">{m.title}</p>
              <p className="mt-1 text-[10px] text-slate-300">{row?.summary || '아직 시작하지 않았습니다.'}</p>
            </button>
          );
        })}
      </div>

      <Notice notice={notice} />

      <Panel
        title={`${meta.icon} ${meta.title}`}
        right={
          <div className="flex gap-2">
            {status === 'ACTIVE' && !isPersistent && (
              <button
                type="button"
                disabled={busy}
                onClick={() => handleStart(true)}
                className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800"
              >
                포기하고 새로 시작
              </button>
            )}
            {mode !== 'CHALLENGE_TOWER' || status === 'NONE' ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => handleStart(false)}
                data-testid="mode-start"
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-blue-600 px-5 py-1.5 text-xs font-black text-white hover:from-emerald-500 hover:to-blue-500 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {startLabel}
              </button>
            ) : null}
          </div>
        }
      >
        <p className="text-xs text-slate-400">{meta.desc}</p>
        <p className="mt-1 text-xs font-semibold text-slate-300">{detail?.summary || '아직 시작하지 않았습니다.'}</p>
      </Panel>

      {detail && detail.state && (
        <>
          {mode === 'LEAGUE' && (
            <LeagueView
              detail={detail}
              clubName={club.name}
              onInspectTeam={(t) => setScoutTarget(getOpponentScoutInfo(t))}
            />
          )}
          {mode === 'CHAMPIONS_CUP' && (
            <Panel
              title="토너먼트 대진표 (팀 클릭 시 전력 분석)"
              right={
                detail.state.champion && (
                  <span className="text-xs font-bold text-amber-300">
                    🏆 우승: {teamName(detail.state, detail.state.champion, club.name)}
                  </span>
                )
              }
            >
              <Bracket
                state={detail.state}
                clubName={club.name}
                onInspectTeam={(t) => setScoutTarget(getOpponentScoutInfo(t))}
              />
            </Panel>
          )}
          {mode === 'WORLD_CUP' && (
            <WorldCupView
              detail={detail}
              clubName={club.name}
              selectedNation={selectedNation}
              onSelectNation={(nat) => {
                setSelectedNation(nat);
                setNotice({ type: 'success', text: `🌍 월드컵 출전 국가를 [${nat.name}] 대표팀으로 설정했습니다!` });
              }}
              onInspectTeam={(t) => setScoutTarget(getOpponentScoutInfo(t))}
            />
          )}
          {mode === 'CHALLENGE_TOWER' && (
            <TowerView
              detail={detail}
              onChallenge={handleChallenge}
              onInspectTeam={(t) => setScoutTarget(getOpponentScoutInfo(t))}
            />
          )}
          {mode === 'RANKED' && <RankedView detail={detail} />}
        </>
      )}

      <OpponentScoutModal teamInfo={scoutTarget} onClose={() => setScoutTarget(null)} />
    </div>
  );
}