/** Đạo Ngân tối giản (docs/09 mục 13): mỗi địa điểm tối đa một dấu, tăng linh khí. */
import type { GameData } from '@tmtg/game-data';
import { createEvent } from '../core/events.ts';
import { clamp } from '../core/math.ts';
import type { Cultivator, EntityId, WorldEvent, WorldState } from '../types.ts';

/** Gọi khi tu sĩ Kim Đan đột phá thành công hoặc tọa hóa tại địa điểm hiện tại. */
export function leaveDaoMark(state: WorldState, data: GameData, c: Cultivator, causeEventId: EntityId): WorldEvent[] {
  const location = state.locations[c.locationId];
  if (!location || location.daoMarkIds.length > 0) return [];
  const cfg = data.balance.cultivation;
  const before = location.spiritualEnergyBp;
  location.spiritualEnergyBp = clamp(before + cfg.daoMarkEnergyBp, 0, cfg.energyClampBp[1]);
  const event = createEvent(state, {
    type: 'dao_mark_left',
    severity: 'info',
    visibility: 'public',
    chronicle: true,
    actorId: c.id,
    locationId: location.id,
    causeEventId,
    payload: { locationId: location.id, energyBefore: before, energyAfter: location.spiritualEnergyBp },
  });
  location.daoMarkIds.push(event.id);
  return [event];
}
