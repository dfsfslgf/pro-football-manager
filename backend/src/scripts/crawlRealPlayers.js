/**
 * - Wikipedia MediaWiki API 기반 크롤러
 * - 선수별 실제 포지션 사전 + 등번호(Back Number) 분석으로 정확한 세부 포지션(CB/LB/RB, CDM/CM/CAM, LW/RW/ST) 할당
 *
 * 실행 방법:
 *   JSON만 생성: node src/scripts/crawlRealPlayers.js
 *   JSON 생성 + MySQL DB(player_master) 전수 저장: node src/scripts/crawlRealPlayers.js --db
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import pool from '../config/database.js';
import { REAL_PLAYER_MASTER_CATALOG, buildBaseStats } from '../models/seedData.js';

const WIKI_HEADERS = {
  'User-Agent': 'ProFootballManagerCrawler/3.0 (https://localhost; dev@pfm.local)',
  Accept: 'application/json',
};

/**
 * 한글/영문 주요 선수들의 정확한 실제 포지션 및 영문 위키피디아 문서 제목 사전
 */
const EXACT_PLAYER_META = {
  // 골키퍼 (GK)
  '티보 쿠르투아': { pos: 'GK', role: 'GK', wiki: 'Thibaut_Courtois' },
  'Thibaut Courtois': { pos: 'GK', role: 'GK', wiki: 'Thibaut_Courtois' },
  '알리송 베케르': { pos: 'GK', role: 'GK', wiki: 'Alisson_Becker' },
  'Alisson': { pos: 'GK', role: 'GK', wiki: 'Alisson_Becker' },
  'Alisson Becker': { pos: 'GK', role: 'GK', wiki: 'Alisson_Becker' },
  '에데르송': { pos: 'GK', role: 'GK', wiki: 'Ederson_(footballer,_born_1993)' },
  'Ederson': { pos: 'GK', role: 'GK', wiki: 'Ederson_(footballer,_born_1993)' },
  '마누엘 노이어': { pos: 'GK', role: 'GK', wiki: 'Manuel_Neuer' },
  'Manuel Neuer': { pos: 'GK', role: 'GK', wiki: 'Manuel_Neuer' },
  '다비드 라야': { pos: 'GK', role: 'GK', wiki: 'David_Raya' },
  'David Raya': { pos: 'GK', role: 'GK', wiki: 'David_Raya' },
  '굴리엘모 비카리오': { pos: 'GK', role: 'GK', wiki: 'Guglielmo_Vicario' },
  'Guglielmo Vicario': { pos: 'GK', role: 'GK', wiki: 'Guglielmo_Vicario' },
  '마이크 메냥': { pos: 'GK', role: 'GK', wiki: 'Mike_Maignan' },
  '에밀리아노 마르티네스': { pos: 'GK', role: 'GK', wiki: 'Emiliano_Martínez' },
  'Emiliano Martínez': { pos: 'GK', role: 'GK', wiki: 'Emiliano_Martínez' },
  '잔루이지 돈나룸마': { pos: 'GK', role: 'GK', wiki: 'Gianluigi_Donnarumma' },
  '얀 오블라크': { pos: 'GK', role: 'GK', wiki: 'Jan_Oblak' },
  '안드레 오나나': { pos: 'GK', role: 'GK', wiki: 'André_Onana' },
  '조던 픽포드': { pos: 'GK', role: 'GK', wiki: 'Jordan_Pickford' },
  '조현우': { pos: 'GK', role: 'GK', wiki: 'Jo_Hyeon-woo' },
  '김승규': { pos: 'GK', role: 'GK', wiki: 'Kim_Seung-gyu' },

  // 수비수 (DF - CB / LB / RB 명확히 구분)
  '벤 화이트': { pos: 'DF', role: 'RB', wiki: 'Ben_White_(footballer)' },
  'Ben White': { pos: 'DF', role: 'RB', wiki: 'Ben_White_(footballer)' },
  '트렌트 알렉산더아놀드': { pos: 'DF', role: 'RB', wiki: 'Trent_Alexander-Arnold' },
  'Trent Alexander-Arnold': { pos: 'DF', role: 'RB', wiki: 'Trent_Alexander-Arnold' },
  '버질 판 데이크': { pos: 'DF', role: 'CB', wiki: 'Virgil_van_Dijk' },
  'Virgil van Dijk': { pos: 'DF', role: 'CB', wiki: 'Virgil_van_Dijk' },
  '후벵 디아스': { pos: 'DF', role: 'CB', wiki: 'Rúben_Dias' },
  'Rúben Dias': { pos: 'DF', role: 'CB', wiki: 'Rúben_Dias' },
  '윌리엄 살리바': { pos: 'DF', role: 'CB', wiki: 'William_Saliba' },
  'William Saliba': { pos: 'DF', role: 'CB', wiki: 'William_Saliba' },
  '가브리에우 마갈량이스': { pos: 'DF', role: 'CB', wiki: 'Gabriel_Magalhães' },
  'Gabriel Magalhães': { pos: 'DF', role: 'CB', wiki: 'Gabriel_Magalhães' },
  '안토니오 뤼디거': { pos: 'DF', role: 'CB', wiki: 'Antonio_Rüdiger' },
  'Antonio Rüdiger': { pos: 'DF', role: 'CB', wiki: 'Antonio_Rüdiger' },
  '김민재': { pos: 'DF', role: 'CB', wiki: 'Kim_Min-jae' },
  'Kim Min-jae': { pos: 'DF', role: 'CB', wiki: 'Kim_Min-jae' },
  '요슈코 그바르디올': { pos: 'DF', role: 'LB', wiki: 'Joško_Gvardiol' },
  'Joško Gvardiol': { pos: 'DF', role: 'LB', wiki: 'Joško_Gvardiol' },
  '크리스티안 로메로': { pos: 'DF', role: 'CB', wiki: 'Cristian_Romero' },
  'Cristian Romero': { pos: 'DF', role: 'CB', wiki: 'Cristian_Romero' },
  '미키 판 더 펜': { pos: 'DF', role: 'CB', wiki: 'Micky_van_de_Ven' },
  'Micky van de Ven': { pos: 'DF', role: 'CB', wiki: 'Micky_van_de_Ven' },
  '페드로 포로': { pos: 'DF', role: 'RB', wiki: 'Pedro_Porro' },
  '데스티니 우도기': { pos: 'DF', role: 'LB', wiki: 'Destiny_Udogie' },
  '아슈라프 하키미': { pos: 'DF', role: 'RB', wiki: 'Achraf_Hakimi' },
  '테오 에르난데스': { pos: 'DF', role: 'LB', wiki: 'Theo_Hernandez' },
  '알레산드로 바스토니': { pos: 'DF', role: 'CB', wiki: 'Alessandro_Bastoni' },
  '알폰소 데이비스': { pos: 'DF', role: 'LB', wiki: 'Alphonso_Davies' },
  '카일 워커': { pos: 'DF', role: 'RB', wiki: 'Kyle_Walker' },
  '앤디 로버트슨': { pos: 'DF', role: 'LB', wiki: 'Andrew_Robertson' },
  '이브라히마 코나테': { pos: 'DF', role: 'CB', wiki: 'Ibrahima_Konaté' },
  '리스 제임스': { pos: 'DF', role: 'RB', wiki: 'Reece_James_(footballer,_born_1999)' },
  '리산드로 마르티네스': { pos: 'DF', role: 'CB', wiki: 'Lisandro_Martínez' },
  '설영우': { pos: 'DF', role: 'RB', wiki: 'Seol_Young-woo' },
  '김영권': { pos: 'DF', role: 'CB', wiki: 'Kim_Young-gwon' },
  '김진수': { pos: 'DF', role: 'LB', wiki: 'Kim_Jin-su' },

  // 미드필더 (MF - CDM / CM / CAM 명확히 구분)
  '로드리': { pos: 'MF', role: 'CDM', wiki: 'Rodri_(footballer,_born_1996)' },
  'Rodri': { pos: 'MF', role: 'CDM', wiki: 'Rodri_(footballer,_born_1996)' },
  '케빈 더 브라위너': { pos: 'MF', role: 'CAM', wiki: 'Kevin_De_Bruyne' },
  'Kevin De Bruyne': { pos: 'MF', role: 'CAM', wiki: 'Kevin_De_Bruyne' },
  '주드 벨링엄': { pos: 'MF', role: 'CAM', wiki: 'Jude_Bellingham' },
  'Jude Bellingham': { pos: 'MF', role: 'CAM', wiki: 'Jude_Bellingham' },
  '마르틴 외데고르': { pos: 'MF', role: 'CAM', wiki: 'Martin_Ødegaard' },
  'Martin Ødegaard': { pos: 'MF', role: 'CAM', wiki: 'Martin_Ødegaard' },
  '데클란 라이스': { pos: 'MF', role: 'CDM', wiki: 'Declan_Rice' },
  'Declan Rice': { pos: 'MF', role: 'CDM', wiki: 'Declan_Rice' },
  '페데리코 발베르데': { pos: 'MF', role: 'CM', wiki: 'Federico_Valverde' },
  '자말 무시알라': { pos: 'MF', role: 'CAM', wiki: 'Jamal_Musiala' },
  '플로리안 비르츠': { pos: 'MF', role: 'CAM', wiki: 'Florian_Wirtz' },
  '콜 파머': { pos: 'MF', role: 'CAM', wiki: 'Cole_Palmer' },
  'Cole Palmer': { pos: 'MF', role: 'CAM', wiki: 'Cole_Palmer' },
  '브루노 페르난데스': { pos: 'MF', role: 'CAM', wiki: 'Bruno_Fernandes' },
  'Bruno Fernandes': { pos: 'MF', role: 'CAM', wiki: 'Bruno_Fernandes' },
  '베르나르두 실바': { pos: 'MF', role: 'CM', wiki: 'Bernardo_Silva' },
  '페드리': { pos: 'MF', role: 'CM', wiki: 'Pedri' },
  '니콜로 바렐라': { pos: 'MF', role: 'CM', wiki: 'Nicolò_Barella' },
  '알렉시스 맥 알리스터': { pos: 'MF', role: 'CM', wiki: 'Alexis_Mac_Allister' },
  '도미니크 소보슬라이': { pos: 'MF', role: 'CAM', wiki: 'Dominik_Szoboszlai' },
  '라이언 흐라번베르흐': { pos: 'MF', role: 'CDM', wiki: 'Ryan_Gravenberch' },
  '이강인': { pos: 'MF', role: 'CAM', wiki: 'Lee_Kang-in' },
  'Lee Kang-in': { pos: 'MF', role: 'CAM', wiki: 'Lee_Kang-in' },
  '제임스 매디슨': { pos: 'MF', role: 'CAM', wiki: 'James_Maddison' },
  'James Maddison': { pos: 'MF', role: 'CAM', wiki: 'James_Maddison' },
  '유리 틸레만스': { pos: 'MF', role: 'CM', wiki: 'Youri_Tielemans' },
  'Youri Tielemans': { pos: 'MF', role: 'CM', wiki: 'Youri_Tielemans' },
  '모이세스 카이세도': { pos: 'MF', role: 'CDM', wiki: 'Moisés_Caicedo' },
  '엔소 페르난데스': { pos: 'MF', role: 'CM', wiki: 'Enzo_Fernández' },
  '브루노 기마랑이스': { pos: 'MF', role: 'CM', wiki: 'Bruno_Guimarães' },
  '조슈아 키미히': { pos: 'MF', role: 'CDM', wiki: 'Joshua_Kimmich' },
  '이재성': { pos: 'MF', role: 'CAM', wiki: 'Lee_Jae-sung_(footballer,_born_1992)' },
  '황인범': { pos: 'MF', role: 'CM', wiki: 'Hwang_In-beom' },
  '배준호': { pos: 'MF', role: 'LM', wiki: 'Bae_Jun-ho' },
  '제시 린가드': { pos: 'MF', role: 'CAM', wiki: 'Jesse_Lingard' },
  '세징야': { pos: 'MF', role: 'CAM', wiki: 'Cesinha_(footballer,_born_1989)' },

  // 공격수 (FW - ST / LW / RW 명확히 구분)
  '킬리안 음바페': { pos: 'FW', role: 'ST', wiki: 'Kylian_Mbappé' },
  'Kylian Mbappé': { pos: 'FW', role: 'ST', wiki: 'Kylian_Mbappé' },
  '엘링 홀란드': { pos: 'FW', role: 'ST', wiki: 'Erling_Haaland' },
  'Erling Haaland': { pos: 'FW', role: 'ST', wiki: 'Erling_Haaland' },
  '해리 케인': { pos: 'FW', role: 'ST', wiki: 'Harry_Kane' },
  'Harry Kane': { pos: 'FW', role: 'ST', wiki: 'Harry_Kane' },
  '비니시우스 주니오르': { pos: 'FW', role: 'LW', wiki: 'Vinícius_Júnior' },
  'Vinícius Júnior': { pos: 'FW', role: 'LW', wiki: 'Vinícius_Júnior' },
  '손흥민': { pos: 'FW', role: 'LW', wiki: 'Son_Heung-min' },
  'Son Heung-min': { pos: 'FW', role: 'LW', wiki: 'Son_Heung-min' },
  '모하메드 살라': { pos: 'FW', role: 'RW', wiki: 'Mohamed_Salah' },
  'Mohamed Salah': { pos: 'FW', role: 'RW', wiki: 'Mohamed_Salah' },
  '부카요 사카': { pos: 'FW', role: 'RW', wiki: 'Bukayo_Saka' },
  'Bukayo Saka': { pos: 'FW', role: 'RW', wiki: 'Bukayo_Saka' },
  '라민 야말': { pos: 'FW', role: 'RW', wiki: 'Lamine_Yamal' },
  'Lamine Yamal': { pos: 'FW', role: 'RW', wiki: 'Lamine_Yamal' },
  '필 포든': { pos: 'FW', role: 'RW', wiki: 'Phil_Foden' },
  'Phil Foden': { pos: 'FW', role: 'RW', wiki: 'Phil_Foden' },
  '리오넬 메시': { pos: 'FW', role: 'RW', wiki: 'Lionel_Messi' },
  'Lionel Messi': { pos: 'FW', role: 'RW', wiki: 'Lionel_Messi' },
  '라우타로 마르티네스': { pos: 'FW', role: 'ST', wiki: 'Lautaro_Martínez' },
  '알렉산데르 이삭': { pos: 'FW', role: 'ST', wiki: 'Alexander_Isak' },
  '올리 왓킨스': { pos: 'FW', role: 'ST', wiki: 'Ollie_Watkins' },
  '미토마 가오루': { pos: 'FW', role: 'LW', wiki: 'Kaoru_Mitoma' },
  'Kaoru Mitoma': { pos: 'FW', role: 'LW', wiki: 'Kaoru_Mitoma' },
  '황희찬': { pos: 'FW', role: 'ST', wiki: 'Hwang_Hee-chan' },
  'Hwang Hee-chan': { pos: 'FW', role: 'ST', wiki: 'Hwang_Hee-chan' },
  '카이 하베르츠': { pos: 'FW', role: 'ST', wiki: 'Kai_Havertz' },
  '가브리엘 마르티넬리': { pos: 'FW', role: 'LW', wiki: 'Gabriel_Martinelli' },
  '양민혁': { pos: 'FW', role: 'RW', wiki: 'Yang_Min-hyeok' },
  '엄지성': { pos: 'FW', role: 'LW', wiki: 'Eom_Ji-sung' },
  '주민규': { pos: 'FW', role: 'ST', wiki: 'Joo_Min-kyu' },
};

// 9대 리그 구단별 [위키피디아 문서명, 게임 내 가명, 실제 구단명, 기본 OVR]
const LEAGUE_CLUBS_WIKI = [
  {
    league: 'EPL_1',
    ovrBase: 82,
    clubs: [
      ['Manchester_City_F.C.', '맨체스터 블루', 'Manchester City', 86],
      ['Arsenal_F.C.', '노스 런던 레드', 'Arsenal', 85],
      ['Liverpool_F.C.', '머지사이드 레드', 'Liverpool', 85],
      ['Tottenham_Hotspur_F.C.', '노스이스트 런던', 'Tottenham Hotspur', 83],
      ['Chelsea_F.C.', '웨스트 런던 블루', 'Chelsea', 83],
      ['Manchester_United_F.C.', '맨체스터 레드', 'Manchester United', 82],
      ['Newcastle_United_F.C.', '타인사이드 블랙화이트', 'Newcastle United', 82],
      ['Aston_Villa_F.C.', '버밍엄 클라렛', 'Aston Villa', 82],
      ['Brighton_&_Hove_Albion_F.C.', '서식스 시걸스', 'Brighton', 79],
      ['West_Ham_United_F.C.', '이스트 런던 해머스', 'West Ham United', 79],
      ['Crystal_Palace_F.C.', '사우스 런던 이글스', 'Crystal Palace', 78],
      ['Fulham_F.C.', '템스 화이트', 'Fulham', 78],
      ['Wolverhampton_Wanderers_F.C.', '미들랜즈 골드울브스', 'Wolverhampton', 77],
      ['Brentford_F.C.', '웨스트 런던 비즈', 'Brentford', 77],
      ['AFC_Bournemouth', '도싯 체리레드', 'Bournemouth', 77],
      ['Everton_F.C.', '머지사이드 블루', 'Everton', 76],
      ['Nottingham_Forest_F.C.', '노팅엄 포레스트 레드', 'Nottingham Forest', 77],
      ['Leicester_City_F.C.', '레스터 폭스 블루', 'Leicester City', 75],
      ['Ipswich_Town_F.C.', '서퍽 트랙터 블루', 'Ipswich Town', 74],
      ['Southampton_F.C.', '사우스코스트 세인츠', 'Southampton', 74],
    ],
  },
  {
    league: 'EFL_2',
    ovrBase: 73,
    clubs: [
      ['Leeds_United_F.C.', '리즈 요크셔 화이트', 'Leeds United', 76],
      ['Burnley_F.C.', '랭커셔 클라렛', 'Burnley', 75],
      ['Sheffield_United_F.C.', '셰필드 블레이즈', 'Sheffield United', 75],
      ['Luton_Town_F.C.', '베드퍼드셔 해터스', 'Luton Town', 74],
      ['Middlesbrough_F.C.', '티사이드 레드', 'Middlesbrough', 74],
      ['Norwich_City_F.C.', '노퍽 카나리아', 'Norwich City', 74],
      ['West_Bromwich_Albion_F.C.', '웨스트브롬 스로슬스', 'West Bromwich', 74],
      ['Sunderland_A.F.C.', '웨어사이드 블랙캣츠', 'Sunderland', 74],
      ['Coventry_City_F.C.', '코번트리 스카이블루', 'Coventry City', 73],
      ['Stoke_City_F.C.', '스토크 포터스 레드', 'Stoke City', 73],
      ['Swansea_City_A.F.C.', '스완지 스완즈 화이트', 'Swansea City', 73],
      ['Queens_Park_Rangers_F.C.', '런던 호프스 블루', 'QPR', 73],
      ['Watford_F.C.', '하트퍼드셔 호넷츠', 'Watford', 73],
      ['Hull_City_A.F.C.', '험버사이드 타이거즈', 'Hull City', 72],
      ['Blackburn_Rovers_F.C.', '랭커셔 로버스', 'Blackburn Rovers', 72],
      ['Bristol_City_F.C.', '브리스톨 로빈스', 'Bristol City', 72],
      ['Preston_North_End_F.C.', '프레스턴 릴리화이트', 'Preston North End', 72],
      ['Cardiff_City_F.C.', '사우스웨일스 블루버즈', 'Cardiff City', 72],
      ['Millwall_F.C.', '사우스런던 라이온스', 'Millwall', 71],
      ['Sheffield_Wednesday_F.C.', '셰필드 아울스', 'Sheffield Wednesday', 71],
      ['Plymouth_Argyle_F.C.', '데본 필그림스 그린', 'Plymouth Argyle', 70],
      ['Derby_County_F.C.', '더비 램스 화이트', 'Derby County', 71],
      ['Portsmouth_F.C.', '포츠머스 폼피 블루', 'Portsmouth', 71],
      ['Oxford_United_F.C.', '옥스퍼드 옐로우즈', 'Oxford United', 70],
    ],
  },
  {
    league: 'BUNDES_1',
    ovrBase: 79,
    clubs: [
      ['FC_Bayern_Munich', '뮌헨 레드', 'Bayern Munich', 86],
      ['Bayer_04_Leverkusen', '라인 레드블랙', 'Bayer Leverkusen', 84],
      ['Borussia_Dortmund', '베스트팔렌 옐로우', 'Borussia Dortmund', 83],
      ['RB_Leipzig', '작센 레드불스', 'RB Leipzig', 82],
      ['VfB_Stuttgart', '슈투트가르트 화이트레드', 'VfB Stuttgart', 80],
      ['Eintracht_Frankfurt', '프랑크푸르트 이글스', 'Eintracht Frankfurt', 79],
      ['TSG_1899_Hoffenheim', '크라이히가우 블루', 'Hoffenheim', 77],
      ['SC_Freiburg', '브라이스가우 그리핀', 'SC Freiburg', 78],
      ['1._FC_Heidenheim', '하이덴하임 레드블루', 'Heidenheim', 75],
      ['SV_Werder_Bremen', '베저 그린화이트', 'Werder Bremen', 77],
      ['FC_Augsburg', '아우크스부르크 트리컬러', 'FC Augsburg', 76],
      ['VfL_Wolfsburg', '니더작센 그린울브스', 'VfL Wolfsburg', 78],
      ['1._FSV_Mainz_05', '마인츠 카니발 레드', 'Mainz 05', 77],
      ['Borussia_Mönchengladbach', '보루시아 포얼스', 'Monchengladbach', 77],
      ['1._FC_Union_Berlin', '쾨페니크 아이언레드', 'Union Berlin', 76],
      ['VfL_Bochum', '보훔 블루화이트', 'VfL Bochum', 74],
      ['FC_St._Pauli', '함부르크 해적 브라운', 'St. Pauli', 74],
      ['Holstein_Kiel', '홀슈타인 스톡스 블루', 'Holstein Kiel', 73],
    ],
  },
  {
    league: 'LALIGA_1',
    ovrBase: 80,
    clubs: [
      ['Real_Madrid_CF', '마드리드 화이트', 'Real Madrid', 87],
      ['FC_Barcelona', '카탈루냐 블루레드', 'Barcelona', 85],
      ['Atlético_Madrid', '마드리드 로히블랑코', 'Atletico Madrid', 84],
      ['Girona_FC', '히로나 레드화이트', 'Girona', 79],
      ['Athletic_Bilbao', '바스크 라이온스', 'Athletic Bilbao', 80],
      ['Real_Sociedad', '산세바스티안 블루화이트', 'Real Sociedad', 80],
      ['Real_Betis', '안달루시아 그린화이트', 'Real Betis', 79],
      ['Villarreal_CF', '발렌시아 옐로우서브마린', 'Villarreal', 79],
      ['Valencia_CF', '발렌시아 배츠 화이트', 'Valencia', 77],
      ['Sevilla_FC', '세비야 레드화이트', 'Sevilla', 78],
      ['CA_Osasuna', '팜플로나 레드', 'Osasuna', 76],
      ['Getafe_CF', '마드리드 사우스 블루', 'Getafe', 76],
      ['RC_Celta_de_Vigo', '갈리시아 스카이블루', 'Celta Vigo', 76],
      ['RCD_Mallorca', '발레아레스 아일랜드 레드', 'Mallorca', 76],
      ['Deportivo_Alavés', '비토리아 블루화이트', 'Alaves', 75],
      ['UD_Las_Palmas', '카나리아 옐로우블루', 'Las Palmas', 75],
      ['Rayo_Vallecano', '바예카스 라이트닝', 'Rayo Vallecano', 76],
      ['CD_Leganés', '레가네스 오이블루', 'Leganes', 74],
      ['Real_Valladolid', '카스티야 바이올렛', 'Valladolid', 74],
      ['RCD_Espanyol', '바르셀로나 블루화이트', 'Espanyol', 74],
    ],
  },
  {
    league: 'SERIE_A',
    ovrBase: 79,
    clubs: [
      ['Inter_Milan', '롬바르디아 블루블랙', 'Inter Milan', 85],
      ['AC_Milan', '밀라노 레드블랙', 'AC Milan', 83],
      ['Juventus_FC', '피에몬테 블랙화이트', 'Juventus', 83],
      ['SSC_Napoli', '나폴리 아주리', 'Napoli', 83],
      ['Atalanta_BC', '베르가모 블루블랙', 'Atalanta', 82],
      ['AS_Roma', '로마 잘로로시', 'AS Roma', 81],
      ['SS_Lazio', '라치오 스카이이글스', 'Lazio', 80],
      ['ACF_Fiorentina', '피렌체 비올라', 'Fiorentina', 79],
      ['Bologna_FC_1909', '볼로냐 레드블루', 'Bologna', 78],
      ['Torino_FC', '토리노 마룬불스', 'Torino', 77],
      ['Genoa_CFC', '제노바 그리폰', 'Genoa', 76],
      ['AC_Monza', '몬차 레드스피드', 'Monza', 75],
      ['Hellas_Verona_FC', '베로나 옐로우블루', 'Verona', 75],
      ['US_Lecce', '살렌토 울브스', 'Lecce', 74],
      ['Udinese_Calcio', '프리울리 제브레테', 'Udinese', 75],
      ['Cagliari_Calcio', '사르데냐 아일랜더스', 'Cagliari', 74],
      ['Empoli_FC', '엠폴리 블루즈', 'Empoli', 74],
      ['Parma_Calcio_1913', '파르마 크루세이더스', 'Parma', 75],
      ['Como_1907', '코모 레이크블루', 'Como', 75],
      ['Venezia_FC', '베네치아 윙드라이온', 'Venezia', 73],
    ],
  },
  {
    league: 'LIGUE_1',
    ovrBase: 78,
    clubs: [
      ['Paris_Saint-Germain_F.C.', '파리 블루레드', 'Paris SG', 85],
      ['AS_Monaco_FC', '모나코 레드화이트', 'AS Monaco', 80],
      ['Olympique_de_Marseille', '마르세유 올림피크 블루', 'Marseille', 80],
      ['Lille_OSC', '릴 마스티프 레드', 'Lille', 79],
      ['Olympique_Lyonnais', '리옹 라이온스', 'Lyon', 79],
      ['OGC_Nice', '니스 이글스 레드블랙', 'Nice', 78],
      ['RC_Lens', '랑스 골드블러드', 'Lens', 78],
      ['Stade_Rennais_F.C.', '렌 브르타뉴 레드', 'Rennes', 77],
      ['Stade_Brestois_29', '브레스트 파이러츠', 'Brest', 77],
      ['Stade_de_Reims', '랭스 샴페인 레드', 'Reims', 76],
      ['Toulouse_FC', '툴루즈 바이올렛', 'Toulouse', 75],
      ['RC_Strasbourg_Alsace', '스트라스부르 블루', 'Strasbourg', 75],
      ['Montpellier_HSC', '몽펠리에 오렌지블루', 'Montpellier', 75],
      ['FC_Nantes', '낭트 카나리아 그린옐로', 'Nantes', 75],
      ['Le_Havre_AC', '르아브르 스카이네이비', 'Le Havre', 73],
      ['AJ_Auxerre', '오세르 화이트블루', 'Auxerre', 73],
      ['Angers_SCO', '앙제 스쿱 블랙화이트', 'Angers', 72],
      ['AS_Saint-Étienne', '생테티엔 그린스타즈', 'Saint-Etienne', 74],
    ],
  },
  {
    league: 'KLEAGUE_1',
    ovrBase: 74,
    clubs: [
      ['Ulsan_HD_FC', '울산 블루타이거즈', 'Ulsan HD', 77],
      ['Gimcheon_Sangmu_FC', '김천 피닉스 레드', 'Gimcheon Sangmu', 75],
      ['Gangwon_FC', '강원 오렌지베어스', 'Gangwon FC', 75],
      ['Pohang_Steelers', '포항 스틸레드', 'Pohang Steelers', 76],
      ['FC_Seoul', '서울 블랙레드', 'FC Seoul', 76],
      ['Suwon_FC', '수원 캐슬블루레드', 'Suwon FC', 74],
      ['Jeju_SK_FC', '제주 아일랜드 오렌지', 'Jeju United', 74],
      ['Daejeon_Hana_Citizen', '대전 퍼플시티즌', 'Daejeon Hana', 75],
      ['Gwangju_FC', '광주 그리핀 옐로우', 'Gwangju FC', 75],
      ['Jeonbuk_Hyundai_Motors', '전북 그린워리어스', 'Jeonbuk Hyundai', 76],
      ['Daegu_FC', '대구 스카이솔라', 'Daegu FC', 74],
      ['FC_Anyang', '안양 바이올렛', 'FC Anyang', 72],
      ['Incheon_United_FC', '인천 블루블랙 마린', 'Incheon United', 74],
      ['Suwon_Samsung_Bluewings', '수원 블루윙즈', 'Suwon Bluewings', 74],
      ['Busan_IPark', '부산 로열실드', 'Busan IPark', 72],
      ['Seoul_E-Land_FC', '서울 레오파즈 네이비', 'Seoul E-Land', 72],
    ],
  },
  {
    league: 'MLS_1',
    ovrBase: 75,
    clubs: [
      ['Inter_Miami_CF', '마이애미 핑크헤론즈', 'Inter Miami', 79],
      ['Los_Angeles_FC', '로스앤젤레스 골드블랙', 'LAFC', 78],
      ['LA_Galaxy', 'LA 갤럭시 스타즈', 'LA Galaxy', 78],
      ['Columbus_Crew', '콜럼버스 골드크루', 'Columbus Crew', 77],
      ['FC_Cincinnati', '신시내티 오렌지라이온', 'FC Cincinnati', 76],
      ['Seattle_Sounders_FC', '시애틀 에메랄드 사운더스', 'Seattle Sounders', 76],
      ['New_York_City_FC', '뉴욕 시티 스카이블루', 'NYCFC', 76],
      ['New_York_Red_Bulls', '뉴욕 메트로 레드불스', 'NY Red Bulls', 75],
      ['Orlando_City_SC', '올랜도 퍼플라이온스', 'Orlando City', 75],
      ['Houston_Dynamo_FC', '휴스턴 오렌지다이나모', 'Houston Dynamo', 75],
      ['Atlanta_United_FC', '애틀랜타 파이브스트라이프', 'Atlanta United', 75],
      ['Charlotte_FC', '샬럿 크라운 블루', 'Charlotte FC', 74],
      ['Vancouver_Whitecaps_FC', '밴쿠버 화이트캡스', 'Vancouver', 74],
      ['Portland_Timbers', '포틀랜드 팀버스 그린', 'Portland Timbers', 74],
      ['Real_Salt_Lake', '솔트레이크 로열클라렛', 'Real Salt Lake', 74],
      ['Minnesota_United_FC', '미네소타 노스룬즈', 'Minnesota United', 74],
      ['Colorado_Rapids', '콜로라도 버건디래피즈', 'Colorado Rapids', 73],
      ['FC_Dallas', '댈러스 텍사스 불스', 'FC Dallas', 73],
      ['St._Louis_City_SC', '세인트루이스 아치 레드', 'St. Louis City', 73],
      ['Toronto_FC', '토론토 메이플 레즈', 'Toronto FC', 73],
    ],
  },
];

/**
 * 포지션 추론 함수
 */
function inferAccurateRole(rawName, mainPos, shirtNo = 0, idx = 0) {
  const exact = EXACT_PLAYER_META[rawName];
  if (exact) {
    return { mainPosition: exact.pos, preferredRoleCode: exact.role, wikiTitle: exact.wiki };
  }

  const pos = ['GK', 'DF', 'MF', 'FW'].includes(mainPos) ? mainPos : 'MF';
  if (pos === 'GK') return { mainPosition: 'GK', preferredRoleCode: 'GK', wikiTitle: null };

  if (pos === 'DF') {
    if (shirtNo === 2 || shirtNo === 12 || shirtNo === 22) return { mainPosition: 'DF', preferredRoleCode: 'RB', wikiTitle: null };
    if (shirtNo === 3 || shirtNo === 13 || shirtNo === 21) return { mainPosition: 'DF', preferredRoleCode: 'LB', wikiTitle: null };
    if ([4, 5, 6, 15, 16, 23, 24, 25].includes(shirtNo)) return { mainPosition: 'DF', preferredRoleCode: 'CB', wikiTitle: null };
    const dfRoles = ['CB', 'CB', 'RB', 'LB'];
    return { mainPosition: 'DF', preferredRoleCode: dfRoles[idx % dfRoles.length], wikiTitle: null };
  }

  if (pos === 'MF') {
    if (shirtNo === 6 || shirtNo === 4 || shirtNo === 16) return { mainPosition: 'MF', preferredRoleCode: 'CDM', wikiTitle: null };
    if (shirtNo === 10 || shirtNo === 19 || shirtNo === 20) return { mainPosition: 'MF', preferredRoleCode: 'CAM', wikiTitle: null };
    const mfRoles = ['CM', 'CDM', 'CAM', 'CM'];
    return { mainPosition: 'MF', preferredRoleCode: mfRoles[idx % mfRoles.length], wikiTitle: null };
  }

  // FW
  if (shirtNo === 7 || shirtNo === 17) return { mainPosition: 'FW', preferredRoleCode: 'RW', wikiTitle: null };
  if (shirtNo === 11 || shirtNo === 14) return { mainPosition: 'FW', preferredRoleCode: 'LW', wikiTitle: null };
  if (shirtNo === 9 || shirtNo === 18 || shirtNo === 19) return { mainPosition: 'FW', preferredRoleCode: 'ST', wikiTitle: null };
  const fwRoles = ['ST', 'LW', 'RW', 'ST'];
  return { mainPosition: 'FW', preferredRoleCode: fwRoles[idx % fwRoles.length], wikiTitle: null };
}

async function fetchSquadFromWikipedia(wikiPageTitle, safeClub, realClub, leagueCode, clubOvr) {
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(
    wikiPageTitle
  )}&prop=wikitext&format=json&redirects=1`;

  try {
    const res = await fetch(url, { headers: WIKI_HEADERS });
    if (!res.ok) return [];
    const json = await res.json();
    const wikitext = json?.parse?.wikitext?.['*'] || '';
    if (!wikitext) return [];

    const players = [];
    const regex = /\{\{\s*[Ff]s player[^}]*?\}\}/g;
    const matches = wikitext.match(regex) || [];

    matches.forEach((block, idx) => {
      const posMatch = block.match(/\|\s*pos\s*=\s*(GK|DF|MF|FW)/i);
      const nameMatch = block.match(/\|\s*name\s*=\s*(.+?)(?:\||\}\})/i);
      const noMatch = block.match(/\|\s*no\s*=\s*(\d+)/i);
      if (!posMatch || !nameMatch) return;

      const rawPos = posMatch[1].toUpperCase();
      const shirtNo = noMatch ? Number(noMatch[1]) : 0;
      let rawName = nameMatch[1].trim();
      let wikiTitle = null;

      const linkMatch = rawName.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
      if (linkMatch) {
        wikiTitle = linkMatch[1].trim().replace(/ /g, '_');
        rawName = (linkMatch[2] || linkMatch[1]).trim();
      } else {
        rawName = rawName.replace(/['"\[\]\{\}]/g, '').trim();
      }
      rawName = rawName.replace(/\s*\([^)]*\)/g, '').trim();
      if (!rawName || rawName.length < 2) return;

      const inferred = inferAccurateRole(rawName, rawPos, shirtNo, idx);
      const finalWikiTitle = inferred.wikiTitle || wikiTitle || rawName.replace(/ /g, '_');
      const mainPosition = inferred.mainPosition;
      const preferredRoleCode = inferred.preferredRoleCode;

      const ovr = Math.max(60, Math.min(92, clubOvr + ((idx * 7) % 9) - 4));
      const tier = ovr >= 85 ? 'LEGEND' : ovr >= 78 ? 'EPIC' : ovr >= 71 ? 'RARE' : 'COMMON';
      const dropWeight = tier === 'LEGEND' ? 2 : tier === 'EPIC' ? 10 : tier === 'RARE' ? 35 : 100;

      players.push({
        name: rawName,
        wikiTitle: finalWikiTitle,
        safeClubName: safeClub,
        realClubName: realClub,
        league: leagueCode,
        mainPosition,
        preferredRoleCode,
        overall: ovr,
        tier,
        dropWeight,
        baseStats: buildBaseStats(mainPosition, ovr, idx + 1),
        tags: [tier, ...(mainPosition === 'MF' && ovr >= 82 ? ['PLAYMAKER'] : [])],
      });
    });

    return players;
  } catch (err) {
    console.warn(`  [Skip] ${realClub} 위키 스쿼드 파싱 실패:`, err.message);
    return [];
  }
}

async function attachPlayerImagesInBatches(players) {
  const withWiki = players.filter((p) => p.wikiTitle);
  const batchSize = 40;

  for (let i = 0; i < withWiki.length; i += batchSize) {
    const batch = withWiki.slice(i, i + batchSize);
    const titlesParam = batch.map((p) => p.wikiTitle).join('|');
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
      titlesParam
    )}&prop=pageimages&pithumbsize=250&redirects=1&format=json`;

    try {
      const res = await fetch(url, { headers: WIKI_HEADERS });
      if (res.ok) {
        const data = await res.json();
        const pages = data?.query?.pages || {};
        const redirects = data?.query?.redirects || [];
        const normalized = data?.query?.normalized || [];

        const thumbByCanonicalTitle = new Map();
        for (const pg of Object.values(pages)) {
          if (pg.title && pg.thumbnail?.source) {
            thumbByCanonicalTitle.set(pg.title.toLowerCase(), pg.thumbnail.source);
          }
        }

        // 리다이렉트 및 정규화 역추적 맵 구성
        const redirectMap = new Map();
        for (const r of redirects) {
          redirectMap.set(r.from.toLowerCase(), r.to.toLowerCase());
        }
        for (const n of normalized) {
          redirectMap.set(n.from.toLowerCase(), n.to.toLowerCase());
        }

        for (const p of batch) {
          let lookupKey = p.wikiTitle.replace(/_/g, ' ').toLowerCase();
          let visited = 0;
          while (redirectMap.has(lookupKey) && visited < 4) {
            lookupKey = redirectMap.get(lookupKey);
            visited++;
          }
          const found =
            thumbByCanonicalTitle.get(lookupKey) ||
            thumbByCanonicalTitle.get(p.wikiTitle.replace(/_/g, ' ').toLowerCase());
          if (found) {
            p.photoUrl = found;
          }
        }
      }
    } catch {
      // 네트워크 오류 시 기본 아바타 유지
    }
  }

  for (const p of players) {
    if (!p.photoUrl) {
      p.photoUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(p.name)}&backgroundColor=1e293b`;
    }
    p.baseStats = {
      ...p.baseStats,
      photoUrl: p.photoUrl,
      safeClubName: p.safeClubName,
      realClubName: p.realClubName,
      league: p.league,
    };
  }
}

export async function runPlayerCrawler() {
  const shouldSyncDb = process.argv.includes('--db');
  console.log('⚽ 9대 리그 전 구단(146개 팀) 실제 소속 선수단 크롤링 시작...');

  const allPlayers = [];

  // 한글 주요 스타 선수 120명 기본 시드 (EXACT_PLAYER_META를 통해 정확한 포지션 & 영문 위키 사진 타이틀 자동 연결)
  REAL_PLAYER_MASTER_CATALOG.forEach((item, idx) => {
    const exact = EXACT_PLAYER_META[item.name];
    const finalPos = exact?.pos || item.pos;
    const finalRole = exact?.role || item.role;
    const finalWiki = exact?.wiki || null;

    allPlayers.push({
      name: item.name,
      wikiTitle: finalWiki,
      safeClubName: '글로벌 스타 풀',
      realClubName: 'Global Stars',
      league: 'GLOBAL',
      mainPosition: finalPos,
      preferredRoleCode: finalRole,
      overall: item.ovr,
      tier: item.tier,
      dropWeight: item.weight,
      baseStats: buildBaseStats(finalPos, item.ovr, idx + 1),
      tags: [item.tier, ...(finalPos === 'MF' && item.ovr >= 82 ? ['PLAYMAKER'] : [])],
    });
  });

  // 2) 각 리그의 모든 구단을 순회하며 구단별 실제 선수 추출
  for (const group of LEAGUE_CLUBS_WIKI) {
    console.log(`\n📌 [${group.league}] 구단별 실제 선수단 크롤링 중...`);
    for (const [wikiTitle, safeClub, realClub, clubOvr] of group.clubs) {
      const clubPlayers = await fetchSquadFromWikipedia(wikiTitle, safeClub, realClub, group.league, clubOvr);
      console.log(`  ✔ ${safeClub} (${realClub}): 실제 선수 ${clubPlayers.length}명 추출 완료`);
      allPlayers.push(...clubPlayers);
    }
  }

  const uniqueMap = new Map();
  for (const p of allPlayers) {
    const key = String(p.name).trim();
    if (key && !uniqueMap.has(key)) {
      uniqueMap.set(key, p);
    }
  }
  const deduplicated = [...uniqueMap.values()];
  console.log(`\n🖼️ 총 ${deduplicated.length}명의 고유 실제 선수 프로필 이미지 배치 매핑 중...`);
  await attachPlayerImagesInBatches(deduplicated);

  const byTeam = {};
  for (const p of deduplicated) {
    const teamKey = p.safeClubName || '기타';
    if (!byTeam[teamKey]) byTeam[teamKey] = [];
    byTeam[teamKey].push(p);
  }

  const outFlatPath = path.resolve(process.cwd(), 'real_players_seed.json');
  const outTeamPath = path.resolve(process.cwd(), 'real_players_by_team.json');
  await fs.writeFile(outFlatPath, JSON.stringify(deduplicated, null, 2), 'utf-8');
  await fs.writeFile(outTeamPath, JSON.stringify(byTeam, null, 2), 'utf-8');

  console.log(`🎉 크롤링 완료! 총 ${deduplicated.length}명의 실제 선수가 저장되었습니다:`);
  console.log(`   - 전체 선수 시드: ${outFlatPath}`);
  console.log(`   - 구단별 선수 로스터: ${outTeamPath}`);

  if (shouldSyncDb && deduplicated.length > 0) {
    console.log(`\n💾 MySQL player_master 테이블에 ${deduplicated.length}명 전수 동기화 시작...`);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [existing] = await conn.query('SELECT id FROM player_master ORDER BY id ASC');

      for (let i = 0; i < deduplicated.length; i++) {
        const row = deduplicated[i];
        if (i < existing.length) {
          await conn.query(
            'UPDATE player_master SET name = ?, main_position = ?, preferred_role = ?, drop_weight = ?, base_stats = ?, tags = ? WHERE id = ?',
            [
              row.name,
              row.mainPosition,
              row.preferredRoleCode,
              row.dropWeight,
              JSON.stringify(row.baseStats),
              JSON.stringify(row.tags),
              existing[i].id,
            ]
          );
        } else {
          await conn.query(
            'INSERT INTO player_master (name, main_position, preferred_role, drop_weight, base_stats, tags) VALUES (?, ?, ?, ?, ?, ?)',
            [
              row.name,
              row.mainPosition,
              row.preferredRoleCode,
              row.dropWeight,
              JSON.stringify(row.baseStats),
              JSON.stringify(row.tags),
            ]
          );
        }
      }
      await conn.commit();
      console.log(`✅ DB(player_master)에 총 ${deduplicated.length}명의 구단별 실제 선수 저장 완료!`);
    } catch (err) {
      await conn.rollback().catch(() => {});
      console.error('❌ DB 저장 오류:', err.message);
    } finally {
      conn.release();
      process.exit(0);
    }
  }
}

if (process.argv[1]?.includes('crawlRealPlayers')) {
  runPlayerCrawler();
}