import { gameData } from '@tmtg/game-data';
import { describe, expect, it } from 'vitest';
import { generateMoisture, MOISTURE_MAX } from '../src/worldgen/terrain/climate.ts';
import { generateElevation, terrainRng, type ElevationResult } from '../src/worldgen/terrain/elevation.ts';
import { createHexGrid, HEX_DIRECTIONS, isBorderCell } from '../src/worldgen/terrain/hexGrid.ts';
import { generateHydrology, type HydrologyResult } from '../src/worldgen/terrain/hydrology.ts';

const params = gameData.balance.worldgen.terrain;
const grid = createHexGrid(params.width, params.height);

interface Landform { seed: string; raw: ElevationResult; hydro: HydrologyResult; moisture: Uint16Array }

function landform(seed: string): Landform {
  const raw = generateElevation(grid, seed, terrainRng(seed), params);
  const hydro = generateHydrology(grid, seed, raw.elevation, params);
  const moisture = generateMoisture(grid, seed, hydro.water, hydro.river, params);
  return { seed, raw, hydro, moisture };
}

const SEEDS = Array.from({ length: 100 }, (_, i) => `terrain-${String(i).padStart(3, '0')}`);
const maps = SEEDS.map(landform);

function largestLandShare(h: HydrologyResult): number {
  const seen = new Uint8Array(grid.cellCount);
  let land = 0;
  let best = 0;
  for (let i = 0; i < grid.cellCount; i++) {
    if (h.water[i]) continue;
    land++;
    if (seen[i]) continue;
    let size = 0;
    const stack = [i];
    seen[i] = 1;
    while (stack.length > 0) {
      const c = stack.pop()!;
      size++;
      for (let d = 0; d < HEX_DIRECTIONS; d++) {
        const nb = grid.neighbor[c * HEX_DIRECTIONS + d]!;
        if (nb >= 0 && !seen[nb] && !h.water[nb]) {
          seen[nb] = 1;
          stack.push(nb);
        }
      }
    }
    best = Math.max(best, size);
  }
  return best / land;
}

describe('địa hình W2 — 100 seed (lưới 64×48)', () => {
  it('tham số mặc định đúng lưới MVP', () => {
    expect([params.width, params.height]).toEqual([64, 48]);
  });

  it('tất định: sinh lại cùng seed cho cùng mọi mảng', () => {
    for (const m of maps.slice(0, 10)) {
      const again = landform(m.seed);
      expect(again.raw.ridgeCells).toEqual(m.raw.ridgeCells);
      expect(again.hydro.elevation).toEqual(m.hydro.elevation);
      expect(again.hydro.downstream).toEqual(m.hydro.downstream);
      expect(again.hydro.flow).toEqual(m.hydro.flow);
      expect(again.moisture).toEqual(m.moisture);
    }
  });

  it('seed khác cho địa hình khác', () => {
    expect(maps[0]!.hydro.elevation).not.toEqual(maps[1]!.hydro.elevation);
  });

  it('tỉ lệ đất trong 55–75 % và khối đất lớn nhất ≥ 90 % diện tích đất', () => {
    for (const { seed, hydro } of maps) {
      let land = 0;
      for (let i = 0; i < grid.cellCount; i++) if (!hydro.water[i]) land++;
      const share = land / grid.cellCount;
      expect(share, seed).toBeGreaterThanOrEqual(0.55);
      expect(share, seed).toBeLessThanOrEqual(0.75);
      expect(largestLandShare(hydro), seed).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('số long mạch nằm trong ridgeCount, ô long mạch không ở rìa', () => {
    for (const { seed, raw } of maps) {
      expect(raw.ridgeCells.length, seed).toBeGreaterThanOrEqual(params.ridgeCount[0]);
      for (const c of raw.ridgeCells) expect(isBorderCell(grid, c), seed).toBe(false);
    }
  });

  it('không còn trũng nội địa: mỗi ô đất không ở rìa có láng giềng thấp hơn hẳn', () => {
    const bad: string[] = [];
    for (const { seed, hydro } of maps) {
      for (let i = 0; i < grid.cellCount; i++) {
        if (hydro.water[i] || isBorderCell(grid, i)) continue;
        let lower = false;
        for (let d = 0; d < HEX_DIRECTIONS; d++) {
          const nb = grid.neighbor[i * HEX_DIRECTIONS + d]!;
          if (nb >= 0 && hydro.elevation[nb]! < hydro.elevation[i]!) lower = true;
        }
        if (!lower) bad.push(`${seed} ô ${i}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('lấp trũng chỉ nâng, không hạ độ cao', () => {
    const bad: string[] = [];
    for (const { seed, raw, hydro } of maps) {
      for (let i = 0; i < grid.cellCount; i++) if (hydro.elevation[i]! < raw.elevation[i]!) bad.push(`${seed} ô ${i}`);
    }
    expect(bad).toEqual([]);
  });

  it('mọi ô đất chảy xuống dốc thật tới biển hoặc rìa lưới', () => {
    const bad: string[] = [];
    for (const { seed, hydro } of maps) {
      for (let i = 0; i < grid.cellCount; i++) {
        if (hydro.water[i]) {
          if (hydro.downstream[i] !== -1) bad.push(`${seed} biển ${i} có hạ lưu`);
          continue;
        }
        let c = i;
        for (let steps = 0; hydro.downstream[c]! >= 0; steps++) {
          const down = hydro.downstream[c]!;
          if (hydro.elevation[down]! >= hydro.elevation[c]!) bad.push(`${seed} ô ${c} chảy ngược dốc`);
          if (steps > grid.cellCount) throw new Error(`${seed}: vòng lặp dòng chảy tại ô ${i}`);
          c = down;
        }
        if (hydro.water[c] !== 1 && !isBorderCell(grid, c)) bad.push(`${seed} ô ${i} kết thúc ở ô ${c}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('lưu lượng bảo toàn: flow hạ lưu > flow thượng nguồn; có sông; sông chảy liền tới biển/rìa', () => {
    const bad: string[] = [];
    for (const { seed, hydro } of maps) {
      let rivers = 0;
      for (let i = 0; i < grid.cellCount; i++) {
        if (hydro.water[i]) {
          if (hydro.flow[i] !== 0) bad.push(`${seed} biển ${i} có flow`);
          continue;
        }
        if (hydro.flow[i]! < 1) bad.push(`${seed} ô ${i} flow < 1`);
        const down = hydro.downstream[i]!;
        const downIsLand = down >= 0 && !hydro.water[down];
        if (downIsLand && hydro.flow[down]! <= hydro.flow[i]!) bad.push(`${seed} ô ${i} flow không tăng`);
        if (hydro.river[i]) {
          rivers++;
          if (downIsLand && !hydro.river[down]) bad.push(`${seed} sông đứt tại ô ${i}`);
        }
      }
      if (rivers < 1) bad.push(`${seed} không có sông`);
    }
    expect(bad).toEqual([]);
  });

  it('độ ẩm trong [0, 1000]; ô ven nước ẩm hơn trung bình', () => {
    for (const { seed, hydro, moisture } of maps) {
      let all = 0;
      let wet = 0;
      let wetCount = 0;
      for (let i = 0; i < grid.cellCount; i++) {
        const m = moisture[i]!;
        if (m > MOISTURE_MAX) throw new Error(`${seed}: độ ẩm ${m} > ${MOISTURE_MAX} tại ô ${i}`);
        all += m;
        if (hydro.water[i] || hydro.river[i]) {
          wet += m;
          wetCount++;
        }
      }
      expect(wet / wetCount, seed).toBeGreaterThan(all / grid.cellCount);
    }
  });

  it('mọi giá trị là số nguyên an toàn', () => {
    for (const { hydro, moisture } of maps.slice(0, 5)) {
      for (const arr of [hydro.elevation, hydro.downstream, hydro.flow, moisture]) {
        expect(Array.from(arr).every((v) => Number.isSafeInteger(v))).toBe(true);
      }
    }
  });
});
