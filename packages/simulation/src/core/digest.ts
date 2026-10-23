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

export function digest(value: unknown): string {
  return fnv1a64(canonicalJson(value));
}
