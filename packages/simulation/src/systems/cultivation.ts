/** Bước 3 của tick: cộng tu vi cho nhân vật đang `cultivate`/`seclusion`. */
import type { SimContext } from '../core/context.ts';
import { createEvent } from '../core/events.ts';
import { compareIds } from '../core/ids.ts';
import { addProgress, dailyGainFx } from '../rules/cultivation.ts';
import type { WorldEvent, WorldState } from '../types.ts';

export function processCultivation(state: WorldState, ctx: SimContext): WorldEvent[] {
  const events: WorldEvent[] = [];
  const cultivating = Object.values(state.actions)
    .filter((a) => a.type === 'cultivate' || a.type === 'seclusion')
    .sort((a, b) => compareIds(a.actorId, b.actorId));
  for (const action of cultivating) {
    const c = state.characters[action.actorId];
    const location = c && state.locations[c.locationId];
    if (!c || !c.alive || !location) continue;
    const gain = dailyGainFx(ctx.data, c, location, action.type === 'seclusion');
    const { gained, reached } = addProgress(ctx.data, c, gain);
    action.meta.progressGained += gained;
    for (const stage of reached) {
      events.push(createEvent(state, {
        type: 'stage_advanced',
        severity: 'info',
        visibility: 'witnesses',
        chronicle: false,
        actorId: c.id,
        locationId: c.locationId,
        ...(c.factionId ? { factionIds: [c.factionId] } : {}),
        payload: { realm: c.realm, stage },
      }));
    }
  }
  return events;
}
