import { computeOverall } from '../utils/playerMath.js';

const PROFILES = {
  GK: { speed: 44, shooting: 22, passing: 56, dribbling: 36, defense: 62, physical: 70, gkReflexes: 78, staminaMax: 92 },
  DF: { speed: 68, shooting: 40, passing: 64, dribbling: 56, defense: 78, physical: 76, gkReflexes: 12, staminaMax: 92 },
  MF: { speed: 72, shooting: 66, passing: 78, dribbling: 76, defense: 62, physical: 68, gkReflexes: 12, staminaMax: 94 },
  FW: { speed: 80, shooting: 80, passing: 66, dribbling: 78, defense: 36, physical: 70, gkReflexes: 12, staminaMax: 90 },
};

/**
 * 프로필 능력치를 목표 OVR 에 맞게 비율 조정한 base_stats 를 만듭니다.
 * @param {'GK'|'DF'|'MF'|'FW'} position
 * @param {number} targetOvr
 * @param {number} jitterSeed 스탯별 결정론적 변동 시드
 * @returns {Object<string, number>}
 */
export function buildBaseStats(position, targetOvr, jitterSeed = 0) {
  const profile = PROFILES[position] || PROFILES.MF;
  const profileOvr = computeOverall(profile, 1, position);
  const scale = targetOvr / Math.max(1, profileOvr);
  const stats = {};
  Object.entries(profile).forEach(([key, value], i) => {
    if (key === 'staminaMax') {
      stats[key] = value;
      return;
    }
    const jitter = ((jitterSeed * 7 + i * 3) % 5) - 2;
    stats[key] = Math.max(10, Math.min(99, Math.round(value * scale + jitter)));
  });
  return stats;
}

/**
 * [요구사항 21 & 23 완벽 반영]
 * 가상 이름 조합을 폐기하고 유럽 주요 리그(1·2부) + K리그 1·2 + MLS 실제 선수 120명을
 * 등급(LEGEND / EPIC / RARE / COMMON) 및 포지션(GK / DF / MF / FW)별로 중복 없이 정의합니다.
 */
export const REAL_PLAYER_MASTER_CATALOG = [
  /* ============================== LEGEND (OVR 85 ~ 92, drop_weight: 2) ============================== */
  // GK
  { name: '티보 쿠르투아', pos: 'GK', role: 'GK', tier: 'LEGEND', weight: 2, ovr: 90 },
  { name: '알리송 베케르', pos: 'GK', role: 'GK', tier: 'LEGEND', weight: 2, ovr: 89 },
  { name: '에데르송', pos: 'GK', role: 'GK', tier: 'LEGEND', weight: 2, ovr: 88 },
  // DF
  { name: '버질 판 데이크', pos: 'DF', role: 'CB', tier: 'LEGEND', weight: 2, ovr: 90 },
  { name: '후벵 디아스', pos: 'DF', role: 'CB', tier: 'LEGEND', weight: 2, ovr: 89 },
  { name: '윌리엄 살리바', pos: 'DF', role: 'CB', tier: 'LEGEND', weight: 2, ovr: 88 },
  { name: '안토니오 뤼디거', pos: 'DF', role: 'CB', tier: 'LEGEND', weight: 2, ovr: 88 },
  { name: '트렌트 알렉산더아놀드', pos: 'DF', role: 'RB', tier: 'LEGEND', weight: 2, ovr: 87 },
  { name: '아슈라프 하키미', pos: 'DF', role: 'RB', tier: 'LEGEND', weight: 2, ovr: 87 },
  { name: '테오 에르난데스', pos: 'DF', role: 'LB', tier: 'LEGEND', weight: 2, ovr: 87 },
  // MF
  { name: '로드리', pos: 'MF', role: 'CDM', tier: 'LEGEND', weight: 2, ovr: 91 },
  { name: '케빈 더 브라위너', pos: 'MF', role: 'CAM', tier: 'LEGEND', weight: 2, ovr: 91 },
  { name: '주드 벨링엄', pos: 'MF', role: 'CAM', tier: 'LEGEND', weight: 2, ovr: 90 },
  { name: '마르틴 외데고르', pos: 'MF', role: 'CAM', tier: 'LEGEND', weight: 2, ovr: 89 },
  { name: '페데리코 발베르데', pos: 'MF', role: 'CM', tier: 'LEGEND', weight: 2, ovr: 89 },
  { name: '자말 무시알라', pos: 'MF', role: 'CAM', tier: 'LEGEND', weight: 2, ovr: 88 },
  { name: '플로리안 비르츠', pos: 'MF', role: 'CAM', tier: 'LEGEND', weight: 2, ovr: 88 },
  { name: '데클란 라이스', pos: 'MF', role: 'CDM', tier: 'LEGEND', weight: 2, ovr: 88 },
  // FW
  { name: '킬리안 음바페', pos: 'FW', role: 'ST', tier: 'LEGEND', weight: 2, ovr: 92 },
  { name: '엘링 홀란드', pos: 'FW', role: 'ST', tier: 'LEGEND', weight: 2, ovr: 92 },
  { name: '해리 케인', pos: 'FW', role: 'ST', tier: 'LEGEND', weight: 2, ovr: 91 },
  { name: '비니시우스 주니오르', pos: 'FW', role: 'LW', tier: 'LEGEND', weight: 2, ovr: 91 },
  { name: '손흥민', pos: 'FW', role: 'LW', tier: 'LEGEND', weight: 2, ovr: 90 },
  { name: '모하메드 살라', pos: 'FW', role: 'RW', tier: 'LEGEND', weight: 2, ovr: 90 },
  { name: '리오넬 메시', pos: 'FW', role: 'RW', tier: 'LEGEND', weight: 2, ovr: 90 },
  { name: '라우타로 마르티네스', pos: 'FW', role: 'ST', tier: 'LEGEND', weight: 2, ovr: 89 },
  { name: '부카요 사카', pos: 'FW', role: 'RW', tier: 'LEGEND', weight: 2, ovr: 88 },
  { name: '라민 야말', pos: 'FW', role: 'RW', tier: 'LEGEND', weight: 2, ovr: 87 },

  /* ============================== EPIC (OVR 77 ~ 84, drop_weight: 10) ============================== */
  // GK
  { name: '마이크 메냥', pos: 'GK', role: 'GK', tier: 'EPIC', weight: 10, ovr: 84 },
  { name: '에밀리아노 마르티네스', pos: 'GK', role: 'GK', tier: 'EPIC', weight: 10, ovr: 84 },
  { name: '다비드 라야', pos: 'GK', role: 'GK', tier: 'EPIC', weight: 10, ovr: 83 },
  { name: '굴리엘모 비카리오', pos: 'GK', role: 'GK', tier: 'EPIC', weight: 10, ovr: 82 },
  { name: '조현우', pos: 'GK', role: 'GK', tier: 'EPIC', weight: 10, ovr: 81 },
  // DF
  { name: '김민재', pos: 'DF', role: 'CB', tier: 'EPIC', weight: 10, ovr: 84 },
  { name: '요슈코 그바르디올', pos: 'DF', role: 'LB', tier: 'EPIC', weight: 10, ovr: 84 },
  { name: '가브리에우 마갈량이스', pos: 'DF', role: 'CB', tier: 'EPIC', weight: 10, ovr: 84 },
  { name: '크리스티안 로메로', pos: 'DF', role: 'CB', tier: 'EPIC', weight: 10, ovr: 84 },
  { name: '알레산드로 바스토니', pos: 'DF', role: 'CB', tier: 'EPIC', weight: 10, ovr: 84 },
  { name: '미키 판 더 펜', pos: 'DF', role: 'CB', tier: 'EPIC', weight: 10, ovr: 83 },
  { name: '쥘 쿤데', pos: 'DF', role: 'RB', tier: 'EPIC', weight: 10, ovr: 83 },
  { name: '알폰소 데이비스', pos: 'DF', role: 'LB', tier: 'EPIC', weight: 10, ovr: 82 },
  { name: '페드로 포로', pos: 'DF', role: 'RB', tier: 'EPIC', weight: 10, ovr: 82 },
  { name: '데스티니 우도기', pos: 'DF', role: 'LB', tier: 'EPIC', weight: 10, ovr: 81 },
  // MF
  { name: '브루노 페르난데스', pos: 'MF', role: 'CAM', tier: 'EPIC', weight: 10, ovr: 84 },
  { name: '콜 파머', pos: 'MF', role: 'CAM', tier: 'EPIC', weight: 10, ovr: 84 },
  { name: '페드리', pos: 'MF', role: 'CM', tier: 'EPIC', weight: 10, ovr: 84 },
  { name: '니콜로 바렐라', pos: 'MF', role: 'CM', tier: 'EPIC', weight: 10, ovr: 84 },
  { name: '알렉시스 맥 알리스터', pos: 'MF', role: 'CM', tier: 'EPIC', weight: 10, ovr: 83 },
  { name: '이강인', pos: 'MF', role: 'CAM', tier: 'EPIC', weight: 10, ovr: 83 },
  { name: '제임스 매디슨', pos: 'MF', role: 'CAM', tier: 'EPIC', weight: 10, ovr: 82 },
  { name: '도미니크 소보슬라이', pos: 'MF', role: 'CAM', tier: 'EPIC', weight: 10, ovr: 82 },
  { name: '비티냐', pos: 'MF', role: 'CM', tier: 'EPIC', weight: 10, ovr: 82 },
  { name: '모이세스 카이세도', pos: 'MF', role: 'CDM', tier: 'EPIC', weight: 10, ovr: 81 },
  { name: '프렝키 더 용', pos: 'MF', role: 'CM', tier: 'EPIC', weight: 10, ovr: 82 },
  { name: '미토마 가오루', pos: 'MF', role: 'LM', tier: 'EPIC', weight: 10, ovr: 80 },
  // FW
  { name: '필 포든', pos: 'FW', role: 'RW', tier: 'EPIC', weight: 10, ovr: 84 },
  { name: '알렉산데르 이삭', pos: 'FW', role: 'ST', tier: 'EPIC', weight: 10, ovr: 84 },
  { name: '호드리구', pos: 'FW', role: 'RW', tier: 'EPIC', weight: 10, ovr: 84 },
  { name: '하파엘 레앙', pos: 'FW', role: 'LW', tier: 'EPIC', weight: 10, ovr: 84 },
  { name: '데얀 쿨루셉스키', pos: 'FW', role: 'RW', tier: 'EPIC', weight: 10, ovr: 83 },
  { name: '니코 윌리엄스', pos: 'FW', role: 'LW', tier: 'EPIC', weight: 10, ovr: 83 },
  { name: '흐비차 크바라츠헬리아', pos: 'FW', role: 'LW', tier: 'EPIC', weight: 10, ovr: 83 },
  { name: '빅토르 요케레스', pos: 'FW', role: 'ST', tier: 'EPIC', weight: 10, ovr: 83 },
  { name: '황희찬', pos: 'FW', role: 'ST', tier: 'EPIC', weight: 10, ovr: 81 },
  { name: '루이스 수아레스', pos: 'FW', role: 'ST', tier: 'EPIC', weight: 10, ovr: 81 },
  { name: '크리스티아누 호날두', pos: 'FW', role: 'ST', tier: 'EPIC', weight: 10, ovr: 82 },
  { name: '쿠보 다케후사', pos: 'FW', role: 'RW', tier: 'EPIC', weight: 10, ovr: 80 },

  /* ============================== RARE (OVR 68 ~ 76, drop_weight: 35) ============================== */
  // GK
  { name: '조던 픽포드', pos: 'GK', role: 'GK', tier: 'RARE', weight: 35, ovr: 76 },
  { name: '베른트 레노', pos: 'GK', role: 'GK', tier: 'RARE', weight: 35, ovr: 75 },
  { name: '위고 요리스', pos: 'GK', role: 'GK', tier: 'RARE', weight: 35, ovr: 74 },
  { name: '김승규', pos: 'GK', role: 'GK', tier: 'RARE', weight: 35, ovr: 73 },
  { name: '송범근', pos: 'GK', role: 'GK', tier: 'RARE', weight: 35, ovr: 71 },
  // DF
  { name: '리산드로 마르티네스', pos: 'DF', role: 'CB', tier: 'RARE', weight: 35, ovr: 76 },
  { name: '마크 게히', pos: 'DF', role: 'CB', tier: 'RARE', weight: 35, ovr: 76 },
  { name: '안토니 로빈슨', pos: 'DF', role: 'LB', tier: 'RARE', weight: 35, ovr: 75 },
  { name: '디오구 달로트', pos: 'DF', role: 'RB', tier: 'RARE', weight: 35, ovr: 75 },
  { name: '이토 히로키', pos: 'DF', role: 'CB', tier: 'RARE', weight: 35, ovr: 74 },
  { name: '도미야스 다케히로', pos: 'DF', role: 'RB', tier: 'RARE', weight: 35, ovr: 74 },
  { name: '설영우', pos: 'DF', role: 'RB', tier: 'RARE', weight: 35, ovr: 74 },
  { name: '김영권', pos: 'DF', role: 'CB', tier: 'RARE', weight: 35, ovr: 73 },
  { name: '이한범', pos: 'DF', role: 'CB', tier: 'RARE', weight: 35, ovr: 71 },
  { name: '김지수', pos: 'DF', role: 'CB', tier: 'RARE', weight: 35, ovr: 70 },
  // MF
  { name: '코비 마이누', pos: 'MF', role: 'CM', tier: 'RARE', weight: 35, ovr: 76 },
  { name: '파페 사르', pos: 'MF', role: 'CM', tier: 'RARE', weight: 35, ovr: 76 },
  { name: '이재성', pos: 'MF', role: 'CAM', tier: 'RARE', weight: 35, ovr: 76 },
  { name: '황인범', pos: 'MF', role: 'CM', tier: 'RARE', weight: 35, ovr: 76 },
  { name: '홍현석', pos: 'MF', role: 'CAM', tier: 'RARE', weight: 35, ovr: 74 },
  { name: '배준호', pos: 'MF', role: 'LM', tier: 'RARE', weight: 35, ovr: 74 },
  { name: '백승호', pos: 'MF', role: 'CM', tier: 'RARE', weight: 35, ovr: 73 },
  { name: '정우영', pos: 'MF', role: 'CAM', tier: 'RARE', weight: 35, ovr: 74 },
  { name: '세징야', pos: 'MF', role: 'CAM', tier: 'RARE', weight: 35, ovr: 75 },
  { name: '제시 린가드', pos: 'MF', role: 'CAM', tier: 'RARE', weight: 35, ovr: 74 },
  { name: '이동경', pos: 'MF', role: 'CAM', tier: 'RARE', weight: 35, ovr: 73 },
  { name: '엔도 와타루', pos: 'MF', role: 'CDM', tier: 'RARE', weight: 35, ovr: 74 },
  // FW
  { name: '브라이언 음뵈모', pos: 'FW', role: 'RW', tier: 'RARE', weight: 35, ovr: 76 },
  { name: '마테우스 쿠냐', pos: 'FW', role: 'ST', tier: 'RARE', weight: 35, ovr: 76 },
  { name: '브레넌 존슨', pos: 'FW', role: 'RW', tier: 'RARE', weight: 35, ovr: 75 },
  { name: '조규성', pos: 'FW', role: 'ST', tier: 'RARE', weight: 35, ovr: 75 },
  { name: '오현규', pos: 'FW', role: 'ST', tier: 'RARE', weight: 35, ovr: 74 },
  { name: '엄지성', pos: 'FW', role: 'LW', tier: 'RARE', weight: 35, ovr: 73 },
  { name: '양민혁', pos: 'FW', role: 'RW', tier: 'RARE', weight: 35, ovr: 73 },
  { name: '주민규', pos: 'FW', role: 'ST', tier: 'RARE', weight: 35, ovr: 73 },
  { name: '이승우', pos: 'FW', role: 'LW', tier: 'RARE', weight: 35, ovr: 72 },
  { name: '정상빈', pos: 'FW', role: 'RW', tier: 'RARE', weight: 35, ovr: 71 },

  /* ============================== COMMON (OVR 58 ~ 67, drop_weight: 100 - 초기 지급용 실제 선수 풀) ============================== */
  // GK (5명)
  { name: '이창근', pos: 'GK', role: 'GK', tier: 'COMMON', weight: 100, ovr: 66 },
  { name: '김준홍', pos: 'GK', role: 'GK', tier: 'COMMON', weight: 100, ovr: 64 },
  { name: '백종범', pos: 'GK', role: 'GK', tier: 'COMMON', weight: 100, ovr: 63 },
  { name: '황인재', pos: 'GK', role: 'GK', tier: 'COMMON', weight: 100, ovr: 65 },
  { name: '김동준', pos: 'GK', role: 'GK', tier: 'COMMON', weight: 100, ovr: 64 },
  // DF (12명 - LB, CB, RB 골고루 포함하여 초기 구단 생성 시 모든 슬롯 매칭 보장)
  { name: '김진수', pos: 'DF', role: 'LB', tier: 'COMMON', weight: 100, ovr: 66 },
  { name: '이명재', pos: 'DF', role: 'LB', tier: 'COMMON', weight: 100, ovr: 65 },
  { name: '박규현', pos: 'DF', role: 'LB', tier: 'COMMON', weight: 100, ovr: 62 },
  { name: '최준', pos: 'DF', role: 'RB', tier: 'COMMON', weight: 100, ovr: 65 },
  { name: '황재원', pos: 'DF', role: 'RB', tier: 'COMMON', weight: 100, ovr: 66 },
  { name: '김문환', pos: 'DF', role: 'RB', tier: 'COMMON', weight: 100, ovr: 65 },
  { name: '권경원', pos: 'DF', role: 'CB', tier: 'COMMON', weight: 100, ovr: 66 },
  { name: '정승현', pos: 'DF', role: 'CB', tier: 'COMMON', weight: 100, ovr: 65 },
  { name: '박진섭', pos: 'DF', role: 'CB', tier: 'COMMON', weight: 100, ovr: 66 },
  { name: '김주성', pos: 'DF', role: 'CB', tier: 'COMMON', weight: 100, ovr: 65 },
  { name: '조유민', pos: 'DF', role: 'CB', tier: 'COMMON', weight: 100, ovr: 65 },
  { name: '변준수', pos: 'DF', role: 'CB', tier: 'COMMON', weight: 100, ovr: 62 },
  // MF (14명 - CM, CAM, CDM, LM, RM 전원 포함)
  { name: '기성용', pos: 'MF', role: 'CM', tier: 'COMMON', weight: 100, ovr: 66 },
  { name: '이청용', pos: 'MF', role: 'RM', tier: 'COMMON', weight: 100, ovr: 66 },
  { name: '정호연', pos: 'MF', role: 'CM', tier: 'COMMON', weight: 100, ovr: 66 },
  { name: '고승범', pos: 'MF', role: 'CM', tier: 'COMMON', weight: 100, ovr: 65 },
  { name: '박용우', pos: 'MF', role: 'CDM', tier: 'COMMON', weight: 100, ovr: 65 },
  { name: '원두재', pos: 'MF', role: 'CDM', tier: 'COMMON', weight: 100, ovr: 64 },
  { name: '권혁규', pos: 'MF', role: 'CDM', tier: 'COMMON', weight: 100, ovr: 64 },
  { name: '강상윤', pos: 'MF', role: 'CAM', tier: 'COMMON', weight: 100, ovr: 63 },
  { name: '김봉수', pos: 'MF', role: 'CDM', tier: 'COMMON', weight: 100, ovr: 64 },
  { name: '이순민', pos: 'MF', role: 'CM', tier: 'COMMON', weight: 100, ovr: 64 },
  { name: '오베르단', pos: 'MF', role: 'CM', tier: 'COMMON', weight: 100, ovr: 67 },
  { name: '보야니치', pos: 'MF', role: 'CAM', tier: 'COMMON', weight: 100, ovr: 67 },
  { name: '문선민', pos: 'MF', role: 'LM', tier: 'COMMON', weight: 100, ovr: 65 },
  { name: '나상호', pos: 'MF', role: 'RM', tier: 'COMMON', weight: 100, ovr: 65 },
  // FW (12명 - LW, ST, RW 전원 포함)
  { name: '엄원상', pos: 'FW', role: 'RW', tier: 'COMMON', weight: 100, ovr: 66 },
  { name: '정상기', pos: 'FW', role: 'RW', tier: 'COMMON', weight: 100, ovr: 63 },
  { name: '양현준', pos: 'FW', role: 'RW', tier: 'COMMON', weight: 100, ovr: 65 },
  { name: '송민규', pos: 'FW', role: 'LW', tier: 'COMMON', weight: 100, ovr: 65 },
  { name: '강현묵', pos: 'FW', role: 'LW', tier: 'COMMON', weight: 100, ovr: 62 },
  { name: '김대원', pos: 'FW', role: 'LW', tier: 'COMMON', weight: 100, ovr: 65 },
  { name: '오세훈', pos: 'FW', role: 'ST', tier: 'COMMON', weight: 100, ovr: 66 },
  { name: '이영준', pos: 'FW', role: 'ST', tier: 'COMMON', weight: 100, ovr: 64 },
  { name: '박재용', pos: 'FW', role: 'ST', tier: 'COMMON', weight: 100, ovr: 62 },
  { name: '일류첸코', pos: 'FW', role: 'ST', tier: 'COMMON', weight: 100, ovr: 67 },
  { name: '안데르송', pos: 'FW', role: 'LW', tier: 'COMMON', weight: 100, ovr: 67 },
  { name: '아사니', pos: 'FW', role: 'RW', tier: 'COMMON', weight: 100, ovr: 66 },
];

/**
 * player_master 시드 행을 실제 선수 카탈로그 기반으로 생성합니다.
 * @returns {Array<{name:string, main_position:string, preferred_role:string, drop_weight:number, base_stats:Object, tags:string[]}>}
 */
export function generatePlayerMasterRows() {
  return REAL_PLAYER_MASTER_CATALOG.map((item, idx) => ({
    name: item.name,
    main_position: item.pos,
    preferred_role: item.role,
    drop_weight: item.weight,
    base_stats: buildBaseStats(item.pos, item.ovr, idx + 1),
    tags: [item.tier],
  }));
}

/**
 * player_master 가 비어 있으면 실제 선수 시드를 삽입하고,
 * 기존에 가상 이름(72명)이 이미 들어가 있는 경우에도 ID를 유지한 채 실제 선수 이름과 능력치로 자동 마이그레이션합니다.
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} executor
 * @returns {Promise<number>} 삽입/갱신한 행 수
 */
export async function ensurePlayerMasterSeed(executor) {
  const rows = generatePlayerMasterRows();
  const [existingRows] = await executor.query('SELECT id, name FROM player_master ORDER BY id ASC');

  if (existingRows.length === 0) {
    for (const row of rows) {
      await executor.query(
        'INSERT INTO player_master (name, main_position, preferred_role, drop_weight, base_stats, tags) VALUES (?, ?, ?, ?, ?, ?)',
        [row.name, row.main_position, row.preferred_role, row.drop_weight, JSON.stringify(row.base_stats), JSON.stringify(row.tags)]
      );
    }
    return rows.length;
  }

  // 기존 DB에 예전 가짜 이름(예: 김태현 등)이 남아있는 경우 외래키(id)를 보존하며 실제 선수로 업데이트 및 부족분 추가 삽입
  let updatedCount = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (i < existingRows.length) {
      const targetId = existingRows[i].id;
      await executor.query(
        'UPDATE player_master SET name = ?, main_position = ?, preferred_role = ?, drop_weight = ?, base_stats = ?, tags = ? WHERE id = ?',
        [row.name, row.main_position, row.preferred_role, row.drop_weight, JSON.stringify(row.base_stats), JSON.stringify(row.tags), targetId]
      );
    } else {
      await executor.query(
        'INSERT INTO player_master (name, main_position, preferred_role, drop_weight, base_stats, tags) VALUES (?, ?, ?, ?, ?, ?)',
        [row.name, row.main_position, row.preferred_role, row.drop_weight, JSON.stringify(row.base_stats), JSON.stringify(row.tags)]
      );
    }
    updatedCount++;
  }
  return updatedCount;
}