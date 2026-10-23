/** Tạo WorldEvent bất biến với ID/seq tăng dần; event không lưu trong WorldState (ADR-10). */
import { nextId, sortedValues } from './ids.ts';
import type { WorldEvent, WorldState } from '../types.ts';

export type EventDraft = Omit<WorldEvent, 'id' | 'seq' | 'day' | 'factionIds' | 'witnessIds' | 'payload'>
  & Partial<Pick<WorldEvent, 'factionIds' | 'witnessIds' | 'payload'>>;

/** Nhân chứng mặc định: nhân vật còn sống đang ở địa điểm xảy ra event (chụp lúc tạo). */
function witnessesAt(state: WorldState, locationId: string | undefined): string[] {
  if (locationId === undefined) return [];
  return sortedValues(state.characters).filter((c) => c.alive && c.locationId === locationId).map((c) => c.id);
}

export function createEvent(state: WorldState, draft: EventDraft): WorldEvent {
  const { id, seq } = nextId(state.counters, 'event');
  state.eventSeq = seq;
  return {
    ...draft,
    id,
    seq,
    day: state.day,
    factionIds: draft.factionIds ?? [],
    witnessIds: draft.witnessIds ?? (draft.visibility === 'secret' ? [] : witnessesAt(state, draft.locationId)),
    payload: draft.payload ?? {},
  };
}
