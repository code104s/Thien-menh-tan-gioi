/**
 * Bước 5 (ranh giới quý): chiến lược tông môn, tiến giai đoạn tranh chấp, khởi tranh chấp mới
 * (docs/09 mục 8–9). Chuyển quyền sở hữu luôn qua `transferLocationOwnership` (nguyên tử).
 */
import type { SimContext } from '../core/context.ts';
import { DAYS_PER_QUARTER } from '../core/calendar.ts';
import { createEvent } from '../core/events.ts';
import { compareIds, nextId, sortedValues } from '../core/ids.ts';
import { mulDiv } from '../core/math.ts';
import { getStream } from '../core/rng.ts';
import {
  factionPower, isInSeclusion, livingMembersOf, monthlyExpense, neighboringFactions, territoryOf,
} from '../world/selectors.ts';
import { realmPower } from '../rules/realm.ts';
import { addCausalRecord, shiftRelation } from './causality.ts';
import { applyInjury } from './lifecycle.ts';
import type {
  Dispute, EntityId, Faction, FactionStrategy, Severity, SpiritVein, WorldEvent, WorldState,
} from '../types.ts';

export function processQuarterly(state: WorldState, ctx: SimContext): WorldEvent[] {
  return [
    ...driftFactionRelations(state),
    ...chooseStrategies(state, ctx),
    ...advanceDisputes(state, ctx),
    ...startDisputes(state, ctx),
  ];
}

// ── Quan hệ tông môn dịch theo quan hệ giữa thành viên (10%) ───────────────
// Chỉ tính các cặp thành viên đã có quan hệ (≠ 0); không ai có ý kiến thì không dịch.
// (Tính cả cặp 0 sẽ kéo mọi quan hệ tông môn về 0 và triệt tiêu kình địch.)

function driftFactionRelations(state: WorldState): WorldEvent[] {
  const factions = sortedValues(state.factions).filter((f) => !f.dissolved);
  for (const f of factions) {
    const members = livingMembersOf(state, f.id);
    for (const other of factions) {
      if (other.id === f.id) continue;
      const otherMembers = livingMembersOf(state, other.id);
      let sum = 0;
      let count = 0;
      for (const m of members) {
        for (const o of otherMembers) {
          const value = m.relations[o.id];
          if (value !== undefined) { sum += value; count++; }
        }
      }
      if (count === 0) continue;
      const average = Math.trunc(sum / count);
      const current = f.relations[other.id] ?? 0;
      shiftRelation(state, f.id, other.id, Math.trunc((average - current) / 10));
    }
  }
  return [];
}

// ── Chiến lược ─────────────────────────────────────────────────────────────

function chooseStrategies(state: WorldState, ctx: SimContext): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (const f of sortedValues(state.factions)) {
    if (f.dissolved) continue;
    const next = decideStrategy(state, ctx, f);
    if (next === f.strategy) continue;
    const previous = f.strategy;
    f.strategy = next;
    f.strategyChosenDay = state.day;
    events.push(createEvent(state, {
      type: 'strategy_changed',
      severity: 'info',
      visibility: 'faction',
      chronicle: false,
      factionIds: [f.id],
      payload: { factionId: f.id, from: previous, to: next },
    }));
  }
  return events;
}

export function decideStrategy(state: WorldState, ctx: SimContext, f: Faction): FactionStrategy {
  const power = factionPower(state, ctx.data, f.id);
  const neighbors = neighboringFactions(state, f.id).filter((id) => !state.factions[id]!.dissolved);
  const strongest = Math.max(0, ...neighbors.map((id) => factionPower(state, ctx.data, id)));
  const underAttack = Object.values(state.disputes).some((d) => d.defenderId === f.id);
  if (underAttack || power * 10 < strongest * 7) return 'defend';

  const veins = (id: EntityId) => territoryOf(state, id).filter((l) => l.veinId).length;
  const poor = f.treasury < 12 * monthlyExpense(state, ctx.data, f.id);
  const fewerVeins = neighbors.some((id) => veins(id) > veins(f.id));
  if ((poor || fewerVeins) && findDisputeTarget(state, ctx, f)) return 'expand';
  if (livingMembersOf(state, f.id).length < 5) return 'recruit';
  return 'consolidate';
}

/** Linh mạch kề lãnh địa, của tông khác hoặc vô chủ, thỏa điều kiện khởi tranh chấp; yield cao nhất, hòa → ID. */
export function findDisputeTarget(state: WorldState, ctx: SimContext, f: Faction): SpiritVein | null {
  const cfg = ctx.data.balance.dispute;
  const own = new Set(territoryOf(state, f.id).map((l) => l.id));
  const power = factionPower(state, ctx.data, f.id);
  const disputed = new Set(Object.values(state.disputes).map((d) => d.veinId));
  const candidates = sortedValues(state.spiritVeins).filter((v) => {
    const location = state.locations[v.locationId]!;
    if (location.ownerFactionId === f.id || disputed.has(v.id)) return false;
    if (!location.edges.some((e) => own.has(e.to))) return false;
    const ownerId = location.ownerFactionId;
    if (ownerId === null) return true;
    const owner = state.factions[ownerId]!;
    if (owner.dissolved) return false;
    if ((f.relations[ownerId] ?? 0) > cfg.maxRelationToStart) return false;
    if ((f.disputeCooldowns[ownerId] ?? 0) > state.day) return false;
    const ownerPower = factionPower(state, ctx.data, ownerId);
    return power * 10_000 >= ownerPower * cfg.minPowerRatioBp;
  });
  candidates.sort((a, b) => b.yieldPerMonth - a.yieldPerMonth || compareIds(a.id, b.id));
  return candidates[0] ?? null;
}

// ── Chuyển quyền sở hữu (nguyên tử) ───────────────────────────────────────

export function transferLocationOwnership(
  state: WorldState,
  locationId: EntityId,
  toFactionId: EntityId | null,
  causeEventId: EntityId | null,
  severity: Severity,
): WorldEvent {
  const location = state.locations[locationId]!;
  const from = location.ownerFactionId;
  location.ownerFactionId = toFactionId;
  return createEvent(state, {
    type: 'territory_transferred',
    severity,
    visibility: 'public',
    chronicle: true,
    factionIds: [from, toFactionId].filter((x): x is string => x !== null),
    locationId,
    ...(causeEventId !== null ? { causeEventId } : {}),
    payload: { locationId, from, to: toFactionId, veinId: location.veinId },
  });
}

// ── Tranh chấp ─────────────────────────────────────────────────────────────

function playerFactionId(state: WorldState): EntityId | null {
  const p = state.characters[state.playerId];
  return p && p.alive ? p.factionId : null;
}

function severityFor(state: WorldState, factionIds: EntityId[], base: Severity): Severity {
  const pf = playerFactionId(state);
  return pf !== null && factionIds.includes(pf) ? 'critical' : base;
}

function startDisputes(state: WorldState, ctx: SimContext): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (const f of sortedValues(state.factions)) {
    if (f.dissolved || f.strategy !== 'expand') continue;
    if (Object.values(state.disputes).some((d) => d.attackerId === f.id)) continue;
    const vein = findDisputeTarget(state, ctx, f);
    if (!vein) continue;
    const location = state.locations[vein.locationId]!;
    const defenderId = location.ownerFactionId;

    if (defenderId === null) {
      // Linh mạch vô chủ: chiếm ngay, không cần tranh chấp.
      events.push(transferLocationOwnership(state, location.id, f.id, null, 'info'));
      continue;
    }

    const cfg = ctx.data.balance.dispute;
    const defender = state.factions[defenderId]!;
    shiftRelation(state, f.id, defender.id, -20);
    shiftRelation(state, defender.id, f.id, -20);
    const { id } = nextId(state.counters, 'dispute');
    const started = createEvent(state, {
      type: 'dispute_started',
      severity: severityFor(state, [f.id, defender.id], 'important'),
      visibility: 'public',
      chronicle: true,
      actorId: f.id,
      targetId: defender.id,
      factionIds: [f.id, defender.id],
      locationId: location.id,
      payload: { disputeId: id, veinId: vein.id, reason: f.treasury < 12 * monthlyExpense(state, ctx.data, f.id) ? 'kho cạn' : 'ít linh mạch' },
    });
    events.push(started);
    const dispute: Dispute = {
      id, veinId: vein.id, attackerId: f.id, defenderId: defender.id, phase: 'tension', startDay: state.day,
      skirmishCount: 0, attackerScore: 0, defenderScore: 0, causeEventId: started.id, playerStance: null,
    };

    // Chênh lệch quá lớn: bên phòng thủ nhượng bộ ngay.
    const attackerPower = factionPower(state, ctx.data, f.id);
    const defenderPower = factionPower(state, ctx.data, defender.id);
    if (attackerPower * 10_000 >= defenderPower * cfg.concedePowerRatioBp) {
      events.push(...settle(state, ctx, dispute, 'conceded'));
      continue;
    }
    state.disputes[id] = dispute;
    offerParticipation(state, dispute, started.id);
  }
  return events;
}

/** Người chơi là thành viên một bên và không bế quan → lựa chọn tham chiến (ADR-06). */
function offerParticipation(state: WorldState, dispute: Dispute, eventId: EntityId): void {
  const pf = playerFactionId(state);
  if (pf === null || (pf !== dispute.attackerId && pf !== dispute.defenderId)) return;
  if (isInSeclusion(state, state.playerId)) {
    dispute.playerStance = 'avoid';
    return;
  }
  const { id } = nextId(state.counters, 'choice');
  state.pendingChoices.push({
    id,
    kind: 'dispute_participation',
    subjectId: dispute.id,
    eventId,
    createdDay: state.day,
    expiresDay: state.day + DAYS_PER_QUARTER - 1,
    options: [{ id: 'fight', label: 'Tham chiến' }, { id: 'avoid', label: 'Né tránh' }],
    defaultOptionId: 'avoid',
  });
}

function advanceDisputes(state: WorldState, ctx: SimContext): WorldEvent[] {
  const events: WorldEvent[] = [];
  const cfg = ctx.data.balance.dispute;
  for (const dispute of sortedValues(state.disputes)) {
    const attacker = state.factions[dispute.attackerId]!;
    const defender = state.factions[dispute.defenderId]!;
    if (attacker.dissolved || defender.dissolved) {
      events.push(...settle(state, ctx, dispute, 'truce'));
      continue;
    }
    dispute.phase = 'skirmish';
    events.push(skirmish(state, ctx, dispute));
    const total = dispute.attackerScore + dispute.defenderScore;
    const margin = Math.abs(dispute.attackerScore - dispute.defenderScore);
    if (total > 0 && margin * 10_000 >= total * cfg.winMarginBp) {
      events.push(...settle(state, ctx, dispute, dispute.attackerScore > dispute.defenderScore ? 'attacker_won' : 'defender_held'));
    } else if (dispute.skirmishCount >= cfg.maxSkirmishes) {
      events.push(...settle(state, ctx, dispute, 'truce'));
    }
  }
  return events;
}

/** Danh sách người tham chiến của một bên: thành viên sống, không bế quan; người chơi chỉ khi chọn tham chiến. */
function combatants(state: WorldState, dispute: Dispute, factionId: EntityId) {
  return livingMembersOf(state, factionId).filter((c) =>
    !isInSeclusion(state, c.id) && (!c.isPlayer || dispute.playerStance === 'fight'));
}

function skirmish(state: WorldState, ctx: SimContext, dispute: Dispute): WorldEvent {
  const rng = getStream(state.rng, state.seed, `dispute:${dispute.id}`);
  const sides = [dispute.attackerId, dispute.defenderId] as const;
  const scores: number[] = [];
  const casualties: string[] = [];
  for (const factionId of sides) {
    const fighters = combatants(state, dispute, factionId);
    const power = fighters.reduce((sum, c) => sum + realmPower(ctx.data, c.realm, c.stage), 0);
    scores.push(mulDiv(power, 8000 + rng.nextInt(4001), 10_000));
    for (const c of fighters) {
      applyInjury(c, rng.nextRange(10, 40), 'dispute');
      if (c.injury >= 100) casualties.push(c.id);
    }
  }
  dispute.attackerScore += scores[0]!;
  dispute.defenderScore += scores[1]!;
  dispute.skirmishCount += 1;
  return createEvent(state, {
    type: 'dispute_skirmish',
    severity: severityFor(state, [...sides], 'info'),
    visibility: 'public',
    chronicle: false,
    actorId: dispute.attackerId,
    targetId: dispute.defenderId,
    factionIds: [...sides],
    locationId: state.spiritVeins[dispute.veinId]!.locationId,
    causeEventId: dispute.causeEventId,
    payload: {
      disputeId: dispute.id, round: dispute.skirmishCount, attackerGain: scores[0]!, defenderGain: scores[1]!,
      attackerScore: dispute.attackerScore, defenderScore: dispute.defenderScore, mortallyWounded: casualties,
    },
  });
}

type Outcome = 'attacker_won' | 'defender_held' | 'truce' | 'conceded';

function settle(state: WorldState, ctx: SimContext, dispute: Dispute, outcome: Outcome): WorldEvent[] {
  dispute.phase = 'settlement';
  delete state.disputes[dispute.id];
  state.pendingChoices = state.pendingChoices.filter((c) => c.subjectId !== dispute.id);
  const attacker = state.factions[dispute.attackerId]!;
  const defender = state.factions[dispute.defenderId]!;
  const sides = [attacker.id, defender.id];
  const vein = state.spiritVeins[dispute.veinId]!;
  const ended = createEvent(state, {
    type: 'dispute_ended',
    severity: severityFor(state, sides, 'important'),
    visibility: 'public',
    chronicle: true,
    actorId: attacker.id,
    targetId: defender.id,
    factionIds: sides,
    locationId: vein.locationId,
    causeEventId: dispute.causeEventId,
    payload: {
      disputeId: dispute.id, veinId: vein.id, outcome,
      attackerScore: dispute.attackerScore, defenderScore: dispute.defenderScore, rounds: dispute.skirmishCount,
    },
  });
  const events = [ended];
  const cooldownUntil = state.day + ctx.data.balance.dispute.cooldownDays;
  attacker.disputeCooldowns[defender.id] = cooldownUntil;
  defender.disputeCooldowns[attacker.id] = cooldownUntil;

  if (outcome === 'attacker_won' || outcome === 'conceded') {
    events.push(transferLocationOwnership(state, vein.locationId, attacker.id, ended.id, severityFor(state, sides, 'important')));
    addCausalRecord(state, { sourceEventId: ended.id, holderId: defender.id, towardId: attacker.id, type: 'grudge', intensity: 60 });
  } else if (outcome === 'defender_held') {
    addCausalRecord(state, { sourceEventId: ended.id, holderId: attacker.id, towardId: defender.id, type: 'grudge', intensity: 40 });
  } else {
    shiftRelation(state, attacker.id, defender.id, 10);
    shiftRelation(state, defender.id, attacker.id, 10);
  }

  // Người chơi tham chiến: tông chủ ghi ân.
  const player = state.characters[state.playerId];
  if (dispute.playerStance === 'fight' && player?.alive && player.factionId) {
    const leaderId = state.factions[player.factionId]?.leaderId;
    if (leaderId && leaderId !== player.id) {
      addCausalRecord(state, { sourceEventId: ended.id, holderId: leaderId, towardId: player.id, type: 'favor', intensity: 40 });
    }
  }
  return events;
}
