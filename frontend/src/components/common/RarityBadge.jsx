import { RARITY_META } from '../../constants/gameConfig.js';

/**
 * 선수 희귀도 뱃지.
 * @param {Object} props
 * @param {'LEGEND'|'EPIC'|'RARE'|'COMMON'} props.rarity
 * @returns {JSX.Element}
 */
export default function RarityBadge({ rarity }) {
  const meta = RARITY_META[rarity] || RARITY_META.COMMON;
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black tracking-wider ${meta.badge}`}>{meta.label}</span>;
}
