import {
  SnapshotError, createContext, digest, generateWorld, run, toSnapshot, type WorldState,
} from '@tmtg/simulation';
import { describe, expect, it } from 'vitest';
import { parseSnapshot, worldStateSchema } from '../src/index.ts';

const world = (seed = 'save') => generateWorld({ seed, origin: { kind: 'join_faction', factionIndex: 1 } }).state;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test cố ý làm hỏng dữ liệu tùy ý
function corrupt(mutate: (raw: Record<string, any>) => void): string {
  const raw = JSON.parse(toSnapshot(world()));
  mutate(raw);
  return JSON.stringify(raw);
}

describe('schema Zod', () => {
  it('chấp nhận thế giới sinh ra từ 100 seed', () => {
    for (let i = 0; i < 100; i++) {
      const result = worldStateSchema.safeParse(world(`zod-${i}`));
      expect(result.success, JSON.stringify(result.error?.issues.slice(0, 3))).toBe(true);
    }
  });
});

describe('snapshot round-trip', () => {
  it('giữ nguyên digest, kể cả sau khi chạy tiếp', () => {
    const ctx = createContext();
    const a = world();
    run(a, ctx, { untilDay: 400 });
    const b = parseSnapshot(toSnapshot(a));
    expect(digest(b)).toBe(digest(a));
    run(a, ctx, { untilDay: 900 });
    run(b, ctx, { untilDay: 900 });
    expect(digest(b)).toBe(digest(a));
  });

  it('snapshot là canonical: cùng state cho cùng chuỗi', () => {
    const s = world();
    const shuffled = JSON.parse(toSnapshot(s)) as WorldState;
    expect(toSnapshot(shuffled)).toBe(toSnapshot(s));
  });
});

describe('save hỏng bị từ chối với thông báo rõ', () => {
  it.each([
    ['JSON hỏng', '{"schemaVersion": 1,', /không đọc được JSON/],
    ['không phải object', '[1,2,3]', /không phải object/],
    ['schema mới hơn', corrupt((r) => { r.schemaVersion = 99; }), /phiên bản mới hơn/],
    ['thiếu trường', corrupt((r) => { delete r.characters; }), /sai cấu trúc.*characters/],
    ['linh thạch âm', corrupt((r) => { r.characters.chr_0001.spiritStones = -5; }), /sai cấu trúc/],
    ['số thực', corrupt((r) => { r.day = 1.5; }), /sai cấu trúc/],
    ['linh thạch từ hư không', corrupt((r) => { r.characters.chr_0001.spiritStones += 1; }), /I8_STONES/],
    ['tham chiếu hỏng', corrupt((r) => { r.characters.chr_0001.locationId = 'loc_999'; }), /I1_REFERENCE/],
  ])('%s', (_label, json, message) => {
    expect(() => parseSnapshot(json)).toThrow(SnapshotError);
    expect(() => parseSnapshot(json)).toThrow(message);
  });
});
