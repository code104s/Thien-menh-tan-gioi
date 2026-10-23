import { gameData } from '@tmtg/game-data';
import { describe, expect, it } from 'vitest';
import { assertInvariants } from '../src/core/invariants.ts';
import { run } from '../src/core/runner.ts';
import { startAction } from '../src/core/scheduler.ts';
import { tick } from '../src/core/tick.ts';
import { PLAYER_ID } from '../src/worldgen/generate.ts';
import { command, ctx, frozenWorld, setStones } from './helpers.ts';

describe('người chơi dùng cùng luật với NPC', () => {
  it('cùng yêu cầu sai cho cùng lý do từ chối', () => {
    const s = frozenWorld();
    const npc = 'chr_0005';
    s.characters[npc]!.locationId = s.characters[PLAYER_ID]!.locationId;
    for (const durationDays of [5, 400]) {
      const viaCommand = tick(s, [command(s, { type: 'START_ACTION', actionType: 'cultivate', durationDays })], ctx);
      const npcResult = startAction(s, { actorId: npc, type: 'cultivate', durationDays, source: 'npc' }, ctx);
      expect(npcResult.ok).toBe(false);
      expect(viaCommand.events[0]!.payload['reason']).toBe(npcResult.ok ? null : npcResult.reason);
    }
  });
});

describe('bế quan', () => {
  it('bế quan 10 năm: phát event bắt đầu/kết thúc, nhanh hơn tu luyện thường 20% (khi không thương)', () => {
    const s = frozenWorld();
    const p = s.characters[PLAYER_ID]!;
    setStones(s, PLAYER_ID, 5000);
    const r = tick(s, [command(s, { type: 'START_ACTION', actionType: 'seclusion', durationDays: 3600 })], ctx);
    expect(r.events.map((e) => e.type)).toEqual(['seclusion_started']);
    const perMonth = gameData.techniques[p.techniqueId!]!.stonesPerMonth;
    expect(Object.values(s.actions)[0]!.reservedCosts.spiritStones).toBe(perMonth * 120);
    const { events, stoppedBy } = run(s, ctx, { untilDay: 4000, stopOn: ['player_action_finished'] });
    expect(stoppedBy?.reason).toBe('player_action_finished');
    expect(s.day).toBe(3601);
    const ended = events.find((e) => e.type === 'seclusion_ended')!;
    expect(ended.payload['early']).toBe(false);
    expect(ended.chronicle).toBe(true);
    expect(p.realm !== 'qi' || p.stage !== 'early').toBe(true);
    assertInvariants(s);
  });

  it('xuất quan sớm: hoàn 50% phần chi phí còn lại, mất 10% tu vi đã tăng trong lần bế quan', () => {
    const s = frozenWorld();
    const p = s.characters[PLAYER_ID]!;
    setStones(s, PLAYER_ID, 5000);
    tick(s, [command(s, { type: 'START_ACTION', actionType: 'seclusion', durationDays: 3600 })], ctx);
    const action = Object.values(s.actions)[0]!;
    const reserved = action.reservedCosts.spiritStones;
    run(s, ctx, { untilDay: 900 });
    const gained = action.meta.progressGained;
    const progressBefore = p.progress;
    const wallet = p.spiritStones;
    const { events } = tick(s, [command(s, { type: 'CANCEL_ACTION', actionId: action.id })], ctx);
    expect(events.map((e) => e.type)).toEqual(['action_cancelled', 'seclusion_ended']);
    const remaining = 3600 - 900;
    const expectedRefund = Math.floor((reserved * remaining) / (3600 * 2));
    // Không so số dư ví: ngày 900 là ranh giới tháng nên người chơi (đệ tử) còn nhận bổng lộc.
    expect(events[0]!.payload['refund']).toBe(expectedRefund);
    expect(p.spiritStones).toBeGreaterThanOrEqual(wallet + expectedRefund);
    expect(p.progress).toBe(Math.max(0, progressBefore - Math.floor(gained / 10)));
    expect(events[1]!.payload['early']).toBe(true);
    assertInvariants(s);
  });

  it('không cho bế quan ngắn hơn 1 năm', () => {
    const s = frozenWorld();
    const r = tick(s, [command(s, { type: 'START_ACTION', actionType: 'seclusion', durationDays: 100 })], ctx);
    expect(r.events[0]!.payload['reason']).toBe('Thời gian bế quan phải từ 360 đến 3600 ngày');
  });
});
