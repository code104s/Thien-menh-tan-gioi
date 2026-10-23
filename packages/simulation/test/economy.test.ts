import { gameData } from '@tmtg/game-data';
import { describe, expect, it } from 'vitest';
import { assertInvariants } from '../src/core/invariants.ts';
import { factionId } from '../src/core/ids.ts';
import { run } from '../src/core/runner.ts';
import { processMonthlyFactions } from '../src/systems/economy.ts';
import { livingMembersOf, monthlyExpense, territoryOf } from '../src/world/selectors.ts';
import { ctx, frozenWorld } from './helpers.ts';

const F = factionId(1);

describe('kinh tế tháng', () => {
  it('thu linh mạch trong lãnh địa (giới hạn bởi trữ lượng), trả duy trì và bổng lộc', () => {
    const s = frozenWorld();
    const f = s.factions[F]!;
    const veins = territoryOf(s, F).map((l) => s.spiritVeins[l.veinId ?? '']).filter((v) => v !== undefined);
    expect(veins.length).toBeGreaterThan(0);
    veins[0]!.reserve = 7; // trữ lượng gần cạn
    const income = veins.reduce((sum, v, i) => sum + (i === 0 ? 7 : Math.min(v.yieldPerMonth, v.reserve)), 0);
    const expense = monthlyExpense(s, gameData, F);
    const treasury = f.treasury;
    const wallets = livingMembersOf(s, F).map((c) => c.spiritStones);
    const events = processMonthlyFactions(s, ctx);
    expect(f.treasury).toBe(treasury + income - expense);
    expect(veins[0]!.reserve).toBe(0);
    livingMembersOf(s, F).forEach((c, i) => {
      expect(c.spiritStones - wallets[i]!).toBe(gameData.balance.economy.stipend[c.factionRank!]);
    });
    expect(events.filter((e) => e.factionIds.includes(F))).toEqual([]);
  });

  it('kho cạn: trả đến hết theo thứ bậc, không âm, giảm ổn định và trung thành, ghi event', () => {
    const s = frozenWorld();
    const f = s.factions[F]!;
    for (const l of territoryOf(s, F)) {
      if (!l.veinId) continue;
      s.initialStoneSupply -= s.spiritVeins[l.veinId]!.reserve;
      s.spiritVeins[l.veinId]!.reserve = 0;
    }
    // Đủ duy trì + bổng lộc tông chủ + 5: trưởng lão đầu tiên chỉ được trả một phần.
    const budget = territoryOf(s, F).length * gameData.balance.economy.upkeepPerTerritory + gameData.balance.economy.stipend.leader + 5;
    s.initialStoneSupply -= f.treasury - budget;
    f.treasury = budget;
    const members = livingMembersOf(s, F);
    const leader = members.find((c) => c.factionRank === 'leader')!;
    const loyaltyBefore = new Map(members.map((c) => [c.id, c.personality.loyalty]));
    const stability = f.stability;
    const events = processMonthlyFactions(s, ctx);
    expect(f.treasury).toBe(0);
    const shortfall = events.find((e) => e.type === 'stipend_shortfall' && e.factionIds.includes(F))!;
    const unpaid = shortfall.payload['unpaid'] as string[];
    expect(unpaid).not.toContain(leader.id);
    expect(unpaid.length).toBeGreaterThan(0);
    for (const id of unpaid) expect(s.characters[id]!.personality.loyalty).toBe(Math.max(0, loyaltyBefore.get(id)! - 5));
    expect(f.stability).toBe(stability - 5);
    assertInvariants(s);
  });

  it('chạy 50 năm: kho không âm, bảo toàn linh thạch, linh mạch cạn dần', () => {
    const s = frozenWorld();
    for (const c of Object.values(s.characters)) c.nextReviewDay = 0;
    const reserveBefore = Object.values(s.spiritVeins).reduce((sum, v) => sum + v.reserve, 0);
    for (let year = 1; year <= 50; year++) {
      run(s, ctx, { untilDay: year * 360 });
      assertInvariants(s);
    }
    const reserveAfter = Object.values(s.spiritVeins).reduce((sum, v) => sum + v.reserve, 0);
    expect(reserveAfter).toBeLessThan(reserveBefore);
    expect(s.ledger.minted.vein_extraction).toBe(reserveBefore - reserveAfter);
  });
});
