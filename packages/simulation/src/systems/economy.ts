/**
 * Bước 4 (phần tông môn): thu từ linh mạch, duy trì lãnh địa, bổng lộc (docs/09 mục 5).
 * Kho không bao giờ âm: thiếu thì trả đến hết, giảm ổn định, ghi stipend_shortfall.
 */
import type { SimContext } from '../core/context.ts';
import { createEvent } from '../core/events.ts';
import { compareIds, sortedValues } from '../core/ids.ts';
import { clamp } from '../core/math.ts';
import { livingMembersOf, territoryOf } from '../world/selectors.ts';
import { FACTION_RANKS, type WorldEvent, type WorldState } from '../types.ts';

export function processMonthlyFactions(state: WorldState, ctx: SimContext): WorldEvent[] {
  const economy = ctx.data.balance.economy;
  const events: WorldEvent[] = [];
  for (const faction of sortedValues(state.factions)) {
    if (faction.dissolved) continue;
    const territory = territoryOf(state, faction.id);

    // 1. Thu từ linh mạch trong lãnh địa.
    let income = 0;
    for (const location of territory) {
      const vein = location.veinId ? state.spiritVeins[location.veinId] : undefined;
      if (!vein) continue;
      const take = Math.min(vein.yieldPerMonth, vein.reserve);
      vein.reserve -= take;
      income += take;
    }
    faction.treasury += income;
    state.ledger.minted.vein_extraction += income;

    // 2. Duy trì lãnh địa.
    const upkeep = territory.length * economy.upkeepPerTerritory;
    const paidUpkeep = Math.min(upkeep, faction.treasury);
    faction.treasury -= paidUpkeep;
    state.ledger.burned.faction_upkeep += paidUpkeep;
    let shortfall = paidUpkeep < upkeep;

    // 3. Bổng lộc: tông chủ → trưởng lão → đệ tử, rồi theo ID.
    const unpaid: string[] = [];
    const members = livingMembersOf(state, faction.id).sort((a, b) =>
      FACTION_RANKS.indexOf(a.factionRank!) - FACTION_RANKS.indexOf(b.factionRank!) || compareIds(a.id, b.id));
    for (const member of members) {
      const amount = economy.stipend[member.factionRank!];
      const paid = Math.min(amount, faction.treasury);
      faction.treasury -= paid;
      member.spiritStones += paid;
      if (paid < amount) {
        unpaid.push(member.id);
        // Thành viên không được trả đủ giảm trung thành (docs/09 mục 5).
        member.personality.loyalty = clamp(member.personality.loyalty - economy.shortfallStabilityLoss, 0, 100);
      }
    }
    if (unpaid.length > 0) shortfall = true;
    if (shortfall) {
      faction.stability = clamp(faction.stability - economy.shortfallStabilityLoss, 0, 100);
      events.push(createEvent(state, {
        type: 'stipend_shortfall',
        severity: 'info',
        visibility: 'faction',
        chronicle: false,
        factionIds: [faction.id],
        payload: { factionId: faction.id, unpaid, upkeepShort: upkeep - paidUpkeep, income },
      }));
    }
  }
  return events;
}
