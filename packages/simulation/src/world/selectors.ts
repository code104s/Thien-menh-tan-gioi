/** Selector suy ra từ nguồn sự thật duy nhất (ADR-13). Kết quả luôn sắp theo ID. */
import { sortedValues } from '../core/ids.ts';
import { realmPower } from '../rules/realm.ts';
import type { GameData } from '@tmtg/game-data';
import type { Cultivator, EntityId, Location, WorldState } from '../types.ts';

export function territoryOf(state: WorldState, factionId: EntityId): Location[] {
  return sortedValues(state.locations).filter((l) => l.ownerFactionId === factionId);
}

export function livingMembersOf(state: WorldState, factionId: EntityId): Cultivator[] {
  return sortedValues(state.characters).filter((c) => c.alive && c.factionId === factionId);
}

export function isInSeclusion(state: WorldState, characterId: EntityId): boolean {
  return Object.values(state.actions).some((a) => a.actorId === characterId && a.type === 'seclusion');
}

/** Sức mạnh tông môn = Σ sức mạnh thành viên sống không đang bế quan (docs/09 mục 9). */
export function factionPower(state: WorldState, data: GameData, factionId: EntityId): number {
  return livingMembersOf(state, factionId)
    .filter((c) => !isInSeclusion(state, c.id))
    .reduce((sum, c) => sum + realmPower(data, c.realm, c.stage), 0);
}

/** Tông môn khác có lãnh địa kề lãnh địa của `factionId`. */
export function neighboringFactions(state: WorldState, factionId: EntityId): EntityId[] {
  const own = new Set(territoryOf(state, factionId).map((l) => l.id));
  const result = new Set<EntityId>();
  for (const l of sortedValues(state.locations)) {
    if (!l.ownerFactionId || l.ownerFactionId === factionId) continue;
    if (l.edges.some((e) => own.has(e.to))) result.add(l.ownerFactionId);
  }
  return [...result].sort();
}

/** Chi phí cố định mỗi tháng: duy trì lãnh địa + bổng lộc thành viên sống. */
export function monthlyExpense(state: WorldState, data: GameData, factionId: EntityId): number {
  const economy = data.balance.economy;
  const stipends = livingMembersOf(state, factionId)
    .reduce((sum, c) => sum + (c.factionRank ? economy.stipend[c.factionRank] : 0), 0);
  return territoryOf(state, factionId).length * economy.upkeepPerTerritory + stipends;
}
