import { describe, expect, it } from 'vitest';
import {
  ageInYears, formatDate, isMonthBoundary, isQuarterBoundary, toCalendar,
} from '../src/core/calendar.ts';
import { characterId, formatId, nextId, sortedKeys } from '../src/core/ids.ts';
import type { Counters } from '../src/types.ts';

describe('calendar', () => {
  it('day 0 là Năm 1, Tháng 1, Ngày 1', () => {
    expect(formatDate(0)).toBe('Năm 1, Tháng 1, Ngày 1');
  });

  it('chuyển ngày sang lịch', () => {
    expect(toCalendar(29)).toEqual({ year: 1, month: 1, dayOfMonth: 30 });
    expect(toCalendar(30)).toEqual({ year: 1, month: 2, dayOfMonth: 1 });
    expect(toCalendar(359)).toEqual({ year: 1, month: 12, dayOfMonth: 30 });
    expect(toCalendar(360)).toEqual({ year: 2, month: 1, dayOfMonth: 1 });
    expect(toCalendar(-1)).toEqual({ year: 0, month: 12, dayOfMonth: 30 });
  });

  it('ranh giới tháng/quý không tính day 0', () => {
    expect(isMonthBoundary(0)).toBe(false);
    expect(isMonthBoundary(30)).toBe(true);
    expect(isMonthBoundary(31)).toBe(false);
    expect(isQuarterBoundary(60)).toBe(false);
    expect(isQuarterBoundary(90)).toBe(true);
  });

  it('tuổi tròn năm, kể cả ngày sinh âm', () => {
    expect(ageInYears(-16 * 360, 0)).toBe(16);
    expect(ageInYears(-16 * 360 + 1, 0)).toBe(15);
  });
});

describe('ids', () => {
  it('định dạng có tiền tố và đệm số', () => {
    expect(formatId('loc', 7, 3)).toBe('loc_007');
    expect(characterId(0)).toBe('chr_0000');
  });

  it('nextId tăng bộ đếm từ 1', () => {
    const counters: Counters = { action: 0, event: 0, causal: 0, dispute: 0, choice: 0 };
    expect(nextId(counters, 'action')).toEqual({ id: 'act_000001', seq: 1 });
    expect(nextId(counters, 'action')).toEqual({ id: 'act_000002', seq: 2 });
    expect(nextId(counters, 'event').id).toBe('evt_00000001');
  });

  it('sortedKeys ổn định theo code unit', () => {
    expect(sortedKeys({ chr_0010: 1, chr_0002: 1, fac_01: 1, Z: 1 })).toEqual(['Z', 'chr_0002', 'chr_0010', 'fac_01']);
  });
});
