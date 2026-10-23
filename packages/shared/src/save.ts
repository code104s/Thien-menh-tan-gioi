/** Đọc snapshot tại ranh giới: JSON → migration → Zod → bất biến. Mọi lỗi được gom thành thông báo tiếng Việt. */
import { checkInvariants, migrateSnapshot, SnapshotError, type WorldState } from '@tmtg/simulation';
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
  return state;
}
