/**
 * Nghiệm thu Phase 2 (docs/11): 100 năm headless × 10 seed —
 * có NPC đột phá Trúc Cơ, có NPC chết già, checkInvariants xanh mỗi 360 ngày.
 */
import { DAYS_PER_YEAR, assertInvariants, createContext, generateWorld, run, type WorldEvent } from '@tmtg/simulation';
import { describe, expect, it } from 'vitest';

const ctx = createContext();
const SEEDS = Array.from({ length: 10 }, (_, i) => `bench-${String(i).padStart(3, '0')}`);
const oldAgeDeathsBySeed = new Map<string, number>();

describe('Phase 2 — 100 năm × 10 seed', () => {
  it.each(SEEDS)('%s', (seed) => {
    const { state } = generateWorld({ seed, origin: { kind: 'join_faction', factionIndex: 0 } });
    const succeeded: WorldEvent[] = [];
    for (let year = 1; year <= 100; year++) {
      run(state, ctx, {
        untilDay: year * DAYS_PER_YEAR,
        onEvents: (events) => succeeded.push(...events.filter((e) => e.type === 'breakthrough_succeeded')),
      });
      assertInvariants(state);
    }
    const toFoundation = succeeded.filter((e) => e.payload['toRealm'] === 'foundation');
    expect(toFoundation.length).toBeGreaterThan(0);
    for (const c of Object.values(state.characters)) {
      if (!c.alive) expect(Object.values(state.actions).some((a) => a.actorId === c.id)).toBe(false);
    }
    oldAgeDeathsBySeed.set(seed, Object.values(state.characters).filter((c) => !c.isPlayer && c.deathCause === 'old_age').length);
  });

  it('có NPC chết già (gộp 10 seed)', () => {
    const total = [...oldAgeDeathsBySeed.values()].reduce((a, b) => a + b, 0);
    expect(oldAgeDeathsBySeed.size).toBe(SEEDS.length);
    expect(total).toBeGreaterThan(0);
  });
});
