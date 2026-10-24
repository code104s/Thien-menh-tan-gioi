/**
 * Hình học hex "pointy-top, odd-r" để vẽ TerrainModel (ADR-16). Chỉ dùng ở lớp hiển thị: số thực được phép.
 * Khớp lưới của simulation: ô i ↔ (col = i % cols, row = ⌊i / cols⌋), hàng lẻ lệch phải nửa ô,
 * hướng láng giềng theo thứ tự Đ, ĐB, TB, T, TN, ĐN (worldgen/terrain/hexGrid.ts).
 */

export const SQRT3 = Math.sqrt(3);

export interface HexMap {
  cols: number;
  rows: number;
  /** Bán kính ngoại tiếp một ô, theo đơn vị thế giới. */
  size: number;
}

/** Kích thước toàn bản đồ theo đơn vị thế giới. */
export function mapSize({ cols, rows, size }: HexMap): { width: number; height: number } {
  return { width: SQRT3 * size * (cols + 0.5), height: size * (1.5 * (rows - 1) + 2) };
}

export function cellCenter({ cols, size }: HexMap, i: number): [number, number] {
  const col = i % cols;
  const row = (i - col) / cols;
  return [SQRT3 * size * (col + 0.5 * (row & 1) + 0.5), size * (1 + 1.5 * row)];
}

/** Đỉnh k (0..5) của ô có tâm (cx, cy); góc 60k − 30 độ, trục y hướng xuống. */
export function hexCorner(cx: number, cy: number, size: number, k: number): [number, number] {
  const angle = (Math.PI / 180) * (60 * k - 30);
  return [cx + size * Math.cos(angle), cy + size * Math.sin(angle)];
}

/** Cặp đỉnh của cạnh chung với láng giềng theo hướng d (Đ, ĐB, TB, T, TN, ĐN). */
export const EDGE_CORNERS: readonly (readonly [number, number])[] = [[0, 1], [5, 0], [4, 5], [3, 4], [2, 3], [1, 2]];

/** Tọa độ thế giới → chỉ số ô, −1 nếu ngoài lưới. */
export function pixelToCell({ cols, rows, size }: HexMap, x: number, y: number): number {
  const px = x - (SQRT3 * size) / 2;
  const py = y - size;
  // Axial phân số (pointy-top) rồi làm tròn cube.
  const q = ((SQRT3 / 3) * px - py / 3) / size;
  const r = ((2 / 3) * py) / size;
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  const col = rq + (rr - (rr & 1)) / 2;
  const row = rr;
  if (col < 0 || row < 0 || col >= cols || row >= rows) return -1;
  return (row * cols + col) | 0; // | 0 bỏ -0 do Math.round
}

/** Ma trận biến đổi thế giới → màn hình: screen = world × scale + offset. */
export interface ViewTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** Biến đổi vừa khung (zoom = 1) rồi phóng quanh tâm, cộng phần kéo (pan, theo pixel màn hình). */
export function fitTransform(
  map: HexMap, viewWidth: number, viewHeight: number, zoom: number, panX: number, panY: number,
): ViewTransform {
  const { width, height } = mapSize(map);
  const scale = Math.min(viewWidth / width, viewHeight / height) * 0.98 * zoom;
  return {
    scale,
    offsetX: (viewWidth - width * scale) / 2 + panX,
    offsetY: (viewHeight - height * scale) / 2 + panY,
  };
}

/** Phóng to/thu nhỏ mà giữ nguyên điểm thế giới dưới con trỏ (sx, sy). Trả về pan mới. */
export function zoomAround(
  map: HexMap, viewWidth: number, viewHeight: number,
  from: { zoom: number; panX: number; panY: number }, toZoom: number, sx: number, sy: number,
): { panX: number; panY: number } {
  const before = fitTransform(map, viewWidth, viewHeight, from.zoom, from.panX, from.panY);
  const wx = (sx - before.offsetX) / before.scale;
  const wy = (sy - before.offsetY) / before.scale;
  const after = fitTransform(map, viewWidth, viewHeight, toZoom, 0, 0);
  return { panX: sx - wx * after.scale - after.offsetX, panY: sy - wy * after.scale - after.offsetY };
}

/**
 * Cạnh biên lãnh thổ: cặp (ô, hướng) mà chủ của ô khác chủ ô láng giềng.
 * `ownerOfCell[i]` là chỉ số tông môn (≥ 0) hoặc −1 (vô chủ / ngoài vùng). Chỉ trả cạnh của ô có chủ.
 */
export function territoryBorders(neighbor: Int32Array, ownerOfCell: Int16Array): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < ownerOfCell.length; i++) {
    const own = ownerOfCell[i]!;
    if (own < 0) continue;
    for (let d = 0; d < 6; d++) {
      const n = neighbor[i * 6 + d]!;
      if (n < 0 || ownerOfCell[n] !== own) out.push([i, d]);
    }
  }
  return out;
}
