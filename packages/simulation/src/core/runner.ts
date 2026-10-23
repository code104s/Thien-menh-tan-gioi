/** Chạy nhiều tick liên tiếp với một command log; dùng chung cho CLI, test và worker. */
import type { SimContext } from './context.ts';
import { tick, type Interrupt, type InterruptReason } from './tick.ts';
import type { Day, PlayerCommand, WorldEvent, WorldState } from '../types.ts';

export interface RunOptions {
  /** Dừng trước khi xử lý ngày này (state.day === untilDay khi dừng). */
  untilDay: Day;
  /** Command log; chỉ lệnh có issuedAtDay trong đoạn chạy được dùng. */
  commands?: readonly PlayerCommand[];
  /** Lý do interrupt làm dừng chạy; mặc định không dừng (chạy headless). */
  stopOn?: readonly InterruptReason[];
  /** Nhận event theo từng tick thay vì gom lại (tiết kiệm bộ nhớ khi chạy dài). */
  onEvents?: (events: WorldEvent[], day: Day) => void;
}

export interface RunResult {
  ticks: number;
  events: WorldEvent[];
  stoppedBy: Interrupt | null;
}

export function run(state: WorldState, ctx: SimContext, options: RunOptions): RunResult {
  const byDay = new Map<Day, PlayerCommand[]>();
  for (const command of options.commands ?? []) {
    if (command.issuedAtDay < state.day || command.issuedAtDay >= options.untilDay) continue;
    const list = byDay.get(command.issuedAtDay) ?? [];
    list.push(command);
    byDay.set(command.issuedAtDay, list);
  }
  const stopOn = new Set(options.stopOn ?? []);
  const collected: WorldEvent[] = [];
  let ticks = 0;
  while (state.day < options.untilDay) {
    const result = tick(state, byDay.get(state.day) ?? [], ctx);
    ticks++;
    if (options.onEvents) options.onEvents(result.events, result.day);
    else collected.push(...result.events);
    const stop = result.interrupts.find((i) => stopOn.has(i.reason));
    if (stop) return { ticks, events: collected, stoppedBy: stop };
  }
  return { ticks, events: collected, stoppedBy: null };
}
