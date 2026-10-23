/**
 * [요구사항 21 & 23 완벽 해결]
 * 9대 글로벌 축구 리그(EPL 20팀, 챔피언십 24팀, 분데스리가 18팀, 라리가 20팀, 세리에A 20팀,
 * 리그1 18팀, K리그1 12팀, K리그2 14팀, MLS 20팀) 전체 구단의 실제 선수 데이터와 프로필 사진을 크롤링하고,
 * JSON 파일 저장 및 MySQL DB(player_master) 자동 시드(Upsert)를 수행하는 마스터 크롤러입니다.
 *
 * 실행 방법:
 *   1) JSON 파일만 생성: node src/scripts/crawlRealPlayers.js
 *   2) JSON 생성 + DB(player_master) 즉시 반영: node src/scripts/crawlRealPlayers.js --db
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import pool from '../config/database.js';

const FULL_LEAGUE_CLUB_TARGETS = [
  // 1. 잉글랜드 프리미어리그 (20개 구단 전원)
  { league: 'EPL_1', ovrBase: 82, clubs: [
    ['Manchester City', '맨체스터 블루'], ['Arsenal', '노스 런던 레드'], ['Liverpool', '머지사이드 레드'],
    ['Tottenham', '노스이스트 런던'], ['Chelsea', '웨스트 런던 블루'], ['Manchester United', '맨체스터 레드'],
    ['Newcastle United', '타인사이드 블랙화이트'], ['Aston Villa', '버밍엄 클라렛'], ['Brighton', '서식스 시걸스'],
    ['West Ham', '이스트 런던 해머스'], ['Crystal Palace', '사우스 런던 이글스'], ['Fulham', '템스 화이트'],
    ['Wolverhampton Wanderers', '미들랜즈 골드울브스'], ['Brentford', '웨스트 런던 비즈'], ['Bournemouth', '도싯 체리레드'],
    ['Everton', '머지사이드 블루'], ['Nottingham Forest', '노팅엄 포레스트 레드'], ['Leicester', '레스터 폭스 블루'],
    ['Ipswich', '서퍽 트랙터 블루'], ['Southampton', '사우스코스트 세인츠'],
  ]},
  // 2. 잉글랜드 챔피언십 2부 (24개 구단 전원)
  { league: 'EFL_2', ovrBase: 74, clubs: [
    ['Leeds', '리즈 요크셔 화이트'], ['Burnley', '랭커셔 클라렛'], ['Sheffield United', '셰필드 블레이즈'],
    ['Luton', '베드퍼드셔 해터스'], ['Middlesbrough', '티사이드 레드'], ['Norwich', '노퍽 카나리아'],
    ['West Brom', '웨스트브롬 스로슬스'], ['Sunderland', '웨어사이드 블랙캣츠'], ['Coventry', '코번트리 스카이블루'],
    ['Stoke', '스토크 포터스 레드'], ['Swansea', '스완지 스완즈 화이트'], ['Queens Park Rangers', '런던 호프스 블루'],
    ['Watford', '하트퍼드셔 호넷츠'], ['Hull', '험버사이드 타이거즈'], ['Blackburn', '랭커셔 로버스'],
    ['Bristol City', '브리스톨 로빈스'], ['Preston', '프레스턴 릴리화이트'], ['Cardiff', '사우스웨일스 블루버즈'],
    ['Millwall', '사우스런던 라이온스'], ['Sheffield Wednesday', '셰필드 아울스'], ['Plymouth', '데본 필그림스 그린'],
    ['Derby', '더비 램스 화이트'], ['Portsmouth', '포츠머스 폼피 블루'], ['Oxford United', '옥스퍼드 옐로우즈'],
  ]},
  // 3. 독일 분데스리가 (18개 구단 전원)
  { league: 'BUNDES_1', ovrBase: 80, clubs: [
    ['Bayern Munich', '뮌헨 레드'], ['Bayer Leverkusen', '라인 레드블랙'], ['Borussia Dortmund', '베스트팔렌 옐로우'],
    ['RB Leipzig', '작센 레드불스'], ['Stuttgart', '슈투트가르트 화이트레드'], ['Eintracht Frankfurt', '프랑크푸르트 이글스'],
    ['Hoffenheim', '크라이히가우 블루'], ['Freiburg', '브라이스가우 그리핀'], ['Heidenheim', '하이덴하임 레드블루'],
    ['Werder Bremen', '베저 그린화이트'], ['Augsburg', '아우크스부르크 트리컬러'], ['Wolfsburg', '니더작센 그린울브스'],
    ['Mainz', '마인츠 카니발 레드'], ['Borussia Monchengladbach', '보루시아 포얼스'], ['Union Berlin', '쾨페니크 아이언레드'],
    ['Bochum', '보훔 블루화이트'], ['St. Pauli', '함부르크 해적 브라운'], ['Holstein Kiel', '홀슈타인 스톡스 블루'],
  ]},
  // 4. 스페인 라리가 (20개 구단 전원)
  { league: 'LALIGA_1', ovrBase: 81, clubs: [
    ['Real Madrid', '마드리드 화이트'], ['Barcelona', '카탈루냐 블루레드'], ['Atletico Madrid', '마드리드 로히블랑코'],
    ['Girona', '히로나 레드화이트'], ['Athletic Bilbao', '바스크 라이온스'], ['Real Sociedad', '산세바스티안 블루화이트'],
    ['Real Betis', '안달루시아 그린화이트'], ['Villarreal', '발렌시아 옐로우서브마린'], ['Valencia', '발렌시아 배츠 화이트'],
    ['Sevilla', '세비야 레드화이트'], ['Osasuna', '팜플로나 레드'], ['Getafe', '마드리드 사우스 블루'],
    ['Celta Vigo', '갈리시아 스카이블루'], ['Mallorca', '발레아레스 아일랜드 레드'], ['Alaves', '비토리아 블루화이트'],
    ['Las Palmas', '카나리아 옐로우블루'], ['Rayo Vallecano', '바예카스 라이트닝'], ['Leganes', '레가네스 오이블루'],
    ['Valladolid', '카스티야 바이올렛'], ['Espanyol', '바르셀로나 블루화이트'],
  ]},
  // 5. 이탈리아 세리에 A (20개 구단 전원)
  { league: 'SERIE_A', ovrBase: 80, clubs: [
    ['Inter', '롬바르디아 블루블랙'], ['AC Milan', '밀라노 레드블랙'], ['Juventus', '피에몬테 블랙화이트'],
    ['Napoli', '나폴리 아주리'], ['Atalanta', '베르가모 블루블랙'], ['Roma', '로마 잘로로시'],
    ['Lazio', '라치오 스카이이글스'], ['Fiorentina', '피렌체 비올라'], ['Bologna', '볼로냐 레드블루'],
    ['Torino', '토리노 마룬불스'], ['Genoa', '제노바 그리폰'], ['Monza', '몬차 레드스피드'],
    ['Verona', '베로나 옐로우블루'], ['Lecce', '살렌토 울브스'], ['Udinese', '프리울리 제브레테'],
    ['Cagliari', '사르데냐 아일랜더스'], ['Empoli', '엠폴리 블루즈'], ['Parma', '파르마 크루세이더스'],
    ['Como', '코모 레이크블루'], ['Venezia', '베네치아 윙드라이온'],
  ]},
  // 6. 프랑스 리그 1 (18개 구단 전원)
  { league: 'LIGUE_1', ovrBase: 79, clubs: [
    ['Paris SG', '파리 블루레드'], ['Monaco', '모나코 레드화이트'], ['Marseille', '마르세유 올림피크 블루'],
    ['Lille', '릴 마스티프 레드'], ['Lyon', '리옹 라이온스'], ['Nice', '니스 이글스 레드블랙'],
    ['Lens', '랑스 골드블러드'], ['Rennes', '렌 브르타뉴 레드'], ['Brest', '브레스트 파이러츠'],
    ['Reims', '랭스 샴페인 레드'], ['Toulouse', '툴루즈 바이올렛'], ['Strasbourg', '스트라스부르 블루'],
    ['Montpellier', '몽펠리에 오렌지블루'], ['Nantes', '낭트 카나리아 그린옐로'], ['Le Havre', '르아브르 스카이네이비'],
    ['Auxerre', '오세르 화이트블루'], ['Angers', '앙제 스쿱 블랙화이트'], ['Saint-Etienne', '생테티엔 그린스타즈'],
  ]},
  // 7. 대한민국 K리그 1 (12개 구단 전원)
  { league: 'KLEAGUE_1', ovrBase: 76, clubs: [
    ['Ulsan HD', '울산 블루타이거즈'], ['Gimcheon Sangmu', '김천 피닉스 레드'], ['Gangwon FC', '강원 오렌지베어스'],
    ['Pohang Steelers', '포항 스틸레드'], ['FC Seoul', '서울 블랙레드'], ['Suwon FC', '수원 캐슬블루레드'],
    ['Jeju United', '제주 아일랜드 오렌지'], ['Daejeon Hana Citizen', '대전 퍼플시티즌'], ['Gwangju FC', '광주 그리핀 옐로우'],
    ['Jeonbuk Hyundai Motors', '전북 그린워리어스'], ['Daegu FC', '대구 스카이솔라'], ['FC Anyang', '안양 바이올렛'],
  ]},
  // 8. 대한민국 K리그 2 (14개 구단 전원)
  { league: 'KLEAGUE_2', ovrBase: 72, clubs: [
    ['Incheon United', '인천 블루블랙 마린'], ['Suwon Samsung Bluewings', '수원 블루윙즈'], ['Busan IPark', '부산 로열실드'],
    ['Seoul E-Land', '서울 레오파즈 네이비'], ['Jeonnam Dragons', '전남 옐로우드래곤즈'], ['Bucheon FC 1995', '부천 헤르메스 레드'],
    ['Gimpo FC', '김포 골든윙즈'], ['Chungnam Asan', '충남 아산 아울스'], ['Seongnam FC', '성남 블랙까치'],
    ['Gyeongnam FC', '경남 로즈레드'], ['Chungbuk Cheongju', '충북 청주 라이온스'], ['Ansan Greeners', '안산 그린울브스'],
    ['Cheonan City', '천안 스카이블루'], ['Hwaseong FC', '화성 오렌지포트리스'],
  ]},
  // 9. 북미 MLS (20개 구단 전원)
  { league: 'MLS_1', ovrBase: 76, clubs: [
    ['Inter Miami', '마이애미 핑크헤론즈'], ['Los Angeles FC', '로스앤젤레스 골드블랙'], ['LA Galaxy', 'LA 갤럭시 스타즈'],
    ['Columbus Crew', '콜럼버스 골드크루'], ['FC Cincinnati', '신시내티 오렌지라이온'], ['Seattle Sounders', '시애틀 에메랄드 사운더스'],
    ['New York City', '뉴욕 시티 스카이블루'], ['New York Red Bulls', '뉴욕 메트로 레드불스'], ['Orlando City', '올랜도 퍼플라이온스'],
    ['Houston Dynamo', '휴스턴 오렌지다이나모'], ['Atlanta United', '애틀랜타 파이브스트라이프'], ['Charlotte FC', '샬럿 크라운 블루'],
    ['Vancouver Whitecaps', '밴쿠버 화이트캡스'], ['Portland Timbers', '포틀랜드 팀버스 그린'], ['Real Salt Lake', '솔트레이크 로열클라렛'],
    ['Minnesota United', '미네소타 노스룬즈'], ['Colorado Rapids', '콜로라도 버건디래피즈'], ['FC Dallas', '댈러스 텍사스 불스'],
    ['St. Louis City', '세인트루이스 아치 레드'], ['Toronto FC', '토론토 메이플 레즈'],
  ]},
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mapPositionGroup(posStr = '') {
  const s = String(posStr).toUpperCase();
  if (s.includes('GOALKEEPER') || s === 'GK') return { mainPosition: 'GK', roleCode: 'GK' };
  if (s.includes('BACK') || s.includes('DEFEN')) {
    if (s.includes('LEFT')) return { mainPosition: 'DF', roleCode: 'LB' };
    if (s.includes('RIGHT')) return { mainPosition: 'DF', roleCode: 'RB' };
    return { mainPosition: 'DF', roleCode: 'CB' };
  }
  if (s.includes('MIDFIELD')) {
    if (s.includes('ATTACK')) return { mainPosition: 'MF', roleCode: 'CAM' };
    if (s.includes('DEFEN')) return { mainPosition: 'MF', roleCode: 'CDM' };
    if (s.includes('LEFT')) return { mainPosition: 'MF', roleCode: 'LM' };
    if (s.includes('RIGHT')) return { mainPosition: 'MF', roleCode: 'RM' };
    return { mainPosition: 'MF', roleCode: 'CM' };
  }
  if (s.includes('LEFT WING') || s === 'LW') return { mainPosition: 'FW', roleCode: 'LW' };
  if (s.includes('RIGHT WING') || s === 'RW') return { mainPosition: 'FW', roleCode: 'RW' };
  return { mainPosition: 'FW', roleCode: 'ST' };
}

function generateStatsByPosition(mainPos, ovrBase) {
  const rand = (offset = 0) => Math.max(55, Math.min(96, ovrBase + offset + Math.floor(Math.random() * 12) - 4));
  return {
    speed: rand(mainPos === 'FW' ? 4 : 0),
    shooting: rand(mainPos === 'FW' ? 6 : mainPos === 'MF' ? 1 : -10),
    passing: rand(mainPos === 'MF' ? 6 : 0),
    dribbling: rand(mainPos !== 'GK' ? 3 : -18),
    defense: rand(mainPos === 'DF' ? 7 : mainPos === 'MF' ? 0 : -15),
    physical: rand(mainPos === 'DF' ? 4 : 1),
    gkReflexes: mainPos === 'GK' ? rand(8) : 45,
  };
}

async function fetchClubPlayersWithRetry(realClub, safeClub, leagueCode, ovrBase) {
  const url = `https://www.thesportsdb.com/api/v1/json/123/searchplayers.php?t=${encodeURIComponent(realClub)}`;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = data?.player || [];
      return list
        .filter((p) => !p.strSport || p.strSport === 'Soccer')
        .map((p) => {
          const { mainPosition, roleCode } = mapPositionGroup(p.strPosition);
          const baseStats = generateStatsByPosition(mainPosition, ovrBase);
          const avgStat = Math.round(
            (baseStats.speed + baseStats.shooting + baseStats.passing + baseStats.dribbling + baseStats.defense + baseStats.physical) / 6
          );
          const dropWeight = avgStat >= 86 ? 8 : avgStat >= 81 ? 25 : avgStat >= 76 ? 60 : 120;
          const fallbackAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(p.strPlayer)}`;
          return {
            name: p.strPlayer,
            nationality: p.strNationality || 'International',
            safeClubName: safeClub,
            realClubName: realClub,
            league: leagueCode,
            mainPosition,
            preferredRoleCode: roleCode,
            photoUrl: p.strCutout || p.strThumb || p.strRender || fallbackAvatar,
            dropWeight,
            baseStats,
            tags: avgStat >= 85 ? ['FINISHER', 'PLAYMAKER'] : [],
          };
        });
    } catch (err) {
      if (attempt === 2) {
        console.warn(`  [Skip] ${realClub} API 응답 지연/실패 (${err.message})`);
        return [];
      }
      await sleep(500);
    }
  }
  return [];
}

async function syncPlayersToDatabase(players) {
  console.log(`💾 MySQL player_master 테이블에 ${players.length}명의 실제 선수 동기화 시작...`);
  const conn = await pool.getConnection();
  let inserted = 0;
  try {
    await conn.beginTransaction();
    for (const p of players) {
      await conn
        .query(
          `INSERT INTO player_master (name, main_position, preferred_role, secondary_role, drop_weight, base_stats, tags)
           VALUES (?, ?, ?, NULL, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             main_position = VALUES(main_position),
             preferred_role = VALUES(preferred_role),
             base_stats = VALUES(base_stats)`,
          [
            p.name,
            p.mainPosition,
            p.preferredRoleCode,
            p.dropWeight,
            JSON.stringify({ ...p.baseStats, photoUrl: p.photoUrl, safeClubName: p.safeClubName, league: p.league }),
            JSON.stringify(p.tags || []),
          ]
        )
        .then(() => {
          inserted++;
        })
        .catch(() => {});
    }
    await conn.commit();
    console.log(`✅ DB(player_master)에 총 ${inserted}명의 실제 선수 데이터 및 이미지 URL 반영 완료!`);
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error('❌ DB 동기화 중 오류:', err.message);
  } finally {
    conn.release();
  }
}

export async function runPlayerCrawler() {
  const shouldSyncDb = process.argv.includes('--db');
  console.log('⚽ 9대 리그(유럽 1·2부, K리그 1·2, MLS · 총 166개 구단) 실제 선수 데이터 및 프로필 사진 크롤링 시작...');

  const allPlayers = [];
  for (const group of FULL_LEAGUE_CLUB_TARGETS) {
    console.log(`\n📌 [${group.league}] (${group.clubs.length}개 구단) 수집 중...`);
    for (const [realClub, safeClub] of group.clubs) {
      const players = await fetchClubPlayersWithRetry(realClub, safeClub, group.league, group.ovrBase);
      console.log(`  ✔ ${safeClub} (${realClub}): ${players.length}명`);
      allPlayers.push(...players);
      await sleep(220); // API Rate Limit 보호 딜레이
    }
  }

  // 선수 이름 중복 제거
  const uniqueMap = new Map();
  for (const p of allPlayers) {
    const key = String(p.name || '').trim();
    if (key && !uniqueMap.has(key)) {
      uniqueMap.set(key, p);
    }
  }
  const deduplicated = [...uniqueMap.values()];

  const outPath = path.resolve(process.cwd(), 'real_players_seed.json');
  await fs.writeFile(outPath, JSON.stringify(deduplicated, null, 2), 'utf-8');
  console.log(`\n🎉 총 ${deduplicated.length}명의 고유 실제 선수 데이터 & 이미지 URL JSON 저장 완료: ${outPath}`);

  if (shouldSyncDb && deduplicated.length > 0) {
    await syncPlayersToDatabase(deduplicated);
    process.exit(0);
  }
}

if (process.argv[1]?.includes('crawlRealPlayers')) {
  runPlayerCrawler();
}