/**
 * Một tick = một ngày, xử lý nguyên tử theo thứ tự chốt ở docs/09 mục 1.
 * Event phát ra ở một bước chỉ được các bước SAU trong cùng tick nhìn thấy.
 */
import { applyCommands } from './commands.ts';
import type { SimContext } from './context.ts';
import { dueActions, finishAction } from './scheduler.ts';
import { processCultivation } from '../systems/cultivation.ts';
import { processDeaths, processMonthlyCharacters } from '../systems/lifecycle.ts';
import { processNpcPlanning } from '../ai/planner.ts';
import { processMonthlyFactions } from '../systems/economy.ts';
import { processQuarterly } from '../systems/factions.ts';
import { processNews, type KnownEvent } from '../systems/news.ts';
import { expireChoices } from '../systems/choices.ts';
import { isMonthBoundary, isQuarterBoundary } from './calendar.ts';
import type { PlayerCommand, Severity, WorldEvent, WorldState } from '../types.ts';

export type InterruptReason =
  | 'critical_event' | 'important_event' | 'player_action_finished' | 'choice_required' | 'game_over';

export interface Interrupt {
  reason: InterruptReason;
  eventId: string;
}

export interface TickResult {
  /** Ngày vừa được xử lý. */
  day: number;
  events: WorldEvent[];
  interrupts: Interrupt[];
  /** Event người chơi biết trong tick này (kể cả tin đến trễ của event cũ). */
  playerKnown: KnownEvent[];
}

/**
 * @param preApplied event do lệnh đã được áp sẵn ở đầu ngày này (applyCommands gọi trước tick, vd. khi
 *   người chơi ra lệnh lúc Pause). Chúng được xử lý như thể sinh ra ở bước 0, nên kết quả trùng replay.
 */
export function tick(
  state: WorldState,
  commands: readonly PlayerCommand[],
  ctx: SimContext,
  preApplied: readonly WorldEvent[] = [],
): TickResult {
  const day = state.day;
  const events: WorldEvent[] = [...preApplied];

  // 0. Lệnh người chơi đến hạn; lựa chọn quá hạn nhận phương án mặc định.
  events.push(...applyCommands(state, commands, ctx));
  events.push(...expireChoices(state));

  // Sau khi người chơi chết (ADR-07) thế giới vẫn vận hành; chỉ lệnh bị từ chối ở bước 0.
  // 1. Tử vong, hủy action của người chết, kế nhiệm.
  events.push(...processDeaths(state, ctx));
  // 2. Hoàn tất action đến hạn.
  events.push(...completeDueActions(state, ctx));
  // 3. Tu luyện hằng ngày.
  events.push(...processCultivation(state, ctx));
  // 4. Ranh giới tháng: kinh tế tông môn, rồi hồi thương và tái sinh tài nguyên địa điểm.
  if (isMonthBoundary(day)) {
    events.push(...processMonthlyFactions(state, ctx));
    events.push(...processMonthlyCharacters(state, ctx));
  }
  // 5. Ranh giới quý: quan hệ, chiến lược tông môn, tranh chấp.
  if (isQuarterBoundary(day)) events.push(...processQuarterly(state, ctx));
  // 6. NPC lập kế hoạch.
  events.push(...processNpcPlanning(state, ctx));
  // 7. Truyền tin, ký ức, nhân quả.
  const { playerKnown } = processNews(state, ctx, events);

  // 8. Interrupt.
  const interrupts = detectInterrupts(state, events, playerKnown);

  // 9. Sang ngày mới.
  state.day = day + 1;
  return { day, events, interrupts, playerKnown };
}

function completeDueActions(state: WorldState, ctx: SimContext): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (const action of dueActions(state, state.day)) {
    // Action có thể đã bị kết thúc bởi hiệu ứng của action xử lý trước trong cùng ngày.
    if (!state.actions[action.id]) continue;
    const actor = state.characters[action.actorId];
    const rule = ctx.actions[action.type];
    let failure: string | null = null;
    if (!actor || !actor.alive) failure = 'Nhân vật không còn';
    else if (!rule) failure = `Hành động ${action.type} chưa được hỗ trợ`;
    else failure = rule.validateComplete?.(state, action, ctx) ?? null;

    if (failure !== null) {
      events.push(...finishAction(state, action.id, 'failed', ctx, { reason: failure }));
      continue;
    }
    const result = rule!.onComplete?.(state, action, ctx) ?? {};
    events.push(...finishAction(state, action.id, 'completed', ctx, result.payload ? { payload: result.payload } : {}));
    events.push(...(result.events ?? []));
  }
  return events;
}

const SEVERITY_REASON: Partial<Record<Severity, InterruptReason>> = {
  critical: 'critical_event',
  important: 'important_event',
};

/**
 * Interrupt chỉ dựa trên những gì người chơi đã biết trong tick này (ADR-08),
 * cộng với action của chính người chơi, lựa chọn mới và cái chết của người chơi.
 */
function detectInterrupts(state: WorldState, events: readonly WorldEvent[], playerKnown: readonly KnownEvent[]): Interrupt[] {
  const interrupts: Interrupt[] = [];
  for (const event of events) {
    const own = event.actorId === state.playerId;
    if (own && (event.type === 'action_completed' || event.type === 'action_failed')) {
      interrupts.push({ reason: 'player_action_finished', eventId: event.id });
      if (event.severity === 'critical') interrupts.push({ reason: 'critical_event', eventId: event.id });
    }
  }
  for (const known of playerKnown) {
    const reason = SEVERITY_REASON[known.severity];
    if (reason) interrupts.push({ reason, eventId: known.eventId });
  }
  for (const choice of state.pendingChoices) {
    if (choice.createdDay === state.day) interrupts.push({ reason: 'choice_required', eventId: choice.eventId });
  }
  if (state.gameOver && events.some((e) => e.id === state.gameOver!.eventId)) {
    interrupts.push({ reason: 'game_over', eventId: state.gameOver.eventId });
  }
  return interrupts;
}
