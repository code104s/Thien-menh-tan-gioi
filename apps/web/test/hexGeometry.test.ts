import { gameData } from '@tmtg/game-data';
import { createHexGrid } from '@tmtg/simulation';
import { describe, expect, it } from 'vitest';
import {
  EDGE_CORNERS, SQRT3, cellCenter, fitTransform, hexCorner, mapSize, pixelToCell, territoryBorders, zoomAround,
  type HexMap,
} from '../src/components/map/hexGeometry.ts';

const { width: cols, height: rows } = gameData.balance.worldgen.terrain;
const map: HexMap = { cols, rows, size: 10 };
const grid = createHexGrid(cols, rows);

describe('hình học hex odd-r khớp lưới simulation', () => {
  it('kích thước bản đồ và tâm ô đầu/cuối', () => {
    expect(mapSize(map)).toEqual({ width: SQRT3 * 10 * (cols + 0.5), height: 10 * (1.5 * (rows - 1) + 2) });
    expect(cellCenter(map, 0)).toEqual([SQRT3 * 5, 10]);
    const [x, y] = cellCenter(map, cols); // hàng 1 lệch phải nửa ô
    expect(x).toBeCloseTo(SQRT3 * 10);
    expect(y).toBeCloseTo(25);
  });

  it('pixelToCell(tâm ô) = ô; điểm gần các đỉnh vẫn thuộc ô đó', () => {
    for (let i = 0; i < grid.cellCount; i++) {
      const [cx, cy] = cellCenter(map, i);
      expect(pixelToCell(map, cx, cy)).toBe(i);
      for (let k = 0; k < 6; k++) {
        const [x, y] = hexCorner(cx, cy, map.size * 0.85, k);
        expect(pixelToCell(map, x, y)).toBe(i);
      }
    }
  });

  it('pixelToCell trả −1 ngoài lưới', () => {
    const { width, height } = mapSize(map);
    expect(pixelToCell(map, -20, -20)).toBe(-1);
    expect(pixelToCell(map, width + 30, height / 2)).toBe(-1);
    expect(pixelToCell(map, width / 2, height + 30)).toBe(-1);
  });

  it('EDGE_CORNERS: trung điểm cạnh d = trung điểm tâm ô và láng giềng hướng d của simulation', () => {
    for (let i = 0; i < grid.cellCount; i++) {
      const [cx, cy] = cellCenter(map, i);
      for (let d = 0; d < 6; d++) {
        const n = grid.neighbor[i * 6 + d]!;
        if (n < 0) continue;
        const [a, b] = EDGE_CORNERS[d]!;
        const [x1, y1] = hexCorner(cx, cy, map.size, a);
        const [x2, y2] = hexCorner(cx, cy, map.size, b);
        const [nx, ny] = cellCenter(map, n);
        expect((x1 + x2) / 2).toBeCloseTo((cx + nx) / 2, 6);
        expect((y1 + y2) / 2).toBeCloseTo((cy + ny) / 2, 6);
      }
    }
  });
});

describe('camera', () => {
  it('fitTransform: bản đồ nằm giữa khung khi zoom = 1', () => {
    const t = fitTransform(map, 1200, 800, 1, 0, 0);
    const { width, height } = mapSize(map);
    expect(t.offsetX * 2 + width * t.scale).toBeCloseTo(1200);
    expect(t.offsetY * 2 + height * t.scale).toBeCloseTo(800);
  });

  it('zoomAround giữ nguyên điểm thế giới dưới con trỏ', () => {
    const from = { zoom: 1.5, panX: 40, panY: -25 };
    const before = fitTransform(map, 1200, 800, from.zoom, from.panX, from.panY);
    const sx = 700;
    const sy = 310;
    const wx = (sx - before.offsetX) / before.scale;
    const wy = (sy - before.offsetY) / before.scale;
    const pan = zoomAround(map, 1200, 800, from, 3, sx, sy);
    const after = fitTransform(map, 1200, 800, 3, pan.panX, pan.panY);
    expect(wx * after.scale + after.offsetX).toBeCloseTo(sx);
    expect(wy * after.scale + after.offsetY).toBeCloseTo(sy);
  });
});

describe('territoryBorders', () => {
  it('chỉ cạnh giữa ô có chủ và ô khác chủ (hoặc rìa lưới)', () => {
    const small = createHexGrid(6, 4);
    const owners = new Int16Array(small.cellCount).fill(-1);
    // Tông 0 giữ cột 0–1, tông 1 giữ cột 2; còn lại vô chủ.
    for (let i = 0; i < small.cellCount; i++) {
      const x = i % 6;
      if (x <= 1) owners[i] = 0;
      else if (x === 2) owners[i] = 1;
    }
    const borders = territoryBorders(small.neighbor, owners);
    for (const [i, d] of borders) {
      const n = small.neighbor[i * 6 + d]!;
      expect(owners[i]).toBeGreaterThanOrEqual(0);
      expect(n < 0 || owners[n] !== owners[i]).toBe(true);
    }
    // Đủ: mọi cặp (ô có chủ, hướng) thỏa điều kiện đều có mặt.
    let expected = 0;
    for (let i = 0; i < small.cellCount; i++) {
      if (owners[i]! < 0) continue;
      for (let d = 0; d < 6; d++) {
        const n = small.neighbor[i * 6 + d]!;
        if (n < 0 || owners[n] !== owners[i]) expected++;
      }
    }
    expect(borders).toHaveLength(expected);
  });
});
