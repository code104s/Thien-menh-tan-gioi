import { gameData } from '@tmtg/game-data';
import { describe, expect, it } from 'vitest';
import { assertInvariants } from '../src/core/invariants.ts';
import { run } from '../src/core/runner.ts';
import { startAction } from '../src/core/scheduler.ts';
import { breakthroughBlocker, breakthroughChanceBp, resolveBreakthrough } from '../src/rules/breakthrough.ts';
import { baseLifespanDays, stageThresholdFx } from '../src/rules/realm.ts';
import type { Cultivator, WorldState } from '../src/types.ts';
import { ctx, frozenWorld, setStones } from './helpers.ts';

const NPC = 'chr_0005';
const QI = stageThresholdFx(gameData, 'qi');

function ready(s: WorldState): Cultivator {
  const c = s.characters[NPC]!;
  Object.assign(c, {
    realm: 'qi', stage: 'perfect', progress: QI, injury: 0, foundation: 50, insight: 50, daoHeart: 50,
    techniqueId: 'dan_khi_quyet', breakthroughCooldownUntil: 0, birthDay: -20 * 360,
  });
  return c;
}

describe('điều kiện đột phá', () => {
  it.each([
    ['chưa viên mãn', (c: Cultivator) => { c.progress = QI - 1; }, 'Tu vi chưa viên mãn'],
    ['thương nặng', (c: Cultivator) => { c.injury = 30; }, 'Thương tích quá nặng để đột phá'],
    ['đang hồi phục', (c: Cultivator) => { c.breakthroughCooldownUntil = 50; }, 'Kinh mạch chưa hồi phục (còn 50 ngày)'],
    ['căn cơ yếu', (c: Cultivator) => { c.foundation = 29; }, 'Căn cơ chưa đủ vững'],
    ['đỉnh Kim Đan', (c: Cultivator) => { c.realm = 'golden_core'; }, 'Đã đạt cảnh giới cao nhất của phiên bản này'],
  ])('%s', (_label, mutate, reason) => {
    const s = frozenWorld();
    const c = ready(s);
    expect(breakthroughBlocker(gameData, c, 0)).toBeNull();
    mutate(c);
    expect(breakthroughBlocker(gameData, c, 0)).toBe(reason);
  });

  it('công thức tỉ lệ và kẹp [500, 9000]', () => {
    const s = frozenWorld();
    const c = ready(s);
    expect(breakthroughChanceBp(gameData, c, 0)).toBe(5000);
    c.insight = 60;
    c.injury = 10;
    expect(breakthroughChanceBp(gameData, c, 0)).toBe(5000 + 400 - 500);
    Object.assign(c, { insight: 100, daoHeart: 100, foundation: 100, injury: 0 });
    expect(breakthroughChanceBp(gameData, c, 0)).toBe(9000);
    Object.assign(c, { insight: 0, daoHeart: 0, foundation: 0, injury: 29 });
    expect(breakthroughChanceBp(gameData, c, 0)).toBe(500);
  });

  it('phạt tuổi theo bảng tra', () => {
    const s = frozenWorld();
    const c = ready(s);
    c.birthDay = -Math.floor(c.lifespanDays * 80 / 100);
    expect(breakthroughChanceBp(gameData, c, 0)).toBe(4000);
  });
});

describe('kết quả đột phá', () => {
  it('10 000 lần: tỉ lệ thành công ≈ công thức (±2%), phân bậc thất bại ≈ 60/35/5, không NaN, không chết trực tiếp', () => {
    const s = frozenWorld();
    let success = 0;
    const tiers: Record<string, number> = {};
    for (let i = 0; i < 10_000; i++) {
      const c = ready(s);
      const [event] = resolveBreakthrough(s, gameData, c);
      expect(c.alive).toBe(true);
      for (const v of [c.injury, c.foundation, c.lifespanDays, c.progress]) expect(Number.isSafeInteger(v)).toBe(true);
      if (event!.type === 'breakthrough_succeeded') success++;
      else tiers[event!.payload['tier'] as string] = (tiers[event!.payload['tier'] as string] ?? 0) + 1;
    }
    expect(Math.abs(success / 10_000 - 0.5)).toBeLessThan(0.02);
    const failures = 10_000 - success;
    expect(Math.abs(tiers['minor']! / failures - 0.6)).toBeLessThan(0.03);
    expect(Math.abs(tiers['major']! / failures - 0.35)).toBeLessThan(0.03);
    expect(Math.abs(tiers['catastrophic']! / failures - 0.05)).toBeLessThan(0.015);
  });

  it('action đột phá: thành công lên cảnh giới, tăng tuổi thọ, trừ phí; thất bại có hồi phục 180 ngày', () => {
    let sawSuccess = false;
    let sawFailure = false;
    for (let i = 0; i < 40 && !(sawSuccess && sawFailure); i++) {
      const s = frozenWorld(`bt-${i}`);
      const c = ready(s);
      setStones(s, NPC, 500);
      const res = startAction(s, { actorId: NPC, type: 'breakthrough', durationDays: 1, source: 'npc' }, ctx);
      if (!res.ok) throw new Error(res.reason);
      expect(res.action.dueDay).toBe(30);
      expect(c.spiritStones).toBe(300);
      run(s, ctx, { untilDay: 31 });
      expect(s.ledger.burned.breakthrough).toBe(200);
      if (c.realm === 'foundation') {
        sawSuccess = true;
        expect([c.stage, c.progress, c.lifespanDays]).toEqual(['early', 0, baseLifespanDays(gameData, 'foundation')]);
      } else {
        sawFailure = true;
        // 25 (bậc nhẹ) trừ 3 hồi thương của ranh giới tháng ngày 30.
        expect(c.injury).toBeGreaterThanOrEqual(22);
        expect(c.breakthroughCooldownUntil).toBe(30 + 180);
        expect(c.lastInjuryCause).toBe('breakthrough');
      }
      assertInvariants(s);
    }
    expect(sawSuccess && sawFailure).toBe(true);
  });

  it('điều kiện mất đi giữa chừng → thất bại, hoàn toàn bộ phí, không tung xúc xắc', () => {
    const s = frozenWorld();
    const c = ready(s);
    setStones(s, NPC, 500);
    startAction(s, { actorId: NPC, type: 'breakthrough', durationDays: 1, source: 'npc' }, ctx);
    c.injury = 50;
    const { events } = run(s, ctx, { untilDay: 31 });
    const failed = events.find((e) => e.actorId === NPC && e.type === 'action_failed')!;
    expect(failed.payload).toMatchObject({ reason: 'Thương tích quá nặng để đột phá', refund: 200, consumed: 0 });
    expect(s.ledger.burned.breakthrough).toBe(0);
    expect(s.rng[`breakthrough:${NPC}`]).toBeUndefined();
    assertInvariants(s);
  });
});
