/**
 * Canonical JSON + FNV-1a 64-bit (ADR-11). Dùng để so sánh state giữa các lần chạy, không dùng cho bảo mật.
 */
import { DeterminismError } from './math.ts';

/** JSON với key sắp xếp đệ quy; chỉ chấp nhận safe integer, chuỗi, boolean, null, mảng, object thường. */
export function canonicalJson(value: unknown): string {
  return write(value, '$');
}

function write(value: unknown, path: string): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isSafeInteger(value)) {
        throw new DeterminismError(`${path}: số không phải safe integer (${value})`);
      }
      return Object.is(value, -0) ? '0' : String(value);
    case 'object': {
      if (Array.isArray(value)) {
        return `[${value.map((v, i) => write(v, `${path}[${i}]`)).join(',')}]`;
      }
      const proto: unknown = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) {
        throw new DeterminismError(`${path}: chỉ chấp nhận object thường`);
      }
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      const parts: string[] = [];
      for (const key of keys) {
        const v = record[key];
        if (v === undefined) throw new DeterminismError(`${path}.${key}: giá trị undefined`);
        parts.push(`${JSON.stringify(key)}:${write(v, `${path}.${key}`)}`);
      }
      return `{${parts.join(',')}}`;
    }
    default:
      throw new DeterminismError(`${path}: kiểu ${typeof value} không serialize được`);
  }
}

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

/** FNV-1a 64-bit trên các code unit UTF-16 (mỗi code unit băm 2 byte). Trả hex 16 ký tự. */
export function fnv1a64(text: string): string {
  let hash = FNV_OFFSET;
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    hash = ((hash ^ BigInt(unit & 0xff)) * FNV_PRIME) & MASK_64;
    hash = ((hash ^ BigInt(unit >>> 8)) * FNV_PRIME) & MASK_64;
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * FNV-1a 64-bit theo từng byte, cùng thuật toán với `fnv1a64` nhưng không dùng BigInt: trạng thái là 4 limb 16-bit.
 * Dùng cho dữ liệu lớn dạng số (mảng địa hình). Nhân với số nguyên tố 2^40 + 435 = h × 435 + (h << 40).
 */
export class Fnv1a64 {
  // Limb thấp → cao của FNV_OFFSET 0xcbf29ce484222325.
  private h0 = 0x2325;
  private h1 = 0x8422;
  private h2 = 0x9ce4;
  private h3 = 0xcbf2;

  byte(value: number): this {
    const b = value & 0xff;
    const h0 = this.h0 ^ b;
    const { h1, h2, h3 } = this;
    let t0 = h0 * 435;
    let t1 = h1 * 435 + (t0 >>> 16);
    t0 &= 0xffff;
    let t2 = h2 * 435 + (h0 << 8) + (t1 >>> 16);
    t1 &= 0xffff;
    const t3 = h3 * 435 + (h1 << 8) + (t2 >>> 16);
    t2 &= 0xffff;
    this.h0 = t0;
    this.h1 = t1;
    this.h2 = t2;
    this.h3 = t3 & 0xffff;
    return this;
  }

  /** 4 byte little-endian của số nguyên 32-bit (có dấu hoặc không). */
  int32(value: number): this {
    const v = value | 0;
    return this.byte(v).byte(v >>> 8).byte(v >>> 16).byte(v >>> 24);
  }

  ints(values: ArrayLike<number>): this {
    for (let i = 0; i < values.length; i++) this.int32(values[i]!);
    return this;
  }

  hex(): string {
    const part = (x: number) => x.toString(16).padStart(4, '0');
    return part(this.h3) + part(this.h2) + part(this.h1) + part(this.h0);
  }
}

export function digest(value: unknown): string {
  return fnv1a64(canonicalJson(value));
}
