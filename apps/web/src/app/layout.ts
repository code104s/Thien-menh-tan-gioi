/**
 * Bố cục bản đồ (chỉ để hiển thị, không thuộc domain): lực đẩy-kéo tất định, 400 vòng,
 * vị trí ban đầu trên vòng tròn theo thứ tự ID. Kết quả chuẩn hóa về [0, 1].
 */
import type { LocationView } from '@tmtg/shared';

export type Layout = Record<string, { x: number; y: number }>;

export function computeLayout(locations: readonly LocationView[]): Layout {
  const ids = locations.map((l) => l.id);
  const n = ids.length;
  const pos = ids.map((_, i) => ({ x: Math.cos((2 * Math.PI * i) / n), y: Math.sin((2 * Math.PI * i) / n) }));
  const index = new Map(ids.map((id, i) => [id, i]));
  const edges: [number, number, number][] = [];
  for (const l of locations) {
    for (const e of l.edges) {
      const a = index.get(l.id)!;
      const b = index.get(e.to)!;
      if (a < b) edges.push([a, b, e.travelDays]);
    }
  }
  for (let iter = 0; iter < 400; iter++) {
    const step = 0.05 * (1 - iter / 400) + 0.002;
    const force = pos.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = pos[i]!.x - pos[j]!.x;
        const dy = pos[i]!.y - pos[j]!.y;
        const d2 = Math.max(dx * dx + dy * dy, 0.0004);
        const f = 0.02 / d2;
        force[i]!.x += dx * f; force[i]!.y += dy * f;
        force[j]!.x -= dx * f; force[j]!.y -= dy * f;
      }
    }
    for (const [a, b, days] of edges) {
      const dx = pos[b]!.x - pos[a]!.x;
      const dy = pos[b]!.y - pos[a]!.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
      const target = 0.25 + days * 0.02;
      const f = (d - target) * 0.5;
      force[a]!.x += (dx / d) * f; force[a]!.y += (dy / d) * f;
      force[b]!.x -= (dx / d) * f; force[b]!.y -= (dy / d) * f;
    }
    for (let i = 0; i < n; i++) {
      pos[i]!.x += Math.max(-1, Math.min(1, force[i]!.x)) * step;
      pos[i]!.y += Math.max(-1, Math.min(1, force[i]!.y)) * step;
    }
  }
  const xs = pos.map((p) => p.x);
  const ys = pos.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const layout: Layout = {};
  ids.forEach((id, i) => {
    layout[id] = {
      x: (pos[i]!.x - minX) / (maxX - minX || 1),
      y: (pos[i]!.y - minY) / (maxY - minY || 1),
    };
  });
  return layout;
}
