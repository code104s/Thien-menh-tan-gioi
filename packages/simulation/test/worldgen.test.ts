import { gameData } from '@tmtg/game-data';
import { describe, expect, it } from 'vitest';
import { digest } from '../src/core/digest.ts';
import { factionId, locationId } from '../src/core/ids.ts';
import { isConnected } from '../src/world/graph.ts';
import { PLAYER_ID, generateWorld, stoneSupply, type PlayerOrigin } from '../src/worldgen/generate.ts';
import { createHexGrid, hexDistance } from '../src/worldgen/terrain/hexGrid.ts';
import { generateTerrainWorld } from '../src/worldgen/terrain/index.ts';

const SEEDS = Array.from({ length: 100 }, (_, i) => `seed-${String(i).padStart(3, '0')}`);
const JOIN_0: PlayerOrigin = { kind: 'join_faction', factionIndex: 0 };

describe('worldgen — 100 seed', () => {
  const worlds = SEEDS.map((seed) => ({ seed, ...generateWorld({ seed, origin: JOIN_0 }) }));

  it('đồ thị liên thông, cạnh đối xứng, đúng số địa điểm', () => {
    for (const { state } of worlds) {
      expect(Object.keys(state.locations)).toHaveLength(gameData.balance.worldgen.locationCount);
      expect(isConnected(state.locations)).toBe(true);
      for (const l of Object.values(state.locations)) {
        for (const e of l.edges) {
          const back = state.locations[e.to]!.edges.find((x) => x.to === l.id);
          expect(back?.travelDays).toBe(e.travelDays);
        }
        expect(new Set(l.edges.map((e) => e.to)).size).toBe(l.edges.length);
        expect(l.edges.some((e) => e.to === l.id)).toBe(false);
      }
    }
  });

  it('ID khớp khóa, đúng 20 NPC + 1 người chơi, tên không trùng', () => {
    for (const { state } of worlds) {
      for (const table of [state.locations, state.characters, state.factions, state.spiritVeins]) {
        for (const [key, entity] of Object.entries(table)) expect(entity.id).toBe(key);
      }
      const chars = Object.values(state.characters);
      expect(chars).toHaveLength(gameData.balance.worldgen.npcCount + 1);
      expect(chars.filter((c) => c.isPlayer).map((c) => c.id)).toEqual([PLAYER_ID]);
      expect(new Set(chars.map((c) => c.name)).size).toBe(chars.length);
    }
  });

  it('3 tông môn có tông chủ hợp lệ tại trụ sở riêng biệt', () => {
    for (const { state } of worlds) {
      const factions = Object.values(state.factions);
      expect(factions).toHaveLength(3);
      expect(new Set(factions.map((f) => f.seatLocationId)).size).toBe(3);
      for (const f of factions) {
        const seat = state.locations[f.seatLocationId]!;
        expect(seat.kind).toBe('sect_seat');
        expect(seat.ownerFactionId).toBe(f.id);
        const leader = state.characters[f.leaderId!]!;
        expect(leader.factionId).toBe(f.id);
        expect(leader.factionRank).toBe('leader');
        const leaders = Object.values(state.characters).filter((c) => c.factionId === f.id && c.factionRank === 'leader');
        expect(leaders).toHaveLength(1);
        for (const other of factions) {
          if (other.id !== f.id) expect(f.relations[other.id]).toBe(other.relations[f.id]);
        }
      }
      const goldenLeaders = factions.filter((f) => state.characters[f.leaderId!]!.realm === 'golden_core');
      expect(goldenLeaders).toHaveLength(1);
    }
  });

  it('có linh mạch của tông 2 kề lãnh địa tông 1, quan hệ kình địch trong khoảng cấu hình', () => {
    const [lo, hi] = gameData.balance.worldgen.rivalRelation;
    for (const { state } of worlds) {
      const a = factionId(1);
      const b = factionId(2);
      const territoryA = Object.values(state.locations).filter((l) => l.ownerFactionId === a).map((l) => l.id);
      const contested = Object.values(state.spiritVeins).filter((v) => {
        const l = state.locations[v.locationId]!;
        return l.ownerFactionId === b && l.edges.some((e) => territoryA.includes(e.to));
      });
      expect(contested.length).toBeGreaterThanOrEqual(1);
      const rel = state.factions[a]!.relations[b]!;
      expect(rel >= lo && rel <= hi).toBe(true);
    }
  });

  it('linh mạch nằm đúng địa điểm, mỗi địa điểm tối đa 1 linh mạch', () => {
    for (const { state } of worlds) {
      const veins = Object.values(state.spiritVeins);
      expect(veins).toHaveLength(gameData.balance.worldgen.veinCount);
      for (const v of veins) expect(state.locations[v.locationId]!.veinId).toBe(v.id);
      expect(new Set(veins.map((v) => v.locationId)).size).toBe(veins.length);
    }
  });

  it('nhân vật còn sống, tuổi < tuổi thọ, tiến độ < ngưỡng, ở địa điểm tồn tại', () => {
    for (const { state } of worlds) {
      for (const c of Object.values(state.characters)) {
        expect(c.alive).toBe(true);
        expect(0 - c.birthDay).toBeLessThan(c.lifespanDays);
        expect(state.locations[c.locationId]).toBeDefined();
        const realm = gameData.realms.realms.find((r) => r.id === c.realm)!;
        expect(c.progress).toBeLessThan(realm.daysPerStage * 1000);
        const technique = gameData.techniques[c.techniqueId!]!;
        expect(c.spiritRootBp).toBeGreaterThanOrEqual(technique.minSpiritRootBp);
        if (c.factionId) expect(c.locationId).toBe(state.factions[c.factionId]!.seatLocationId);
      }
    }
  });

  it('tổng linh thạch ban đầu được ghi nhận', () => {
    for (const { state } of worlds) {
      expect(state.initialStoneSupply).toBe(stoneSupply(state));
      expect(state.initialStoneSupply).toBeGreaterThan(0);
    }
  });

  it('phát đúng một event world_created', () => {
    for (const { state, events } of worlds) {
      expect(events.map((e) => e.type)).toEqual(['world_created']);
      expect(state.eventSeq).toBe(1);
    }
  });
});

describe('worldgen — tất định và xuất thân', () => {
  it('cùng seed cho cùng digest', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      expect(digest(generateWorld({ seed, origin: JOIN_0 }).state)).toBe(digest(generateWorld({ seed, origin: JOIN_0 }).state));
    }
  });

  it('seed khác thường cho thế giới khác', () => {
    const digests = new Set(SEEDS.map((seed) => digest(generateWorld({ seed, origin: JOIN_0 }).state)));
    expect(digests.size).toBe(SEEDS.length);
  });

  it('xuất thân đặt người chơi đúng chỗ', () => {
    const seed = 'origin-test';
    const joined = generateWorld({ seed, origin: { kind: 'join_faction', factionIndex: 2 } }).state;
    const p1 = joined.characters[PLAYER_ID]!;
    expect(p1.factionId).toBe(factionId(3));
    expect(p1.factionRank).toBe('disciple');
    expect(p1.locationId).toBe(joined.factions[factionId(3)]!.seatLocationId);

    const rogue = generateWorld({ seed, origin: { kind: 'rogue' } }).state;
    expect(rogue.characters[PLAYER_ID]!.factionId).toBeNull();
    expect(rogue.locations[rogue.characters[PLAYER_ID]!.locationId]!.kind).toBe('town');

    const seeker = generateWorld({ seed, origin: { kind: 'resource_seeker' } }).state;
    const at = seeker.locations[seeker.characters[PLAYER_ID]!.locationId]!;
    const maxStock = Math.max(...Object.values(seeker.locations).map((l) => l.resourceStock));
    expect(at.resourceStock).toBe(maxStock);
  });

  it('tên người chơi tùy chọn được giữ nguyên', () => {
    const { state } = generateWorld({ seed: 'x', origin: { kind: 'rogue' }, playerName: '  Lý Thanh Phong ' });
    expect(state.characters[PLAYER_ID]!.name).toBe('Lý Thanh Phong');
    const p = state.characters[PLAYER_ID]!;
    expect([p.realm, p.stage, p.progress, p.spiritStones]).toEqual(['qi', 'early', 0, 50]);
  });
});

describe('worldgen v2 — địa hình (ADR-16), 30 seed', () => {
  const terrainCfg = gameData.balance.worldgen.terrain;
  const grid = createHexGrid(terrainCfg.width, terrainCfg.height);
  const [energyMin, energyMax] = gameData.balance.cultivation.energyClampBp;
  const cases = SEEDS.slice(0, 30).map((seed) => {
    const terrain = generateTerrainWorld(seed, gameData);
    const anchor = new Map(terrain.sites.map((cell, k) => [locationId(k + 1), cell]));
    return { seed, terrain, anchor, state: generateWorld({ seed, origin: JOIN_0 }).state };
  });

  it('cạnh và travelDays lấy đúng từ đồ thị địa hình', () => {
    for (const { terrain, state } of cases) {
      const fromTerrain = terrain.edges.map((e) => `${locationId(e.a + 1)}-${locationId(e.b + 1)}:${e.travelDays}`);
      const fromState = Object.values(state.locations)
        .flatMap((l) => l.edges.filter((e) => l.id < e.to).map((e) => `${l.id}-${e.to}:${e.travelDays}`));
      expect(fromState.sort()).toEqual(fromTerrain.sort());
    }
  });

  it('địa hình không ghi vào WorldState.rng (chỉ luồng worldgen)', () => {
    for (const { state } of cases) expect(Object.keys(state.rng)).toEqual(['worldgen']);
  });

  it('linh khí trong khoảng kẹp; trữ lượng và sản lượng linh mạch xếp theo địa khí', () => {
    for (const { terrain, anchor, state } of cases) {
      for (const l of Object.values(state.locations)) {
        expect(l.spiritualEnergyBp).toBeGreaterThanOrEqual(energyMin);
        expect(l.spiritualEnergyBp).toBeLessThanOrEqual(energyMax);
      }
      const veins = Object.values(state.spiritVeins)
        .map((v) => ({ v, qi: terrain.model.qi[anchor.get(v.locationId)!]! }))
        .sort((x, y) => y.qi - x.qi || (x.v.locationId < y.v.locationId ? -1 : 1));
      for (let i = 1; i < veins.length; i++) {
        expect(veins[i]!.v.reserve).toBeLessThanOrEqual(veins[i - 1]!.v.reserve);
        expect(veins[i]!.v.yieldPerMonth).toBeLessThanOrEqual(veins[i - 1]!.v.yieldPerMonth);
      }
    }
  });

  it('bí cảnh xa trụ sở nhất trong các nút trống; thị trấn có biome dễ đi nhất', () => {
    for (const { terrain, anchor, state } of cases) {
      const seats = Object.values(state.factions).map((f) => anchor.get(f.seatLocationId)!);
      const seatDistance = (id: string) => seats.reduce((sum, s) => sum + hexDistance(grid, s, anchor.get(id)!), 0);
      const travelCost = (id: string) => gameData.biomes[terrain.model.biome[anchor.get(id)!]!]!.travelCost;
      const special = Object.values(state.locations).filter((l) => l.kind === 'town' || l.kind === 'secret_realm');
      for (const l of special) expect([l.ownerFactionId, l.veinId]).toEqual([null, null]);
      const realm = special.filter((l) => l.kind === 'secret_realm');
      const towns = special.filter((l) => l.kind === 'town');
      expect(realm).toHaveLength(1);
      expect(towns).toHaveLength(2);
      const plainWild = Object.values(state.locations)
        .filter((l) => l.kind === 'wild' && l.ownerFactionId === null && l.veinId === null);
      for (const l of [...plainWild, ...towns]) expect(seatDistance(l.id)).toBeLessThanOrEqual(seatDistance(realm[0]!.id));
      for (const l of plainWild) for (const t of towns) expect(travelCost(t.id)).toBeLessThanOrEqual(travelCost(l.id));
    }
  });
});
