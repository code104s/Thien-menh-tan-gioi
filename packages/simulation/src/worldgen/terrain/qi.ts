/**
 * Địa khí (ADR-16): điểm "linh khí của đất" dùng để xếp hạng trụ sở và linh mạch ở W4.
 * qi = hạng độ cao trong các ô đất × qiElevationPoints + min(cap, flow × k) (hợp lưu) + thưởng núi + noise nhỏ;
 * biển = −1. Dùng hạng (phân vị) thay vì độ cao tuyệt đối để cán cân núi/sông ổn định giữa các seed.
 */
import type { GameData } from '@tmtg/game-data';
import { clamp, mulDiv } from '../../core/math.ts';
import { biomeHasTag } from './biome.ts';
import { type HexGrid, cellPoint } from './hexGrid.ts';
import type { HydrologyResult } from './hydrology.ts';
import { NOISE_MAX, fbm, noiseSalt } from './noise.ts';

export const QI_MAX = 0x7fff;
export const QI_WATER = -1;

export function generateQi(grid: HexGrid, seed: string, hydro: HydrologyResult, biome: Uint8Array, data: GameData): Int16Array {
  const params = data.balance.worldgen.terrain;
  const salt = noiseSalt(seed, 'qi');
  const noise = { cellSize: params.qiNoiseCellSize, octaves: 2 };
  const landHeights: number[] = [];
  for (let i = 0; i < grid.cellCount; i++) if (!hydro.water[i]) landHeights.push(hydro.elevation[i]!);
  landHeights.sort((a, b) => a - b);
  const qi = new Int16Array(grid.cellCount);
  for (let i = 0; i < grid.cellCount; i++) {
    if (hydro.water[i]) {
      qi[i] = QI_WATER;
      continue;
    }
    const [px, py] = cellPoint(grid, i);
    const height = mulDiv(lowerBound(landHeights, hydro.elevation[i]!), params.qiElevationPoints, landHeights.length);
    const confluence = Math.min(params.qiFlowCap, hydro.flow[i]! * params.qiFlowWeight);
    const mountain = biomeHasTag(data, biome[i]!, 'mountain') ? params.qiMountainBonus : 0;
    const jitter = mulDiv(fbm(salt, px, py, noise), params.qiNoiseAmplitude, NOISE_MAX);
    qi[i] = clamp(height + confluence + mountain + jitter, 0, QI_MAX);
  }
  return qi;
}

/** Số phần tử < value trong mảng đã sắp tăng. */
function lowerBound(sorted: readonly number[], value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
