/**
 * Nghiệm thu Phase 3 (docs/11): xung đột sinh từ trạng thái tài nguyên; quyền sở hữu không mâu thuẫn;
 * lịch sử phản ánh đúng event. 10 seed × 50 năm, kiểm bất biến mỗi năm.
 */
import { gameData } from '@tmtg/game-data';
import {
  DAYS_PER_YEAR, assertInvariants, buildChronicle, createContext, generateWorld, run, type WorldEvent,
} from '@tmtg/simulation';
import { describe, expect, it } from 'vitest';

const ctx = createContext();
const SEEDS = Array.from({ length: 10 }, (_, i) => `bench-${String(i).padStart(3, '0')}`);
const disputesBySeed = new Map<string, number>();

describe('Phase 3 — 50 năm × 10 seed', () => {
  it.each(SEEDS)('%s', (seed) => {
    const { state, events: initial } = generateWorld({ seed, origin: { kind: 'join_faction', factionIndex: 0 } });
    const log: WorldEvent[] = [...initial];
    for (let year = 1; year <= 50; year++) {
      run(state, ctx, { untilDay: year * DAYS_PER_YEAR, onEvents: (e) => log.push(...e) });
      assertInvariants(state);
    }
    const byId = new Map(log.map((e) => [e.id, e]));

    // Mỗi tranh chấp có nguyên nhân tài nguyên và kết thúc trỏ về sự kiện khởi phát.
    for (const e of log.filter((x) => x.type === 'dispute_started')) {
      expect(['kho cạn', 'ít linh mạch']).toContain(e.payload['reason']);
    }
    for (const e of log.filter((x) => x.type === 'dispute_ended')) {
      expect(byId.get(e.causeEventId!)?.type).toBe('dispute_started');
    }
    // Mọi lần chuyển quyền có nguyên nhân là kết thúc tranh chấp, hoặc chiếm đất vô chủ.
    for (const e of log.filter((x) => x.type === 'territory_transferred')) {
      if (e.payload['from'] === null) expect(e.causeEventId).toBeUndefined();
      else expect(byId.get(e.causeEventId!)?.type).toBe('dispute_ended');
    }
    // Sử ký chỉ chứa event có thật.
    const chronicle = buildChronicle(state, gameData, log);
    for (const entry of chronicle) expect(byId.get(entry.eventId)?.chronicle).toBe(true);
    // Mọi bản ghi nhân quả gắn với event có thật hoặc event gốc nằm trong log.
    for (const r of Object.values(state.causalRecords)) expect(byId.has(r.sourceEventId)).toBe(true);

    disputesBySeed.set(seed, log.filter((e) => e.type === 'dispute_started').length);
  });

  it('xung đột phát sinh ở nhiều seed', () => {
    const withDispute = [...disputesBySeed.values()].filter((n) => n > 0).length;
    expect(disputesBySeed.size).toBe(SEEDS.length);
    expect(withDispute).toBeGreaterThanOrEqual(5);
  });
});
