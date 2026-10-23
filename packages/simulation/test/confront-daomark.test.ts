import { gameData } from '@tmtg/game-data';
import { describe, expect, it } from 'vitest';
import { evaluateGoals } from '../src/ai/planner.ts';
import { assertInvariants } from '../src/core/invariants.ts';
import { run } from '../src/core/runner.ts';
import { startAction } from '../src/core/scheduler.ts';
import { resolveBreakthrough } from '../src/rules/breakthrough.ts';
import { stageThresholdFx } from '../src/rules/realm.ts';
import { addCausalRecord } from '../src/systems/causality.ts';
import { killCharacter } from '../src/systems/lifecycle.ts';
import type { WorldEvent, WorldState } from '../src/types.ts';
import { ctx, frozenWorld } from './helpers.ts';

const A = 'chr_0019';
const B = 'chr_0020';

function duelists(seed = 'duel'): WorldState {
  const s = frozenWorld(seed, { kind: 'rogue' });
  s.characters[B]!.locationId = s.characters[A]!.locationId;
  return s;
}

describe('đối đầu cá nhân', () => {
  it('phải cùng địa điểm, không tự đấu', () => {
    const s = frozenWorld('duel', { kind: 'rogue' });
    const far = Object.keys(s.locations).find((id) => id !== s.characters[A]!.locationId)!;
    s.characters[B]!.locationId = far;
    expect(startAction(s, { actorId: A, type: 'confront', targetId: B, durationDays: 1, source: 'npc' }, ctx))
      .toMatchObject({ ok: false, reason: 'Đối thủ không ở đây' });
    expect(startAction(s, { actorId: A, type: 'confront', targetId: A, durationDays: 1, source: 'npc' }, ctx))
      .toMatchObject({ ok: false, reason: 'Không thể tự đối đầu' });
  });

  it('kết quả: kẻ thua bị thương ≤ 95, không ai chết, oán người khởi xướng được giải, kẻ thua ghi oán kẻ thắng', () => {
    for (let i = 0; i < 30; i++) {
      const s = duelists(`duel-${i}`);
      s.characters[B]!.injury = 90;
      const grudge = addCausalRecord(s, { sourceEventId: 'evt_00000001', holderId: A, towardId: B, type: 'grudge', intensity: 80 });
      const res = startAction(s, { actorId: A, type: 'confront', targetId: B, durationDays: 1, source: 'npc' }, ctx);
      if (!res.ok) throw new Error(res.reason);
      const events: WorldEvent[] = [];
      run(s, ctx, { untilDay: 3, onEvents: (e) => events.push(...e) });
      const duel = events.find((e) => e.type === 'duel_fought')!;
      expect(s.characters[A]!.alive && s.characters[B]!.alive).toBe(true);
      expect(s.characters[B]!.injury).toBeLessThanOrEqual(95);
      expect(grudge.resolvedByEventId).toBe(duel.id);
      const loserId = duel.payload['loserId'] as string;
      const winnerId = duel.payload['winnerId'] as string;
      const loserGrudge = Object.values(s.causalRecords).find((r) => r.sourceEventId === duel.id)!;
      expect(loserGrudge).toMatchObject({ holderId: loserId, towardId: winnerId, type: 'grudge', intensity: 40 });
      assertInvariants(s);
    }
  });

  it('AI: oán sâu với người cùng địa điểm → mục tiêu đối đầu; oán nông thì không', () => {
    const s = duelists();
    s.characters[A]!.personality.riskTolerance = 90;
    addCausalRecord(s, { sourceEventId: 'evt_00000001', holderId: A, towardId: B, type: 'grudge', intensity: 50 });
    expect(evaluateGoals(s, ctx, s.characters[A]!).some((g) => g.goal === 'confront')).toBe(false);
    addCausalRecord(s, { sourceEventId: 'evt_00000001', holderId: A, towardId: B, type: 'grudge', intensity: 90 });
    const confront = evaluateGoals(s, ctx, s.characters[A]!).find((g) => g.goal === 'confront')!;
    expect(confront.targetId).toBe(B);
  });
});

describe('Đạo Ngân', () => {
  it('Kim Đan tọa hóa để lại dấu một lần, tăng linh khí có kẹp', () => {
    const s = frozenWorld();
    const c = s.characters['chr_0005']!;
    Object.assign(c, { realm: 'golden_core', stage: 'early', progress: 0 });
    const location = s.locations[c.locationId]!;
    const before = location.spiritualEnergyBp;
    const events = killCharacter(s, ctx, c, 'old_age');
    const mark = events.find((e) => e.type === 'dao_mark_left')!;
    expect(location.daoMarkIds).toEqual([mark.id]);
    expect(location.spiritualEnergyBp).toBe(Math.min(before + 500, gameData.balance.cultivation.energyClampBp[1]));
    const other = s.characters['chr_0006']!;
    Object.assign(other, { realm: 'golden_core', stage: 'early', progress: 0, locationId: location.id });
    expect(killCharacter(s, ctx, other, 'old_age').some((e) => e.type === 'dao_mark_left')).toBe(false);
  });

  it('đột phá Kim Đan thành công để lại dấu', () => {
    for (let i = 0; i < 50; i++) {
      const s = frozenWorld(`dao-${i}`);
      const c = s.characters['chr_0005']!;
      Object.assign(c, {
        realm: 'foundation', stage: 'perfect', progress: stageThresholdFx(gameData, 'foundation'),
        insight: 100, daoHeart: 100, foundation: 100, injury: 0,
      });
      const events = resolveBreakthrough(s, gameData, c);
      if (events[0]!.type !== 'breakthrough_succeeded') continue;
      expect(events.map((e) => e.type)).toEqual(['breakthrough_succeeded', 'dao_mark_left']);
      expect(events[1]!.causeEventId).toBe(events[0]!.id);
      return;
    }
    throw new Error('Không có lần đột phá thành công nào trong 50 thử');
  });
});
