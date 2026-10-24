/**
 * Chia vùng (ADR-16): Dijkstra đa nguồn từ các ô neo, chi phí bước vào một ô = biome.travelCost
 * (biển không đi được). Ô hòa khoảng cách thuộc vùng nào tới trước theo thứ tự pop (dist, chỉ số ô) → tất định.
 */
import type { GameData } from '@tmtg/game-data';
import { CellHeap } from './heap.ts';
import { HEX_DIRECTIONS, type HexGrid } from './hexGrid.ts';

export interface RegionResult {
  /** Chỉ số site sở hữu ô; −1 = không tới được (biển, đảo). */
  cellLocation: Int16Array;
  /** Chi phí từ ô neo của vùng tới ô (không tính ô neo); −1 nếu không tới được. */
  cost: Int32Array;
}

export function assignRegions(grid: HexGrid, biome: Uint8Array, sites: readonly number[], data: GameData): RegionResult {
  const stepCost = data.biomes.map((b) => b.travelCost);
  const cellLocation = new Int16Array(grid.cellCount).fill(-1);
  const cost = new Int32Array(grid.cellCount).fill(-1);
  const done = new Uint8Array(grid.cellCount);
  const heap = new CellHeap();
  sites.forEach((cell, k) => {
    cellLocation[cell] = k;
    cost[cell] = 0;
    heap.push(0, cell);
  });
  while (heap.size > 0) {
    const c = heap.pop();
    if (done[c]) continue;
    done[c] = 1;
    const base = c * HEX_DIRECTIONS;
    for (let d = 0; d < HEX_DIRECTIONS; d++) {
      const n = grid.neighbor[base + d]!;
      if (n < 0 || done[n]) continue;
      const step = stepCost[biome[n]!]!;
      if (step <= 0) continue;
      const next = cost[c]! + step;
      if (cost[n] === -1 || next < cost[n]!) {
        cost[n] = next;
        cellLocation[n] = cellLocation[c]!;
        heap.push(next, n);
      }
    }
  }
  return { cellLocation, cost };
}
