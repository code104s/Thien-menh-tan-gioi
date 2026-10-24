/**
 * Snapshot = canonical JSON của WorldState (ADR-10, ADR-15). Event log và command log lưu riêng.
 * Migration chạy tuần tự từ schemaVersion cũ lên CURRENT_SCHEMA_VERSION trước khi validate.
 */
import { canonicalJson } from './digest.ts';
import type { WorldState } from '../types.ts';

export const CURRENT_SCHEMA_VERSION = 2;

/** MIGRATIONS[v] nâng snapshot từ phiên bản v lên v + 1. */
export const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {
  /** v1 → v2 (ADR-16): save cũ không có địa hình → terrainGenVersion 0, các trường địa hình null. */
  1: (raw) => {
    const locations = raw['locations'];
    if (locations !== null && typeof locations === 'object' && !Array.isArray(locations)) {
      for (const l of Object.values(locations as Record<string, unknown>)) {
        if (l !== null && typeof l === 'object') Object.assign(l, { biomeId: null, anchorCell: null });
      }
    }
    return { ...raw, terrainGenVersion: 0, terrainDigest: null };
  },
};

export class SnapshotError extends Error {
  override name = 'SnapshotError';
}

export function toSnapshot(state: WorldState): string {
  return canonicalJson(state);
}

/** Parse JSON và chạy migration; KHÔNG validate cấu trúc — việc đó thuộc ranh giới (@tmtg/shared). */
export function migrateSnapshot(json: string): Record<string, unknown> {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (error) {
    throw new SnapshotError(`Save hỏng: không đọc được JSON (${(error as Error).message})`);
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SnapshotError('Save hỏng: nội dung không phải object');
  }
  let current = raw as Record<string, unknown>;
  let version = current['schemaVersion'];
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) {
    throw new SnapshotError(`Save hỏng: schemaVersion không hợp lệ (${String(version)})`);
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new SnapshotError(`Save được tạo bởi phiên bản mới hơn (schema ${version} > ${CURRENT_SCHEMA_VERSION})`);
  }
  while (version < CURRENT_SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) throw new SnapshotError(`Thiếu migration từ schema ${version}`);
    current = migrate(current);
    version += 1;
    current['schemaVersion'] = version;
  }
  return current;
}

/** Sao chép sâu một WorldState qua snapshot (dùng cho test và nhánh "what-if"). */
export function cloneState(state: WorldState): WorldState {
  return JSON.parse(toSnapshot(state)) as WorldState;
}
