import { describe, expect, it } from 'vitest';
import { createContext, type ActionRule, type SimContext } from '../src/core/context.ts';
import { assertInvariants } from '../src/core/invariants.ts';
import { run } from '../src/core/runner.ts';
import { dueActions, finishAction, refundAmount, startAction } from '../src/core/scheduler.ts';
import { tick } from '../src/core/tick.ts';
import { PLAYER_ID, generateWorld } from '../src/worldgen/generate.ts';
import type { PlayerCommand, ScheduledAction, WorldState } from '../src/types.ts';

/** Luật giả lập cho test: chi phí 1 linh thạch/ngày, hoàn tất thì +1 ngộ tính. */
const trainRule: ActionRule = {
  costSink: 'cultivation',
  priority: 10,
  cancellationPolicy: 'refund_prorated',
  cost: (_s, req) => req.durationDays,
  validateStart: () => null,
  onComplete: (state, action) => {
    state.characters[action.actorId]!.insight += 1;
    return {};
  },
};

function setup(rules: SimContext['actions'] = { cultivate: trainRule }): { state: WorldState; ctx: SimContext } {
  const { state } = generateWorld({ seed: 'tick', origin: { kind: 'rogue' } });
  state.characters[PLAYER_ID]!.spiritStones = 100;
  state.initialStoneSupply += 50; // bù phần đặt lại số dư người chơi
  // Test này chỉ xét lệnh người chơi: NPC không đến lượt lập kế hoạch.
  for (const c of Object.values(state.characters)) c.nextReviewDay = Number.MAX_SAFE_INTEGER;
  return { state, ctx: createContext({ actions: rules }) };
}

let seq = 0;
function cmd(day: number, payload: PlayerCommand['payload'], overrideSeq?: number): PlayerCommand {
  seq = overrideSeq ?? seq + 1;
  return { commandId: `c-${seq}`, seq, issuedAtDay: day, actorId: PLAYER_ID, payload };
}
const startCultivate = (day: number, durationDays: number, s?: number) =>
  cmd(day, { type: 'START_ACTION', actionType: 'cultivate', durationDays }, s);

describe('lệnh và scheduler', () => {
  it('bắt đầu action giữ chỗ chi phí đúng một lần và giữ bảo toàn linh thạch', () => {
    const { state, ctx } = setup();
    const before = state.characters[PLAYER_ID]!.insight;
    tick(state, [startCultivate(0, 10)], ctx);
    const action = Object.values(state.actions)[0]!;
    expect(action).toMatchObject({ actorId: PLAYER_ID, startDay: 0, dueDay: 10, reservedCosts: { spiritStones: 10 } });
    expect(state.characters[PLAYER_ID]!.spiritStones).toBe(90);
    assertInvariants(state);

    const result = run(state, ctx, { untilDay: 11 });
    expect(state.actions).toEqual({});
    expect(state.characters[PLAYER_ID]!.insight).toBe(before + 1);
    expect(state.characters[PLAYER_ID]!.spiritStones).toBe(90);
    expect(state.ledger.burned.cultivation).toBe(10);
    expect(result.events.filter((e) => e.type === 'action_completed')).toHaveLength(1);
    assertInvariants(state);
  });

  it('lệnh trùng seq không áp dụng hai lần', () => {
    const { state, ctx } = setup();
    const c = startCultivate(0, 5);
    tick(state, [c, c], ctx);
    expect(Object.keys(state.actions)).toHaveLength(1);
    expect(state.characters[PLAYER_ID]!.spiritStones).toBe(95);
    tick(state, [{ ...c, issuedAtDay: 1 }], ctx);
    expect(state.characters[PLAYER_ID]!.spiritStones).toBe(95);
    expect(state.lastCommandSeq).toBe(c.seq);
  });

  it('lệnh sai điều kiện bị từ chối, chỉ đổi lastCommandSeq', () => {
    const { state, ctx } = setup();
    const c = startCultivate(0, 500);
    const result = tick(state, [c], ctx);
    expect(result.events.map((e) => e.type)).toEqual(['command_rejected']);
    expect(result.events[0]!.payload['reason']).toMatch(/Không đủ linh thạch/);
    expect(state.actions).toEqual({});
    expect(state.characters[PLAYER_ID]!.spiritStones).toBe(100);
    expect(state.lastCommandSeq).toBe(c.seq);
  });

  it('không cho hai action cùng lúc, từ chối loại chưa hỗ trợ và lệnh của NPC', () => {
    const { state, ctx } = setup();
    const result = tick(state, [
      startCultivate(0, 5),
      startCultivate(0, 5),
      cmd(0, { type: 'START_ACTION', actionType: 'travel', durationDays: 3 }),
      { ...startCultivate(0, 5), actorId: 'chr_0001' },
    ], ctx);
    const reasons = result.events.filter((e) => e.type === 'command_rejected').map((e) => e.payload['reason']);
    expect(reasons).toEqual(['Đang thực hiện hành động khác', 'Đang thực hiện hành động khác', 'Chỉ người chơi được ra lệnh']);

    const idle = setup();
    const unsupported = tick(idle.state, [cmd(0, { type: 'START_ACTION', actionType: 'travel', durationDays: 3 })], idle.ctx);
    expect(unsupported.events[0]!.payload['reason']).toBe('Hành động travel chưa được hỗ trợ');
  });

  it('hủy action hoàn theo tỉ lệ ngày còn lại', () => {
    const { state, ctx } = setup();
    tick(state, [startCultivate(0, 10)], ctx);
    run(state, ctx, { untilDay: 4 });
    const actionId = Object.keys(state.actions)[0]!;
    tick(state, [cmd(4, { type: 'CANCEL_ACTION', actionId })], ctx);
    expect(state.actions).toEqual({});
    expect(state.characters[PLAYER_ID]!.spiritStones).toBe(96);
    expect(state.ledger.burned.cultivation).toBe(4);
    assertInvariants(state);
  });

  it('finishAction lần hai là no-op', () => {
    const { state, ctx } = setup();
    const res = startAction(state, { actorId: PLAYER_ID, type: 'cultivate', durationDays: 10, source: 'player' }, ctx);
    if (!res.ok) throw new Error(res.reason);
    expect(finishAction(state, res.action.id, 'completed', ctx)).toHaveLength(1);
    expect(finishAction(state, res.action.id, 'completed', ctx)).toEqual([]);
    expect(finishAction(state, res.action.id, 'cancelled', ctx)).toEqual([]);
    expect(state.ledger.burned.cultivation).toBe(10);
    assertInvariants(state);
  });

  it('kiểm tra lại lúc kết thúc thất bại → failed, hoàn theo policy, không áp hiệu ứng', () => {
    const failing: ActionRule = { ...trainRule, cancellationPolicy: 'refund_full', validateComplete: () => 'Mục tiêu đã biến mất' };
    const { state, ctx } = setup({ cultivate: failing });
    const insight = state.characters[PLAYER_ID]!.insight;
    tick(state, [startCultivate(0, 3)], ctx);
    const { events, stoppedBy } = run(state, ctx, { untilDay: 10, stopOn: ['player_action_finished'] });
    expect(stoppedBy?.reason).toBe('player_action_finished');
    expect(state.day).toBe(4);
    const failed = events.find((e) => e.type === 'action_failed')!;
    expect(failed.severity).toBe('critical');
    expect(failed.payload['reason']).toBe('Mục tiêu đã biến mất');
    expect(state.characters[PLAYER_ID]!.insight).toBe(insight);
    expect(state.characters[PLAYER_ID]!.spiritStones).toBe(100);
    assertInvariants(state);
  });

  it('lệnh gửi sai ngày là lỗi lập trình', () => {
    const { state, ctx } = setup();
    expect(() => tick(state, [startCultivate(5, 3)], ctx)).toThrow(/ngày 5/);
  });
});

describe('refundAmount theo policy', () => {
  const base: ScheduledAction = {
    id: 'act_000001', actorId: PLAYER_ID, type: 'cultivate', locationId: 'loc_001', startDay: 0, dueDay: 10,
    priority: 0, seq: 1, status: 'running', reservedCosts: { spiritStones: 100 }, cancellationPolicy: 'none',
    source: 'player', meta: { progressGained: 0 },
  };
  it.each([
    ['refund_full', 3, 100],
    ['refund_prorated', 3, 70],
    ['refund_half_remaining', 3, 35],
    ['none', 3, 0],
    ['refund_prorated', 10, 0],
  ] as const)('%s tại ngày %i → %i', (policy, day, expected) => {
    expect(refundAmount({ ...base, cancellationPolicy: policy }, day)).toBe(expected);
  });
});

describe('thứ tự xử lý action đến hạn', () => {
  it('sắp theo (priority, actorId, seq)', () => {
    const { state } = setup();
    const mk = (id: string, actorId: string, priority: number, s: number): ScheduledAction => ({
      id, actorId, type: 'cultivate', locationId: 'loc_001', startDay: 0, dueDay: 5, priority, seq: s,
      status: 'running', reservedCosts: { spiritStones: 0 }, cancellationPolicy: 'none', source: 'npc',
      meta: { progressGained: 0 },
    });
    for (const a of [mk('act_000004', 'chr_0002', 1, 4), mk('act_000001', 'chr_0003', 0, 1), mk('act_000003', 'chr_0002', 0, 3), mk('act_000002', 'chr_0002', 0, 2)]) {
      state.actions[a.id] = a;
    }
    expect(dueActions(state, 5).map((a) => a.id)).toEqual(['act_000002', 'act_000003', 'act_000001', 'act_000004']);
  });
});

describe('vòng tick rỗng', () => {
  it('tiến ngày và giữ bất biến qua 10 năm không lệnh', () => {
    const { state, ctx } = setup();
    const { ticks, stoppedBy } = run(state, ctx, { untilDay: 3600 });
    expect(ticks).toBe(3600);
    expect(stoppedBy).toBeNull();
    expect(state.day).toBe(3600);
    assertInvariants(state);
  });
});
