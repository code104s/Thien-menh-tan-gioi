/**
 * Độ cao thô (ADR-16): fbm − falloff rìa + long mạch (dãy núi).
 * Long mạch là các đường đi ngẫu nhiên trên lưới; độ cao cộng thêm giảm tuyến tính theo khoảng cách BFS tới long mạch.
 * Kết quả chưa lấp trũng — xem hydrology.ts.
 */
import type { BalanceData } from '@tmtg/game-data';
import { clamp, mulDiv } from '../../core/math.ts';
import { RngStream, createStreamState } from '../../core/rng.ts';
import {
  HEX_DIRECTIONS, HEX_UNITS_X, HEX_UNITS_Y, type HexGrid, cellPoint, isBorderCell,
} from './hexGrid.ts';
import { NOISE_MAX, fbm, noiseSalt } from './noise.ts';

export type TerrainParams = BalanceData['worldgen']['terrain'];

/** Biên độ cao lưu được trong Int16Array (chừa chỗ cho phần lấp trũng). */
export const ELEVATION_LIMIT = 16_000;

const NOISE_MID = (NOISE_MAX + 1) / 2;

/** Luồng RNG cục bộ của địa hình — không ghi vào WorldState.rng (ADR-16). */
export function terrainRng(seed: string): RngStream {
  return new RngStream(createStreamState(seed, 'worldgen:terrain'));
}

export interface ElevationResult {
  /** Độ cao thô, chưa lấp trũng. */
  elevation: Int16Array;
  /** Các ô thuộc long mạch, theo thứ tự sinh. */
  ridgeCells: number[];
  /** Số bước hex tới long mạch gần nhất; −1 nếu không có long mạch. */
  ridgeDistance: Int32Array;
}

/**
 * Sinh long mạch: mỗi dãy bắt đầu trong vùng giữa (bỏ 1/5 mỗi rìa), đi theo một hướng,
 * mỗi bước rẽ trái/phải với xác suất 1/4 mỗi bên, dừng khi chạm rìa hoặc đủ độ dài.
 */
export function generateRidges(grid: HexGrid, rng: RngStream, params: TerrainParams): number[] {
  const count = rng.nextRange(params.ridgeCount[0], params.ridgeCount[1]);
  const marginX = Math.floor(grid.width / 5);
  const marginY = Math.floor(grid.height / 5);
  const cells: number[] = [];
  const seen = new Uint8Array(grid.cellCount);
  for (let k = 0; k < count; k++) {
    const x = rng.nextRange(marginX, grid.width - 1 - marginX);
    const y = rng.nextRange(marginY, grid.height - 1 - marginY);
    let cell = y * grid.width + x;
    let dir = rng.nextInt(HEX_DIRECTIONS);
    const length = rng.nextRange(params.ridgeLength[0], params.ridgeLength[1]);
    for (let step = 0; step < length; step++) {
      if (!seen[cell]) {
        seen[cell] = 1;
        cells.push(cell);
      }
      const turn = rng.nextInt(4);
      if (turn === 0) dir = (dir + HEX_DIRECTIONS - 1) % HEX_DIRECTIONS;
      else if (turn === 3) dir = (dir + 1) % HEX_DIRECTIONS;
      const next = grid.neighbor[cell * HEX_DIRECTIONS + dir]!;
      if (next < 0 || isBorderCell(grid, next)) break;
      cell = next;
    }
  }
  return cells;
}

/** BFS đa nguồn theo số bước hex. */
export function hexStepDistance(grid: HexGrid, sources: readonly number[]): Int32Array {
  const dist = new Int32Array(grid.cellCount).fill(-1);
  const queue = new Int32Array(grid.cellCount);
  let tail = 0;
  for (const s of sources) {
    if (dist[s] === -1) {
      dist[s] = 0;
      queue[tail++] = s;
    }
  }
  for (let head = 0; head < tail; head++) {
    const c = queue[head]!;
    const base = c * HEX_DIRECTIONS;
    for (let d = 0; d < HEX_DIRECTIONS; d++) {
      const n = grid.neighbor[base + d]!;
      if (n >= 0 && dist[n] === -1) {
        dist[n] = dist[c]! + 1;
        queue[tail++] = n;
      }
    }
  }
  return dist;
}

export function generateElevation(grid: HexGrid, seed: string, rng: RngStream, params: TerrainParams): ElevationResult {
  const baseSalt = noiseSalt(seed, 'elevation');
  const ridgeSalt = noiseSalt(seed, 'ridge');
  const noise = { cellSize: params.noiseCellSize, octaves: params.octaves };
  const ridgeNoise = { cellSize: params.noiseCellSize, octaves: 2 };
  const ridgeCells = generateRidges(grid, rng, params);
  const ridgeDistance = hexStepDistance(grid, ridgeCells);
  // Bề rộng/cao toàn lưới theo tọa độ phẳng của cellPoint; tâm ở (spanX/2, spanY/2).
  const spanX = (grid.width - 1) * HEX_UNITS_X + HEX_UNITS_X / 2;
  const spanY = Math.max(1, (grid.height - 1) * HEX_UNITS_Y);
  const elevation = new Int16Array(grid.cellCount);
  for (let i = 0; i < grid.cellCount; i++) {
    const [px, py] = cellPoint(grid, i);
    const base = mulDiv(fbm(baseSalt, px, py, noise) - NOISE_MID, params.noiseAmplitude, NOISE_MID);
    // Khoảng cách elip chuẩn hóa: r² ∈ [0, 2·10⁶], rìa trục = 10⁶.
    const nx = mulDiv(2 * px - spanX, 1000, spanX);
    const ny = mulDiv(2 * py - spanY, 1000, spanY);
    const falloff = mulDiv(nx * nx + ny * ny, params.edgeFalloff, 1_000_000);
    let ridge = 0;
    const steps = ridgeDistance[i]!;
    if (steps >= 0) {
      const raw = params.ridgeHeight - steps * params.ridgeFalloffPerStep;
      // Điều biến bằng noise ∈ [0,5; 1,5) để sườn núi không đều.
      if (raw > 0) ridge = mulDiv(raw, NOISE_MID + fbm(ridgeSalt, px, py, ridgeNoise), NOISE_MAX + 1);
    }
    elevation[i] = clamp(base - falloff + ridge, -ELEVATION_LIMIT, ELEVATION_LIMIT);
  }
  // Dịch cả bản đồ để đúng ~landTargetBp số ô nằm trên mực nước biển (ổn định giữa các seed).
  const sorted = Int16Array.from(elevation).sort();
  const waterCells = clamp(grid.cellCount - mulDiv(grid.cellCount, params.landTargetBp, 10_000), 0, grid.cellCount - 1);
  const shift = params.seaLevel - sorted[waterCells]! + 1;
  for (let i = 0; i < grid.cellCount; i++) {
    elevation[i] = clamp(elevation[i]! + shift, -ELEVATION_LIMIT, ELEVATION_LIMIT);
  }
  return { elevation, ridgeCells, ridgeDistance };
}
