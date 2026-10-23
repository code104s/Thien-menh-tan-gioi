import { gameData } from '@tmtg/game-data';
import { describe, expect, it } from 'vitest';
import { bandIndex, biomeHasTag, generateBiomes, percentileThresholds } from '../src/worldgen/terrain/biome.ts';
import { generateMoisture } from '../src/worldgen/terrain/climate.ts';
import { generateElevation, terrainRng } from '../src/worldgen/terrain/elevation.ts';
import { createHexGrid } from '../src/worldgen/terrain/hexGrid.ts';
import { generateHydrology, type HydrologyResult } from '../src/worldgen/terrain/hydrology.ts';
import { QI_MAX, QI_WATER, generateQi } from '../src/worldgen/terrain/qi.ts';

const params = gameData.balance.worldgen.terrain;
const grid = createHexGrid(params.width, params.height);
const idx = (id: string) => gameData.biomes.findIndex((b) => b.id === id);
const WATER = idx(params.waterBiomeId);
const FORBIDDEN = idx(params.forbiddenBiomeId);

interface Map { seed: string; hydro: HydrologyResult; moisture: Uint16Array; biome: Uint8Array; qi: Int16Array }

function build(seed: string): Map {
  const raw = generateElevation(grid, seed, terrainRng(seed), params);
  const hydro = generateHydrology(grid, seed, raw.elevation, params);
  const moisture = generateMoisture(grid, seed, hydro.water, hydro.river, params);
  const biome = generateBiomes(grid, seed, hydro, moisture, gameData);
  const qi = generateQi(grid, seed, hydro, biome, gameData);
  return { seed, hydro, moisture, biome, qi };
}

const maps = Array.from({ length: 100 }, (_, i) => build(`terrain-${String(i).padStart(3, '0')}`));

describe('bandIndex / percentileThresholds', () => {
  it('bandIndex đếm số ngưỡng ≤ giá trị', () => {
    expect([-5, 0, 9, 10, 19, 20, 99].map((v) => bandIndex(v, [10, 20]))).toEqual([0, 0, 0, 1, 1, 2, 2]);
    expect(bandIndex(5, [])).toBe(0);
  });

  it('percentileThresholds bỏ qua ô nước và chọn đúng phần tử', () => {
    const values = [100, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const water = Uint8Array.from([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(percentileThresholds(values, water, [2000, 5000, 9999])).toEqual([3, 6, 10]);
    expect(percentileThresholds([1, 2], Uint8Array.from([1, 1]), [5000])).toEqual([0]);
  });
});

describe('biome và địa khí W3 — 100 seed', () => {
  it('tất định', () => {
    for (const m of maps.slice(0, 10)) {
      const again = build(m.seed);
      expect(again.biome).toEqual(m.biome);
      expect(again.qi).toEqual(m.qi);
    }
  });

  it('ô nước ⇔ biome nước; ô đất luôn đi được', () => {
    const bad: string[] = [];
    for (const { seed, hydro, biome } of maps) {
      for (let i = 0; i < grid.cellCount; i++) {
        const isWater = hydro.water[i] === 1;
        if (isWater !== (biome[i] === WATER)) bad.push(`${seed} ô ${i}`);
        if (!isWater && gameData.biomes[biome[i]!]!.travelCost === 0) bad.push(`${seed} ô ${i} không đi được`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('núi chiếm 18–26 % diện tích đất, ổn định giữa các seed', () => {
    for (const { seed, hydro, biome } of maps) {
      let land = 0;
      let mountain = 0;
      for (let i = 0; i < grid.cellCount; i++) {
        if (hydro.water[i]) continue;
        land++;
        if (biomeHasTag(gameData, biome[i]!, 'mountain')) mountain++;
      }
      expect(mountain / land, seed).toBeGreaterThanOrEqual(0.18);
      expect(mountain / land, seed).toBeLessThanOrEqual(0.26);
    }
  });

  it('biome núi nằm ở dải độ cao trên cùng; mỗi biome đúng ô bảng tra', () => {
    const bad: string[] = [];
    for (const { seed, hydro, moisture, biome } of maps) {
      const eBands = percentileThresholds(hydro.elevation, hydro.water, params.elevationBandsBp);
      const mBands = percentileThresholds(moisture, hydro.water, params.moistureBandsBp);
      for (let i = 0; i < grid.cellCount; i++) {
        if (hydro.water[i]) continue;
        const expected = params.biomeMatrix[bandIndex(hydro.elevation[i]!, eBands)]![bandIndex(moisture[i]!, mBands)]!;
        const actual = gameData.biomes[biome[i]!]!.id;
        // Vùng cấm chỉ được thay biome nền nằm trong forbiddenOnBiomes.
        if (actual === params.forbiddenBiomeId) {
          if (!params.forbiddenOnBiomes.includes(expected)) bad.push(`${seed} ô ${i}: vùng cấm trên ${expected}`);
        } else if (actual !== expected) {
          bad.push(`${seed} ô ${i}: ${actual} ≠ ${expected}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('mọi seed có vùng cấm, nhưng không quá 15 % diện tích đất', () => {
    for (const { seed, hydro, biome } of maps) {
      let land = 0;
      let forbidden = 0;
      for (let i = 0; i < grid.cellCount; i++) {
        if (hydro.water[i]) continue;
        land++;
        if (biome[i] === FORBIDDEN) forbidden++;
      }
      expect(forbidden, seed).toBeGreaterThan(0);
      expect(forbidden / land, seed).toBeLessThanOrEqual(0.15);
    }
  });

  it('qi: biển = −1, đất trong [0, QI_MAX]', () => {
    const bad: string[] = [];
    for (const { seed, hydro, qi } of maps) {
      for (let i = 0; i < grid.cellCount; i++) {
        const v = qi[i]!;
        if (hydro.water[i] ? v !== QI_WATER : v < 0 || v > QI_MAX) bad.push(`${seed} ô ${i}: ${v}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('qi cao nhất pha trộn núi và hợp lưu sông (trung bình trên 100 seed)', () => {
    let mountainShare = 0;
    let riverShare = 0;
    for (const { hydro, biome, qi } of maps) {
      const top = Array.from({ length: grid.cellCount }, (_, i) => i)
        .sort((a, b) => qi[b]! - qi[a]! || a - b)
        .slice(0, 30);
      mountainShare += top.filter((i) => biomeHasTag(gameData, biome[i]!, 'mountain')).length / 30;
      riverShare += top.filter((i) => hydro.river[i]).length / 30;
    }
    expect(mountainShare / maps.length).toBeGreaterThanOrEqual(0.4);
    expect(riverShare / maps.length).toBeGreaterThanOrEqual(0.3);
  });
});
