/**
 * Đồ thị địa điểm từ vùng (ADR-16, docs/08 › Quy tắc worldgen v2 mục 2):
 * cạnh ứng viên = cặp vùng kề nhau; chọn MST (Kruskal, tie-break (cost, a, b)) + `extraEdges` cạnh rẻ nhất còn lại.
 * travelDays = clamp(⌊cost / travelCostPerDay⌋, travelDays[0], travelDays[1]).
 */
import type { GameData } from '@tmtg/game-data';
import { DeterminismError, clamp, divFloor } from '../../core/math.ts';
import { HEX_DIRECTIONS, type HexGrid } from './hexGrid.ts';
import type { RegionResult } from './regions.ts';
import type { SiteEdge } from './types.ts';

/** Mọi cặp vùng kề nhau với chi phí min(cost[u] + cost[v]) trên các cặp ô biên, sắp theo (cost, a, b). */
export function regionAdjacency(grid: HexGrid, regions: RegionResult, siteCount: number): Omit<SiteEdge, 'travelDays'>[] {
  const best = new Map<number, number>();
  const { cellLocation, cost } = regions;
  for (let u = 0; u < grid.cellCount; u++) {
    const ru = cellLocation[u]!;
    if (ru < 0) continue;
    const base = u * HEX_DIRECTIONS;
    for (let d = 0; d < HEX_DIRECTIONS; d++) {
      const v = grid.neighbor[base + d]!;
      if (v < 0) continue;
      const rv = cellLocation[v]!;
      if (rv <= ru) continue; // mỗi cặp (u, v) xét đúng một chiều: ru < rv
      const key = ru * siteCount + rv;
      const c = cost[u]! + cost[v]!;
      const prev = best.get(key);
      if (prev === undefined || c < prev) best.set(key, c);
    }
  }
  const edges = [...best].map(([key, c]) => ({ a: divFloor(key, siteCount), b: key % siteCount, cost: c }));
  return edges.sort((x, y) => x.cost - y.cost || x.a - y.a || x.b - y.b);
}

export function buildSiteGraph(grid: HexGrid, regions: RegionResult, siteCount: number, data: GameData): SiteEdge[] {
  const { extraEdges, travelDays: [minDays, maxDays], terrain } = data.balance.worldgen;
  const candidates = regionAdjacency(grid, regions, siteCount);
  const parent = Array.from({ length: siteCount }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  };
  const chosen: Omit<SiteEdge, 'travelDays'>[] = [];
  const rest: Omit<SiteEdge, 'travelDays'>[] = [];
  for (const e of candidates) {
    const ra = find(e.a);
    const rb = find(e.b);
    if (ra === rb) {
      rest.push(e);
    } else {
      parent[ra] = rb;
      chosen.push(e);
    }
  }
  // Kiểm tra trên MST, trước khi thêm cạnh phụ: cạnh phụ có thể bù số lượng cho một đồ thị bị tách.
  if (chosen.length !== siteCount - 1) {
    throw new DeterminismError(`Đồ thị địa điểm từ địa hình không liên thông (${siteCount - chosen.length} thành phần)`);
  }
  chosen.push(...rest.slice(0, extraEdges));
  return chosen
    .map((e) => ({ ...e, travelDays: clamp(divFloor(e.cost, terrain.travelCostPerDay), minDays, maxDays) }))
    .sort((x, y) => x.a - y.a || x.b - y.b);
}
