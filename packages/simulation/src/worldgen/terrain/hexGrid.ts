/**
 * Lưới hex "odd-r" cho địa hình (ADR-16): hàng lẻ lệch sang phải nửa ô.
 * Ô i ↔ (x = i % width, y = floor(i / width)); mọi phép toán là số nguyên.
 */
import { DeterminismError } from '../../core/math.ts';

/** Số láng giềng tối đa; thứ tự hướng cố định: Đ, ĐB, TB, T, TN, ĐN. */
export const HEX_DIRECTIONS = 6;

export interface HexGrid {
  readonly width: number;
  readonly height: number;
  readonly cellCount: number;
  /** `neighbor[i * 6 + d]` = ô láng giềng theo hướng d, −1 nếu ra ngoài lưới. */
  readonly neighbor: Int32Array;
}

// [dx, dy] theo hướng Đ, ĐB, TB, T, TN, ĐN (Red Blob Games, offset coordinates "odd-r").
const EVEN_ROW: readonly (readonly [number, number])[] = [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
const ODD_ROW: readonly (readonly [number, number])[] = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]];

export function createHexGrid(width: number, height: number): HexGrid {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new DeterminismError(`Kích thước lưới phải là số nguyên ≥ 1, nhận ${width}×${height}`);
  }
  const cellCount = width * height;
  const neighbor = new Int32Array(cellCount * HEX_DIRECTIONS).fill(-1);
  for (let y = 0; y < height; y++) {
    const offsets = (y & 1) === 1 ? ODD_ROW : EVEN_ROW;
    for (let x = 0; x < width; x++) {
      const base = (y * width + x) * HEX_DIRECTIONS;
      offsets.forEach(([dx, dy], d) => {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < width && ny < height) neighbor[base + d] = ny * width + nx;
      });
    }
  }
  return { width, height, cellCount, neighbor };
}

export function cellIndex(grid: HexGrid, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) {
    throw new DeterminismError(`Ô (${x}, ${y}) nằm ngoài lưới ${grid.width}×${grid.height}`);
  }
  return y * grid.width + x;
}

export function cellX(grid: HexGrid, i: number): number {
  return i % grid.width;
}

export function cellY(grid: HexGrid, i: number): number {
  return (i - (i % grid.width)) / grid.width;
}

/** Ghi các láng giềng tồn tại của ô i vào `out` theo thứ tự hướng; trả về số láng giềng. */
export function neighborsOf(grid: HexGrid, i: number, out: number[]): number {
  let count = 0;
  const base = i * HEX_DIRECTIONS;
  for (let d = 0; d < HEX_DIRECTIONS; d++) {
    const n = grid.neighbor[base + d]!;
    if (n >= 0) out[count++] = n;
  }
  return count;
}

/** Ô ở rìa lưới (thiếu ít nhất một láng giềng). */
export function isBorderCell(grid: HexGrid, i: number): boolean {
  const base = i * HEX_DIRECTIONS;
  for (let d = 0; d < HEX_DIRECTIONS; d++) if (grid.neighbor[base + d]! < 0) return true;
  return false;
}

/** Tọa độ cube [q, r, s] với q + r + s = 0. */
export function toCube(grid: HexGrid, i: number): [number, number, number] {
  const x = cellX(grid, i);
  const y = cellY(grid, i);
  const q = x - (y - (y & 1)) / 2;
  return [q, y, -q - y];
}

/** Số bước hex ít nhất giữa hai ô (bỏ qua địa hình). */
export function hexDistance(grid: HexGrid, a: number, b: number): number {
  const [aq, ar, as] = toCube(grid, a);
  const [bq, br, bs] = toCube(grid, b);
  return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(as - bs));
}

/** Đơn vị tọa độ phẳng: 8 đơn vị mỗi bề ngang ô, 7 đơn vị mỗi hàng (≈ tỉ lệ √3/2 của hex). */
export const HEX_UNITS_X = 8;
export const HEX_UNITS_Y = 7;

/** Tâm ô theo tọa độ phẳng nguyên, dùng làm đầu vào noise để hình dạng không bị kéo dãn theo hàng. */
export function cellPoint(grid: HexGrid, i: number): [number, number] {
  const y = cellY(grid, i);
  return [cellX(grid, i) * HEX_UNITS_X + (y & 1) * (HEX_UNITS_X / 2), y * HEX_UNITS_Y];
}
