import { gameData, type GameData } from '@tmtg/game-data';
import { describe, expect, it } from 'vitest';
import { DeterminismError } from '../src/core/math.ts';
import { biomeHasTag } from '../src/worldgen/terrain/biome.ts';
import { buildSiteGraph } from '../src/worldgen/terrain/graph.ts';
import { HEX_DIRECTIONS, createHexGrid, hexDistance } from '../src/worldgen/terrain/hexGrid.ts';
import { TERRAIN_GEN_VERSION, generateTerrain, generateTerrainWorld, terrainDigest } from '../src/worldgen/terrain/index.ts';
import { isPassable, largestLandMass, relaxedSpacings } from '../src/worldgen/terrain/sites.ts';

const cfg = gameData.balance.worldgen;
const params = cfg.terrain;
const grid = createHexGrid(params.width, params.height);
const SEEDS = Array.from({ length: 100 }, (_, i) => `terrain-${String(i).padStart(3, '0')}`);
const worlds = SEEDS.map((seed) => ({ seed, ...generateTerrainWorld(seed, gameData) }));

/** Đổi bất kỳ thuật toán/tham số địa hình nào → các digest này đổi → phải tăng TERRAIN_GEN_VERSION (ADR-16). */
const GOLDEN: Record<string, string> = {
  'thien-khuyet-01': 'b1c52952de4bbe2f',
  'golden-a': 'd79c91954f3ed974',
  'golden-b': 'ae3571d444db942f',
};

describe('relaxedSpacings', () => {
  it('giảm một nửa tới 1, hữu hạn', () => {
    expect(relaxedSpacings(8)).toEqual([8, 4, 2, 1]);
    expect(relaxedSpacings(5)).toEqual([5, 2, 1]);
    expect(relaxedSpacings(1)).toEqual([1]);
    expect(relaxedSpacings(0)).toEqual([1]);
  });
});

describe('địa điểm, vùng, đồ thị W4 — 100 seed', () => {
  it('đúng locationCount địa điểm, phân biệt, sắp tăng, trên khối đất chính, không ở vùng cấm', () => {
    for (const { model, sites } of worlds) {
      expect(sites).toHaveLength(cfg.locationCount);
      expect([...sites].sort((a, b) => a - b)).toEqual(sites);
      expect(new Set(sites).size).toBe(sites.length);
      const mass = largestLandMass(grid, model.biome, gameData);
      for (const cell of sites) {
        expect(mass[cell]).toBe(1);
        expect(biomeHasTag(gameData, model.biome[cell]!, 'forbidden')).toBe(false);
      }
    }
  });

  it('địa điểm cách nhau ≥ minSiteSpacing (không cần nới trên lưới MVP)', () => {
    for (const { sites } of worlds) {
      for (const a of sites) for (const b of sites) if (a < b) expect(hexDistance(grid, a, b)).toBeGreaterThanOrEqual(params.minSiteSpacing);
    }
  });

  it('cellLocation: ô neo thuộc vùng của nó; ô khối đất chính đều có vùng, ô ngoài đều −1', () => {
    for (const { model, sites } of worlds) {
      sites.forEach((cell, k) => expect(model.cellLocation[cell]).toBe(k));
      const mass = largestLandMass(grid, model.biome, gameData);
      for (let i = 0; i < grid.cellCount; i++) {
        if (mass[i]) expect(model.cellLocation[i]).toBeGreaterThanOrEqual(0);
        else expect(model.cellLocation[i]).toBe(-1);
      }
    }
  });

  it('mỗi vùng liên thông (BFS trong vùng từ ô neo phủ hết vùng)', () => {
    for (const { model, sites } of worlds.slice(0, 20)) {
      sites.forEach((anchor, k) => {
        const seen = new Set([anchor]);
        const queue = [anchor];
        for (let h = 0; h < queue.length; h++) {
          for (let d = 0; d < HEX_DIRECTIONS; d++) {
            const n = grid.neighbor[queue[h]! * HEX_DIRECTIONS + d]!;
            if (n >= 0 && !seen.has(n) && model.cellLocation[n] === k) {
              seen.add(n);
              queue.push(n);
            }
          }
        }
        const size = model.cellLocation.filter((c) => c === k).length;
        expect(seen.size).toBe(size);
      });
    }
  });

  it('đồ thị: liên thông, MST + tối đa extraEdges, cạnh nối hai vùng kề nhau, travelDays đúng công thức', () => {
    const [minDays, maxDays] = cfg.travelDays;
    for (const { model, sites, edges } of worlds) {
      const n = sites.length;
      expect(edges.length).toBeGreaterThanOrEqual(n - 1);
      expect(edges.length).toBeLessThanOrEqual(n - 1 + cfg.extraEdges);
      const keys = edges.map((e) => `${e.a}-${e.b}`);
      expect(new Set(keys).size).toBe(keys.length);
      const parent = Array.from({ length: n }, (_, i) => i);
      const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x]!)));
      for (const e of edges) {
        expect(e.a).toBeLessThan(e.b);
        expect(e.travelDays).toBe(Math.min(maxDays, Math.max(minDays, Math.floor(e.cost / params.travelCostPerDay))));
        let touching = false;
        for (let u = 0; u < grid.cellCount && !touching; u++) {
          if (model.cellLocation[u] !== e.a) continue;
          for (let d = 0; d < HEX_DIRECTIONS; d++) {
            const v = grid.neighbor[u * HEX_DIRECTIONS + d]!;
            if (v >= 0 && model.cellLocation[v] === e.b) touching = true;
          }
        }
        expect(touching).toBe(true);
        parent[find(e.a)] = find(e.b);
      }
      expect(new Set(sites.map((_, k) => find(k))).size).toBe(1);
    }
  });

  it('tất định, digest khớp nội dung, golden digest không đổi', () => {
    for (const w of worlds.slice(0, 5)) {
      expect([w.grid.width, w.grid.height]).toEqual([w.model.width, w.model.height]);
      const again = generateTerrainWorld(w.seed, gameData);
      expect(again.model.digest).toBe(w.model.digest);
      expect(again.sites).toEqual(w.sites);
      expect(again.edges).toEqual(w.edges);
      expect(terrainDigest(w.model)).toBe(w.model.digest);
    }
    for (const [seed, expected] of Object.entries(GOLDEN)) {
      const model = generateTerrain(seed, gameData);
      expect(model.terrainGenVersion).toBe(TERRAIN_GEN_VERSION);
      expect(model.digest).toBe(expected);
    }
  });

  it('digest đổi khi một ô đổi', () => {
    const model = worlds[0]!.model;
    const cellLocation = Int16Array.from(model.cellLocation);
    cellLocation[0] = cellLocation[0] === -1 ? 0 : -1;
    expect(terrainDigest({ ...model, cellLocation })).not.toBe(model.digest);
  });
});

describe('buildSiteGraph — kiểm tra liên thông', () => {
  // Lưới 8×8: khối trái (x ≤ 2) chia 3 vùng kề nhau đôi một (tam giác → 1 cạnh thừa ngoài MST),
  // cột x = 3, 4 không thuộc vùng nào, khối phải (x ≥ 5) chia 2 vùng. 5 địa điểm, 2 thành phần.
  const small = createHexGrid(8, 8);
  const cellLocation = new Int16Array(small.cellCount);
  for (let i = 0; i < small.cellCount; i++) {
    const x = i % 8;
    const y = Math.floor(i / 8);
    if (x <= 2) cellLocation[i] = y >= 4 ? 2 : x <= 1 ? 0 : 1;
    else if (x <= 4) cellLocation[i] = -1;
    else cellLocation[i] = y < 4 ? 3 : 4;
  }
  const regions = { cellLocation, cost: new Int32Array(small.cellCount).fill(1) };

  it('từ chối đồ thị bị tách dù cạnh phụ đủ bù số lượng (MST 3 cạnh + 1 cạnh thừa = 4 = n − 1)', () => {
    expect(() => buildSiteGraph(small, regions, 5, gameData)).toThrow(DeterminismError);
    expect(() => buildSiteGraph(small, regions, 5, gameData)).toThrow(/không liên thông \(2 thành phần\)/);
  });

  it('chấp nhận khi hai khối được nối', () => {
    const joined = Int16Array.from(cellLocation);
    for (let y = 0; y < 8; y++) joined[y * 8 + 3] = 1;
    for (let y = 0; y < 8; y++) joined[y * 8 + 4] = 3;
    const edges = buildSiteGraph(small, { ...regions, cellLocation: joined }, 5, gameData);
    expect(edges.length).toBeGreaterThanOrEqual(4);
  });
});

describe('nới khoảng cách tất định', () => {
  it('minSiteSpacing quá lớn vẫn đủ địa điểm, vẫn trên đất đi được', () => {
    const data: GameData = {
      ...gameData,
      balance: {
        ...gameData.balance,
        worldgen: { ...cfg, terrain: { ...params, minSiteSpacing: 1000 } },
      },
    };
    const w = generateTerrainWorld('relax', data);
    expect(new Set(w.sites).size).toBe(cfg.locationCount);
    for (const cell of w.sites) expect(isPassable(data, w.model.biome[cell]!)).toBe(true);
    expect(generateTerrainWorld('relax', data).sites).toEqual(w.sites);
  });
});
