/**
 * Chọn địa điểm trên địa hình (ADR-16, docs/08 › Quy tắc worldgen v2 mục 1):
 * chỉ trên khối đất liên thông lớn nhất, không trên ô vùng cấm, tham lam theo địa khí, cách nhau ≥ minSiteSpacing.
 */
import type { GameData } from '@tmtg/game-data';
import { DeterminismError } from '../../core/math.ts';
import { biomeHasTag } from './biome.ts';
import { HEX_DIRECTIONS, type HexGrid, hexDistance } from './hexGrid.ts';

export function isPassable(data: GameData, biome: number): boolean {
  return (data.biomes[biome]?.travelCost ?? 0) > 0;
}

/**
 * Mặt nạ khối đất (ô đi được) liên thông lớn nhất. Hòa kích thước → khối chứa ô có chỉ số nhỏ hơn
 * (khối được phát hiện trước khi quét theo chỉ số).
 */
export function largestLandMass(grid: HexGrid, biome: Uint8Array, data: GameData): Uint8Array {
  const component = new Int32Array(grid.cellCount).fill(-1);
  const queue = new Int32Array(grid.cellCount);
  let best = -1;
  let bestSize = 0;
  let next = 0;
  for (let start = 0; start < grid.cellCount; start++) {
    if (component[start] !== -1 || !isPassable(data, biome[start]!)) continue;
    const id = next++;
    component[start] = id;
    queue[0] = start;
    let tail = 1;
    for (let head = 0; head < tail; head++) {
      const base = queue[head]! * HEX_DIRECTIONS;
      for (let d = 0; d < HEX_DIRECTIONS; d++) {
        const n = grid.neighbor[base + d]!;
        if (n >= 0 && component[n] === -1 && isPassable(data, biome[n]!)) {
          component[n] = id;
          queue[tail++] = n;
        }
      }
    }
    if (tail > bestSize) {
      best = id;
      bestSize = tail;
    }
  }
  const mask = new Uint8Array(grid.cellCount);
  for (let i = 0; i < grid.cellCount; i++) if (component[i] === best && best >= 0) mask[i] = 1;
  return mask;
}

/** Dãy khoảng cách nới dần một cách tất định: s, ⌊s/2⌋, …, 1. */
export function relaxedSpacings(spacing: number): number[] {
  const out: number[] = [];
  for (let s = Math.max(1, spacing); s > 1; s = Math.floor(s / 2)) out.push(s);
  out.push(1);
  return out;
}

/**
 * Chọn `count` ô neo. Ứng viên sắp theo (qi giảm dần, chỉ số ô); lấy tham lam nếu cách mọi ô đã chọn
 * ≥ khoảng cách hiện tại; thiếu thì nới khoảng cách. Trả về các ô neo sắp tăng theo chỉ số (= thứ tự id địa điểm).
 */
export function selectSites(
  grid: HexGrid, biome: Uint8Array, qi: Int16Array, mass: Uint8Array, data: GameData, count: number,
): number[] {
  const candidates: number[] = [];
  for (let i = 0; i < grid.cellCount; i++) {
    if (mass[i] && !biomeHasTag(data, biome[i]!, 'forbidden')) candidates.push(i);
  }
  if (candidates.length < count) {
    throw new DeterminismError(`Khối đất chính chỉ có ${candidates.length} ô hợp lệ, cần ${count} địa điểm`);
  }
  candidates.sort((a, b) => qi[b]! - qi[a]! || a - b);
  const chosen: number[] = [];
  const taken = new Uint8Array(grid.cellCount);
  for (const spacing of relaxedSpacings(data.balance.worldgen.terrain.minSiteSpacing)) {
    for (const cell of candidates) {
      if (chosen.length === count) break;
      if (taken[cell]) continue;
      if (chosen.every((c) => hexDistance(grid, c, cell) >= spacing)) {
        chosen.push(cell);
        taken[cell] = 1;
      }
    }
  }
  return chosen.sort((a, b) => a - b);
}
