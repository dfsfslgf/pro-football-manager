import { useEffect, useState } from 'react';
import { Loader2, Search, Shield, Trophy, X } from 'lucide-react';
import useAuthStore from '../store/useAuthStore.js';
import useCompetitionStore from '../store/useCompetitionStore.js';
import useNavStore from '../store/useNavStore.js';
import Panel from '../components/common/Panel.jsx';
import Notice from '../components/common/Notice.jsx';
import { StandingsTable } from '../components/domain/liveMatch/FullTimeReportModal.jsx';
import { MODE_META, MODE_ORDER, formatNumber } from '../constants/gameConfig.js';

const WORLD_CUP_NATIONS = [
  { code: 'KOR', name: '🇰🇷 대한민국', emblem: '🐯', ovr: 84, stars: ['손흥민 (LW · 91)', '김민재 (CB · 88)', '이강인 (CAM · 86)', '황희찬 (ST · 83)', '조현우 (GK · 85)'] },
  { code: 'ARG', name: '🇦🇷 아르헨티나', emblem: '☀️', ovr: 91, stars: ['리오넬 메시 (RW · 92)', '라우타로 마르티네스 (ST · 89)', '엔소 페르난데스 (CM · 86)', '에밀리아노 마르티네스 (GK · 89)'] },
  { code: 'FRA', name: '🇫🇷 프랑스', emblem: '🐓', ovr: 92, stars: ['킬리안 음바페 (ST · 92)', '앙투안 그리에즈만 (CAM · 88)', '윌리엄 살리바 (CB · 89)', '마이크 메냥 (GK · 87)'] },
  { code: 'ENG', name: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 잉글랜드', emblem: '🦁', ovr: 91, stars: ['해리 케인 (ST · 91)', '주드 벨링엄 (CAM · 90)', '부카요 사카 (RW · 88)', '데클란 라이스 (CDM · 88)'] },
  { code: 'BRA', name: '🇧🇷 브라질', emblem: '⭐', ovr: 90, stars: ['비니시우스 주니오르 (LW · 91)', '호드리구 (RW · 87)', '마르키뉴스 (CB · 87)', '알리송 베케르 (GK · 89)'] },
  { code: 'ESP', name: '🇪🇸 스페인', emblem: '👑', ovr: 91, stars: ['로드리 (CDM · 91)', '라민 야말 (RW · 88)', '페드리 (CM · 88)', '니코 윌리엄스 (LW · 86)'] },
  { code: 'GER', name: '🇩🇪 독일', emblem: '🦅', ovr: 89, stars: ['자말 무시알라 (CAM · 89)', '플로리안 비르츠 (CAM · 89)', '안토니오 뤼디거 (CB · 88)', '마누엘 노이어 (GK · 86)'] },
  { code: 'POR', name: '🇵🇹 포르투갈', emblem: '🛡️', ovr: 89, stars: ['크리스티아누 호날두 (ST · 87)', '브루노 페르난데스 (CAM · 88)', '베르나르두 실바 (CM · 88)', '후벵 디아스 (CB · 89)'] },
  { code: 'JPN', name: '🇯🇵 일본', emblem: '🌊', ovr: 83, stars: ['쿠보 다케후사 (RW · 84)', '미토마 가오루 (LW · 83)', '엔도 와타루 (CDM · 82)', '도미야스 다케히로 (CB · 82)'] },
  { code: 'USA', name: '🇺🇸 미국', emblem: '🦅', ovr: 81, stars: ['크리스티안 풀리식 (LW · 83)', '웨스턴 맥케니 (CM · 80)', '안토니 로빈슨 (LB · 81)'] },
];

const CLUB_KEY_PLAYERS_MAP = {
  '맨체스터 블루': { formation: '4-2-3-1', style: '게겐프레싱 & 포제션', keyPlayers: ['엘링 홀란드 (ST · 92)', '케빈 더 브라위너 (CAM · 91)', '로드리 (CDM · 91)', '후벵 디아스 (CB · 89)'] },
  '노스 런던 레드': { formation: '4-3-3', style: '아르테타식 하이브리드 압박', keyPlayers: ['부카요 사카 (RW · 88)', '마르틴 외데고르 (CAM · 89)', '데클란 라이스 (CDM · 88)', '윌리엄 살리바 (CB · 89)'] },
  '머지사이드 레드': { formation: '4-3-3', style: '헤비메탈 게겐프레싱', keyPlayers: ['모하메드 살라 (RW · 90)', '버질 판 데이크 (CB · 90)', '알렉시스 맥 알리스터 (CM · 86)', '트렌트 알렉산더아놀드 (RB · 87)'] },
  '노스이스트 런던': { formation: '4-2-3-1', style: '하이 라인 & 측면 속공', keyPlayers: ['손흥민 (LW · 90)', '제임스 매디슨 (CAM · 85)', '미키 판 더 펜 (CB · 84)', '크리스티안 로메로 (CB · 86)'] },
  '웨스트 런던 블루': { formation: '4-2-3-1', style: '측면 아이솔레이션 & 역습', keyPlayers: ['콜 파머 (CAM · 87)', '모이세스 카이세도 (CDM · 84)', '엔소 페르난데스 (CM · 84)', '리스 제임스 (RB · 83)'] },
  '맨체스터 레드': { formation: '4-2-3-1', style: '다이렉트 카운터 어택', keyPlayers: ['브루노 페르난데스 (CAM · 87)', '코비 마이누 (CM · 82)', '알레한드로 가르나초 (LW · 82)', '리산드로 마르티네스 (CB · 84)'] },
  '타인사이드 블랙화이트': { formation: '4-3-3', style: '강한 중원 피지컬 압박', keyPlayers: ['알렉산데르 이삭 (ST · 87)', '브루노 기마랑이스 (CM · 86)', '앤서니 고든 (LW · 84)', '스벤 보트만 (CB · 83)'] },
  '버밍엄 클라렛': { formation: '4-4-2', style: '오프사이드 트랩 & 공간 침투', keyPlayers: ['올리 왓킨스 (ST · 85)', '유리 틸레만스 (CM · 83)', '모건 로저스 (CAM · 81)', '에밀리아노 마르티네스 (GK · 88)'] },
  '서식스 시걸스': { formation: '4-2-3-1', style: '후방 빌드업 & 드리블 돌파', keyPlayers: ['미토마 가오루 (LW · 83)', '주앙 페드로 (ST · 81)', '카를로스 발레바 (CDM · 80)', '루이스 덩크 (CB · 81)'] },
  '미들랜즈 골드울브스': { formation: '3-4-3', style: '스리백 역습 & 측면 돌파', keyPlayers: ['황희찬 (ST · 81)', '마테우스 쿠냐 (CF · 82)', '주앙 고메스 (CM · 80)', '라얀 아이트누리 (LWB · 80)'] },
  '마드리드 화이트': { formation: '4-3-3', style: '초고속 카운터 & 크랙 돌파', keyPlayers: ['킬리안 음바페 (ST · 92)', '비니시우스 주니오르 (LW · 91)', '주드 벨링엄 (CAM · 90)', '페데리코 발베르데 (CM · 89)'] },
  '카탈루냐 블루레드': { formation: '4-3-3', style: '티키타카 & 하이 라인 압박', keyPlayers: ['라민 야말 (RW · 88)', '로베르트 레반도프스키 (ST · 88)', '페드리 (CM · 87)', '하피냐 (LW · 86)'] },
  '마드리드 로히블랑코': { formation: '5-3-2', style: '시메오네식 질식 수비 & 역습', keyPlayers: ['앙투안 그리에즈만 (ST · 88)', '훌리안 알바레스 (ST · 86)', '코케 (CM · 83)', '얀 오블라크 (GK · 88)'] },
  '뮌헨 레드': { formation: '4-2-3-1', style: '전방위 압박 & 측면 폭격', keyPlayers: ['해리 케인 (ST · 91)', '자말 무시알라 (CAM · 89)', '김민재 (CB · 86)', '조슈아 키미히 (CDM · 87)'] },
  '라인 레드블랙': { formation: '3-4-3', style: '무패 사비 알론소식 윙백 전술', keyPlayers: ['플로리안 비르츠 (CAM · 89)', '그라니트 자카 (CM · 86)', '알레한드로 그리말도 (LWB · 86)', '제레미 프림퐁 (RWB · 85)'] },
  '베스트팔렌 옐로우': { formation: '4-2-3-1', style: '빠른 공수 전환 & 게겐프레싱', keyPlayers: ['세루 기라시 (ST · 85)', '율리안 브란트 (CAM · 84)', '카림 아데예미 (LW · 82)', '그레고르 코벨 (GK · 87)'] },
  '롬바르디아 블루블랙': { formation: '3-5-2', style: '인자기식 스위칭 스리백', keyPlayers: ['라우타로 마르티네스 (ST · 89)', '니콜로 바렐라 (CM · 87)', '하칸 찰하노글루 (CDM · 86)', '알레산드로 바스토니 (CB · 87)'] },
  '밀라노 레드블랙': { formation: '4-2-3-1', style: '좌측면 초고속 오버래핑', keyPlayers: ['하파엘 레앙 (LW · 87)', '크리스티안 풀리식 (RW · 84)', '테오 에르난데스 (LB · 87)', '마이크 메냥 (GK · 87)'] },
  '파리 블루레드': { formation: '4-3-3', style: '루이스 엔리케식 포제션', keyPlayers: ['이강인 (CAM · 85)', '우스만 뎀벨레 (RW · 86)', '아슈라프 하키미 (RB · 87)', '비티냐 (CM · 86)'] },
  '울산 블루타이거즈': { formation: '4-2-3-1', style: 'K리그 챔피언 밸런스 빌드업', keyPlayers: ['조현우 (GK · 83)', '주민규 (ST · 79)', '김영권 (CB · 78)', '이청용 (RM · 78)'] },
  '서울 블랙레드': { formation: '4-4-2', style: '측면 크로스 & 2선 침투', keyPlayers: ['제시 린가드 (CAM · 79)', '일류첸코 (ST · 78)', '기성용 (CM · 77)', '김주성 (CB · 76)'] },
  '마이애미 핑크헤론즈': { formation: '4-3-3', style: '메시·수아레스 플레이메이킹', keyPlayers: ['리오넬 메시 (RW · 90)', '루이스 수아레스 (ST · 83)', '세르히오 부스케츠 (CDM · 82)', '조르디 알바 (LB · 81)'] },
};

const DYNAMIC_FORMATIONS = ['4-3-3', '4-2-3-1', '4-4-2', '3-5-2', '3-4-3', '4-1-4-1', '5-3-2'];
const DYNAMIC_STYLES = [
  '하프스페이스 침투 & 포제션',
  '강력한 두 줄 수비 후 역습',
  '게겐프레싱 & 빠른 템포 전환',
  '측면 풀백 오버래핑 & 크로스',
  '중원 티키타카 빌드업',
];
const DYNAMIC_STAR_POOL_FW = ['빅토르 요케레스', '니코 윌리엄스', '흐비차 크바라츠헬리아', '이반 토니', '도미닉 솔란케', '브라이언 음뵈모', '쿠보 다케후사', '아데몰라 루크먼', '두산 블라호비치', '엄지성'];
const DYNAMIC_STAR_POOL_MF = ['페드리', '가비', '산드로 토날리', '제임스 워드프라우즈', '에베레치 에제', '모건 깁스화이트', '배준호', '이재성', '황인범', '세징야'];
const DYNAMIC_STAR_POOL_DF = ['요슈코 그바르디올', '마크 게히', '재러드 브랜스웨이트', '이브라히마 코나테', '페드로 포로', '데스티니 우도기', '설영우', '이한범', '뱅자맹 파바르', '다요 우파메카노'];
const DYNAMIC_STAR_POOL_GK = ['다비드 라야', '굴리엘모 비카리오', '조던 픽포드', '우나이 시몬', '얀 조머', '김승규', '이창근'];

function getOpponentScoutInfo(teamObjOrName) {
  const name = typeof teamObjOrName === 'string' ? teamObjOrName : teamObjOrName?.name || '상대 구단';
  const strength = Math.round(teamObjOrName?.strength || teamObjOrName?.avgOvr || 80);

  // 정확히 매칭되는 구단 사전 확인
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
                      onClick={() => m.a !== 'USER' && onInspectTeam(state?.teams?.[m.a] || nameA)}
                      className={`flex cursor-pointer justify-between hover:text-blue-300 ${
                        aWon ? 'font-black text-white' : 'text-slate-400'
                      }`}
                    >
                      <span className="truncate">{nameA}</span>
                      <span>{played ? m.ga : '-'}</span>
                    </div>
                    <div
                      onClick={() => m.b !== 'USER' && onInspectTeam(state?.teams?.[m.b] || nameB)}
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
  const winGold = Math.round(20000 * mult);
  const winCash = Math.round(350 * mult);
  const isBundes = state.leagueCode === 'BUNDES_1' || detail.standings?.length === 18 || detail.standings?.length <= 14;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Panel
        title={`${state.leagueTitle || `${state.division}부 리그`} · 시즌 ${state.season} (난이도 Lv.${tierLevel})`}
        className="lg:col-span-2"
        right={
          <span className="text-[11px] font-bold text-amber-300">
            🏆 우승 보상: {formatNumber(winGold)} G + {formatNumber(winCash)} 캐시 (우승 시 다음 시즌 보상 +35% 상승!)
          </span>
        }
      >
        <p className="mb-2 text-[11px] text-slate-400">
          현재 {Math.min(state.round, state.totalRounds)}/{state.totalRounds} 라운드 ·{' '}
          <b className="text-sky-300">아래 구단을 클릭하면 해당 구단의 실제 핵심 선수와 전술을 분석합니다.</b>
        </p>
        <StandingsTable rows={detail.standings} isBundesliga={isBundes} division={state.division} />
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
          {detail.standings
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
  const state = detail.state;
  const tierLevel = state.tierLevel || 1;
  const mult = Math.pow(1.35, tierLevel - 1);
  return (
    <div className="space-y-4">
      <Panel
        title={`🌍 내셔널 월드컵 참가 국가대표팀 선택 (난이도 Lv.${tierLevel})`}
        right={
          <span className="text-xs font-bold text-amber-300">
            🏆 월드컵 우승 보상: {formatNumber(Math.round(35000 * mult))} G + {formatNumber(Math.round(500 * mult))} 캐시
          </span>
        }
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
                division={2}
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
  const selectedNation = useCompetitionStore((s) => s.selectedWorldCupNation) || WORLD_CUP_NATIONS[0];
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
        ? '다음 시즌 시작 (난이도·보상 UP)'
        : '새 대회 도전 (난이도·보상 UP)'
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
              title={`챔피언스 컵 토너먼트 대진표 (난이도 Lv.${detail.state.tierLevel || 1} · 팀 클릭 시 전력 분석)`}
              right={
                <span className="text-xs font-bold text-amber-300">
                  🏆 우승 보상: {formatNumber(Math.round(25000 * Math.pow(1.35, (detail.state.tierLevel || 1) - 1)))} G +{' '}
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
              onSelectNation={(nat) => {
                if (typeof setSelectedNation === 'function') setSelectedNation(nat);
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