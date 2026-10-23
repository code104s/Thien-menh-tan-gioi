import { describe, expect, it } from 'vitest';
import { assertInvariants } from '../src/core/invariants.ts';
import { factionId } from '../src/core/ids.ts';
import { run } from '../src/core/runner.ts';
import { tick } from '../src/core/tick.ts';
import { livingMembersOf } from '../src/world/selectors.ts';
import { PLAYER_ID } from '../src/worldgen/generate.ts';
import type { WorldState } from '../src/types.ts';
import { command, ctx, frozenWorld } from './helpers.ts';

const A = factionId(1);
const B = factionId(2);

/** Ngày 89, người chơi là đệ tử của B; A nghèo, kình địch, cân sức → quý tới A khởi tranh chấp. */
function eveOfWar(): WorldState {
  const s = frozenWorld('choice', { kind: 'join_faction', factionIndex: 1 });
  s.day = 89;
  s.factions[A]!.relations[B] = -60;
  s.factions[B]!.relations[A] = -60;
  s.initialStoneSupply -= s.factions[A]!.treasury;
  s.factions[A]!.treasury = 0;
  for (const id of [A, B]) {
    for (const c of livingMembersOf(s, id)) Object.assign(c, { realm: 'qi', stage: 'late', progress: 0 });
  }
  const a = livingMembersOf(s, A);
  const b = livingMembersOf(s, B).filter((c) => !c.isPlayer);
  while (a.length > b.length + 1) Object.assign(a.pop()!, { factionId: null, factionRank: null });
  while (b.length + 1 > a.length) Object.assign(b.pop()!, { factionId: null, factionRank: null });
  s.factions[A]!.strategy = 'expand';
  return s;
}

describe('lựa chọn tham chiến', () => {
  it('tranh chấp nổ ra: người chơi được hỏi, tick báo interrupt choice_required và critical', () => {
    const s = eveOfWar();
    tick(s, [], ctx);
    const r = tick(s, [], ctx);
    expect(s.pendingChoices).toHaveLength(1);
    const reasons = r.interrupts.map((i) => i.reason);
    expect(reasons).toContain('choice_required');
    expect(reasons).toContain('critical_event');
  });

  it('chọn tham chiến: người chơi vào trận, bị thương ở vòng giao tranh', () => {
    const s = eveOfWar();
    run(s, ctx, { untilDay: 91 });
    const choice = s.pendingChoices[0]!;
    const r = tick(s, [command(s, { type: 'RESOLVE_CHOICE', choiceId: choice.id, optionId: 'fight' })], ctx);
    expect(r.events.map((e) => e.type)).toContain('choice_resolved');
    expect(Object.values(s.disputes)[0]!.playerStance).toBe('fight');
    expect(s.pendingChoices).toEqual([]);
    const injury = s.characters[PLAYER_ID]!.injury;
    run(s, ctx, { untilDay: 181 });
    expect(s.characters[PLAYER_ID]!.injury).toBeGreaterThan(Math.max(0, injury - 6));
    assertInvariants(s);
  });

  it('không trả lời: hết hạn trước vòng giao tranh, áp "né tránh", người chơi không bị thương', () => {
    const s = eveOfWar();
    const events = run(s, ctx, { untilDay: 181 }).events;
    const resolved = events.find((e) => e.type === 'choice_resolved')!;
    expect(resolved.payload).toMatchObject({ optionId: 'avoid', defaulted: true });
    const skirmish = events.find((e) => e.type === 'dispute_skirmish');
    if (skirmish) expect(resolved.seq).toBeLessThan(skirmish.seq);
    expect(s.characters[PLAYER_ID]!.injury).toBe(0);
  });

  it('từ chối lựa chọn không tồn tại hoặc phương án sai', () => {
    const s = eveOfWar();
    run(s, ctx, { untilDay: 91 });
    const choice = s.pendingChoices[0]!;
    const bad = tick(s, [
      command(s, { type: 'RESOLVE_CHOICE', choiceId: 'chc_9999', optionId: 'fight' }),
      command(s, { type: 'RESOLVE_CHOICE', choiceId: choice.id, optionId: 'flee' }),
    ], ctx);
    expect(bad.events.filter((e) => e.type === 'command_rejected').map((e) => e.payload['reason']))
      .toEqual(['Lựa chọn không còn hiệu lực', 'Phương án không hợp lệ']);
    expect(s.pendingChoices).toHaveLength(1);
  });
});
