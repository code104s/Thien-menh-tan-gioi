/**
 * Bước 7: truyền tin, ký ức, phản ứng nhân quả (ADR-08, docs/09 mục 11).
 * - secret: chỉ actor/target. witnesses: + nhân chứng. faction: + thành viên tông liên quan.
 *   public: như faction ngay lập tức, mọi người khác sau 7 ngày.
 * - Nhân vật chỉ phản ứng (tạo ân/oán) với event mình biết; phản ứng xảy ra lúc biết tin ngay,
 *   vì event không lưu trong snapshot. Tin đến trễ chỉ cập nhật ký ức.
 */
import type { SimContext } from '../core/context.ts';
import { compareIds, sortedValues } from '../core/ids.ts';
import { clamp } from '../core/math.ts';
import { addCausalRecord } from './causality.ts';
import type { Cultivator, EntityId, MemoryEntry, Severity, WorldEvent, WorldEventType, WorldState } from '../types.ts';

export const PUBLIC_NEWS_DELAY_DAYS = 7;
export const MEMORY_CAPACITY = 32;
const INVOLVED_BONUS = 20;

/** Mức đáng nhớ theo loại event; 0 = không truyền tin, không ghi ký ức. */
export const SALIENCE: Record<WorldEventType, number> = {
  world_created: 10, character_born: 20, character_died: 70, stage_advanced: 15,
  breakthrough_succeeded: 50, breakthrough_failed: 30,
  action_completed: 0, action_failed: 0, action_cancelled: 0, command_rejected: 0,
  faction_joined: 30, faction_left: 50, leader_succeeded: 60, leader_vacant: 60, faction_dissolved: 80,
  strategy_changed: 20, dispute_started: 80, dispute_skirmish: 50, dispute_ended: 80, territory_transferred: 70,
  stipend_shortfall: 30, duel_fought: 60, dao_mark_left: 40, seclusion_started: 10, seclusion_ended: 20,
  choice_resolved: 10,
};

export interface KnownEvent {
  eventId: EntityId;
  severity: Severity;
  type: WorldEventType;
}

export interface NewsResult {
  /** Event người chơi biết trong tick này (ngay hoặc tin đến trễ), dùng cho interrupt. */
  playerKnown: KnownEvent[];
}

export function processNews(state: WorldState, _ctx: SimContext, events: readonly WorldEvent[]): NewsResult {
  const playerKnown: KnownEvent[] = [];
  const note = (recipient: Cultivator, known: KnownEvent) => {
    if (recipient.id === state.playerId) playerKnown.push(known);
  };

  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    const base = SALIENCE[event.type];
    if (base === 0) continue;
    const { immediate, delayed } = audience(state, event);
    for (const recipient of immediate) {
      remember(recipient, event.id, state.day, salienceFor(base, event, recipient));
      note(recipient, { eventId: event.id, severity: event.severity, type: event.type });
      react(state, event, recipient);
    }
    for (const recipient of delayed) {
      state.pendingNews.push({
        eventId: event.id, recipientId: recipient.id, deliverDay: state.day + PUBLIC_NEWS_DELAY_DAYS,
        severity: event.severity, type: event.type,
      });
    }
  }

  const due = state.pendingNews.filter((n) => n.deliverDay <= state.day);
  state.pendingNews = state.pendingNews.filter((n) => n.deliverDay > state.day);
  due.sort((a, b) => a.deliverDay - b.deliverDay || compareIds(a.eventId, b.eventId) || compareIds(a.recipientId, b.recipientId));
  for (const news of due) {
    const recipient = state.characters[news.recipientId];
    if (!recipient?.alive) continue;
    remember(recipient, news.eventId, state.day, SALIENCE[news.type]);
    note(recipient, { eventId: news.eventId, severity: news.severity, type: news.type });
  }
  return { playerKnown };
}

/** Ai biết ngay, ai biết sau (chỉ nhân vật còn sống). */
export function audience(state: WorldState, event: WorldEvent): { immediate: Cultivator[]; delayed: Cultivator[] } {
  const ids = new Set<EntityId>();
  for (const id of [event.actorId, event.targetId]) {
    if (id && state.characters[id]) ids.add(id);
  }
  if (event.visibility !== 'secret') for (const id of event.witnessIds) ids.add(id);
  if (event.visibility === 'faction' || event.visibility === 'public') {
    const factions = new Set(event.factionIds);
    for (const id of [event.actorId, event.targetId]) if (id && state.factions[id]) factions.add(id);
    for (const c of Object.values(state.characters)) if (c.factionId && factions.has(c.factionId)) ids.add(c.id);
  }
  const alive = sortedValues(state.characters).filter((c) => c.alive);
  const immediate = alive.filter((c) => ids.has(c.id));
  const delayed = event.visibility === 'public' ? alive.filter((c) => !ids.has(c.id)) : [];
  return { immediate, delayed };
}

function salienceFor(base: number, event: WorldEvent, recipient: Cultivator): number {
  const involved = event.actorId === recipient.id || event.targetId === recipient.id;
  return clamp(base + (involved ? INVOLVED_BONUS : 0), 0, 100);
}

/** Ghi ký ức; đầy thì bỏ mục có salience thấp nhất, hòa → cũ nhất. Không ghi trùng. */
export function remember(c: Cultivator, eventId: EntityId, day: number, salience: number): void {
  if (c.memory.some((m) => m.eventId === eventId)) return;
  const entry: MemoryEntry = { eventId, learnedDay: day, salience };
  c.memory.push(entry);
  if (c.memory.length > MEMORY_CAPACITY) {
    let worst = 0;
    for (let i = 1; i < c.memory.length; i++) {
      const m = c.memory[i]!;
      const w = c.memory[worst]!;
      if (m.salience < w.salience || (m.salience === w.salience && m.learnedDay < w.learnedDay)) worst = i;
    }
    c.memory.splice(worst, 1);
  }
}

/** Phản ứng nhân quả của người vừa biết tin (chỉ áp cho người biết ngay lúc event xảy ra). */
function react(state: WorldState, event: WorldEvent, recipient: Cultivator): void {
  switch (event.type) {
    case 'faction_left': {
      // Tông chủ coi việc rời tông là phản bội.
      const faction = state.factions[String(event.payload['factionId'])];
      if (faction?.leaderId === recipient.id && event.actorId && event.actorId !== recipient.id) {
        addCausalRecord(state, { sourceEventId: event.id, holderId: recipient.id, towardId: event.actorId, type: 'betrayal', intensity: 50 });
      }
      return;
    }
    case 'duel_fought': {
      // Kẻ thua ghi oán kẻ thắng.
      const loserId = event.payload['loserId'];
      const winnerId = event.payload['winnerId'];
      if (loserId === recipient.id && typeof winnerId === 'string') {
        addCausalRecord(state, { sourceEventId: event.id, holderId: recipient.id, towardId: winnerId, type: 'grudge', intensity: 40 });
      }
      return;
    }
    default:
      return;
  }
}
