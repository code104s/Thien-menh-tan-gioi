/**
 * Noise số nguyên không trạng thái cho địa hình (ADR-16).
 * Chỉ dùng Math.imul, phép dịch bit và cộng trừ số nguyên nên kết quả giống nhau trên mọi engine.
 * Giá trị noise nằm trong [0, NOISE_MAX].
 */
import { DeterminismError, divFloor, mulDiv } from '../../core/math.ts';
import { cyrb128 } from '../../core/rng.ts';

export const NOISE_MAX = 0xffff;
/** Tọa độ lattice dùng fixed-point 1/256 ô. */
const FRAC_BITS = 8;
const FRAC_ONE = 1 << FRAC_BITS;
const FRAC_MASK = FRAC_ONE - 1;
export const MAX_OCTAVES = 8;
/** Biên an toàn cho tọa độ fixed-point (chừa 1 bit cho x0 + 1). */
const INT32_LIMIT = 0x3fff_ffff;

/** Salt cho một lớp noise (độ cao, độ ẩm…) của thế giới `seed`. */
export function noiseSalt(seed: string, layer: string): number {
  return cyrb128(`${seed}|terrain:${layer}`)[0];
}

/** Hash 2D → [0, 65535]. x, y là số nguyên 32-bit (có thể âm). */
export function hash2(salt: number, x: number, y: number): number {
  let h = (salt ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return h >>> 16;
}

/** smoothstep t²(3 − 2t) với t ∈ [0, 256] theo fixed-point ×256. */
function smooth(t: number): number {
  return (t * t * (3 * FRAC_ONE - 2 * t)) >> (2 * FRAC_BITS);
}

/**
 * Value noise nội suy smoothstep. `fx`, `fy` là tọa độ lattice fixed-point ×256
 * (fx = 256 nghĩa là đúng lattice thứ 1). Tại điểm lattice, giá trị đúng bằng hash2.
 */
export function valueNoise(salt: number, fx: number, fy: number): number {
  const x0 = fx >> FRAC_BITS;
  const y0 = fy >> FRAC_BITS;
  const sx = smooth(fx & FRAC_MASK);
  const sy = smooth(fy & FRAC_MASK);
  const a = hash2(salt, x0, y0);
  const b = hash2(salt, x0 + 1, y0);
  const c = hash2(salt, x0, y0 + 1);
  const d = hash2(salt, x0 + 1, y0 + 1);
  const top = a + ((b - a) * sx >> FRAC_BITS);
  const bottom = c + ((d - c) * sx >> FRAC_BITS);
  return top + ((bottom - top) * sy >> FRAC_BITS);
}

export interface FbmParams {
  /** Kích thước ô lattice của tầng thô nhất, theo đơn vị tọa độ đầu vào (vd. đơn vị của cellPoint). */
  cellSize: number;
  /** Số tầng, 1..MAX_OCTAVES; mỗi tầng tần số ×2, biên độ ÷2. */
  octaves: number;
}

/** Salt riêng cho từng tầng để các tầng không tương quan. */
function octaveSalt(salt: number, octave: number): number {
  return (salt ^ Math.imul(octave + 1, 0x9e3779b9)) >>> 0;
}

/** Fractal value noise trên tọa độ nguyên (x, y); kết quả trong [0, NOISE_MAX]. */
export function fbm(salt: number, x: number, y: number, params: FbmParams): number {
  const { cellSize, octaves } = params;
  if (!Number.isSafeInteger(cellSize) || cellSize < 1) {
    throw new DeterminismError(`cellSize phải là số nguyên ≥ 1, nhận ${cellSize}`);
  }
  if (!Number.isSafeInteger(octaves) || octaves < 1 || octaves > MAX_OCTAVES) {
    throw new DeterminismError(`octaves phải trong [1, ${MAX_OCTAVES}], nhận ${octaves}`);
  }
  let sum = 0;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const amplitude = 1 << (octaves - 1 - o);
    const scale = FRAC_ONE << o;
    const fx = mulDiv(x, scale, cellSize);
    const fy = mulDiv(y, scale, cellSize);
    // Phép dịch bit làm việc trên int32: tọa độ vượt biên sẽ bị quấn vòng.
    if (fx > INT32_LIMIT || fx < -INT32_LIMIT || fy > INT32_LIMIT || fy < -INT32_LIMIT) {
      throw new DeterminismError(`Tọa độ noise (${x}, ${y}) quá lớn cho cellSize ${cellSize}, octaves ${octaves}`);
    }
    sum += amplitude * valueNoise(octaveSalt(salt, o), fx, fy);
    total += amplitude;
  }
  return divFloor(sum, total);
}
