import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { Fnv1a64, canonicalJson, digest, fnv1a64 } from '../src/core/digest.ts';
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

describe('Fnv1a64 (theo byte, không BigInt)', () => {
  const viaBytes = (text: string) => {
    const h = new Fnv1a64();
    for (let i = 0; i < text.length; i++) h.byte(text.charCodeAt(i)).byte(text.charCodeAt(i) >>> 8);
    return h.hex();
  };

  it('trùng fnv1a64 trên cùng dãy byte', () => {
    expect(new Fnv1a64().hex()).toBe('cbf29ce484222325');
    fc.assert(fc.property(fc.string({ unit: 'binary', maxLength: 200 }), (text) => viaBytes(text) === fnv1a64(text)));
  });

  it('int32 băm 4 byte little-endian, số âm như uint32', () => {
    expect(new Fnv1a64().int32(-1).hex()).toBe(new Fnv1a64().byte(255).byte(255).byte(255).byte(255).hex());
    expect(new Fnv1a64().int32(0x01020304).hex()).toBe(new Fnv1a64().byte(4).byte(3).byte(2).byte(1).hex());
    expect(new Fnv1a64().ints([1, 2]).hex()).not.toBe(new Fnv1a64().ints([2, 1]).hex());
  });
});
