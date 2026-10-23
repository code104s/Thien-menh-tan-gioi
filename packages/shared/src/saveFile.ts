/**
 * Định dạng file save (ADR-15): snapshot + event log rút gọn + command log + checksum.
 * Dùng cho cả IndexedDB lẫn export/import. Mọi lỗi được báo bằng SnapshotError tiếng Việt.
 */
import { SnapshotError, canonicalJson, fnv1a64, type PlayerCommand, type WorldEvent, type WorldState } from '@tmtg/simulation';
import { z } from 'zod';
import { parseSnapshot } from './save.ts';
import { playerCommandSchema, worldEventSchema } from './schema.ts';

export const SAVE_FORMAT = 'tmtg-save';

export const originSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('join_faction'), factionIndex: z.union([z.literal(0), z.literal(1), z.literal(2)]) }),
  z.object({ kind: z.literal('rogue') }),
  z.object({ kind: z.literal('resource_seeker') }),
]);

export const saveFileSchema = z.object({
  format: z.literal(SAVE_FORMAT),
  schemaVersion: z.int().positive(),
  contentVersion: z.string().min(1),
  /** Metadata giao diện; không nằm trong checksum, không ảnh hưởng mô phỏng. */
  savedAt: z.string(),
  creation: z.object({
    seed: z.string().min(1),
    origin: originSchema,
    playerName: z.string().exactOptional(),
  }),
  snapshot: z.string().min(2),
  events: z.array(worldEventSchema),
  commands: z.array(playerCommandSchema),
  /** Event của lệnh đã áp ở đầu ngày hiện tại nhưng chưa qua tick (sẽ được xử lý ở tick kế tiếp). */
  pendingEventIds: z.array(z.string()),
  checksum: z.string().regex(/^[0-9a-f]{16}$/),
});

export type SaveFile = z.infer<typeof saveFileSchema>;

export function saveChecksum(
  snapshot: string, events: readonly WorldEvent[], commands: readonly PlayerCommand[], pendingEventIds: readonly string[],
): string {
  return fnv1a64(`${snapshot}|${canonicalJson(events)}|${canonicalJson(commands)}|${canonicalJson(pendingEventIds)}`);
}

/** Validate toàn bộ file save; trả file và WorldState đã kiểm bất biến. */
export function parseSaveFile(input: string | unknown): { save: SaveFile; state: WorldState } {
  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch {
      throw new SnapshotError('Save hỏng: file không phải JSON hợp lệ');
    }
  }
  const parsed = saveFileSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new SnapshotError(`Save hỏng: sai cấu trúc file (${issue?.path.join('.') || '$'}: ${issue?.message ?? '?'})`);
  }
  const save = parsed.data;
  if (saveChecksum(save.snapshot, save.events, save.commands, save.pendingEventIds) !== save.checksum) {
    throw new SnapshotError('Save hỏng: checksum không khớp (file bị sửa hoặc ghi dở)');
  }
  const state = parseSnapshot(save.snapshot);
  if (state.seed !== save.creation.seed) throw new SnapshotError('Save hỏng: seed trong snapshot không khớp');
  const ids = new Set(save.events.map((e) => e.id));
  if (!save.pendingEventIds.every((id) => ids.has(id))) throw new SnapshotError('Save hỏng: thiếu event đang chờ xử lý');
  return { save, state };
}
