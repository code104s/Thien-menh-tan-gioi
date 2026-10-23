/**
 * Vòng đời nhân vật: tử vong (bước 1), xử lý tài sản, kế nhiệm/giải tán tông môn,
 * hồi thương và tái sinh tài nguyên hằng tháng (bước 4). Luật chung cho NPC và người chơi.
 */
import type { SimContext } from '../core/context.ts';
import { createEvent } from '../core/events.ts';
import { compareIds, sortedValues } from '../core/ids.ts';
import { clamp } from '../core/math.ts';
import { finishAction, runningActionOf } from '../core/scheduler.ts';
import { cultivationRank } from '../rules/cultivation.ts';
import { leaveDaoMark } from './daomark.ts';
import type { Cultivator, DeathCause, Faction, WorldEvent, WorldState } from '../types.ts';

export const MAX_INJURY = 100;

/** Cộng thương tích (kẹp 100) và ghi nguồn gây thương tích. */
export function applyInjury(c: Cultivator, amount: number, cause: DeathCause): void {
  c.injury = clamp(c.injury + amount, 0, MAX_INJURY);
  if (amount > 0) c.lastInjuryCause = cause;
}

export function processDeaths(state: WorldState, ctx: SimContext): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (const c of sortedValues(state.characters)) {
    if (!c.alive) continue;
    if (state.day - c.birthDay >= c.lifespanDays) events.push(...killCharacter(state, ctx, c, 'old_age'));
    else if (c.injury >= MAX_INJURY) events.push(...killCharacter(state, ctx, c, c.lastInjuryCause ?? 'injury'));
  }
  return events;
}

export function killCharacter(state: WorldState, ctx: SimContext, c: Cultivator, cause: DeathCause): WorldEvent[] {
  const events: WorldEvent[] = [];
  const action = runningActionOf(state, c.id);
  if (action) {
    events.push(...finishAction(state, action.id, 'failed', ctx, { reason: 'Nhân vật đã chết' }));
  }
  c.alive = false;
  c.deathDay = state.day;
  c.deathCause = cause;
  c.plan = null;
  c.needsReview = false;

  const faction = c.factionId ? state.factions[c.factionId] : undefined;
  const playerFactionId = state.characters[state.playerId]?.factionId ?? null;
  const isPlayerLeader = faction !== undefined && faction.leaderId === c.id && faction.id === playerFactionId;
  const died = createEvent(state, {
    type: 'character_died',
    severity: c.isPlayer || isPlayerLeader ? 'critical' : faction?.leaderId === c.id ? 'important' : 'info',
    visibility: 'public',
    chronicle: true,
    actorId: c.id,
    locationId: c.locationId,
    ...(faction ? { factionIds: [faction.id] } : {}),
    payload: { cause, realm: c.realm, stage: c.stage, ageDays: state.day - c.birthDay, estate: c.spiritStones },
  });
  events.push(died);
  if (c.realm === 'golden_core') events.push(...leaveDaoMark(state, ctx.data, c, died.id));

  // Tài sản: về kho tông môn nếu còn, ngược lại bị hủy.
  if (faction && !faction.dissolved) faction.treasury += c.spiritStones;
  else state.ledger.burned.unclaimed_estate += c.spiritStones;
  c.spiritStones = 0;

  if (faction && faction.leaderId === c.id) events.push(...succeedLeader(state, faction, died.id));
  else if (faction && !faction.dissolved && livingMembers(state, faction.id).length === 0) {
    events.push(dissolveFaction(state, faction, died.id));
  }

  if (c.isPlayer) state.gameOver = { day: state.day, cause, eventId: died.id };
  return events;
}

export function livingMembers(state: WorldState, factionId: string): Cultivator[] {
  return sortedValues(state.characters).filter((c) => c.alive && c.factionId === factionId);
}

/** Kế nhiệm: tu vi cao nhất; hòa → lớn tuổi hơn; hòa → ID (docs/09 mục 8). */
export function succeedLeader(state: WorldState, faction: Faction, causeEventId: string): WorldEvent[] {
  const candidates = livingMembers(state, faction.id).sort((a, b) => {
    const ra = cultivationRank(a);
    const rb = cultivationRank(b);
    return rb[0] - ra[0] || rb[1] - ra[1] || rb[2] - ra[2] || a.birthDay - b.birthDay || compareIds(a.id, b.id);
  });
  const playerFactionId = state.characters[state.playerId]?.factionId ?? null;
  const severity = faction.id === playerFactionId ? 'critical' : 'important';
  const heir = candidates[0];
  if (!heir) {
    faction.leaderId = null;
    return [dissolveFaction(state, faction, causeEventId)];
  }
  // Chỉ ghi nhận "trống chức" khi thật sự không có ai; có thành viên thì luôn có người kế nhiệm.
  heir.factionRank = 'leader';
  faction.leaderId = heir.id;
  return [createEvent(state, {
    type: 'leader_succeeded',
    severity,
    visibility: 'public',
    chronicle: true,
    actorId: heir.id,
    factionIds: [faction.id],
    causeEventId,
    payload: { factionId: faction.id },
  })];
}

function dissolveFaction(state: WorldState, faction: Faction, causeEventId: string): WorldEvent {
  faction.dissolved = true;
  faction.leaderId = null;
  for (const l of sortedValues(state.locations)) {
    if (l.ownerFactionId === faction.id) l.ownerFactionId = null;
  }
  state.ledger.burned.unclaimed_estate += faction.treasury;
  faction.treasury = 0;
  return createEvent(state, {
    type: 'faction_dissolved',
    severity: 'important',
    visibility: 'public',
    chronicle: true,
    factionIds: [faction.id],
    causeEventId,
    payload: { factionId: faction.id },
  });
}

/** Bước 4 (phần nhân vật và địa điểm): hồi thương, tái sinh tài nguyên địa điểm. */
export function processMonthlyCharacters(state: WorldState, ctx: SimContext): WorldEvent[] {
  const economy = ctx.data.balance.economy;
  for (const c of sortedValues(state.characters)) {
    if (!c.alive || c.injury === 0) continue;
    const healing = runningActionOf(state, c.id)?.type === 'heal';
    c.injury = clamp(c.injury - (healing ? economy.healInjuryRecovery : economy.monthlyInjuryRecovery), 0, MAX_INJURY);
  }
  for (const l of sortedValues(state.locations)) {
    const add = Math.min(l.resourceRegenPerMonth, Math.max(0, l.resourceCap - l.resourceStock));
    l.resourceStock += add;
    state.ledger.minted.location_regen += add;
  }
  return [];
}
