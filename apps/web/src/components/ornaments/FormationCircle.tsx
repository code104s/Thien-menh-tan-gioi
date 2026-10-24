/**
 * Trận pháp tu luyện (W7, ASSET_RESEARCH §7.3): SVG thủ tục, màu lấy từ token CSS nên tự đổi theo sáng/tối.
 * - Vòng ngoài: 8 quẻ bát quái, xoay chậm khi đang tu luyện/bế quan (tắt khi prefers-reduced-motion).
 * - Cung ngọc: tiến độ tầng hiện tại (progressPct).
 * - 4 nút: tiểu cảnh sơ/trung/hậu kỳ/viên mãn, tô tới stageIndex.
 * - Cung son bên trong: tỉ lệ đột phá (nếu đủ điều kiện).
 * Chỉ là cách trình bày khác của số liệu trong view model; con số vẫn hiện dạng chữ ở giữa và trong aria-label.
 */

const TRIGRAMS = ['☰', '☱', '☲', '☳', '☴', '☵', '☶', '☷'];
const STAGE_LABELS = ['Sơ kỳ', 'Trung kỳ', 'Hậu kỳ', 'Viên mãn'];
const C = 100;

export interface FormationCircleProps {
  realmName: string;
  stageIndex: number;
  /** 0..100 */
  progressPct: number;
  /** null = chưa đủ điều kiện đột phá. */
  breakthroughChancePct: number | null;
  /** Đang tu luyện hoặc bế quan → vòng quẻ xoay. */
  active: boolean;
}

function polar(radius: number, degrees: number): [number, number] {
  const a = (degrees * Math.PI) / 180;
  return [C + radius * Math.cos(a), C + radius * Math.sin(a)];
}

/** Thuộc tính stroke-dasharray để vẽ cung `pct`% của đường tròn bán kính `radius`. */
export function arcDash(radius: number, pct: number): string {
  const length = 2 * Math.PI * radius;
  const filled = (Math.max(0, Math.min(100, pct)) / 100) * length;
  return `${filled.toFixed(2)} ${length.toFixed(2)}`;
}

export function formationLabel(p: FormationCircleProps): string {
  const stage = STAGE_LABELS[p.stageIndex] ?? '';
  const chance = p.breakthroughChancePct === null ? 'chưa đủ điều kiện đột phá' : `tỉ lệ đột phá ${p.breakthroughChancePct}%`;
  return `Trận pháp tu luyện: ${p.realmName} ${stage.toLowerCase()}, tiến độ ${p.progressPct}%, ${chance}`;
}

export function FormationCircle(props: FormationCircleProps) {
  const { realmName, stageIndex, progressPct, breakthroughChancePct, active } = props;
  return (
    <figure className="formation">
      <svg viewBox="0 0 200 200" role="img" aria-label={formationLabel(props)}>
        <g className={active ? 'formation-spin' : undefined} aria-hidden="true">
          <circle cx={C} cy={C} r={88} fill="none" stroke="var(--gold)" strokeWidth={1} strokeDasharray="2 4" />
          {TRIGRAMS.map((t, k) => {
            const [x, y] = polar(88, k * 45 - 90);
            return (
              <text key={t} x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={17} fill="var(--gold)"
                stroke="var(--paper-2)" strokeWidth={4} paintOrder="stroke">{t}</text>
            );
          })}
        </g>
        <circle cx={C} cy={C} r={78} fill="none" stroke="var(--line)" strokeWidth={1} />
        {/* Cung tiến độ tầng hiện tại */}
        <circle cx={C} cy={C} r={68} fill="none" stroke="var(--line)" strokeWidth={8} />
        <circle cx={C} cy={C} r={68} fill="none" stroke="var(--jade, var(--accent))" strokeWidth={8} strokeLinecap="round"
          strokeDasharray={arcDash(68, progressPct)} transform={`rotate(-90 ${C} ${C})`} />
        {/* Nút tiểu cảnh */}
        {STAGE_LABELS.map((label, k) => {
          const [x, y] = polar(54, k * 90 - 90);
          const reached = k <= stageIndex;
          return (
            <circle key={label} cx={x} cy={y} r={5} strokeWidth={1.5} stroke="var(--jade, var(--accent))"
              fill={reached ? 'var(--jade, var(--accent))' : 'var(--paper-2)'} />
          );
        })}
        {/* Cung tỉ lệ đột phá */}
        {breakthroughChancePct !== null && (
          <circle cx={C} cy={C} r={44} fill="none" stroke="var(--accent)" strokeWidth={4} strokeLinecap="round"
            strokeDasharray={arcDash(44, breakthroughChancePct)} transform={`rotate(-90 ${C} ${C})`} opacity={0.85} />
        )}
        <text x={C} y={C - 8} textAnchor="middle" fontSize={12} fill="var(--ink-soft)">{realmName}</text>
        <text x={C} y={C + 14} textAnchor="middle" fontSize={24} fontWeight={700} fill="var(--ink)">{progressPct}%</text>
        <text x={C} y={C + 30} textAnchor="middle" fontSize={10} fill="var(--ink-soft)">{STAGE_LABELS[stageIndex] ?? ''}</text>
      </svg>
      <figcaption className="muted">
        {breakthroughChancePct !== null ? `Cung son: tỉ lệ đột phá ${breakthroughChancePct}%` : 'Chưa đủ điều kiện đột phá'}
      </figcaption>
    </figure>
  );
}
