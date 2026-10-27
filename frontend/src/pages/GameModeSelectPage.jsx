import { useEffect, useState } from 'react';
import { Check, Loader2, RotateCcw, Search, Shield, Trophy, X } from 'lucide-react';
import useAuthStore from '../store/useAuthStore.js';
import useCompetitionStore from '../store/useCompetitionStore.js';
import useNavStore from '../store/useNavStore.js';
import Panel from '../components/common/Panel.jsx';
import Notice from '../components/common/Notice.jsx';
import { StandingsTable } from '../components/domain/liveMatch/FullTimeReportModal.jsx';
import { MODE_META, MODE_ORDER, formatNumber } from '../constants/gameConfig.js';
import { WC_2026_NATIONAL_ROSTERS, WORLD_CUP_48_NATIONS } from '../constants/nationalSquads.js';

const CONFED_TABS = [
  { key: 'ALL', label: '전체 (48개국)' },
  { key: 'UEFA', label: '유럽 (16)' },
  { key: 'CONMEBOL', label: '남미 (6)' },
  { key: 'AFC', label: '아시아 (8)' },
  { key: 'CAF', label: '아프리카 (9)' },
  { key: 'CONCACAF', label: '북중미 (8)' },
  { key: 'OFC', label: '오세아니아 (1)' },
];

const CLUB_KEY_PLAYERS_MAP = {
  '맨체스터 블루': { formation: '4-2-3-1', style: '게겐프레싱 & 포제션', keyPlayers: ['엘링 홀란드 (ST · 92)', '케빈 더 브라위너 (CAM · 91)', '로드리 (CDM · 91)', '후벵 디아스 (CB · 89)'] },
  '노스 런던 레드': { formation: '4-3-3', style: '하이브리드 압박 & 세트피스', keyPlayers: ['부카요 사카 (RW · 88)', '마르틴 외데고르 (CAM · 89)', '데클란 라이스 (CDM · 88)', '윌리엄 살리바 (CB · 89)'] },
  '머지사이드 레드': { formation: '4-3-3', style: '헤비메탈 게겐프레싱', keyPlayers: ['모하메드 살라 (RW · 90)', '버질 판 데이크 (CB · 90)', '알렉시스 맥 알리스터 (CM · 86)', '트렌트 알렉산더아놀드 (RB · 87)'] },
  '노스이스트 런던': { formation: '4-2-3-1', style: '하이 라인 & 측면 속공', keyPlayers: ['손흥민 (LW · 90)', '제임스 매디슨 (CAM · 85)', '미키 판 더 펜 (CB · 84)', '크리스티안 로메로 (CB · 86)'] },
  '웨스트 런던 블루': { formation: '4-2-3-1', style: '측면 아이솔레이션 & 역습', keyPlayers: ['콜 파머 (CAM · 87)', '모이세스 카이세도 (CDM · 84)', '엔소 페르난데스 (CM · 84)', '리스 제임스 (RB · 83)'] },
  '맨체스터 레드': { formation: '4-2-3-1', style: '다이렉트 카운터 어택', keyPlayers: ['브루노 페르난데스 (CAM · 87)', '코비 마이누 (CM · 82)', '알레한드로 가르나초 (LW · 82)', '리산드로 마르티네스 (CB · 84)'] },
  '마드리드 화이트': { formation: '4-3-3', style: '초고속 카운터 & 크랙 돌파', keyPlayers: ['킬리안 음바페 (ST · 92)', '비니시우스 주니오르 (LW · 91)', '주드 벨링엄 (CAM · 90)', '페데리코 발베르데 (CM · 89)'] },
  '카탈루냐 블루레드': { formation: '4-3-3', style: '티키타카 & 하이 라인 압박', keyPlayers: ['라민 야말 (RW · 88)', '로베르트 레반도프스키 (ST · 88)', '페드리 (CM · 87)', '하피냐 (LW · 86)'] },
  '뮌헨 레드': { formation: '4-2-3-1', style: '전방위 압박 & 측면 폭격', keyPlayers: ['해리 케인 (ST · 91)', '자말 무시알라 (CAM · 89)', '김민재 (CB · 86)', '조슈아 키미히 (CDM · 87)'] },
  '파리 블루레드': { formation: '4-3-3', style: '점유율 & 측면 오버래핑', keyPlayers: ['이강인 (CAM · 85)', '우스만 뎀벨레 (RW · 86)', '아슈라프 하키미 (RB · 87)', '비티냐 (CM · 86)'] },
};

const DYNAMIC_FORMATIONS = ['4-3-3', '4-2-3-1', '4-4-2', '3-5-2', '3-4-3', '4-1-4-1', '5-3-2'];
const DYNAMIC_STYLES = [
  '하프스페이스 침투 & 포제션',
  '강력한 두 줄 수비 후 역습',
  '게겐프레싱 & 빠른 템포 전환',
  '측면 풀백 오버래핑 & 크로스',
  '중원 티키타카 빌드업',
];
const DYNAMIC_STAR_POOL_FW = ['빅토르 요케레스', '니코 윌리엄스', '흐비차 크바라츠헬리아', '도미닉 솔란케', '브라이언 음뵈모', '쿠보 다케후사', '아데몰라 루크먼', '두산 블라호비치'];
const DYNAMIC_STAR_POOL_MF = ['페드리', '가비', '산드로 토날리', '에베레치 에제', '모건 깁스화이트', '배준호', '이재성', '황인범'];
const DYNAMIC_STAR_POOL_DF = ['요슈코 그바르디올', '마크 게히', '재러드 브랜스웨이트', '이브라히마 코나테', '페드로 포로', '데스티니 우도기', '설영우', '다요 우파메카노'];
const DYNAMIC_STAR_POOL_GK = ['다비드 라야', '굴리엘모 비카리오', '조던 픽포드', '우나이 시몬', '얀 조머', '조현우'];

function getOpponentScoutInfo(teamObjOrName) {
  const name = typeof teamObjOrName === 'string' ? teamObjOrName : teamObjOrName?.name || '상대 구단';
  const code = typeof teamObjOrName === 'object' ? teamObjOrName?.code || teamObjOrName?.id : null;
  const strength = Math.round(teamObjOrName?.strength || teamObjOrName?.avgOvr || 82);

  const matchedRoster =
    (code && WC_2026_NATIONAL_ROSTERS[code]) ||
    Object.values(WC_2026_NATIONAL_ROSTERS).find((r) => name.includes(r.name) || r.name.includes(name));

  if (matchedRoster) {
    return {
      name: `${matchedRoster.name} 국가대표팀 (26인 공식 엔트리)`,
      formation: matchedRoster.formation,
      avgOvr: strength || matchedRoster.ovr,
      style: '2026 북중미 월드컵 본선 대표팀 전술',
      recentForm: ['W', 'W', 'D', 'W', 'W'],
      keyPlayers: matchedRoster.players.slice(0, 8).map((p) => `#${p.no} ${p.name} (${p.role} · OVR ${p.ovr})`),
    };
  }

  const exactKey = Object.keys(CLUB_KEY_PLAYERS_MAP).find((k) => name.includes(k) || k.includes(name));
  if (exactKey) {
    const info = CLUB_KEY_PLAYERS_MAP[exactKey];
    return {
      name,
      formation: info.formation,
      avgOvr: strength,
      style: info.style,
      recentForm: ['W', 'W', 'D', 'W', 'L'],
      keyPlayers: info.keyPlayers,
    };
  }

  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;

  const fw = DYNAMIC_STAR_POOL_FW[h % DYNAMIC_STAR_POOL_FW.length];
  const mf = DYNAMIC_STAR_POOL_MF[(h * 7) % DYNAMIC_STAR_POOL_MF.length];
  const df = DYNAMIC_STAR_POOL_DF[(h * 13) % DYNAMIC_STAR_POOL_DF.length];
  const gk = DYNAMIC_STAR_POOL_GK[(h * 19) % DYNAMIC_STAR_POOL_GK.length];
  const forms = [
    ['W', 'D', 'W', 'L', 'W'],
    ['W', 'W', 'L', 'D', 'W'],
    ['D', 'W', 'W', 'W', 'L'],
    ['L', 'W', 'D', 'W', 'D'],
  ];

  return {
    name,
    formation: DYNAMIC_FORMATIONS[h % DYNAMIC_FORMATIONS.length],
    avgOvr: strength,
    style: DYNAMIC_STYLES[h % DYNAMIC_STYLES.length],
    recentForm: forms[h % forms.length],
    keyPlayers: [
      `${fw} (FW · ${Math.min(93, strength + 2)})`,
      `${mf} (MF · ${Math.min(92, strength + 1)})`,
      `${df} (DF · ${strength})`,
      `${gk} (GK · ${Math.max(72, strength - 1)})`,
    ],
  };
}

function teamName(state, id, clubName) {
  if (state?.teams?.[id]?.name) return state.teams[id].name;
  if (id === 'USER') return clubName;
  return id || '미정';
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
          <p className="font-bold text-slate-300">
            전술 스타일: <span className="text-amber-300">{teamInfo.style}</span>
          </p>
          <p className="mt-2 font-bold text-slate-300">소속 핵심 선수 (Key Players):</p>
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

function Bracket({ state, clubName, onInspectTeam }) {
  const userIdKey = state.userTeamId || 'USER';
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
                const hasUser = m.a === userIdKey || m.b === userIdKey;
                const nameA = teamName(state, m.a, clubName);
                const nameB = teamName(state, m.b, clubName);
                return (
                  <li
                    key={i}
                    className={`rounded-lg border p-2 text-xs ${
                      hasUser ? 'border-blue-400/70 bg-blue-500/10' : 'border-slate-800 bg-slate-950/50'
                    }`}
                  >
                    <div
                      onClick={() => onInspectTeam(state?.teams?.[m.a] || nameA)}
                      className={`flex cursor-pointer justify-between hover:text-blue-300 ${
                        aWon ? 'font-black text-white' : 'text-slate-400'
                      }`}
                    >
                      <span className="truncate">{nameA}</span>
                      <span>{played ? m.ga : '-'}</span>
                    </div>
                    <div
                      onClick={() => onInspectTeam(state?.teams?.[m.b] || nameB)}
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
  const tierLevel = state.tierLevel || 1;
  const mult = Math.pow(1.35, tierLevel - 1);
  const winGold = Math.round(25000 * mult);
  const winCash = Math.round(350 * mult);
  const isBundes = state.leagueCode === 'BUNDES_1' || detail.standings?.length === 18 || detail.standings?.length <= 14;

  const standings = detail.standings || [];
  const remainingMatches = Math.max(0, (state.totalRounds || 38) - (state.round - 1));
  const isEarlyClinched =
    state.earlyTitleClinched ||
    (standings.length >= 2 && standings[0].pts - standings[1].pts > remainingMatches * 3);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Panel
        title={`${state.leagueTitle || `${state.division}부 리그`} · 시즌 ${state.season} (난이도 Lv.${tierLevel})`}
        className="lg:col-span-2"
        right={
          <span className="text-[11px] font-bold text-amber-300">
            🏆 우승 보상: {formatNumber(winGold)} G + {formatNumber(winCash)} 캐시
          </span>
        }
      >
        {isEarlyClinched && (
          <div className="mb-3 flex items-center justify-between rounded-xl border border-amber-400 bg-gradient-to-r from-amber-500/20 to-yellow-500/10 px-4 py-2.5 text-xs font-black text-amber-200">
            <span className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-400" />
              조기 우승 확정: 남은 {remainingMatches}경기 결과와 관계없이 {standings[0]?.name} 구단의 리그 우승이 확정되었습니다!
            </span>
            <span className="rounded bg-amber-400 px-2 py-0.5 text-[10px] text-slate-950">CHAMPION</span>
          </div>
        )}
        <p className="mb-2 text-[11px] text-slate-400">
          현재 {Math.min(state.round, state.totalRounds)}/{state.totalRounds} 라운드 ·{' '}
          <b className="text-sky-300">아래 구단을 클릭하면 해당 구단의 핵심 선수와 전술을 분석합니다.</b>
        </p>
        <StandingsTable rows={standings} isBundesliga={isBundes} division={state.division} />
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
          {standings
            .filter((r) => r.id !== 'USER')
            .map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onInspectTeam(state?.teams?.[r.id] || { name: r.name })}
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
  const [confedFilter, setConfedFilter] = useState('ALL');
  const state = detail.state;
  const tierLevel = state?.tierLevel || 1;
  const mult = Math.pow(1.35, tierLevel - 1);
  const groupEntries = Object.entries(detail.groupStandings || {});
  const userTeamId = state?.userTeamId || selectedNation?.code || 'KOR';
  const userGroup = state?.userGroup || groupEntries.find(([, rows]) => rows.some((r) => r.id === userTeamId))?.[0] || 'A';
  const canSwitchNation = state?.phase === 'GROUP' && (state?.matchday || 1) === 1 && !state?.nationLocked;

  const filteredNations = WORLD_CUP_48_NATIONS.filter((n) =>
    confedFilter === 'ALL' ? true : n.confed === confedFilter
  );

  return (
    <div className="space-y-4">
      <Panel
        title={`🌍 2026 북중미 월드컵 48개국 전체 국가대표팀 선택 (현재 플레이 국가: ${userGroup}조 · ${
          state?.teams?.[userTeamId]?.name || selectedNation.name
        })`}
        right={
          <span className="text-xs font-bold text-amber-300">
            🏆 우승 보상: {formatNumber(Math.round(50000 * mult))} G + {formatNumber(Math.round(500 * mult))} 캐시
          </span>
        }
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-400">
            {canSwitchNation
              ? '48개 본선 진출국 중 원하는 국가를 클릭하면 즉시 해당 국가와 편성된 조로 전환됩니다.'
              : '조별리그 경기가 이미 시작되어 플레이 국가가 확정되었습니다.'}
          </p>
          <div className="flex flex-wrap gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1">
            {CONFED_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setConfedFilter(tab.key)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                  confedFilter === tab.key ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
            {filteredNations.map((nat) => {
              const assignedGroup =
                groupEntries.find(([, rows]) => rows.some((r) => r.id === nat.code || r.name === nat.name))?.[0] || '-';
              const isSelected = userTeamId === nat.code;
              return (
                <button
                  key={nat.code}
                  type="button"
                  disabled={!canSwitchNation && !isSelected}
                  onClick={() => onSelectNation(nat)}
                  className={`rounded-xl border p-2.5 text-left transition disabled:opacity-45 ${
                    isSelected
                      ? 'border-amber-400 bg-amber-500/20 text-white ring-1 ring-amber-400'
                      : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-blue-400/60 hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate text-xs font-black">
                      {nat.emblem} {nat.name}
                    </span>
                    <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-black text-blue-300">
                      {assignedGroup}조
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                    <span>OVR {nat.ovr}</span>
                    <span className="truncate text-emerald-300">{nat.stars[0].split(' ')[0]}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </Panel>

      {groupEntries.length > 0 && (
        <Panel title="2026 월드컵 48개국 조별리그 순위표 (A조 ~ L조 · 아래 표에서 국가를 클릭해 선택하거나 전력을 확인할 수 있습니다)">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {groupEntries.map(([group, rows]) => {
              const isMyGroup = group === userGroup;
              return (
                <div
                  key={group}
                  className={
                    isMyGroup
                      ? 'rounded-xl border-2 border-amber-400/80 bg-amber-950/15 p-2.5'
                      : 'rounded-xl border border-slate-800 bg-slate-950/40 p-2.5'
                  }
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <h4 className="text-xs font-black text-white">
                      {group}조 {isMyGroup && <span className="ml-1 text-amber-300">★ 내 대표팀 소속 조</span>}
                    </h4>
                    <span className="text-[10px] text-slate-400">
                      {rows.map((r) => state?.teams?.[r.id]?.confed).filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <StandingsTable
                    rows={rows.map((r) => ({
                      ...r,
                      id: r.id === userTeamId ? 'USER' : r.id,
                      name: r.name,
                    }))}
                    limit={4}
                    division={2}
                  />
                  <div className="mt-2 flex flex-wrap gap-1 border-t border-slate-800/80 pt-2">
                    {rows.map((r) => {
                      const natMeta = WORLD_CUP_48_NATIONS.find((n) => n.code === r.id || n.name === r.name);
                      const isMe = r.id === userTeamId;
                      return (
                        <div key={r.id} className="flex items-center gap-1">
                          {canSwitchNation && natMeta && !isMe && (
                            <button
                              type="button"
                              onClick={() => onSelectNation(natMeta)}
                              className="inline-flex items-center gap-0.5 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-200 hover:bg-amber-500/40"
                            >
                              <Check className="h-2.5 w-2.5" /> {r.name} 선택
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onInspectTeam(state?.teams?.[r.id] || { code: r.id, name: r.name })}
                            className="inline-flex items-center gap-0.5 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300 hover:text-white"
                          >
                            🔍 {r.name} 명단
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {state?.phase === 'KNOCKOUT' && (
        <Panel title="32강 결선 토너먼트 대진표 (동일 조 출신 32강 맞대결 방지 적용)">
          <Bracket state={state} clubName={clubName} onInspectTeam={onInspectTeam} />
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
          {next ? `다음 티어 ${next.label}까지 ${next.minRp - state.rp} RP` : '최고 티어입니다'}
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
  const selectedNation = useCompetitionStore((s) => s.selectedWorldCupNation) || WORLD_CUP_48_NATIONS[0];
  const setSelectedNation = useCompetitionStore((s) => s.setSelectedWorldCupNation);
  const loadList = useCompetitionStore((s) => s.loadList);
  const loadDetail = useCompetitionStore((s) => s.loadDetail);
  const startMode = useCompetitionStore((s) => s.startMode);
  const prepareNextMatch = useCompetitionStore((s) => s.prepareNextMatch);

  const [mode, setMode] = useState(params.mode || 'LEAGUE');
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [scoutTarget, setScoutTarget] = useState(null);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    loadDetail(mode);
  }, [mode, loadDetail]);

  const detail = details[mode];
  const meta = MODE_META[mode];
  const rowInList = list.find((c) => c.mode === mode);
  const status = detail?.status || rowInList?.status || 'NONE';
  const isPersistent = mode === 'CHALLENGE_TOWER' || mode === 'RANKED';

  const handleSelectWorldCupNation = async (nat) => {
    if (typeof setSelectedNation === 'function') setSelectedNation(nat);
    setBusy(true);
    if (status === 'ACTIVE' && detail?.state?.phase === 'GROUP' && (detail?.state?.matchday || 1) === 1) {
      await startMode('WORLD_CUP', false, nat.code);
      await loadDetail('WORLD_CUP');
    }
    setBusy(false);
    setNotice({
      type: 'success',
      text: `🌍 플레이 국가를 [${nat.name} 국가대표팀]으로 변경했습니다. 해당 국가의 실제 26인 로스터와 조 편성으로 진행합니다.`,
    });
  };

  const goToPreMatch = async (stageId = null) => {
    const result = await prepareNextMatch(mode, stageId, mode === 'WORLD_CUP' ? selectedNation.code : null);
    if (!result.ok) {
      setNotice({ type: 'error', text: result.message });
      return;
    }
    go('prematch', { mode, nation: mode === 'WORLD_CUP' ? selectedNation : null });
  };

  const handleForfeitAndGoDashboard = async () => {
    setBusy(true);
    setNotice(null);
    await startMode(mode, true, mode === 'WORLD_CUP' ? selectedNation.code : null);
    setBusy(false);
    go('lobby');
  };

  const handleStart = async () => {
    setBusy(true);
    setNotice(null);
    if (status === 'NONE' || status === 'FINISHED') {
      const result = await startMode(mode, true, mode === 'WORLD_CUP' ? selectedNation.code : null);
      if (!result.ok) {
        setNotice({ type: 'error', text: result.message });
        setBusy(false);
        return;
      }
      await loadDetail(mode);
      if (mode === 'WORLD_CUP') {
        setNotice({
          type: 'success',
          text: '🎲 48개국 조 편성이 완료되었습니다. 48개국 중 플레이할 국가를 선택한 뒤 [이어하기 (다음 경기 입장)]을 눌러주세요.',
        });
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
        : '이어하기 (다음 경기 입장)'
      : status === 'FINISHED'
      ? mode === 'LEAGUE'
        ? '다음 시즌 시작 (난이도·보상 UP)'
        : mode === 'WORLD_CUP'
        ? '🎲 새 월드컵 48개국 조 추첨'
        : '새 대회 도전 (난이도·보상 UP)'
      : mode === 'CHALLENGE_TOWER'
      ? '챌린지 시작'
      : mode === 'RANKED'
      ? '랭크 시작'
      : mode === 'WORLD_CUP'
      ? '🎲 1단계: 48개국 조 추첨 실행'
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
          <div className="flex flex-wrap gap-2">
            {!isPersistent && (
              <button
                type="button"
                disabled={busy}
                onClick={handleForfeitAndGoDashboard}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-500/60 bg-rose-950/40 px-3 py-1.5 text-xs font-bold text-rose-200 hover:bg-rose-900/60"
              >
                <RotateCcw className="h-3.5 w-3.5" /> 포기하고 대시보드로
              </button>
            )}
            {mode !== 'CHALLENGE_TOWER' || status === 'NONE' ? (
              <button
                type="button"
                disabled={busy}
                onClick={handleStart}
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
        <p className="mt-1 text-xs font-semibold text-slate-300">{detail?.summary || rowInList?.summary || '아직 시작하지 않았습니다.'}</p>
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
              title={`챔피언스 컵 토너먼트 대진표 (난이도 Lv.${detail.state.tierLevel || 1} · 팀 클릭 시 전력 분석)`}
              right={
                <span className="text-xs font-bold text-amber-300">
                  🏆 우승 보상: {formatNumber(Math.round(35000 * Math.pow(1.35, (detail.state.tierLevel || 1) - 1)))} G +{' '}
                  {formatNumber(Math.round(400 * Math.pow(1.35, (detail.state.tierLevel || 1) - 1)))} 캐시
                </span>
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
              onSelectNation={handleSelectWorldCupNation}
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