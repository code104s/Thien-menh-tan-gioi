import { gameData } from '@tmtg/game-data';
import { describe, expect, it } from 'vitest';
import { run } from '../src/core/runner.ts';
import { buildChronicle } from '../src/history/chronicle.ts';
import { generateWorld } from '../src/worldgen/generate.ts';
import type { WorldEvent } from '../src/types.ts';
import { ctx } from './helpers.ts';

describe('Sử ký', () => {
  const { state, events: initial } = generateWorld({ seed: 'bench-002', origin: { kind: 'join_faction', factionIndex: 0 } });
  const log: WorldEvent[] = [...initial];
  run(state, ctx, { untilDay: 30 * 360, onEvents: (e) => log.push(...e) });
  const chronicle = buildChronicle(state, gameData, log);

  it('mỗi dòng trỏ tới đúng một event có thật, theo thứ tự xảy ra', () => {
    const byId = new Map(log.map((e) => [e.id, e]));
    expect(chronicle.length).toBe(log.filter((e) => e.chronicle).length);
    for (const entry of chronicle) {
      const event = byId.get(entry.eventId)!;
      expect(event.chronicle).toBe(true);
      expect(entry.day).toBe(event.day);
      if (entry.causeEventId) expect(byId.has(entry.causeEventId)).toBe(true);
    }
    expect(chronicle.map((e) => e.seq)).toEqual([...chronicle.map((e) => e.seq)].sort((a, b) => a - b));
  });

  it('có văn bản tiếng Việt, không rơi vào mẫu mặc định với các loại chính', () => {
    expect(chronicle[0]!.text).toMatch(/^Thiên Khuyết năm thứ nhất/);
    for (const entry of chronicle) {
      expect(entry.text.length).toBeGreaterThan(5);
      expect(entry.text).not.toMatch(/undefined|NaN/);
      expect(entry.text).not.toContain(`: ${entry.type}.`);
    }
  });

  it('không ghi event không thuộc sử ký', () => {
    const ids = new Set(chronicle.map((c) => c.eventId));
    for (const e of log) if (!e.chronicle) expect(ids.has(e.id)).toBe(false);
  });
});
