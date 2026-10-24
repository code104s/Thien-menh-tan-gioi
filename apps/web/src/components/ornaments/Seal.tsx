/** Ấn triện son "天命" cạnh tiêu đề (W7, chỉ trang trí: aria-hidden). Chữ Hán là hình, không phải nội dung. */
export function Seal({ size = 52 }: { size?: number }) {
  return (
    <svg className="seal" width={size} height={size} viewBox="0 0 60 60" aria-hidden="true">
      <rect x="3" y="3" width="54" height="54" rx="6" fill="var(--accent)" />
      <rect x="8" y="8" width="44" height="44" rx="3" fill="none" stroke="var(--paper-2)" strokeWidth="2" />
      <text x="30" y="27" textAnchor="middle" fontSize="18" fontWeight="700" fill="var(--paper-2)">天</text>
      <text x="30" y="47" textAnchor="middle" fontSize="18" fontWeight="700" fill="var(--paper-2)">命</text>
    </svg>
  );
}
