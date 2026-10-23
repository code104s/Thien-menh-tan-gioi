/** Ân/oán/nợ/phản bội gắn với event gốc (docs/09 mục 11). Không có thanh thiện/ác chung. */
import { nextId } from '../core/ids.ts';
import { clamp, divFloor } from '../core/math.ts';
import type { CausalRecord, CausalType, EntityId, WorldState } from '../types.ts';

const POSITIVE: Record<CausalType, boolean> = { favor: true, debt: true, grudge: false, betrayal: false };

export interface CausalDraft {
  sourceEventId: EntityId;
  holderId: EntityId;
  towardId: EntityId;
  type: CausalType;
  intensity: number;
  amount?: number;
}

/**
 * Tạo bản ghi nhân quả và dịch quan hệ của người mang về phía đối tượng ±intensity/4.
 * Người mang/đối tượng có thể là nhân vật hoặc tông môn; quan hệ chỉ cập nhật khi cùng loại.
 */
export function addCausalRecord(state: WorldState, draft: CausalDraft): CausalRecord {
  const { id } = nextId(state.counters, 'causal');
  const record: CausalRecord = {
    id,
    sourceEventId: draft.sourceEventId,
    holderId: draft.holderId,
    towardId: draft.towardId,
    type: draft.type,
    intensity: clamp(draft.intensity, 0, 100),
    ...(draft.amount !== undefined ? { amount: draft.amount } : {}),
    createdDay: state.day,
    resolvedByEventId: null,
  };
  state.causalRecords[id] = record;
  shiftRelation(state, draft.holderId, draft.towardId,
    (POSITIVE[draft.type] ? 1 : -1) * divFloor(record.intensity, 4));
  return record;
}

/** Dịch quan hệ một chiều; chỉ giữa hai nhân vật hoặc hai tông môn. */
export function shiftRelation(state: WorldState, holderId: EntityId, towardId: EntityId, delta: number): void {
  if (holderId === towardId || delta === 0) return;
  const holderChar = state.characters[holderId];
  if (holderChar && state.characters[towardId]) {
    const value = clamp((holderChar.relations[towardId] ?? 0) + delta, -100, 100);
    if (value === 0) delete holderChar.relations[towardId];
    else holderChar.relations[towardId] = value;
    return;
  }
  const holderFaction = state.factions[holderId];
  if (holderFaction && state.factions[towardId]) {
    holderFaction.relations[towardId] = clamp((holderFaction.relations[towardId] ?? 0) + delta, -100, 100);
  }
}

export function unresolvedRecords(state: WorldState, holderId: EntityId, type?: CausalType): CausalRecord[] {
  return Object.values(state.causalRecords)
    .filter((r) => r.holderId === holderId && r.resolvedByEventId === null && (!type || r.type === type))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}
