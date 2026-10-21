const AXES = [
  { key: 'speed', label: '속도' },
  { key: 'shooting', label: '슈팅' },
  { key: 'passing', label: '패스' },
  { key: 'dribbling', label: '드리블' },
  { key: 'defense', label: '수비' },
  { key: 'physical', label: '피지컬' },
  { key: 'gkReflexes', label: 'GK 반응' },
  { key: 'staminaMax', label: '체력' },
];

/**
 * 선수 능력치 8축 레이더 차트(SVG).
 * 속도/슈팅/패스/드리블/수비/피지컬/GK 반응/최대 체력을 0~100 스케일로 그립니다.
 * @param {Object} props
 * @param {Object<string, number>} props.stats 실효 스탯(effectiveStats) 또는 기본 스탯
 * @param {Object<string, number>} [props.baseStats] staminaMax 를 읽을 기본 스탯
 * @param {number} [props.size=220] 차트 크기(px)
 * @returns {JSX.Element}
 */
export default function StatRadar({ stats, baseStats = null, size = 220 }) {
  const center = size / 2;
  const radius = size / 2 - 34;
  const values = AXES.map((a) => Math.max(0, Math.min(100, Number(a.key === 'staminaMax' ? (baseStats || stats).staminaMax ?? 0 : stats[a.key] ?? 0))));
  const pointAt = (index, ratio) => {
    const angle = (Math.PI * 2 * index) / AXES.length - Math.PI / 2;
    return [center + Math.cos(angle) * radius * ratio, center + Math.sin(angle) * radius * ratio];
  };
  const polygon = values.map((v, i) => pointAt(i, v / 100).join(',')).join(' ');

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="능력치 레이더 차트" data-testid="stat-radar">
      {[0.25, 0.5, 0.75, 1].map((ring) => (
        <polygon key={ring} points={AXES.map((_, i) => pointAt(i, ring).join(',')).join(' ')} fill="none" stroke="#334155" strokeWidth="1" />
      ))}
      {AXES.map((a, i) => {
        const [x, y] = pointAt(i, 1);
        const [lx, ly] = pointAt(i, 1.22);
        return (
          <g key={a.key}>
            <line x1={center} y1={center} x2={x} y2={y} stroke="#334155" strokeWidth="1" />
            <text x={lx} y={ly} fill="#94a3b8" fontSize="10" textAnchor="middle" dominantBaseline="middle">
              {a.label}
            </text>
          </g>
        );
      })}
      <polygon points={polygon} fill="rgba(59,130,246,0.35)" stroke="#60a5fa" strokeWidth="2" />
      {values.map((v, i) => {
        const [x, y] = pointAt(i, v / 100);
        return <circle key={AXES[i].key} cx={x} cy={y} r="3" fill="#93c5fd" />;
      })}
    </svg>
  );
}
