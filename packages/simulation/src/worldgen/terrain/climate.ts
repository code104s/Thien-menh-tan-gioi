/**
 * Độ ẩm (ADR-16): fbm + thưởng theo khoảng cách tới biển/sông. Bỏ mô phỏng gió của mapgen4
 * vì cần lượng giác. Giá trị trong [0, MOISTURE_MAX].
 */
import { mulDiv } from '../../core/math.ts';
import { hexStepDistance, type TerrainParams } from './elevation.ts';
import { type HexGrid, cellPoint } from './hexGrid.ts';
import { NOISE_MAX, fbm, noiseSalt } from './noise.ts';

export const MOISTURE_MAX = 1000;

export function generateMoisture(
  grid: HexGrid,
  seed: string,
  water: Uint8Array,
  river: Uint8Array,
  params: TerrainParams,
): Uint16Array {
  const sources: number[] = [];
  for (let i = 0; i < grid.cellCount; i++) if (water[i] || river[i]) sources.push(i);
  const dist = hexStepDistance(grid, sources);
  const salt = noiseSalt(seed, 'moisture');
  const noise = { cellSize: params.moistureCellSize, octaves: 3 };
  // Phần noise chiếm (1000 − bonus tối đa) để tổng không vượt MOISTURE_MAX.
  const noiseShare = MOISTURE_MAX - params.moistureWaterBonus;
  const moisture = new Uint16Array(grid.cellCount);
  for (let i = 0; i < grid.cellCount; i++) {
    const [px, py] = cellPoint(grid, i);
    const base = mulDiv(fbm(salt, px, py, noise), noiseShare, NOISE_MAX);
    const steps = dist[i]!;
    const bonus = steps < 0 ? 0 : Math.max(0, params.moistureWaterBonus - steps * params.moistureWaterFalloff);
    moisture[i] = base + bonus;
  }
  return moisture;
}
