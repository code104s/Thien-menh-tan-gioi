/**
 * Đọc snapshot tại ranh giới: JSON → migration → Zod → bất biến → bất biến địa hình (nếu sinh lại được).
 * Mọi lỗi được gom thành thông báo tiếng Việt.
 */
import {
  checkInvariants, checkTerrainInvariants, migrateSnapshot, regenerateTerrain, SnapshotError, type WorldState,
} from '@tmtg/simulation';
import { worldStateSchema } from './schema.ts';

export function parseSnapshot(json: string): WorldState {
  const migrated = migrateSnapshot(json);
  const parsed = worldStateSchema.safeParse(migrated);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join('.') || '$'}: ${issue.message}`)
      .join('; ');
    throw new SnapshotError(`Save hỏng: sai cấu trúc (${issues})`);
  }
  const state = parsed.data;
  const violations = checkInvariants(state);
  if (violations.length > 0) {
    const detail = violations.slice(0, 5).map((v) => `[${v.code}] ${v.message}`).join('; ');
    throw new SnapshotError(`Save hỏng: vi phạm bất biến (${detail})`);
  }
  // ADR-16: địa hình không sinh lại được (save cũ, generator đổi) không phải lỗi save — UI rơi về bản đồ cũ.
  const terrain = regenerateTerrain(state);
  if (terrain.status === 'ok') {
    const terrainViolations = checkTerrainInvariants(state, terrain.model);
    if (terrainViolations.length > 0) {
      const detail = terrainViolations.slice(0, 5).map((v) => `[${v.code}] ${v.message}`).join('; ');
      throw new SnapshotError(`Save hỏng: vi phạm bất biến địa hình (${detail})`);
    }
  }
  return state;
}
