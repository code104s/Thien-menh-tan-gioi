/**
 * W7: giao diện trang trí "Ngọc Các". Kiểm tra token màu trong styles.css đạt WCAG 2.1 AA (chữ thường ≥ 4,5:1),
 * chuyển động tôn trọng prefers-reduced-motion, khung border-image tồn tại, và trận pháp SVG mô tả đúng số liệu.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FormationCircle, arcDash, formationLabel } from '../src/components/ornaments/FormationCircle.tsx';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const css = read('../src/styles.css');
const frameLight = read('../src/assets/frame-jade.svg');
const frameDark = read('../src/assets/frame-jade-dark.svg');

/** Token của bảng màu đánh dấu bằng comment `/* palette:<name> *\/` ngay trước khối. */
function palette(name: string): Record<string, string> {
  const at = css.indexOf(`/* palette:${name} */`);
  expect(at, `thiếu palette ${name}`).toBeGreaterThanOrEqual(0);
  const body = css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
  return Object.fromEntries([...body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1]!, m[2]!]));
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Cặp [chữ, nền] dùng trong giao diện. Màu nền kế thừa từ bảng sáng/tối tương ứng nếu bảng không định nghĩa. */
const TEXT_PAIRS: [string, string][] = [
  ['ink', 'paper'], ['ink', 'paper-2'], ['ink-soft', 'paper'], ['ink-soft', 'paper-2'],
  ['critical', 'paper'], ['critical', 'paper-2'], ['important', 'paper'], ['important', 'paper-2'],
  ['jade', 'paper'], ['jade', 'paper-2'], ['paper-2', 'jade'],
];

describe('độ tương phản WCAG AA', () => {
  it('công thức đúng với giá trị chuẩn', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });

  it.each(['plain-light', 'plain-dark', 'jade-light', 'jade-dark'])('bảng %s: mọi cặp chữ/nền ≥ 4,5:1', (name) => {
    const base = name.endsWith('dark') ? { ...palette('plain-light'), ...palette('plain-dark') } : palette('plain-light');
    const tokens = name.startsWith('jade')
      ? { ...base, ...palette('jade-light'), ...(name === 'jade-dark' ? palette('jade-dark') : {}) }
      : base;
    const failures: string[] = [];
    for (const [fg, bg] of TEXT_PAIRS) {
      if (!tokens[fg] || !tokens[bg]) continue; // bảng tối giản không có --jade
      const ratio = contrast(tokens[fg]!, tokens[bg]!);
      if (ratio < 4.5) failures.push(`${fg} trên ${bg}: ${ratio.toFixed(2)}`);
    }
    // Nút chính: chữ --on-accent trên nền son.
    const onAccent = tokens['on-accent'];
    expect(onAccent, 'thiếu --on-accent').toBeDefined();
    if (contrast(onAccent!, tokens['accent']!) < 4.5) failures.push(`on-accent trên accent: ${contrast(onAccent!, tokens['accent']!).toFixed(2)}`);
    // Banner lỗi: cùng màu chữ trên nền --critical.
    if (contrast(onAccent!, tokens['critical']!) < 4.5) failures.push(`on-accent trên critical: ${contrast(onAccent!, tokens['critical']!).toFixed(2)}`);
    expect(failures).toEqual([]);
  });
});

describe('chuyển động và khung', () => {
  it('trận pháp xoay bị tắt khi prefers-reduced-motion', () => {
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(block).toMatch(/\.formation-spin\s*\{\s*animation:\s*none/);
  });

  it('trang trí chỉ áp dụng dưới [data-ornate="on"] và hai khung SVG tồn tại', () => {
    expect(css).toMatch(/\[data-ornate="on"\] \.card \{[^}]*border-image: var\(--frame\)/);
    for (const file of ['frame-jade.svg', 'frame-jade-dark.svg']) expect(css).toContain(`./assets/${file}`);
    // Màu khung khớp token ngọc/vàng của bảng sáng và tối.
    expect(frameLight).toContain(palette('jade-light')['jade']);
    expect(frameLight).toContain(palette('jade-light')['gold']);
    expect(frameDark).toContain(palette('jade-dark')['jade']);
    expect(frameDark).toContain(palette('jade-dark')['gold']);
  });
});

describe('trận pháp tu luyện', () => {
  const props = { realmName: 'Luyện Khí', stageIndex: 2, progressPct: 78, breakthroughChancePct: 40, active: true };

  it('arcDash tô đúng phần trăm chu vi, kẹp 0..100', () => {
    const length = 2 * Math.PI * 10;
    expect(arcDash(10, 50)).toBe(`${(length / 2).toFixed(2)} ${length.toFixed(2)}`);
    expect(arcDash(10, 150)).toBe(`${length.toFixed(2)} ${length.toFixed(2)}`);
    expect(arcDash(10, -5)).toBe(`0.00 ${length.toFixed(2)}`);
  });

  it('nhãn truy cập nêu đủ cảnh giới, tiến độ, tỉ lệ đột phá', () => {
    expect(formationLabel(props)).toBe('Trận pháp tu luyện: Luyện Khí hậu kỳ, tiến độ 78%, tỉ lệ đột phá 40%');
    expect(formationLabel({ ...props, breakthroughChancePct: null })).toContain('chưa đủ điều kiện đột phá');
  });

  it('SVG: vòng quẻ chỉ xoay khi đang tu luyện; cung đột phá chỉ có khi đủ điều kiện; tô 3 nút tiểu cảnh', () => {
    const html = renderToStaticMarkup(createElement(FormationCircle, props));
    expect(html).toContain('class="formation-spin"');
    expect(html).toContain('78%');
    expect(html).toContain(arcDash(68, 78));
    expect(html).toContain(arcDash(44, 40));
    expect(html.match(/fill="var\(--jade, var\(--accent\)\)"/g)).toHaveLength(3);
    const idle = renderToStaticMarkup(createElement(FormationCircle, { ...props, active: false, breakthroughChancePct: null }));
    expect(idle).not.toContain('formation-spin');
    expect(idle).not.toContain('stroke="var(--accent)"');
  });
});
