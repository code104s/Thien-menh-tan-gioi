import { gameData } from '@tmtg/game-data';
import { describe, expect, it } from 'vitest';
import { assertInvariants } from '../src/core/invariants.ts';
import { run } from '../src/core/runner.ts';
import { startAction } from '../src/core/scheduler.ts';
import { gatherRule } from '../src/actions/index.ts';
import { stageThresholdFx } from '../src/rules/realm.ts';
import type { ActionType, WorldState } from '../src/types.ts';
import { ctx, frozenWorld, setStones } from './helpers.ts';

const NPC = 'chr_0005';
const start = (s: WorldState, type: ActionType, durationDays: number, targetId?: string, actorId = NPC) =>
  startAction(s, { actorId, type, durationDays, source: 'npc', ...(targetId ? { targetId } : {}) }, ctx);

describe('travel', () => {
  it('chỉ đi được tới địa điểm kề, đến nơi sau đúng travelDays', () => {
    const s = frozenWorld();
    const c = s.characters[NPC]!;
    const from = s.locations[c.locationId]!;
    const far = Object.keys(s.locations).find((id) => id !== from.id && !from.edges.some((e) => e.to === id))!;
    expect(start(s, 'travel', 1, far)).toEqual({ ok: false, reason: 'Nơi đến không kề địa điểm hiện tại' });
    expect(start(s, 'travel', 1)).toEqual({ ok: false, reason: 'Chưa chọn nơi đến' });

    const edge = from.edges[0]!;
    const res = start(s, 'travel', 999, edge.to);
    if (!res.ok) throw new Error(res.reason);
    expect(res.action.dueDay - res.action.startDay).toBe(edge.travelDays);
    run(s, ctx, { untilDay: edge.travelDays });
    expect(c.locationId).toBe(from.id);
    run(s, ctx, { untilDay: edge.travelDays + 1 });
    expect(c.locationId).toBe(edge.to);
    assertInvariants(s);
  });
});

describe('cultivate', () => {
  it('kiểm tra thời lượng, tính phí theo tháng làm tròn lên, ghi tu vi tăng', () => {
    const s = frozenWorld();
    const c = s.characters[NPC]!;
    const perMonth = gameData.techniques[c.techniqueId!]!.stonesPerMonth;
    setStones(s, NPC, 1000);
    expect(start(s, 'cultivate', 10)).toMatchObject({ ok: false, reason: 'Thời gian tu luyện phải từ 30 đến 360 ngày' });
    const res = start(s, 'cultivate', 31);
    if (!res.ok) throw new Error(res.reason);
    expect(res.action.reservedCosts.spiritStones).toBe(perMonth * 2);
    const before = c.progress;
    const { events } = run(s, ctx, { untilDay: 32 });
    const done = events.find((e) => e.type === 'action_completed' && e.actorId === NPC)!;
    expect(done.payload['progressGained']).toBeGreaterThan(0);
    expect(c.progress !== before || c.stage !== 'early').toBe(true);
    assertInvariants(s);
  });

  it('từ chối khi tu vi đã viên mãn', () => {
    const s = frozenWorld();
    const c = s.characters[NPC]!;
    Object.assign(c, { stage: 'perfect', progress: stageThresholdFx(gameData, c.realm) });
    expect(start(s, 'cultivate', 30)).toMatchObject({ ok: false, reason: 'Tu vi đã viên mãn, cần đột phá' });
  });
});

describe('gather', () => {
  it('lấy tài nguyên hữu hạn từ địa điểm, kéo dài 30 ngày', () => {
    const s = frozenWorld();
    const c = s.characters[NPC]!;
    const wild = Object.values(s.locations).find((l) => l.resourceStock > 0)!;
    c.locationId = wild.id;
    s.initialStoneSupply -= wild.resourceStock - 5;
    wild.resourceStock = 5;
    wild.resourceRegenPerMonth = 0;
    const wallet = c.spiritStones;
    const res = start(s, 'gather', 1);
    if (!res.ok) throw new Error(res.reason);
    expect(res.action.dueDay).toBe(30);
    run(s, ctx, { untilDay: 30 });
    expect(c.spiritStones).toBe(wallet);
    const { events } = run(s, ctx, { untilDay: 31 });
    // Sau khi hoàn tất NPC tự lập kế hoạch mới ngay trong ngày, nên kiểm tra qua event.
    expect(events.find((e) => e.type === 'action_completed' && e.actorId === NPC)!.payload['gathered']).toBe(5);
    expect(wild.resourceStock).toBe(0);
    expect(gatherRule.validateStart(s, { actorId: NPC, type: 'gather', durationDays: 30, source: 'npc' }, ctx))
      .toBe('Nơi này đã cạn tài nguyên');
    assertInvariants(s);
  });
});

describe('heal', () => {
  it('chỉ khi bị thương; hồi 12 thương/tháng khi đang dưỡng', () => {
    const s = frozenWorld();
    const c = s.characters[NPC]!;
    setStones(s, NPC, 100);
    expect(start(s, 'heal', 30)).toMatchObject({ ok: false, reason: 'Không bị thương' });
    c.injury = 40;
    const res = start(s, 'heal', 60);
    if (!res.ok) throw new Error(res.reason);
    expect(res.action.reservedCosts.spiritStones).toBe(20);
    run(s, ctx, { untilDay: 31 });
    expect(c.injury).toBe(28);
    assertInvariants(s);
  });
});
