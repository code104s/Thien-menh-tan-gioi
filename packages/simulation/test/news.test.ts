import { describe, expect, it } from 'vitest';
import { createEvent, type EventDraft } from '../src/core/events.ts';
import { assertInvariants } from '../src/core/invariants.ts';
import { factionId } from '../src/core/ids.ts';
import { MEMORY_CAPACITY, PUBLIC_NEWS_DELAY_DAYS, processNews, remember } from '../src/systems/news.ts';
import { livingMembersOf } from '../src/world/selectors.ts';
import { PLAYER_ID } from '../src/worldgen/generate.ts';
import type { WorldState } from '../src/types.ts';
import { ctx, frozenWorld } from './helpers.ts';

const F = factionId(2);
const knows = (s: WorldState, charId: string, eventId: string) => s.characters[charId]!.memory.some((m) => m.eventId === eventId);

function leftEvent(s: WorldState, visibility: EventDraft['visibility']) {
  const leaver = livingMembersOf(s, F).find((c) => c.factionRank === 'disciple')!;
  const event = createEvent(s, {
    type: 'faction_left', severity: 'info', visibility, chronicle: true,
    actorId: leaver.id, targetId: F, factionIds: [F], payload: { factionId: F, wasLeader: false },
  });
  return { leaver, event };
}

describe('truyền tin theo visibility', () => {
  it('secret: chỉ người trong cuộc biết; tông chủ không phản ứng với điều mình không biết', () => {
    const s = frozenWorld('news', { kind: 'rogue' });
    const { leaver, event } = leftEvent(s, 'secret');
    processNews(s, ctx, [event]);
    const leaderId = s.factions[F]!.leaderId!;
    expect(knows(s, leaver.id, event.id)).toBe(true);
    expect(knows(s, leaderId, event.id)).toBe(false);
    expect(Object.values(s.causalRecords)).toEqual([]);
    expect(s.pendingNews).toEqual([]);
  });

  it('faction: thành viên biết ngay; tông chủ ghi phản bội gắn với event gốc, quan hệ giảm', () => {
    const s = frozenWorld('news', { kind: 'rogue' });
    const { leaver, event } = leftEvent(s, 'faction');
    processNews(s, ctx, [event]);
    const leader = s.characters[s.factions[F]!.leaderId!]!;
    for (const m of livingMembersOf(s, F)) expect(knows(s, m.id, event.id)).toBe(true);
    const outsider = livingMembersOf(s, factionId(1))[0]!;
    expect(knows(s, outsider.id, event.id)).toBe(false);
    const record = Object.values(s.causalRecords)[0]!;
    expect(record).toMatchObject({ type: 'betrayal', holderId: leader.id, towardId: leaver.id, sourceEventId: event.id });
    expect(leader.relations[leaver.id]).toBe(-12);
    assertInvariants(s);
  });

  it('public: người ngoài biết sau 7 ngày; người chết không nhận tin', () => {
    const s = frozenWorld('news', { kind: 'rogue' });
    const { event } = leftEvent(s, 'public');
    processNews(s, ctx, [event]);
    const outsider = livingMembersOf(s, factionId(1))[0]!;
    const deadOutsider = livingMembersOf(s, factionId(1))[1]!;
    expect(knows(s, outsider.id, event.id)).toBe(false);
    expect(s.pendingNews.some((n) => n.recipientId === outsider.id && n.deliverDay === PUBLIC_NEWS_DELAY_DAYS)).toBe(true);
    Object.assign(deadOutsider, { alive: false, deathDay: 1, deathCause: 'old_age' });
    s.day = PUBLIC_NEWS_DELAY_DAYS - 1;
    processNews(s, ctx, []);
    expect(knows(s, outsider.id, event.id)).toBe(false);
    s.day = PUBLIC_NEWS_DELAY_DAYS;
    processNews(s, ctx, []);
    expect(knows(s, outsider.id, event.id)).toBe(true);
    expect(knows(s, deadOutsider.id, event.id)).toBe(false);
    expect(s.pendingNews).toEqual([]);
  });

  it('witnesses: nhân vật cùng địa điểm lúc xảy ra được chụp làm nhân chứng', () => {
    const s = frozenWorld('news', { kind: 'rogue' });
    const a = s.characters['chr_0019']!;
    const b = s.characters['chr_0020']!;
    b.locationId = a.locationId;
    const event = createEvent(s, {
      type: 'stage_advanced', severity: 'info', visibility: 'witnesses', chronicle: false,
      actorId: a.id, locationId: a.locationId, payload: {},
    });
    expect(event.witnessIds).toContain(b.id);
    processNews(s, ctx, [event]);
    expect(knows(s, b.id, event.id)).toBe(true);
  });

  it('người chơi chỉ được báo (playerKnown) khi thực sự biết tin', () => {
    const s = frozenWorld('news', { kind: 'rogue' });
    const outsiderEvent = createEvent(s, {
      type: 'dispute_started', severity: 'important', visibility: 'public', chronicle: true,
      actorId: factionId(1), targetId: F, factionIds: [factionId(1), F], payload: {},
    });
    expect(processNews(s, ctx, [outsiderEvent]).playerKnown).toEqual([]);
    s.day = PUBLIC_NEWS_DELAY_DAYS;
    expect(processNews(s, ctx, []).playerKnown).toEqual([{ eventId: outsiderEvent.id, severity: 'important', type: 'dispute_started' }]);
    expect(knows(s, PLAYER_ID, outsiderEvent.id)).toBe(true);
  });

  it('không truyền event có salience 0 (action_completed)', () => {
    const s = frozenWorld('news', { kind: 'rogue' });
    const event = createEvent(s, {
      type: 'action_completed', severity: 'info', visibility: 'public', chronicle: false, actorId: 'chr_0019', payload: {},
    });
    processNews(s, ctx, [event]);
    expect(s.pendingNews).toEqual([]);
    expect(knows(s, 'chr_0019', event.id)).toBe(false);
  });
});

describe('ký ức', () => {
  it(`tối đa ${MEMORY_CAPACITY} mục; bỏ mục kém đáng nhớ nhất, hòa thì cũ nhất; không trùng`, () => {
    const s = frozenWorld();
    const c = s.characters['chr_0019']!;
    for (let i = 0; i < MEMORY_CAPACITY; i++) remember(c, `evt_${String(i).padStart(8, '0')}`, i, 50);
    remember(c, 'evt_00000003', 99, 90);
    expect(c.memory).toHaveLength(MEMORY_CAPACITY);
    remember(c, 'evt_99999999', 100, 60);
    expect(c.memory).toHaveLength(MEMORY_CAPACITY);
    expect(c.memory.some((m) => m.eventId === 'evt_00000000')).toBe(false);
    remember(c, 'evt_99999998', 101, 10);
    expect(c.memory.some((m) => m.eventId === 'evt_99999998')).toBe(false);
  });
});
