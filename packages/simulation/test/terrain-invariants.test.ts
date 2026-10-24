import { gameData } from '@tmtg/game-data';
import { describe, expect, it } from 'vitest';
import { checkInvariants, checkTerrainInvariants, regenerateTerrain } from '../src/core/invariants.ts';
import { createContext, run } from '../src/index.ts';
import { cloneState } from '../src/core/snapshot.ts';
import { sortedKeys } from '../src/core/ids.ts';
import { PLAYER_ID, contestedVeinLocation, generateWorld } from '../src/worldgen/generate.ts';
import { createHexGrid, hexDistance } from '../src/worldgen/terrain/hexGrid.ts';
import { TERRAIN_GEN_VERSION, generateTerrain, type TerrainModel } from '../src/worldgen/terrain/index.ts';
import type { WorldState } from '../src/types.ts';

const world = (seed: string) => generateWorld({ seed, origin: { kind: 'join_faction', factionIndex: 0 } }).state;
const codes = (state: WorldState, model?: TerrainModel) =>
  (model ? checkTerrainInvariants(state, model) : checkInvariants(state)).map((v) => v.code);

function modelOf(state: WorldState): TerrainModel {
  const t = regenerateTerrain(state);
  if (t.status !== 'ok') throw new Error(`Không sinh lại được địa hình: ${t.reason}`);
  return t.model;
}

describe('worldgen v2 ghi trường địa hình (schema v2)', () => {
  it('schemaVersion 2, terrainGenVersion, terrainDigest, biomeId, anchorCell', () => {
    const s = world('v2-fields');
    const model = generateTerrain('v2-fields', gameData);
    expect(s.schemaVersion).toBe(2);
    expect(s.terrainGenVersion).toBe(TERRAIN_GEN_VERSION);
    expect(s.terrainDigest).toBe(model.digest);
    sortedKeys(s.locations).forEach((id, k) => {
      const l = s.locations[id]!;
      expect(l.anchorCell).not.toBeNull();
      expect(model.cellLocation[l.anchorCell!]).toBe(k);
      expect(l.biomeId).toBe(gameData.biomes[model.biome[l.anchorCell!]!]!.id);
    });
  });
});

describe('bất biến I12–I14', () => {
  it('100 seed: không vi phạm lúc sinh', () => {
    for (let i = 0; i < 100; i++) {
      const s = world(`inv-${String(i).padStart(3, '0')}`);
      expect(codes(s), s.seed).toEqual([]);
      expect(codes(s, modelOf(s)), s.seed).toEqual([]);
    }
  });

  it('vẫn đúng sau 20 năm mô phỏng (lãnh địa đổi chủ, trụ sở và linh mạch không đổi)', () => {
    const ctx = createContext();
    for (const seed of ['inv-run-a', 'inv-run-b', 'inv-run-c']) {
      const s = world(seed);
      run(s, ctx, { untilDay: 20 * 360 });
      expect(codes(s), seed).toEqual([]);
      expect(codes(s, modelOf(s)), seed).toEqual([]);
    }
  });

  it('I12 cấu trúc: thiếu trường địa hình, trùng ô neo, save cũ lẫn trường địa hình', () => {
    const base = world('inv-struct');
    const [a, b] = sortedKeys(base.locations);
    const missing = cloneState(base);
    missing.locations[a!]!.biomeId = null;
    expect(codes(missing)).toContain('I12_TERRAIN');
    const dup = cloneState(base);
    dup.locations[b!]!.anchorCell = dup.locations[a!]!.anchorCell;
    expect(codes(dup)).toContain('I12_TERRAIN');
    const legacyMixed = cloneState(base);
    legacyMixed.terrainGenVersion = 0;
    expect(codes(legacyMixed)).toContain('I12_TERRAIN');
  });

  it('I12 sâu: ô neo trên biển, ô neo sai vùng', () => {
    const base = world('inv-deep');
    const model = modelOf(base);
    const [a, b] = sortedKeys(base.locations);
    const sea = cloneState(base);
    sea.locations[a!]!.anchorCell = model.biome.findIndex((x) => gameData.biomes[x]!.travelCost === 0);
    expect(codes(sea, model)).toContain('I12_TERRAIN');
    const swapped = cloneState(base);
    [swapped.locations[a!]!.anchorCell, swapped.locations[b!]!.anchorCell] =
      [swapped.locations[b!]!.anchorCell, swapped.locations[a!]!.anchorCell];
    expect(codes(swapped, model)).toContain('I12_TERRAIN');
  });

  it('I13: biomeId không khớp ô neo', () => {
    const s = world('inv-biome');
    const model = modelOf(s);
    const l = s.locations[sortedKeys(s.locations)[0]!]!;
    l.biomeId = l.biomeId === 'rung' ? 'thao_nguyen' : 'rung';
    expect(codes(s, model)).toContain('I13_TERRAIN');
  });

  it('I14: travelDays ngoài khoảng kẹp', () => {
    const s = world('inv-days');
    const l = s.locations[sortedKeys(s.locations)[0]!]!;
    const e = l.edges[0]!;
    e.travelDays = 99;
    s.locations[e.to]!.edges.find((x) => x.to === l.id)!.travelDays = 99;
    expect(codes(s)).toContain('I14_TERRAIN');
  });

  it('I14: dời linh mạch tự do sang nút trống địa khí thấp nhất bị phát hiện', () => {
    let detected = 0;
    let tried = 0;
    for (let i = 0; i < 20; i++) {
      const s = world(`inv-vein-${i}`);
      const model = modelOf(s);
      const grid = createHexGrid(model.width, model.height);
      const seats = sortedKeys(s.factions).map((f) => s.factions[f]!.seatLocationId);
      const contested = contestedVeinLocation(s.locations, seats);
      const ids = sortedKeys(s.locations);
      const qi = (id: string) => model.qi[s.locations[id]!.anchorCell!]!;
      const free = ids.filter((id) => s.locations[id]!.veinId !== null && !seats.includes(id) && id !== contested);
      const empty = ids.filter((id) => s.locations[id]!.veinId === null && !seats.includes(id)).sort((x, y) => qi(x) - qi(y));
      if (free.length === 0 || empty.length === 0) continue;
      const from = free[0]!;
      const to = empty[0]!;
      // Điều kiện để vi phạm đo được: nút cũ (giờ trống) không nằm trong minVeinSpacing của linh mạch nào còn lại,
      // và địa khí nút cũ > nút mới.
      const remaining = ids.filter((id) => s.locations[id]!.veinId !== null && id !== from).concat(to);
      const anchor = (id: string) => s.locations[id]!.anchorCell!;
      const spacing = gameData.balance.worldgen.terrain.minVeinSpacing;
      if (remaining.some((v) => hexDistance(grid, anchor(v), anchor(from)) < spacing) || qi(from) <= qi(to)) continue;
      tried++;
      const veinId = s.locations[from]!.veinId!;
      s.locations[to]!.veinId = veinId;
      s.locations[from]!.veinId = null;
      s.spiritVeins[veinId]!.locationId = to;
      if (codes(s, model).includes('I14_TERRAIN')) detected++;
    }
    expect(tried).toBeGreaterThan(0);
    expect(detected).toBe(tried);
  });
});

describe('regenerateTerrain', () => {
  it('ok khi digest khớp; unavailable với save cũ, phiên bản lạ, digest lệch', () => {
    const s = world('regen');
    expect(regenerateTerrain(s).status).toBe('ok');
    expect(regenerateTerrain({ ...s, terrainGenVersion: 0, terrainDigest: null })).toEqual({ status: 'unavailable', reason: 'legacy_save' });
    expect(regenerateTerrain({ ...s, terrainGenVersion: TERRAIN_GEN_VERSION + 1 })).toEqual({ status: 'unavailable', reason: 'unsupported_version' });
    expect(regenerateTerrain({ ...s, terrainDigest: '0000000000000000' })).toEqual({ status: 'unavailable', reason: 'digest_mismatch' });
  });

  it('không đổi state (luồng RNG cục bộ)', () => {
    const s = world('regen-pure');
    const before = JSON.stringify(s);
    regenerateTerrain(s);
    expect(JSON.stringify(s)).toBe(before);
    expect(s.characters[PLAYER_ID]).toBeDefined();
  });

  it('checkTerrainInvariants từ chối model của seed khác', () => {
    const s = world('regen-a');
    expect(codes(s, generateTerrain('regen-b', gameData))).toEqual(['I12_TERRAIN']);
  });
});
