/**
 * Thủy văn (ADR-16): priority-flood lấp trũng (Barnes, Lehman, Mulla 2014, biến thể +1)
 * rồi cộng dồn lưu lượng theo thứ tự topo. Mọi ô đất có đúng một đường chảy ra biển hoặc ra rìa lưới.
 */
import { DeterminismError } from '../../core/math.ts';
import { HEX_DIRECTIONS, type HexGrid, cellPoint, isBorderCell } from './hexGrid.ts';
import type { TerrainParams } from './elevation.ts';
import { fbm, noiseSalt } from './noise.ts';

export const FLOW_MAX = 0xffff;

/** Min-heap theo (key, cell); hòa key thì ô có chỉ số nhỏ ra trước → tất định. */
export class CellHeap {
  private readonly keys: number[] = [];
  private readonly cells: number[] = [];

  get size(): number {
    return this.cells.length;
  }

  private less(ka: number, ca: number, kb: number, cb: number): boolean {
    return ka < kb || (ka === kb && ca < cb);
  }

  push(key: number, cell: number): void {
    const { keys, cells } = this;
    let i = cells.length;
    keys.push(key);
    cells.push(cell);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(key, cell, keys[p]!, cells[p]!)) break;
      keys[i] = keys[p]!;
      cells[i] = cells[p]!;
      i = p;
    }
    keys[i] = key;
    cells[i] = cell;
  }

  pop(): number {
    const { keys, cells } = this;
    const top = cells[0]!;
    const lastKey = keys.pop()!;
    const lastCell = cells.pop()!;
    const n = cells.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && this.less(keys[c + 1]!, cells[c + 1]!, keys[c]!, cells[c]!)) c++;
        if (!this.less(keys[c]!, cells[c]!, lastKey, lastCell)) break;
        keys[i] = keys[c]!;
        cells[i] = cells[c]!;
        i = c;
      }
      keys[i] = lastKey;
      cells[i] = lastCell;
    }
    return top;
  }
}

export interface HydrologyResult {
  /** Độ cao đã lấp trũng: mọi ô đất không ở rìa có láng giềng thấp hơn hẳn. */
  elevation: Int16Array;
  /** 1 = biển (độ cao sau lấp ≤ seaLevel). */
  water: Uint8Array;
  /** Ô hạ lưu; −1 = biển hoặc ô đất ở rìa (chảy ra ngoài lưới). */
  downstream: Int32Array;
  /** Lưu lượng cộng dồn (chỉ ô đất), bão hòa ở FLOW_MAX. */
  flow: Uint16Array;
  /** 1 = sông (ô đất có flow ≥ riverFlowThreshold). */
  river: Uint8Array;
}

export function generateHydrology(
  grid: HexGrid,
  seed: string,
  rawElevation: Int16Array,
  params: TerrainParams,
): HydrologyResult {
  const n = grid.cellCount;
  if (rawElevation.length !== n) throw new DeterminismError('Mảng độ cao không khớp kích thước lưới');
  const filled = new Int32Array(n);
  const downstream = new Int32Array(n).fill(-1);
  const visited = new Uint8Array(n);
  const order = new Int32Array(n);
  let popped = 0;

  // Ô rìa là cửa thoát: nước chảy ra ngoài lưới.
  const heap = new CellHeap();
  for (let i = 0; i < n; i++) {
    if (isBorderCell(grid, i)) {
      filled[i] = rawElevation[i]!;
      visited[i] = 1;
      heap.push(filled[i]!, i);
    }
  }
  while (heap.size > 0) {
    const c = heap.pop();
    order[popped++] = c;
    const base = c * HEX_DIRECTIONS;
    for (let d = 0; d < HEX_DIRECTIONS; d++) {
      const nb = grid.neighbor[base + d]!;
      if (nb < 0 || visited[nb]) continue;
      visited[nb] = 1;
      // +1 bảo đảm có dốc thật xuống ô cha kể cả trên vùng phẳng hoặc trũng đã lấp.
      filled[nb] = Math.max(rawElevation[nb]!, filled[c]! + 1);
      downstream[nb] = c;
      heap.push(filled[nb]!, nb);
    }
  }
  if (popped !== n) throw new DeterminismError('Priority-flood không phủ hết lưới');

  const water = new Uint8Array(n);
  const elevation = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    if (filled[i]! > 0x7fff || filled[i]! < -0x8000) throw new DeterminismError(`Độ cao vượt Int16 tại ô ${i}`);
    elevation[i] = filled[i]!;
    if (filled[i]! <= params.seaLevel) {
      water[i] = 1;
      downstream[i] = -1;
    }
  }

  // Lưu lượng: mỗi ô đất nhận 1..8 đơn vị mưa, cộng dồn từ thượng nguồn (thứ tự pop ngược = cao → thấp).
  const rainSalt = noiseSalt(seed, 'rain');
  const rainNoise = { cellSize: params.rainCellSize, octaves: 2 };
  const acc = new Int32Array(n);
  for (let k = n - 1; k >= 0; k--) {
    const c = order[k]!;
    if (water[c]) continue;
    const [px, py] = cellPoint(grid, c);
    acc[c] = acc[c]! + 1 + (fbm(rainSalt, px, py, rainNoise) >> 13);
    const down = downstream[c]!;
    if (down >= 0) acc[down] = acc[down]! + acc[c]!;
  }
  const flow = new Uint16Array(n);
  const river = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (water[i]) continue;
    flow[i] = Math.min(FLOW_MAX, acc[i]!);
    if (acc[i]! >= params.riverFlowThreshold) river[i] = 1;
  }
  return { elevation, water, downstream, flow, river };
}
