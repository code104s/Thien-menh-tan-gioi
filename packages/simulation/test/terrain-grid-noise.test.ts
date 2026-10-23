import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DeterminismError } from '../src/core/math.ts';
import {
  HEX_DIRECTIONS, cellIndex, cellPoint, cellX, cellY, createHexGrid, hexDistance, isBorderCell, neighborsOf,
  toCube,
} from '../src/worldgen/terrain/hexGrid.ts';
import { MAX_OCTAVES, NOISE_MAX, fbm, hash2, noiseSalt, valueNoise } from '../src/worldgen/terrain/noise.ts';

// Lưới MVP theo ADR-16.
const W = 64;
const H = 48;
const grid = createHexGrid(W, H);

function bfsDistances(source: number): Int32Array {
  const dist = new Int32Array(grid.cellCount).fill(-1);
  const queue = [source];
  dist[source] = 0;
  const out: number[] = [];
  for (let k = 0; k < queue.length; k++) {
    const c = queue[k]!;
    const n = neighborsOf(grid, c, out);
    for (let j = 0; j < n; j++) {
      const nb = out[j]!;
      if (dist[nb] === -1) {
        dist[nb] = dist[c]! + 1;
        queue.push(nb);
      }
    }
  }
  return dist;
}

describe('hexGrid odd-r', () => {
  it('kích thước và chỉ số ô khứ hồi', () => {
    expect(grid.cellCount).toBe(3072);
    expect(grid.neighbor.length).toBe(3072 * HEX_DIRECTIONS);
    for (let i = 0; i < grid.cellCount; i++) {
      expect(cellIndex(grid, cellX(grid, i), cellY(grid, i))).toBe(i);
    }
  });

  it('từ chối kích thước và tọa độ không hợp lệ', () => {
    expect(() => createHexGrid(0, 10)).toThrow(DeterminismError);
    expect(() => createHexGrid(4.5, 10)).toThrow(DeterminismError);
    expect(() => cellIndex(grid, W, 0)).toThrow(DeterminismError);
    expect(() => cellIndex(grid, 0, -1)).toThrow(DeterminismError);
  });

  it('láng giềng ở góc, rìa và bên trong', () => {
    const out: number[] = [];
    // Hàng chẵn: cột 0 thiếu T, TB, TN; hàng lẻ lệch phải nên cột 0 chỉ thiếu T.
    expect(neighborsOf(grid, cellIndex(grid, 0, 0), out)).toBe(2);
    expect(neighborsOf(grid, cellIndex(grid, 0, 1), out)).toBe(5);
    expect(neighborsOf(grid, cellIndex(grid, W - 1, 1), out)).toBe(3);
    expect(neighborsOf(grid, cellIndex(grid, 10, 10), out)).toBe(6);
    // Thứ tự hướng cố định Đ, ĐB, TB, T, TN, ĐN.
    neighborsOf(grid, cellIndex(grid, 10, 10), out);
    expect(out.slice(0, 6).map((n) => [cellX(grid, n), cellY(grid, n)])).toEqual([
      [11, 10], [10, 9], [9, 9], [9, 10], [9, 11], [10, 11],
    ]);
    neighborsOf(grid, cellIndex(grid, 10, 11), out);
    expect(out.slice(0, 6).map((n) => [cellX(grid, n), cellY(grid, n)])).toEqual([
      [11, 11], [11, 10], [10, 10], [9, 11], [10, 12], [11, 12],
    ]);
  });

  it('chỉ ô bên trong có đủ 6 láng giềng; isBorderCell khớp', () => {
    let full = 0;
    const out: number[] = [];
    for (let i = 0; i < grid.cellCount; i++) {
      const n = neighborsOf(grid, i, out);
      if (n === 6) full++;
      expect(isBorderCell(grid, i)).toBe(n < 6);
    }
    expect(full).toBe((W - 2) * (H - 2));
  });

  it('quan hệ láng giềng đối xứng, không trùng, mỗi láng giềng cách đúng 1', () => {
    const out: number[] = [];
    const back: number[] = [];
    for (let i = 0; i < grid.cellCount; i++) {
      const n = neighborsOf(grid, i, out);
      expect(new Set(out.slice(0, n)).size).toBe(n);
      for (let j = 0; j < n; j++) {
        const nb = out[j]!;
        expect(hexDistance(grid, i, nb)).toBe(1);
        const m = neighborsOf(grid, nb, back);
        expect(back.slice(0, m)).toContain(i);
      }
    }
  });

  it('toCube thỏa q + r + s = 0', () => {
    for (let i = 0; i < grid.cellCount; i++) {
      const [q, r, s] = toCube(grid, i);
      expect(q + r + s).toBe(0);
    }
  });

  it('hexDistance trùng khoảng cách BFS trên lưới', () => {
    for (const source of [0, cellIndex(grid, 31, 23), cellIndex(grid, W - 1, H - 1), cellIndex(grid, 5, 40)]) {
      const dist = bfsDistances(source);
      for (let i = 0; i < grid.cellCount; i++) expect(hexDistance(grid, source, i)).toBe(dist[i]);
    }
  });

  it('hexDistance là metric (đối xứng, bất đẳng thức tam giác)', () => {
    const cell = fc.integer({ min: 0, max: grid.cellCount - 1 });
    fc.assert(fc.property(cell, cell, cell, (a, b, c) => {
      const ab = hexDistance(grid, a, b);
      expect(ab).toBe(hexDistance(grid, b, a));
      expect(ab === 0).toBe(a === b);
      expect(hexDistance(grid, a, c)).toBeLessThanOrEqual(ab + hexDistance(grid, b, c));
    }));
  });

  it('cellPoint: hàng lẻ lệch nửa ô, mọi tọa độ là số nguyên', () => {
    expect(cellPoint(grid, cellIndex(grid, 0, 0))).toEqual([0, 0]);
    expect(cellPoint(grid, cellIndex(grid, 0, 1))).toEqual([4, 7]);
    expect(cellPoint(grid, cellIndex(grid, 3, 2))).toEqual([24, 14]);
    for (let i = 0; i < grid.cellCount; i++) {
      const [px, py] = cellPoint(grid, i);
      expect(Number.isSafeInteger(px) && Number.isSafeInteger(py)).toBe(true);
    }
  });
});

describe('noise số nguyên', () => {
  const salt = noiseSalt('thien-khuyet-01', 'elevation');

  it('vector cố định (chống hồi quy)', () => {
    expect(salt).toMatchInlineSnapshot(`3893457741`);
    expect([hash2(salt, 0, 0), hash2(salt, 1, 0), hash2(salt, -7, 13), hash2(0, 0, 0)]).toMatchInlineSnapshot(`
      [
        6166,
        1301,
        62034,
        0,
      ]
    `);
    expect([valueNoise(salt, 0, 0), valueNoise(salt, 128, 64), valueNoise(salt, -300, 999)]).toMatchInlineSnapshot(`
      [
        6166,
        7829,
        36955,
      ]
    `);
    expect([0, 100, 2000].map((i) => fbm(salt, ...cellPoint(grid, i), { cellSize: 96, octaves: 4 })))
      .toMatchInlineSnapshot(`
        [
          35441,
          45898,
          38559,
        ]
      `);
  });

  it('salt khác nhau theo seed và theo lớp', () => {
    expect(noiseSalt('a', 'elevation')).not.toBe(noiseSalt('b', 'elevation'));
    expect(noiseSalt('a', 'elevation')).not.toBe(noiseSalt('a', 'moisture'));
    expect(noiseSalt('a', 'elevation')).toBe(noiseSalt('a', 'elevation'));
  });

  it('hash2 trong [0, 65535] và gần đều', () => {
    const buckets = new Array<number>(16).fill(0);
    const n = 64_000;
    for (let i = 0; i < n; i++) {
      const v = hash2(salt, i % 400 - 200, Math.floor(i / 400) - 80);
      expect(Number.isSafeInteger(v) && v >= 0 && v <= NOISE_MAX).toBe(true);
      buckets[v >> 12]!++;
    }
    for (const count of buckets) expect(Math.abs(count - n / 16)).toBeLessThan(n / 16 * 0.08);
  });

  it('valueNoise bằng hash2 tại điểm lattice và nằm giữa 4 góc', () => {
    fc.assert(fc.property(fc.integer({ min: -5000, max: 5000 }), fc.integer({ min: -5000, max: 5000 }), (fx, fy) => {
      const x0 = fx >> 8;
      const y0 = fy >> 8;
      const corners = [hash2(salt, x0, y0), hash2(salt, x0 + 1, y0), hash2(salt, x0, y0 + 1), hash2(salt, x0 + 1, y0 + 1)];
      const v = valueNoise(salt, fx, fy);
      expect(Number.isSafeInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(Math.min(...corners) - 1);
      expect(v).toBeLessThanOrEqual(Math.max(...corners));
      expect(valueNoise(salt, x0 * 256, y0 * 256)).toBe(corners[0]);
    }));
  });

  it('valueNoise liên tục: bước 1/256 ô thay đổi có giới hạn', () => {
    for (let fx = -1024; fx < 1024; fx++) {
      // Độ dốc smoothstep tối đa 1,5 → |Δ| ≤ 1,5 × 65535 / 256 ≈ 384 (+ làm tròn).
      expect(Math.abs(valueNoise(salt, fx + 1, 300) - valueNoise(salt, fx, 300))).toBeLessThanOrEqual(400);
    }
  });

  it('fbm trong [0, 65535], tất định, đủ biến thiên trên lưới 64×48', () => {
    const params = { cellSize: 96, octaves: 4 };
    let min = NOISE_MAX;
    let max = 0;
    for (let i = 0; i < grid.cellCount; i++) {
      const [px, py] = cellPoint(grid, i);
      const v = fbm(salt, px, py, params);
      expect(Number.isSafeInteger(v) && v >= 0 && v <= NOISE_MAX).toBe(true);
      expect(fbm(salt, px, py, params)).toBe(v);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(max - min).toBeGreaterThan(NOISE_MAX / 3);
  });

  it('fbm 1 tầng = valueNoise tại tọa độ quy đổi', () => {
    expect(fbm(salt, 50, 70, { cellSize: 100, octaves: 1 })).toBe(valueNoise((salt ^ 0x9e3779b9) >>> 0, 128, 179));
  });

  it('fbm từ chối tham số không hợp lệ và tọa độ tràn int32', () => {
    expect(() => fbm(salt, 0, 0, { cellSize: 0, octaves: 4 })).toThrow(DeterminismError);
    expect(() => fbm(salt, 0, 0, { cellSize: 10, octaves: 0 })).toThrow(DeterminismError);
    expect(() => fbm(salt, 0, 0, { cellSize: 10, octaves: MAX_OCTAVES + 1 })).toThrow(DeterminismError);
    expect(() => fbm(salt, 2_000_000_000, 0, { cellSize: 1, octaves: 2 })).toThrow(DeterminismError);
  });
});
