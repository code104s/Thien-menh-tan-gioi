import { gameData } from '@tmtg/game-data';
import { describe, expect, it } from 'vitest';
import { evaluateGoals } from '../src/ai/planner.ts';
import { assertInvariants } from '../src/core/invariants.ts';
import { factionId } from '../src/core/ids.ts';
import { run } from '../src/core/runner.ts';
import { startAction } from '../src/core/scheduler.ts';
import { livingMembersOf } from '../src/world/selectors.ts';
import type { ActionType, WorldState } from '../src/types.ts';
import { ctx, frozenWorld } from './helpers.ts';

const F = factionId(3);
const rogueOf = (s: WorldState) => Object.values(s.characters).find((c) => !c.isPlayer && c.factionId === null)!;
const start = (s: WorldState, actorId: string, type: ActionType, targetId?: string) =>
  startAction(s, { actorId, type, durationDays: 1, source: 'npc', ...(targetId ? { targetId } : {}) }, ctx);

describe('gia nhập tông môn', () => {
  it('phải ở trụ sở; hoàn tất sau 7 ngày thành đệ tử và học công pháp tông môn', () => {
    const s = frozenWorld();
    const rogue = rogueOf(s);
    expect(start(s, rogue.id, 'join_faction', F)).toMatchObject({ ok: false, reason: 'Phải đến trụ sở tông môn để bái sư' });
    rogue.locationId = s.factions[F]!.seatLocationId;
    rogue.spiritRootBp = 15_000;
    const res = start(s, rogue.id, 'join_faction', F);
    if (!res.ok) throw new Error(res.reason);
    expect(res.action.dueDay).toBe(7);
    const { events } = run(s, ctx, { untilDay: 8 });
    const template = gameData.factionTemplates.find((t) => t.id === s.factions[F]!.templateId)!;
    expect(rogue).toMatchObject({ factionId: F, factionRank: 'disciple', techniqueId: template.techniqueId });
    expect(events.some((e) => e.type === 'faction_joined' && e.actorId === rogue.id)).toBe(true);
    assertInvariants(s);
  });

  it('từ chối khi tông môn đông và không tuyển, hoặc tông chủ ghét', () => {
    const s = frozenWorld();
    const rogue = rogueOf(s);
    const f = s.factions[F]!;
    rogue.locationId = f.seatLocationId;
    const leader = s.characters[f.leaderId!]!;
    leader.relations[rogue.id] = -10;
    expect(start(s, rogue.id, 'join_faction', F)).toMatchObject({ ok: false, reason: 'Tông chủ không ưa bạn' });
    leader.relations[rogue.id] = 0;
    for (const c of Object.values(s.characters)) if (!c.isPlayer && c.factionId === null && c.id !== rogue.id) {
      c.factionId = F; c.factionRank = 'disciple';
    }
    while (livingMembersOf(s, F).length < 8) {
      const other = livingMembersOf(s, factionId(1)).find((c) => c.factionRank === 'disciple')!;
      other.factionId = F;
    }
    expect(start(s, rogue.id, 'join_faction', F)).toMatchObject({ ok: false, reason: 'Tông môn không nhận thêm đệ tử' });
    f.strategy = 'recruit';
    expect(start(s, rogue.id, 'join_faction', F).ok).toBe(true);
  });
});

describe('rời tông môn', () => {
  it('tông chủ rời → có người kế nhiệm, sự kiện kế nhiệm trỏ về sự kiện rời', () => {
    const s = frozenWorld();
    const f = s.factions[F]!;
    const leaderId = f.leaderId!;
    const res = start(s, leaderId, 'leave_faction');
    if (!res.ok) throw new Error(res.reason);
    const { events } = run(s, ctx, { untilDay: 2 });
    expect(s.characters[leaderId]).toMatchObject({ factionId: null, factionRank: null });
    expect(f.leaderId).not.toBe(leaderId);
    const left = events.find((e) => e.type === 'faction_left')!;
    expect(events.find((e) => e.type === 'leader_succeeded')!.causeEventId).toBe(left.id);
    assertInvariants(s);
  });
});

describe('nhiệm vụ tông môn', () => {
  it('ở trụ sở 30 ngày: nhận 10 linh thạch từ kho, tông chủ thiện cảm hơn', () => {
    const s = frozenWorld();
    const f = s.factions[F]!;
    const disciple = livingMembersOf(s, F).find((c) => c.factionRank === 'disciple')!;
    const res = start(s, disciple.id, 'duty');
    if (!res.ok) throw new Error(res.reason);
    const { events } = run(s, ctx, { untilDay: 31 });
    expect(events.find((e) => e.type === 'action_completed' && e.actorId === disciple.id)!.payload['pay']).toBe(10);
    expect(s.characters[f.leaderId!]!.relations[disciple.id]).toBe(3);
    assertInvariants(s);
  });
});

describe('AI tông môn', () => {
  it('tán tu trung thành gần trụ sở lên kế hoạch bái sư', () => {
    const s = frozenWorld();
    const rogue = rogueOf(s);
    rogue.personality.loyalty = 90;
    rogue.locationId = s.factions[F]!.seatLocationId;
    const join = evaluateGoals(s, ctx, rogue).find((g) => g.goal === 'join_faction')!;
    expect(join.targetId).toBe(F);
    expect(join.steps).toEqual([{ actionType: 'join_faction', targetId: F, durationDays: 7 }]);
  });

  it('thành viên có mục tiêu làm nhiệm vụ', () => {
    const s = frozenWorld();
    const disciple = livingMembersOf(s, F).find((c) => c.factionRank === 'disciple')!;
    expect(evaluateGoals(s, ctx, disciple).some((g) => g.goal === 'duty')).toBe(true);
  });
});
