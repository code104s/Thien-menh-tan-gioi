/** Hành động liên quan tông môn: gia nhập, rời, làm nhiệm vụ (docs/09 mục 6, 8). */
import type { ActionRule, SimContext } from '../core/context.ts';
import { createEvent } from '../core/events.ts';
import { clamp } from '../core/math.ts';
import { succeedLeader } from '../systems/lifecycle.ts';
import { livingMembersOf } from '../world/selectors.ts';
import type { Cultivator, Faction, WorldState } from '../types.ts';

const actorOf = (state: WorldState, id: string): Cultivator => state.characters[id]!;

/** Lý do tông môn từ chối nhận `c`, hoặc null nếu nhận. */
export function joinBlocker(state: WorldState, ctx: SimContext, c: Cultivator, faction: Faction | undefined): string | null {
  if (!faction || faction.dissolved) return 'Tông môn không tồn tại';
  if (c.factionId !== null) return 'Đã thuộc một tông môn';
  if (c.locationId !== faction.seatLocationId) return 'Phải đến trụ sở tông môn để bái sư';
  const crowded = livingMembersOf(state, faction.id).length >= ctx.data.balance.actions.joinMaxMembers;
  if (faction.strategy !== 'recruit' && crowded) return 'Tông môn không nhận thêm đệ tử';
  const leader = faction.leaderId ? state.characters[faction.leaderId] : undefined;
  if (leader && (leader.relations[c.id] ?? 0) < 0) return 'Tông chủ không ưa bạn';
  return null;
}

export const joinFactionRule: ActionRule = {
  costSink: 'cultivation',
  priority: 50,
  cancellationPolicy: 'none',
  cost: () => 0,
  duration: (_state, _request, ctx) => ctx.data.balance.actions.joinDays,
  validateStart: (state, request, ctx) =>
    joinBlocker(state, ctx, actorOf(state, request.actorId), request.targetId ? state.factions[request.targetId] : undefined),
  validateComplete: (state, action, ctx) =>
    joinBlocker(state, ctx, actorOf(state, action.actorId), action.targetId ? state.factions[action.targetId] : undefined),
  onComplete: (state, action, ctx) => {
    const c = actorOf(state, action.actorId);
    const faction = state.factions[action.targetId!]!;
    c.factionId = faction.id;
    c.factionRank = 'disciple';
    const template = ctx.data.factionTemplates.find((t) => t.id === faction.templateId);
    const technique = template ? ctx.data.techniques[template.techniqueId] : undefined;
    if (technique && c.spiritRootBp >= technique.minSpiritRootBp) c.techniqueId = technique.id;
    return {
      events: [createEvent(state, {
        type: 'faction_joined',
        severity: c.isPlayer ? 'important' : 'info',
        visibility: 'faction',
        chronicle: true,
        actorId: c.id,
        targetId: faction.id,
        factionIds: [faction.id],
        locationId: c.locationId,
        payload: { factionId: faction.id },
      })],
    };
  },
};

export const leaveFactionRule: ActionRule = {
  costSink: 'cultivation',
  priority: 50,
  cancellationPolicy: 'none',
  cost: () => 0,
  duration: (_state, _request, ctx) => ctx.data.balance.actions.leaveDays,
  validateStart: (state, request) => (actorOf(state, request.actorId).factionId ? null : 'Không thuộc tông môn nào'),
  validateComplete: (state, action) => (actorOf(state, action.actorId).factionId ? null : 'Không thuộc tông môn nào'),
  onComplete: (state, action) => {
    const c = actorOf(state, action.actorId);
    const faction = state.factions[c.factionId!]!;
    const wasLeader = faction.leaderId === c.id;
    c.factionId = null;
    c.factionRank = null;
    const left = createEvent(state, {
      type: 'faction_left',
      severity: c.isPlayer ? 'important' : 'info',
      visibility: 'faction',
      chronicle: true,
      actorId: c.id,
      targetId: faction.id,
      factionIds: [faction.id],
      locationId: c.locationId,
      payload: { factionId: faction.id, wasLeader },
    });
    return { events: [left, ...(wasLeader ? succeedLeader(state, faction, left.id) : [])] };
  },
};

export const dutyRule: ActionRule = {
  costSink: 'cultivation',
  priority: 40,
  cancellationPolicy: 'none',
  cost: () => 0,
  duration: (_state, _request, ctx) => ctx.data.balance.actions.dutyDays,
  validateStart: (state, request) => {
    const c = actorOf(state, request.actorId);
    const faction = c.factionId ? state.factions[c.factionId] : undefined;
    if (!faction || faction.dissolved) return 'Không thuộc tông môn nào';
    if (c.locationId !== faction.seatLocationId) return 'Phải ở trụ sở tông môn để nhận nhiệm vụ';
    return null;
  },
  validateComplete: (state, action) => (actorOf(state, action.actorId).factionId ? null : 'Không còn thuộc tông môn'),
  onComplete: (state, action, ctx) => {
    const c = actorOf(state, action.actorId);
    const faction = state.factions[c.factionId!]!;
    const cfg = ctx.data.balance.actions;
    const pay = Math.min(cfg.dutyPay, faction.treasury);
    faction.treasury -= pay;
    c.spiritStones += pay;
    if (faction.leaderId && faction.leaderId !== c.id) {
      const leader = state.characters[faction.leaderId]!;
      leader.relations[c.id] = clamp((leader.relations[c.id] ?? 0) + cfg.dutyRelation, -100, 100);
    }
    return { payload: { pay } };
  },
};
