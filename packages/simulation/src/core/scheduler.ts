/**
 * Vòng đời ScheduledAction (docs/08): tạo → trừ ví sang reservedCosts (đúng một lần) → running →
 * kết thúc đúng một trong completed | cancelled | failed → xóa khỏi bảng và phát event.
 * Kết thúc một action không còn trong bảng là no-op, nên hiệu ứng không bao giờ bị áp hai lần.
 */
import type { ActionRequest, SimContext } from './context.ts';
import { createEvent } from './events.ts';
import { compareIds, nextId, sortedValues } from './ids.ts';
import { mulDiv } from './math.ts';
import type { Day, EventPayload, ScheduledAction, WorldEvent, WorldState } from '../types.ts';

export type StartResult =
  | { ok: true; action: ScheduledAction; events: WorldEvent[] }
  | { ok: false; reason: string };

export function runningActionOf(state: WorldState, actorId: string): ScheduledAction | undefined {
  return sortedValues(state.actions).find((a) => a.actorId === actorId);
}

export interface ActionPreview {
  ok: boolean;
  reason: string | null;
  /** Chi phí giữ chỗ (0 nếu yêu cầu không hợp lệ đến mức không tính được). */
  cost: number;
  durationDays: number;
}

/** Kiểm tra một yêu cầu hành động mà không đổi state — dùng chung cho startAction và giao diện. */
export function previewAction(state: WorldState, request: ActionRequest, ctx: SimContext): ActionPreview {
  const fail = (reason: string, cost = 0, durationDays = 0): ActionPreview => ({ ok: false, reason, cost, durationDays });
  const actor = state.characters[request.actorId];
  if (!actor) return fail('Nhân vật không tồn tại');
  if (!actor.alive) return fail('Nhân vật đã chết');
  if (runningActionOf(state, actor.id)) return fail('Đang thực hiện hành động khác');
  const rule = ctx.actions[request.type];
  if (!rule) return fail(`Hành động ${request.type} chưa được hỗ trợ`);
  const invalid = rule.validateStart(state, request, ctx);
  if (invalid !== null) return fail(invalid);
  const durationDays = rule.duration ? rule.duration(state, request, ctx) : request.durationDays;
  if (!Number.isSafeInteger(durationDays) || durationDays < 1) return fail('Thời gian thực hiện không hợp lệ');
  const cost = rule.cost(state, request, ctx);
  if (!Number.isSafeInteger(cost) || cost < 0) throw new Error(`Chi phí không hợp lệ cho ${request.type}: ${cost}`);
  if (actor.spiritStones < cost) return fail(`Không đủ linh thạch (cần ${cost}, có ${actor.spiritStones})`, cost, durationDays);
  return { ok: true, reason: null, cost, durationDays };
}

export function startAction(state: WorldState, request: ActionRequest, ctx: SimContext): StartResult {
  const preview = previewAction(state, request, ctx);
  if (!preview.ok) return { ok: false, reason: preview.reason! };
  const actor = state.characters[request.actorId]!;
  const rule = ctx.actions[request.type]!;
  const { cost, durationDays } = preview;

  const { id, seq } = nextId(state.counters, 'action');
  actor.spiritStones -= cost;
  const action: ScheduledAction = {
    id,
    actorId: actor.id,
    type: request.type,
    ...(request.targetId !== undefined ? { targetId: request.targetId } : {}),
    locationId: actor.locationId,
    startDay: state.day,
    dueDay: state.day + durationDays,
    priority: rule.priority,
    seq,
    status: 'running',
    reservedCosts: { spiritStones: cost },
    cancellationPolicy: rule.cancellationPolicy,
    source: request.source,
    meta: { progressGained: 0 },
  };
  state.actions[id] = action;
  actor.needsReview = false;
  return { ok: true, action, events: rule.onStart?.(state, action, ctx) ?? [] };
}

/** Action đến hạn trong ngày, theo thứ tự (priority, actorId, seq). */
export function dueActions(state: WorldState, day: Day): ScheduledAction[] {
  return Object.values(state.actions)
    .filter((a) => a.dueDay === day)
    .sort((a, b) => a.priority - b.priority || compareIds(a.actorId, b.actorId) || a.seq - b.seq);
}

/** Phần chi phí được hoàn khi dừng action tại ngày `day`. */
export function refundAmount(action: ScheduledAction, day: Day): number {
  const reserved = action.reservedCosts.spiritStones;
  const total = action.dueDay - action.startDay;
  const remaining = Math.max(0, action.dueDay - day);
  switch (action.cancellationPolicy) {
    case 'refund_full':
      return reserved;
    case 'refund_prorated':
      return total > 0 ? mulDiv(reserved, remaining, total) : 0;
    case 'refund_half_remaining':
      return total > 0 ? mulDiv(reserved, remaining, total * 2) : 0;
    case 'none':
      return 0;
  }
}

type Ending = 'completed' | 'cancelled' | 'failed';

export interface FinishOptions {
  reason?: string;
  /** Gộp vào payload của event kết thúc. */
  payload?: EventPayload;
}

/**
 * Kết thúc action: hoàn phần chi phí theo policy (completed: không hoàn), phần còn lại bị hủy vào sổ cái.
 * Khi hủy, gọi `onCancel` của luật. Trả mảng rỗng nếu action đã kết thúc trước đó (idempotent).
 */
export function finishAction(
  state: WorldState,
  actionId: string,
  ending: Ending,
  ctx: SimContext,
  options: FinishOptions = {},
): WorldEvent[] {
  const action = state.actions[actionId];
  if (!action) return [];
  delete state.actions[actionId];
  action.status = ending;
  const rule = ctx.actions[action.type];

  const reserved = action.reservedCosts.spiritStones;
  const refund = ending === 'completed' ? 0 : refundAmount(action, state.day);
  const consumed = reserved - refund;
  const actor = state.characters[action.actorId];
  if (actor) {
    actor.spiritStones += refund;
    actor.needsReview = actor.alive && !actor.isPlayer;
  }
  const sink = rule?.costSink ?? 'cultivation';
  state.ledger.burned[sink] += consumed;
  action.reservedCosts = { spiritStones: 0 };

  const type = ending === 'completed' ? 'action_completed' : ending === 'cancelled' ? 'action_cancelled' : 'action_failed';
  const ended = createEvent(state, {
    type,
    severity: actor?.isPlayer && ending === 'failed' ? 'critical' : 'info',
    visibility: 'secret',
    chronicle: false,
    actorId: action.actorId,
    ...(action.targetId !== undefined ? { targetId: action.targetId } : {}),
    locationId: action.locationId,
    payload: {
      actionId: action.id,
      actionType: action.type,
      refund,
      consumed,
      ...options.payload,
      ...(options.reason !== undefined ? { reason: options.reason } : {}),
    },
  });
  const extra = ending === 'cancelled' ? rule?.onCancel?.(state, action, ctx) ?? [] : [];
  return [ended, ...extra];
}
