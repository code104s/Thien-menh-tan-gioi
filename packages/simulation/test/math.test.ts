import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BP_ONE, DeterminismError, assertSafeInt, clamp, divCeil, divFloor, lerpTable, mulBp, mulDiv,
} from '../src/core/math.ts';

describe('math', () => {
  it('assertSafeInt từ chối số thực, NaN, vô cực, số quá lớn', () => {
    for (const bad of [0.5, NaN, Infinity, -Infinity, 2 ** 53]) {
      expect(() => assertSafeInt(bad)).toThrow(DeterminismError);
    }
    expect(assertSafeInt(-7)).toBe(-7);
  });

  it('clamp', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });

  it('divFloor / divCeil đúng với số âm', () => {
    expect(divFloor(7, 2)).toBe(3);
    expect(divFloor(-7, 2)).toBe(-4);
    expect(divCeil(7, 2)).toBe(4);
    expect(divCeil(-7, 2)).toBe(-3);
    expect(() => divFloor(1, 0)).toThrow(DeterminismError);
  });

  it('mulBp làm tròn xuống', () => {
    expect(mulBp(1000, BP_ONE)).toBe(1000);
    expect(mulBp(1000, 12_345)).toBe(1234);
    expect(mulBp(999, 5_000)).toBe(499);
  });

  it('mulDiv báo lỗi khi tích tràn safe integer', () => {
    expect(() => mulDiv(2 ** 40, 2 ** 20, 1)).toThrow(DeterminismError);
  });

  it('mulBp luôn trả safe integer và không vượt x khi bp ≤ 100%', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 1e9 }), fc.integer({ min: 0, max: BP_ONE }), (x, bp) => {
      const r = mulBp(x, bp);
      return Number.isSafeInteger(r) && r >= 0 && r <= x;
    }));
  });

  describe('lerpTable', () => {
    const table = [[0, 0], [60, 0], [80, 1000], [95, 2500]] as const;
    it('kẹp ngoài biên', () => {
      expect(lerpTable(table, -5)).toBe(0);
      expect(lerpTable(table, 200)).toBe(2500);
    });
    it('đúng tại các mốc và nội suy giữa', () => {
      expect(lerpTable(table, 60)).toBe(0);
      expect(lerpTable(table, 70)).toBe(500);
      expect(lerpTable(table, 80)).toBe(1000);
      expect(lerpTable(table, 85)).toBe(1500);
    });
    it('báo lỗi khi bảng rỗng hoặc không tăng', () => {
      expect(() => lerpTable([], 1)).toThrow(DeterminismError);
      expect(() => lerpTable([[0, 0], [0, 1], [5, 2]], 3)).toThrow(DeterminismError);
    });
  });
});
