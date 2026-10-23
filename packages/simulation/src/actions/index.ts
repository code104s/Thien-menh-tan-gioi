/**
 * Luật các hành động (docs/09 mục 6).
 * Một bộ luật duy nhất cho cả NPC và người chơi.
 */
import type { ActionRegistry, ActionRequest, ActionRule, SimContext } from '../core/context.ts';
import { DAYS_PER_MONTH } from '../core/calendar.ts';
import { createEvent } from '../core/events.ts';
import { divCeil, mulDiv } from '../core/math.ts';
import { resolveBreakthrough, breakthroughBlocker, breakthroughCost } from '../rules/breakthrough.ts';
import { isProgressCapped } from '../rules/cultivation.ts';
import { realmPower } from '../rules/realm.ts';
import type { Cultivator, ScheduledAction, WorldState } from '../types.ts';
import { dutyRule, joinFactionRule, leaveFactionRule } from './faction.ts';
import { confrontRule } from './confront.ts';

const actorOf = (state: WorldState, id: string): Cultivator => state.characters[id]!;
const months = (days: number) => divCeil(days, DAYS_PER_MONTH);

function rangeReason(days: number, [min, max]: readonly [number, number], label: string): string | null {
  if (!Number.isSafeInteger(days) || days < min || days > max) return `${label} phải từ ${min} đến ${max} ngày`;
  return null;
}

function techniqueCost(state: WorldState, request: ActionRequest, ctx: SimContext): number {
  const c = actorOf(state, request.actorId);
  const technique = c.techniqueId ? ctx.data.techniques[c.techniqueId] : undefined;
  return (technique?.stonesPerMonth ?? 0) * months(request.durationDays);
}

function cappedReason(state: WorldState, request: ActionRequest, ctx: SimContext): string | null {
  const c = actorOf(state, request.actorId);
  if (!isProgressCapped(ctx.data, c)) return null;
  return c.realm === 'golden_core' ? 'Đã đạt đỉnh tu vi của phiên bản này' : 'Tu vi đã viên mãn, cần đột phá';
}

export const travelRule: ActionRule = {
  costSink: 'cultivation',
  priority: 20,
  cancellationPolicy: 'none',
  cost: () => 0,
  duration: (state, request) => {
    const from = state.locations[actorOf(state, request.actorId).locationId]!;
    return from.edges.find((e) => e.to === request.targetId)?.travelDays ?? 0;
  },
  validateStart: (state, request) => {
    if (!request.targetId || !state.locations[request.targetId]) return 'Chưa chọn nơi đến';
    const from = state.locations[actorOf(state, request.actorId).locationId]!;
    if (!from.edges.some((e) => e.to === request.targetId)) return 'Nơi đến không kề địa điểm hiện tại';
    return null;
  },
  onComplete: (state, action) => {
    actorOf(state, action.actorId).locationId = action.targetId!;
    return { payload: { from: action.locationId, to: action.targetId! } };
  },
};

export const cultivateRule: ActionRule = {
  costSink: 'cultivation',
  priority: 30,
  cancellationPolicy: 'refund_prorated',
  cost: techniqueCost,
  validateStart: (state, request, ctx) =>
    rangeReason(request.durationDays, ctx.data.balance.actions.cultivateDays, 'Thời gian tu luyện')
    ?? cappedReason(state, request, ctx),
  onComplete: (_state, action) => ({ payload: { progressGained: action.meta.progressGained } }),
};

function seclusionEvent(state: WorldState, action: ScheduledAction, type: 'seclusion_started' | 'seclusion_ended', early: boolean) {
  const c = actorOf(state, action.actorId);
  return createEvent(state, {
    type,
    severity: 'info',
    visibility: 'faction',
    chronicle: c.isPlayer,
    actorId: c.id,
    locationId: action.locationId,
    ...(c.factionId ? { factionIds: [c.factionId] } : {}),
    payload: { plannedDays: action.dueDay - action.startDay, progressGained: action.meta.progressGained, early },
  });
}

export const seclusionRule: ActionRule = {
  costSink: 'cultivation',
  priority: 30,
  cancellationPolicy: 'refund_half_remaining',
  cost: techniqueCost,
  validateStart: (state, request, ctx) =>
    rangeReason(request.durationDays, ctx.data.balance.actions.seclusionDays, 'Thời gian bế quan')
    ?? cappedReason(state, request, ctx),
  onStart: (state, action) => [seclusionEvent(state, action, 'seclusion_started', false)],
  onComplete: (state, action) => ({ events: [seclusionEvent(state, action, 'seclusion_ended', false)] }),
  /** Xuất quan sớm (ADR-06): mất một phần tu vi đã tăng trong lần bế quan, kẹp trong tầng hiện tại. */
  onCancel: (state, action, ctx) => {
    const c = actorOf(state, action.actorId);
    const loss = mulDiv(action.meta.progressGained, ctx.data.balance.actions.seclusionEarlyExitLossBp, 10_000);
    c.progress = Math.max(0, c.progress - loss);
    return [seclusionEvent(state, action, 'seclusion_ended', true)];
  },
};

export const gatherRule: ActionRule = {
  costSink: 'cultivation',
  priority: 40,
  cancellationPolicy: 'none',
  cost: () => 0,
  duration: (_state, _request, ctx) => ctx.data.balance.actions.gatherDays,
  validateStart: (state, request) =>
    state.locations[actorOf(state, request.actorId).locationId]!.resourceStock > 0 ? null : 'Nơi này đã cạn tài nguyên',
  onComplete: (state, action, ctx) => {
    const c = actorOf(state, action.actorId);
    const location = state.locations[action.locationId]!;
    const cfg = ctx.data.balance.actions;
    const take = Math.min(location.resourceStock, cfg.gatherBase + cfg.gatherPerPower * realmPower(ctx.data, c.realm, c.stage));
    location.resourceStock -= take;
    c.spiritStones += take;
    state.ledger.minted.location_gather += take;
    return { payload: { gathered: take } };
  },
};

export const healRule: ActionRule = {
  costSink: 'pill_consumed',
  priority: 10,
  cancellationPolicy: 'refund_prorated',
  cost: (_state, request, ctx) => ctx.data.balance.economy.healStonesPerMonth * months(request.durationDays),
  validateStart: (state, request, ctx) =>
    rangeReason(request.durationDays, ctx.data.balance.actions.healDays, 'Thời gian dưỡng thương')
    ?? (actorOf(state, request.actorId).injury > 0 ? null : 'Không bị thương'),
};

export const breakthroughRule: ActionRule = {
  costSink: 'breakthrough',
  priority: 0,
  cancellationPolicy: 'refund_full',
  cost: (state, request, ctx) => breakthroughCost(ctx.data, actorOf(state, request.actorId)),
  duration: (_state, _request, ctx) => ctx.data.balance.breakthrough.durationDays,
  validateStart: (state, request, ctx) => breakthroughBlocker(ctx.data, actorOf(state, request.actorId), state.day),
  validateComplete: (state, action, ctx) => breakthroughBlocker(ctx.data, actorOf(state, action.actorId), state.day),
  onComplete: (state, action, ctx) => ({ events: resolveBreakthrough(state, ctx.data, actorOf(state, action.actorId)) }),
};

export const defaultActionRules: ActionRegistry = {
  travel: travelRule,
  cultivate: cultivateRule,
  seclusion: seclusionRule,
  gather: gatherRule,
  heal: healRule,
  breakthrough: breakthroughRule,
  duty: dutyRule,
  join_faction: joinFactionRule,
  leave_faction: leaveFactionRule,
  confront: confrontRule,
};
