/**
 * Lớp vẽ bản đồ địa hình (ADR-16, docs/WORLD_MAP_TECH_PLAN §5). Bake ra canvas ngoài màn hình:
 * - nền: biome + hillshade + bờ biển + sông, bake một lần mỗi seed;
 * - lãnh thổ: tô màu tông môn + đường biên, bake lại khi quyền sở hữu đổi.
 * Thời gian bake được ghi bằng performance.measure ('map:bake-base', 'map:bake-territory').
 */
import type { GameData } from '@tmtg/game-data';
import type { HexGrid, TerrainModel } from '@tmtg/simulation';
import { EDGE_CORNERS, cellCenter, hexCorner, mapSize, type HexMap } from './hexGeometry.ts';

/** Bán kính ô theo đơn vị thế giới; bản đồ bake ở độ phân giải `size × bakeScale` pixel. */
export const HEX_SIZE = 10;

export interface BakedLayer {
  canvas: HTMLCanvasElement;
  /** Pixel canvas trên mỗi đơn vị thế giới. */
  scale: number;
}

function createLayer(map: HexMap, scale: number): { layer: BakedLayer; g: CanvasRenderingContext2D } {
  const { width, height } = mapSize(map);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const g = canvas.getContext('2d')!;
  g.setTransform(scale, 0, 0, scale, 0, 0);
  return { layer: { canvas, scale }, g };
}

function hexPath(g: CanvasRenderingContext2D, map: HexMap, i: number, size = map.size) {
  const [cx, cy] = cellCenter(map, i);
  g.beginPath();
  for (let k = 0; k < 6; k++) {
    const [x, y] = hexCorner(cx, cy, size, k);
    if (k === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}

function edgeSegment(g: CanvasRenderingContext2D, map: HexMap, i: number, d: number) {
  const [cx, cy] = cellCenter(map, i);
  const [a, b] = EDGE_CORNERS[d]!;
  const [x1, y1] = hexCorner(cx, cy, map.size, a);
  const [x2, y2] = hexCorner(cx, cy, map.size, b);
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
}

/** Nhân độ sáng màu '#rrggbb' với `factor`. */
export function shade(hex: string, factor: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 0xff) * factor)));
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

const NW = 2;
const COAST = '#2e4a5c';
const RIVER = '#4f86b0';

export function bakeBase(model: TerrainModel, grid: HexGrid, data: GameData, bakeScale: number): BakedLayer {
  performance.mark('map:bake-base:start');
  const map: HexMap = { cols: model.width, rows: model.height, size: HEX_SIZE };
  const { layer, g } = createLayer(map, bakeScale);
  const water = (i: number) => (data.biomes[model.biome[i]!]?.travelCost ?? 0) === 0;

  // Biome + hillshade (ánh sáng từ tây bắc) hoặc độ sâu nước.
  for (let i = 0; i < grid.cellCount; i++) {
    const biome = data.biomes[model.biome[i]!]!;
    const e = model.elevation[i]!;
    let factor: number;
    if (water(i)) {
      factor = 1 + Math.max(-0.45, Math.min(0, e / 900));
    } else {
      const nw = grid.neighbor[i * 6 + NW]!;
      const diff = nw >= 0 && !water(nw) ? e - model.elevation[nw]! : 0;
      factor = 1 + Math.max(-0.22, Math.min(0.22, diff / 300));
    }
    const color = shade(biome.color, factor);
    hexPath(g, map, i);
    g.fillStyle = color;
    g.fill();
    // Viền cùng màu để che khe giữa các ô khi khử răng cưa.
    g.strokeStyle = color;
    g.lineWidth = 0.6;
    g.stroke();
  }

  // Bờ biển: cạnh giữa ô đất và ô nước.
  g.beginPath();
  for (let i = 0; i < grid.cellCount; i++) {
    if (water(i)) continue;
    for (let d = 0; d < 6; d++) {
      const n = grid.neighbor[i * 6 + d]!;
      if (n >= 0 && water(n)) edgeSegment(g, map, i, d);
    }
  }
  g.strokeStyle = COAST;
  g.globalAlpha = 0.7;
  g.lineWidth = 1.2;
  g.lineCap = 'round';
  g.stroke();
  g.globalAlpha = 1;

  // Sông: nối tâm ô với ô hạ lưu, dày theo log lưu lượng.
  const threshold = data.balance.worldgen.terrain.riverFlowThreshold;
  g.strokeStyle = RIVER;
  g.lineCap = 'round';
  for (let i = 0; i < grid.cellCount; i++) {
    const flow = model.flow[i]!;
    const down = model.downstream[i]!;
    if (flow < threshold || down < 0 || water(i)) continue;
    const [x1, y1] = cellCenter(map, i);
    const [x2, y2] = cellCenter(map, down);
    g.lineWidth = 0.9 + 0.9 * Math.log2(flow / threshold);
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  }
  performance.measure('map:bake-base', 'map:bake-base:start');
  return layer;
}

export function bakeTerritory(
  model: TerrainModel, grid: HexGrid, ownerOfCell: Int16Array, colors: readonly string[], bakeScale: number,
  borders: readonly [number, number][],
): BakedLayer {
  performance.mark('map:bake-territory:start');
  const map: HexMap = { cols: model.width, rows: model.height, size: HEX_SIZE };
  const { layer, g } = createLayer(map, bakeScale);
  g.globalAlpha = 0.26;
  for (let i = 0; i < grid.cellCount; i++) {
    const own = ownerOfCell[i]!;
    if (own < 0) continue;
    hexPath(g, map, i, HEX_SIZE + 0.3);
    g.fillStyle = colors[own] ?? '#000';
    g.fill();
  }
  g.globalAlpha = 0.9;
  g.lineWidth = 1.8;
  g.lineCap = 'round';
  colors.forEach((color, own) => {
    g.beginPath();
    for (const [i, d] of borders) if (ownerOfCell[i] === own) edgeSegment(g, map, i, d);
    g.strokeStyle = color;
    g.stroke();
  });
  g.globalAlpha = 1;
  performance.measure('map:bake-territory', 'map:bake-territory:start');
  return layer;
}
