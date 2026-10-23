/**
 * Pipeline địa hình cố định (ADR-16): lưới → độ cao → thủy văn → độ ẩm → biome → địa khí
 * → địa điểm → vùng → đồ thị. Hàm thuần của (seed, game-data); không ghi WorldState.rng.
 */
import type { GameData } from '@tmtg/game-data';
import { Fnv1a64 } from '../../core/digest.ts';
import { DeterminismError } from '../../core/math.ts';
import { generateBiomes } from './biome.ts';
import { generateMoisture } from './climate.ts';
import { generateElevation, terrainRng } from './elevation.ts';
import { buildSiteGraph } from './graph.ts';
import { createHexGrid } from './hexGrid.ts';
import { generateHydrology } from './hydrology.ts';
import { generateQi } from './qi.ts';
import { assignRegions } from './regions.ts';
import { largestLandMass, selectSites } from './sites.ts';
import { TERRAIN_GEN_VERSION, type TerrainModel, type TerrainWorld } from './types.ts';

export * from './types.ts';

export function terrainDigest(m: Omit<TerrainModel, 'digest' | 'terrainGenVersion'>): string {
  return new Fnv1a64()
    .int32(m.width).int32(m.height)
    .ints(m.elevation).ints(m.moisture).ints(m.biome).ints(m.downstream).ints(m.flow).ints(m.qi).ints(m.cellLocation)
    .hex();
}

export function generateTerrainWorld(seed: string, data: GameData): TerrainWorld {
  const params = data.balance.worldgen.terrain;
  const siteCount = data.balance.worldgen.locationCount;
  const grid = createHexGrid(params.width, params.height);
  const raw = generateElevation(grid, seed, terrainRng(seed), params);
  const hydro = generateHydrology(grid, seed, raw.elevation, params);
  const moisture = generateMoisture(grid, seed, hydro.water, hydro.river, params);
  const biome = generateBiomes(grid, seed, hydro, moisture, data);
  const qi = generateQi(grid, seed, hydro, biome, data);
  const mass = largestLandMass(grid, biome, data);
  const sites = selectSites(grid, biome, qi, mass, data, siteCount);
  const regions = assignRegions(grid, biome, sites, data);
  const edges = buildSiteGraph(grid, regions, siteCount, data);
  if (edges.length < siteCount - 1) throw new DeterminismError('Đồ thị địa điểm từ địa hình không liên thông');
  const arrays = {
    width: grid.width,
    height: grid.height,
    elevation: hydro.elevation,
    moisture,
    biome,
    downstream: hydro.downstream,
    flow: hydro.flow,
    qi,
    cellLocation: regions.cellLocation,
  };
  return { model: { terrainGenVersion: TERRAIN_GEN_VERSION, ...arrays, digest: terrainDigest(arrays) }, sites, edges };
}

/** `generateTerrain(seed, data): TerrainModel` theo hợp đồng docs/08 (dùng cho UI ở W6). */
export function generateTerrain(seed: string, data: GameData): TerrainModel {
  return generateTerrainWorld(seed, data).model;
}
