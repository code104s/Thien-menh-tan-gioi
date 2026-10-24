import {
  SnapshotError, checkInvariants, createContext, digest, generateWorld, regenerateTerrain, run, toSnapshot,
  type WorldState,
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
    ['thiếu trường địa hình', corrupt((r) => { r.locations.loc_001.anchorCell = null; }), /I12_TERRAIN/],
    ['biome sai ô neo', corrupt((r) => {
      r.locations.loc_001.biomeId = r.locations.loc_001.biomeId === 'rung' ? 'thao_nguyen' : 'rung';
    }), /bất biến địa hình.*I13_TERRAIN/],
  ])('%s', (_label, json, message) => {
    expect(() => parseSnapshot(json)).toThrow(SnapshotError);
    expect(() => parseSnapshot(json)).toThrow(message);
  });
});

/** Snapshot v1 (trước ADR-16): bỏ các trường địa hình khỏi một thế giới v2 và hạ schemaVersion. */
function v1Snapshot(state: WorldState): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dựng dữ liệu cũ không khớp kiểu hiện tại
  const raw = JSON.parse(toSnapshot(state)) as Record<string, any>;
  raw.schemaVersion = 1;
  delete raw.terrainGenVersion;
  delete raw.terrainDigest;
  for (const l of Object.values(raw.locations) as Record<string, unknown>[]) {
    delete l.biomeId;
    delete l.anchorCell;
  }
  return JSON.stringify(raw);
}

describe('migration v1 → v2 (ADR-16)', () => {
  it('save v1 tải được: terrainGenVersion 0, trường địa hình null, địa hình "save cũ"', () => {
    const ctx = createContext();
    const original = world('legacy');
    run(original, ctx, { untilDay: 500 });
    const loaded = parseSnapshot(v1Snapshot(original));
    expect(loaded.schemaVersion).toBe(2);
    expect([loaded.terrainGenVersion, loaded.terrainDigest]).toEqual([0, null]);
    for (const l of Object.values(loaded.locations)) expect([l.biomeId, l.anchorCell]).toEqual([null, null]);
    expect(regenerateTerrain(loaded)).toEqual({ status: 'unavailable', reason: 'legacy_save' });
    // Mô phỏng không phụ thuộc địa hình: chạy tiếp vẫn giữ bất biến.
    run(loaded, ctx, { untilDay: 1500 });
    expect(checkInvariants(loaded)).toEqual([]);
  });

  it('migration không đổi phần còn lại của state', () => {
    const original = world('legacy-same');
    const loaded = parseSnapshot(v1Snapshot(original));
    const strip = (s: WorldState) => {
      const copy = JSON.parse(toSnapshot(s)) as Record<string, unknown>;
      delete copy['terrainGenVersion'];
      delete copy['terrainDigest'];
      for (const l of Object.values(copy['locations'] as Record<string, Record<string, unknown>>)) {
        delete l['biomeId'];
        delete l['anchorCell'];
      }
      return JSON.stringify(copy);
    };
    expect(strip(loaded)).toBe(strip(original));
  });

  it('digest địa hình lệch (generator đổi) không làm hỏng save', () => {
    const json = corrupt((r) => { r.terrainDigest = '0000000000000000'; });
    const loaded = parseSnapshot(json);
    expect(regenerateTerrain(loaded)).toEqual({ status: 'unavailable', reason: 'digest_mismatch' });
  });
});
