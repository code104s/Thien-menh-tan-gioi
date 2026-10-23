/** Định danh có tiền tố và thứ tự lặp ổn định (ADR-12). */
import type { Counters, EntityId } from '../types.ts';

export function formatId(prefix: string, n: number, width: number): EntityId {
  return `${prefix}_${String(n).padStart(width, '0')}`;
}

const COUNTER_FORMAT: Record<keyof Counters, { prefix: string; width: number }> = {
  action: { prefix: 'act', width: 6 },
  event: { prefix: 'evt', width: 8 },
  causal: { prefix: 'cr', width: 6 },
  dispute: { prefix: 'dsp', width: 4 },
  choice: { prefix: 'chc', width: 4 },
};

/** Tăng bộ đếm và trả ID mới; seq bắt đầu từ 1. */
export function nextId(counters: Counters, kind: keyof Counters): { id: EntityId; seq: number } {
  const seq = counters[kind] + 1;
  counters[kind] = seq;
  const { prefix, width } = COUNTER_FORMAT[kind];
  return { id: formatId(prefix, seq, width), seq };
}

export const locationId = (n: number): EntityId => formatId('loc', n, 3);
export const characterId = (n: number): EntityId => formatId('chr', n, 4);
export const factionId = (n: number): EntityId => formatId('fac', n, 2);
export const veinId = (n: number): EntityId => formatId('vein', n, 2);

/** So sánh theo code unit, không phụ thuộc locale. */
export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortedKeys(record: Record<string, unknown>): string[] {
  return Object.keys(record).sort(compareIds);
}

export function sortedValues<T>(record: Record<string, T>): T[] {
  return sortedKeys(record).map((k) => record[k] as T);
}
