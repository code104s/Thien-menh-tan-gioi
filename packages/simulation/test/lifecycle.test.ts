import { describe, expect, it } from 'vitest';
import { createContext, type ActionRule } from '../src/core/context.ts';
import { assertInvariants } from '../src/core/invariants.ts';
import { factionId } from '../src/core/ids.ts';
import { run } from '../src/core/runner.ts';
import { startAction } from '../src/core/scheduler.ts';
import { tick } from '../src/core/tick.ts';
import { applyInjury, livingMembers } from '../src/systems/lifecycle.ts';
import { PLAYER_ID, generateWorld } from '../src/worldgen/generate.ts';
import type { WorldState } from '../src/types.ts';

const idleRule: ActionRule = {
  costSink: 'cultivation', priority: 10, cancellationPolicy: 'refund_prorated',
  cost: () => 30, validateStart: () => null,
};
const ctx = createContext({ actions: { gather: idleRule } });
const world = () => generateWorld({ seed: 'life', origin: { kind: 'join_faction', factionIndex: 0 } }).state;

/** Đặt tuổi để nhân vật chết đúng ngày `deathDay`. */
function dieOn(s: WorldState, id: string, deathDay: number) {
  const c = s.characters[id]!;
  c.birthDay = deathDay - c.lifespanDays;
}

describe('tử vong do tuổi thọ', () => {
  it('chết đúng ngày, action đang chạy thất bại và hoàn tiền, tài sản về kho tông môn', () => {
    const s = world();
    const npc = livingMembers(s, factionId(2)).find((c) => c.factionRank === 'disciple')!;
    dieOn(s, npc.id, 10);
    const res = startAction(s, { actorId: npc.id, type: 'gather', durationDays: 30, source: 'npc' }, ctx);
    expect(res.ok).toBe(true);
    const wallet = npc.spiritStones;
    const treasury = s.factions[factionId(2)]!.treasury;

    run(s, ctx, { untilDay: 10 });
    expect(npc.alive).toBe(true);
    const { events } = run(s, ctx, { untilDay: 11 });
    expect(npc).toMatchObject({ alive: false, deathDay: 10, deathCause: 'old_age', spiritStones: 0 });
    expect(events.map((e) => e.type)).toEqual(['action_failed', 'character_died']);
    // Hủy ở ngày 10/30: hoàn 20/30 của 30 = 20, tiêu hao 10.
    expect(s.factions[factionId(2)]!.treasury).toBe(treasury + wallet + 20);
    expect(s.actions).toEqual({});
    assertInvariants(s);
  });

  it('tán tu chết thì tài sản bị hủy vào sổ cái', () => {
    const s = world();
    const rogue = Object.values(s.characters).find((c) => !c.isPlayer && c.factionId === null)!;
    const wallet = rogue.spiritStones;
    dieOn(s, rogue.id, 3);
    run(s, ctx, { untilDay: 5 });
    expect(rogue.alive).toBe(false);
    expect(s.ledger.burned.unclaimed_estate).toBe(wallet);
    assertInvariants(s);
  });
});

describe('tử vong do thương tích', () => {
  it('injury chạm 100 → chết hôm sau với nguyên nhân gây thương tích', () => {
    const s = world();
    const npc = s.characters['chr_0019']!;
    applyInjury(npc, 150, 'breakthrough');
    expect(npc.injury).toBe(100);
    tick(s, [], ctx);
    expect(npc).toMatchObject({ alive: false, deathCause: 'breakthrough' });
  });
});

describe('kế nhiệm và giải tán', () => {
  it('tông chủ chết → người tu vi cao nhất kế nhiệm', () => {
    const s = world();
    const f = s.factions[factionId(3)]!;
    const oldLeader = f.leaderId!;
    const members = livingMembers(s, f.id).filter((c) => c.id !== oldLeader);
    const strongest = members.reduce((best, c) => {
      const order = ['qi', 'foundation', 'golden_core'];
      const stages = ['early', 'middle', 'late', 'perfect'];
      const key = (x: typeof c) => [order.indexOf(x.realm), stages.indexOf(x.stage), x.progress];
      const [a, b] = [key(c), key(best)];
      return a[0]! > b[0]! || (a[0] === b[0] && (a[1]! > b[1]! || (a[1] === b[1] && a[2]! > b[2]!))) ? c : best;
    });
    dieOn(s, oldLeader, 1);
    const { events } = run(s, ctx, { untilDay: 2 });
    expect(f.leaderId).toBe(strongest.id);
    expect(strongest.factionRank).toBe('leader');
    const succeeded = events.find((e) => e.type === 'leader_succeeded')!;
    expect(succeeded.causeEventId).toBe(events.find((e) => e.type === 'character_died')!.id);
    assertInvariants(s);
  });

  it('thành viên cuối cùng chết → tông môn giải tán, lãnh địa vô chủ, kho bị hủy', () => {
    const s = world();
    const f = s.factions[factionId(2)]!;
    const members = livingMembers(s, f.id);
    members.forEach((c, i) => dieOn(s, c.id, 1 + i));
    const { events } = run(s, ctx, { untilDay: members.length + 2 });
    expect(f.dissolved).toBe(true);
    expect(f.leaderId).toBeNull();
    expect(f.treasury).toBe(0);
    expect(Object.values(s.locations).some((l) => l.ownerFactionId === f.id)).toBe(false);
    expect(events.filter((e) => e.type === 'faction_dissolved')).toHaveLength(1);
    assertInvariants(s);
  });
});

describe('người chơi chết', () => {
  it('đặt gameOver, từ chối lệnh sau đó; thế giới vẫn vận hành và giữ bất biến (regression)', () => {
    const s = world();
    dieOn(s, PLAYER_ID, 2);
    const { events, stoppedBy } = run(s, ctx, { untilDay: 100, stopOn: ['game_over'] });
    expect(stoppedBy?.reason).toBe('game_over');
    expect(s.gameOver).toMatchObject({ day: 2, cause: 'old_age' });
    expect(events.find((e) => e.type === 'character_died')!.severity).toBe('critical');
    const after = tick(s, [{
      commandId: 'late', seq: 1, issuedAtDay: s.day, actorId: PLAYER_ID,
      payload: { type: 'START_ACTION', actionType: 'gather', durationDays: 30 },
    }], ctx);
    expect(after.events[0]!.payload['reason']).toBe('Trò chơi đã kết thúc');
    expect(after.interrupts.some((i) => i.reason === 'game_over')).toBe(false);
    // Trước đây tick bỏ qua mọi bước sau game over → action NPC quá hạn, vi phạm I3.
    run(s, createContext(), { untilDay: 2000 });
    assertInvariants(s);
  });
});

describe('hằng tháng', () => {
  it('hồi thương và tái sinh tài nguyên tới trần, ghi sổ cái', () => {
    const s = world();
    const npc = s.characters['chr_0019']!;
    applyInjury(npc, 10, 'duel');
    const wild = Object.values(s.locations).find((l) => l.resourceCap > 0)!;
    s.initialStoneSupply += wild.resourceCap - 1 - wild.resourceStock;
    wild.resourceStock = wild.resourceCap - 1;
    const before = { ...s.ledger.minted };
    run(s, ctx, { untilDay: 31 });
    expect(npc.injury).toBe(7);
    expect(wild.resourceStock).toBe(wild.resourceCap);
    expect(s.ledger.minted.location_regen).toBeGreaterThan(before.location_regen);
    assertInvariants(s);
  });

  it('bất biến giữ nguyên qua 100 năm chỉ có lão hóa', () => {
    const s = world();
    const lifespans = Object.values(s.characters).map((c) => ({ id: c.id, deathDay: c.birthDay + c.lifespanDays }));
    for (let year = 1; year <= 100 && !s.gameOver; year++) {
      run(s, ctx, { untilDay: year * 360 });
      assertInvariants(s);
    }
    for (const { id, deathDay } of lifespans) {
      const c = s.characters[id]!;
      if (deathDay < s.day) expect(c.deathDay).toBe(Math.max(0, deathDay));
    }
  });
});
