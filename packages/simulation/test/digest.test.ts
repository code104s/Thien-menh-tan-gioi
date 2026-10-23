import { describe, expect, it } from 'vitest';
import { canonicalJson, digest, fnv1a64 } from '../src/core/digest.ts';
import { DeterminismError } from '../src/core/math.ts';

describe('canonicalJson', () => {
  it('sắp xếp key đệ quy, giữ thứ tự mảng', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, 1], c: null } })).toBe('{"a":{"c":null,"d":[3,1]},"b":1}');
  });

  it('chuẩn hóa -0 thành 0', () => {
    expect(canonicalJson({ x: -0 })).toBe('{"x":0}');
  });

  it.each([
    ['số thực', { x: 0.5 }],
    ['NaN', { x: NaN }],
    ['undefined', { x: undefined }],
    ['hàm', { x: () => 1 }],
    ['Map', { x: new Map() }],
    ['BigInt', { x: 1n }],
  ])('từ chối %s', (_label, value) => {
    expect(() => canonicalJson(value)).toThrow(DeterminismError);
  });
});

describe('digest', () => {
  it('FNV-1a 64 đúng vector chuẩn cho chuỗi rỗng', () => {
    expect(fnv1a64('')).toBe('cbf29ce484222325');
  });

  it('không phụ thuộc thứ tự key', () => {
    expect(digest({ a: 1, b: [1, 2], c: { x: 'Thiên' } })).toBe(digest({ c: { x: 'Thiên' }, b: [1, 2], a: 1 }));
  });

  it('đổi một giá trị thì đổi digest', () => {
    expect(digest({ a: 1, b: 2 })).not.toBe(digest({ a: 1, b: 3 }));
    expect(digest([1, 2])).not.toBe(digest([2, 1]));
    expect(digest({ s: 'Kim Đan' })).not.toBe(digest({ s: 'Kim Dan' }));
  });

  it('trả 16 ký tự hex', () => {
    expect(digest({ any: 'thing' })).toMatch(/^[0-9a-f]{16}$/);
  });
});
