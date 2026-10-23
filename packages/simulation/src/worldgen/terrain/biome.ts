/**
 * Biome (ADR-16): bảng tra [dải độ cao][dải ẩm] → biome, lấy từ game-data; dải tính theo phân vị ô đất.
 * Vùng cấm là lớp phủ noise trên một số biome nền (chỉ ảnh hưởng chi phí đi lại trong MVP).
 */
import type { BiomeData, BiomeTag, GameData } from '@tmtg/game-data';
import { DeterminismError, mulDiv } from '../../core/math.ts';
import { type HexGrid, cellPoint } from './hexGrid.ts';
import type { HydrologyResult } from './hydrology.ts';
import { fbm, noiseSalt } from './noise.ts';

/** Số ngưỡng ≤ value, tức chỉ số dải chứa value (0..bands.length). */
export function bandIndex(value: number, bands: readonly number[]): number {
  let k = 0;
  while (k < bands.length && value >= bands[k]!) k++;
  return k;
}

/**
 * Ngưỡng thực tế từ phân vị (Bp) của `values` trên các ô đất: ngưỡng k = giá trị thứ floor(L × bp / 10000)
 * trong dãy đã sắp. Giữ tỉ lệ biome ổn định giữa các seed dù biên độ địa hình khác nhau.
 */
export function percentileThresholds(
  values: ArrayLike<number>,
  water: Uint8Array,
  bandsBp: readonly number[],
): number[] {
  const land: number[] = [];
  for (let i = 0; i < values.length; i++) if (!water[i]) land.push(values[i]!);
  if (land.length === 0) return bandsBp.map(() => 0);
  land.sort((a, b) => a - b);
  return bandsBp.map((bp) => land[Math.min(land.length - 1, mulDiv(land.length, bp, 10_000))]!);
}

function indexOfBiome(biomes: readonly BiomeData[], id: string): number {
  const i = biomes.findIndex((b) => b.id === id);
  if (i < 0) throw new DeterminismError(`Biome không tồn tại: ${id}`);
  return i;
}

export function biomeHasTag(data: GameData, biome: number, tag: BiomeTag): boolean {
  return data.biomes[biome]?.tags.includes(tag) ?? false;
}

/** Biome của mỗi ô, giá trị là chỉ số trong `data.biomes`. */
export function generateBiomes(
  grid: HexGrid,
  seed: string,
  hydro: HydrologyResult,
  moisture: Uint16Array,
  data: GameData,
): Uint8Array {
  const params = data.balance.worldgen.terrain;
  const water = indexOfBiome(data.biomes, params.waterBiomeId);
  const forbidden = indexOfBiome(data.biomes, params.forbiddenBiomeId);
  const matrix = params.biomeMatrix.map((row) => row.map((id) => indexOfBiome(data.biomes, id)));
  const forbiddenOn = new Set(params.forbiddenOnBiomes.map((id) => indexOfBiome(data.biomes, id)));
  const salt = noiseSalt(seed, 'forbidden');
  const noise = { cellSize: params.forbiddenNoiseCellSize, octaves: 3 };
  const elevationBands = percentileThresholds(hydro.elevation, hydro.water, params.elevationBandsBp);
  const moistureBands = percentileThresholds(moisture, hydro.water, params.moistureBandsBp);
  const biome = new Uint8Array(grid.cellCount);
  for (let i = 0; i < grid.cellCount; i++) {
    if (hydro.water[i]) {
      biome[i] = water;
      continue;
    }
    const row = matrix[bandIndex(hydro.elevation[i]!, elevationBands)]!;
    let b = row[bandIndex(moisture[i]!, moistureBands)]!;
    if (forbiddenOn.has(b)) {
      const [px, py] = cellPoint(grid, i);
      if (fbm(salt, px, py, noise) >= params.forbiddenThreshold) b = forbidden;
    }
    biome[i] = b;
  }
  return biome;
}
