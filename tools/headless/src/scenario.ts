/** Kịch bản chạy headless dùng chung cho CLI, benchmark và test tất định. */
import {
  DAYS_PER_YEAR, checkInvariants, createContext, digest, generateWorld, run, toSnapshot,
  type PlayerCommand, type PlayerOrigin, type SimContext, type WorldEvent, type WorldState,
} from '@tmtg/simulation';
import { parseSnapshot } from '@tmtg/shared';

export interface Scenario {
  seed: string;
  origin: PlayerOrigin;
  years: number;
  commands?: readonly PlayerCommand[];
  /** Nếu có: lưu snapshot ở năm này, tải lại rồi chạy tiếp (kiểm tra save/load). */
  saveAtYear?: number;
  ctx?: SimContext;
  /** Giữ lại event có chronicle = true (Sử ký). */
  keepChronicle?: boolean;
}

export interface ScenarioResult {
  state: WorldState;
  digest: string;
  ticks: number;
  eventCount: number;
  snapshotBytes: number;
  invariantViolations: number;
  eventTypes: Record<string, number>;
  chronicle: WorldEvent[];
}

export function runScenario(scenario: Scenario): ScenarioResult {
  const ctx = scenario.ctx ?? createContext();
  const generated = generateWorld({ seed: scenario.seed, origin: scenario.origin });
  let state = generated.state;
  let eventCount = generated.events.length;
  let ticks = 0;
  const eventTypes: Record<string, number> = { world_created: 1 };
  const chronicle: WorldEvent[] = scenario.keepChronicle ? generated.events.filter((e) => e.chronicle) : [];
  const onEvents = (events: WorldEvent[]) => {
    eventCount += events.length;
    for (const e of events) {
      eventTypes[e.type] = (eventTypes[e.type] ?? 0) + 1;
      if (scenario.keepChronicle && e.chronicle) chronicle.push(e);
    }
  };
  const endDay = scenario.years * DAYS_PER_YEAR;
  const commands = scenario.commands ?? [];

  if (scenario.saveAtYear !== undefined) {
    ticks += run(state, ctx, { untilDay: scenario.saveAtYear * DAYS_PER_YEAR, commands, onEvents }).ticks;
    state = parseSnapshot(toSnapshot(state));
  }
  ticks += run(state, ctx, { untilDay: endDay, commands, onEvents }).ticks;

  const snapshot = toSnapshot(state);
  return {
    state,
    digest: digest(state),
    ticks,
    eventCount,
    snapshotBytes: snapshot.length,
    invariantViolations: checkInvariants(state).length,
    eventTypes,
    chronicle,
  };
}

export function parseOrigin(text: string): PlayerOrigin {
  if (text === 'rogue') return { kind: 'rogue' };
  if (text === 'seeker') return { kind: 'resource_seeker' };
  const match = /^join:([012])$/.exec(text);
  if (match) return { kind: 'join_faction', factionIndex: Number(match[1]) as 0 | 1 | 2 };
  throw new Error(`Xuất thân không hợp lệ: "${text}" (dùng join:0|join:1|join:2|rogue|seeker)`);
}
