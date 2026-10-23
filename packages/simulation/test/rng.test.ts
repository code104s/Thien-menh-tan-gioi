import { describe, expect, it } from 'vitest';
import {
  RngStream, createStreamState, cyrb128, getStream, sfc32Next, type Sfc32State,
} from '../src/core/rng.ts';

/** Cài đặt sfc32 độc lập bằng BigInt để đối chiếu. */
function referenceSfc32(seed: [number, number, number, number], count: number): number[] {
  const M = 0xffffffffn;
  let [a, b, c, d] = seed.map(BigInt) as [bigint, bigint, bigint, bigint];
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    let t = (a + b) & M;
    a = b ^ (b >> 9n);
    b = (c + ((c << 3n) & M)) & M;
    c = ((c << 21n) & M) | (c >> 11n);
    d = (d + 1n) & M;
    t = (t + d) & M;
    c = (c + t) & M;
    out.push(Number(t));
  }
  return out;
}

describe('sfc32', () => {
  it('khớp cài đặt tham chiếu BigInt trên 2000 giá trị', () => {
    const seed = cyrb128('thien-khuyet');
    const s: Sfc32State = { a: seed[0], b: seed[1], c: seed[2], d: seed[3] };
    const ours = Array.from({ length: 2000 }, () => sfc32Next(s));
    expect(ours).toEqual(referenceSfc32(seed, 2000));
  });

  it('vector cố định (chống hồi quy)', () => {
    const r = new RngStream(createStreamState('seed-001', 'worldgen'));
    expect(Array.from({ length: 5 }, () => r.nextU32())).toMatchInlineSnapshot(`
      [
        1800091164,
        315061602,
        2438029297,
        3699411383,
        4122984875,
      ]
    `);
  });

  it('state luôn là uint32 serialize được', () => {
    const s = createStreamState('x', 'y');
    for (let i = 0; i < 100; i++) sfc32Next(s);
    for (const v of Object.values(s)) {
      expect(Number.isInteger(v) && v >= 0 && v <= 0xffffffff).toBe(true);
    }
  });

  it('khôi phục state giữa chừng cho cùng chuỗi tiếp theo', () => {
    const s = createStreamState('seed', 'k');
    const r = new RngStream(s);
    for (let i = 0; i < 37; i++) r.nextU32();
    const saved: Sfc32State = JSON.parse(JSON.stringify(s));
    const continued = Array.from({ length: 50 }, () => r.nextInt(1000));
    const restored = new RngStream(saved);
    expect(Array.from({ length: 50 }, () => restored.nextInt(1000))).toEqual(continued);
  });
});

describe('luồng theo khóa', () => {
  it('tạo lười và độc lập giữa các khóa', () => {
    const streams: Record<string, Sfc32State> = {};
    const a1 = getStream(streams, 'seed', 'plan:chr_0001').nextU32();
    getStream(streams, 'seed', 'plan:chr_0002').nextU32();
    const a2 = getStream(streams, 'seed', 'plan:chr_0001').nextU32();

    const solo: Record<string, Sfc32State> = {};
    const b1 = getStream(solo, 'seed', 'plan:chr_0001').nextU32();
    const b2 = getStream(solo, 'seed', 'plan:chr_0001').nextU32();
    expect([a1, a2]).toEqual([b1, b2]);
    expect(Object.keys(streams).sort()).toEqual(['plan:chr_0001', 'plan:chr_0002']);
  });

  it('seed khác cho chuỗi khác', () => {
    const x = new RngStream(createStreamState('a', 'k')).nextU32();
    const y = new RngStream(createStreamState('b', 'k')).nextU32();
    expect(x).not.toBe(y);
  });
});

describe('RngStream API', () => {
  const rng = () => new RngStream(createStreamState('api', 'test'));

  it('nextInt nằm trong khoảng và phân bố gần đều (chi-square)', () => {
    const r = rng();
    const buckets = 10;
    const n = 100_000;
    const counts = new Array<number>(buckets).fill(0);
    for (let i = 0; i < n; i++) {
      const v = r.nextInt(buckets);
      expect(v >= 0 && v < buckets).toBe(true);
      counts[v]!++;
    }
    const expected = n / buckets;
    const chi2 = counts.reduce((sum, c) => sum + ((c - expected) * (c - expected)) / expected, 0);
    expect(chi2).toBeLessThan(27.88); // df = 9, p = 0.001
  });

  it('nextInt từ chối tham số sai', () => {
    expect(() => rng().nextInt(0)).toThrow();
    expect(() => rng().nextInt(1.5)).toThrow();
  });

  it('nextRange bao gồm hai đầu', () => {
    const r = rng();
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.nextRange(3, 5));
    expect([...seen].sort()).toEqual([3, 4, 5]);
  });

  it('rollBp: 0 luôn false, 10000 luôn true, 30% ≈ 30%', () => {
    const r = rng();
    let hits = 0;
    for (let i = 0; i < 20_000; i++) {
      expect(r.rollBp(0)).toBe(false);
      expect(r.rollBp(10_000)).toBe(true);
      if (r.rollBp(3000)) hits++;
    }
    expect(Math.abs(hits / 20_000 - 0.3)).toBeLessThan(0.015);
  });

  it('pickWeighted bỏ qua trọng số 0 và báo lỗi khi tổng = 0', () => {
    const r = rng();
    for (let i = 0; i < 200; i++) {
      expect(r.pickWeighted(['a', 'b', 'c'], (x) => (x === 'b' ? 0 : 1))).not.toBe('b');
    }
    expect(() => r.pickWeighted(['a'], () => 0)).toThrow();
  });

  it('shuffle là hoán vị và không đổi mảng gốc', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const out = rng().shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...out].sort()).toEqual(input);
  });
});
