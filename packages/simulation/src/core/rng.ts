/**
 * RNG tất định sfc32 với nhiều luồng độc lập theo khóa (ADR-03).
 * Trạng thái là 4 số uint32, nằm trong WorldState.rng nên save/load giữ đúng chuỗi ngẫu nhiên.
 */
import { BP_ONE, DeterminismError } from './math.ts';

export interface Sfc32State {
  a: number;
  b: number;
  c: number;
  d: number;
}

const UINT32_RANGE = 0x1_0000_0000;
const WARMUP_DRAWS = 12;

/** Băm chuỗi thành 4 × uint32 (cyrb128). Dùng để tạo seed cho từng luồng. */
export function cyrb128(input: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < input.length; i++) {
    const k = input.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Bước sfc32: cập nhật state tại chỗ, trả về uint32. */
export function sfc32Next(s: Sfc32State): number {
  let { a, b, c, d } = s;
  let t = (a + b) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  d = (d + 1) | 0;
  t = (t + d) | 0;
  c = (c + t) | 0;
  s.a = a >>> 0;
  s.b = b >>> 0;
  s.c = c >>> 0;
  s.d = d >>> 0;
  return t >>> 0;
}

/** Khởi tạo state cho luồng `streamKey` của thế giới `seed`, đã bỏ các giá trị khởi động. */
export function createStreamState(seed: string, streamKey: string): Sfc32State {
  const [a, b, c, d] = cyrb128(`${seed}|${streamKey}`);
  const state: Sfc32State = { a, b, c, d };
  for (let i = 0; i < WARMUP_DRAWS; i++) sfc32Next(state);
  return state;
}

/** Một luồng ngẫu nhiên; thay đổi trực tiếp state nằm trong WorldState.rng. */
export class RngStream {
  constructor(private readonly state: Sfc32State) {}

  nextU32(): number {
    return sfc32Next(this.state);
  }

  /** Số nguyên đều trong [0, maxExclusive), không lệch modulo (rejection sampling). */
  nextInt(maxExclusive: number): number {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > UINT32_RANGE) {
      throw new DeterminismError(`nextInt cần 1 ≤ max ≤ 2^32, nhận ${maxExclusive}`);
    }
    const limit = UINT32_RANGE - (UINT32_RANGE % maxExclusive);
    let x = this.nextU32();
    while (x >= limit) x = this.nextU32();
    return x % maxExclusive;
  }

  /** Số nguyên đều trong [min, max] (bao gồm hai đầu). */
  nextRange(min: number, max: number): number {
    if (max < min) throw new DeterminismError(`nextRange cần min ≤ max, nhận ${min}..${max}`);
    return min + this.nextInt(max - min + 1);
  }

  /** true với xác suất chanceBp / 10000. */
  rollBp(chanceBp: number): boolean {
    return this.nextInt(BP_ONE) < chanceBp;
  }

  /** Chọn theo trọng số nguyên ≥ 0; tổng trọng số phải > 0. */
  pickWeighted<T>(items: readonly T[], weightOf: (item: T) => number): T {
    let total = 0;
    for (const item of items) {
      const w = weightOf(item);
      if (!Number.isSafeInteger(w) || w < 0) throw new DeterminismError(`Trọng số không hợp lệ: ${w}`);
      total += w;
    }
    if (total <= 0) throw new DeterminismError('Tổng trọng số phải > 0');
    let r = this.nextInt(total);
    for (const item of items) {
      r -= weightOf(item);
      if (r < 0) return item;
    }
    throw new DeterminismError('pickWeighted không chọn được phần tử');
  }

  pick<T>(items: readonly T[]): T {
    const item = items[this.nextInt(items.length)];
    if (item === undefined) throw new DeterminismError('pick trên mảng rỗng');
    return item;
  }

  /** Fisher–Yates, trả mảng mới; thứ tự đầu vào phải ổn định. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  }
}

/** Lấy (tạo lười nếu chưa có) luồng `streamKey` trong bảng state của thế giới. */
export function getStream(
  streams: Record<string, Sfc32State>,
  seed: string,
  streamKey: string,
): RngStream {
  let state = streams[streamKey];
  if (!state) {
    state = createStreamState(seed, streamKey);
    streams[streamKey] = state;
  }
  return new RngStream(state);
}
