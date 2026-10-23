/**
 * Nghiệm thu Phase 1 (docs/06 "Determinism", docs/11 task 1.13):
 * - 10 seed × cùng chuỗi lệnh × 2 lần chạy → cùng digest;
 * - save năm 5 → load → chạy đến năm 20 = chạy liền 20 năm;
 * - seed khác thường cho kết quả khác.
 * Dùng bộ luật mặc định (NPC tự hành động); fixture lệnh có cả lệnh hợp lệ, lệnh bị từ chối và lệnh trùng.
 */
import { readFileSync } from 'node:fs';
import { playerCommandSchema } from '@tmtg/shared';
import { createContext, type PlayerCommand } from '@tmtg/simulation';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { runScenario, type Scenario } from '../../tools/headless/src/scenario.ts';

const commands: PlayerCommand[] = z
  .array(playerCommandSchema)
  .parse(JSON.parse(readFileSync('tests/fixtures/commands/phase1-basic.json', 'utf8')));

const ctx = createContext();
const SEEDS = Array.from({ length: 10 }, (_, i) => `det-${i}`);
const scenario = (seed: string, extra: Partial<Scenario> = {}): Scenario => ({
  seed, origin: { kind: 'join_faction', factionIndex: 0 }, years: 20, commands, ctx, ...extra,
});

describe('determinism', () => {
  it('fixture lệnh hợp lệ theo schema', () => {
    expect(commands).toHaveLength(10);
  });

  it.each(SEEDS)('%s: hai lần chạy cùng digest, save năm 5 → load → năm 20 cùng digest', (seed) => {
    const first = runScenario(scenario(seed));
    const second = runScenario(scenario(seed));
    const resumed = runScenario(scenario(seed, { saveAtYear: 5 }));
    expect(first.invariantViolations).toBe(0);
    expect(second.digest).toBe(first.digest);
    expect(resumed.digest).toBe(first.digest);
    expect(first.state.lastCommandSeq).toBe(9);
    expect(first.state.ledger.burned.cultivation).toBeGreaterThan(0);
  });

  it('seed khác cho digest khác', () => {
    const digests = new Set(SEEDS.map((seed) => runScenario(scenario(seed, { years: 1 })).digest));
    expect(digests.size).toBe(SEEDS.length);
  });

  it('lệnh khác cho digest khác', () => {
    const base = runScenario(scenario('det-0')).digest;
    const fewer = runScenario(scenario('det-0', { commands: commands.slice(0, 3) })).digest;
    expect(fewer).not.toBe(base);
  });
});
