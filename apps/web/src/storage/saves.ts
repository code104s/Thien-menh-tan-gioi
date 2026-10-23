/**
 * Lưu save vào IndexedDB qua Dexie (ADR-10, ADR-15).
 * Một save = 1 dòng `saves` (metadata + snapshot) + các chunk event 1000 mục + command log;
 * ghi/xóa trong một transaction duy nhất nên không bao giờ còn save ghi dở.
 */
import { parseSaveFile, type SaveFile } from '@tmtg/shared';
import Dexie, { type Table } from 'dexie';

export const EVENT_CHUNK_SIZE = 1000;

export interface SaveRow {
  slot: string;
  savedAt: string;
  day: number;
  playerName: string;
  seed: string;
  /** Toàn bộ SaveFile trừ events/commands. */
  head: Omit<SaveFile, 'events' | 'commands'>;
  chunkCount: number;
}

interface ChunkRow {
  slot: string;
  index: number;
  events: SaveFile['events'];
}

interface CommandRow {
  slot: string;
  commands: SaveFile['commands'];
}

export class SaveDatabase extends Dexie {
  saves!: Table<SaveRow, string>;
  eventChunks!: Table<ChunkRow, [string, number]>;
  commandLogs!: Table<CommandRow, string>;

  constructor(name = 'thien-menh-tan-gioi') {
    super(name);
    this.version(1).stores({
      saves: 'slot, savedAt',
      eventChunks: '[slot+index], slot',
      commandLogs: 'slot',
    });
  }
}

export interface SaveMeta {
  slot: string;
  savedAt: string;
  day: number;
  playerName: string;
  seed: string;
}

export async function writeSave(
  db: SaveDatabase, slot: string, save: SaveFile, playerName: string, day: number, chunkSize = EVENT_CHUNK_SIZE,
): Promise<void> {
  const { events, commands, ...head } = save;
  const chunks: ChunkRow[] = [];
  for (let i = 0; i * chunkSize < events.length; i++) {
    chunks.push({ slot, index: i, events: events.slice(i * chunkSize, (i + 1) * chunkSize) });
  }
  await db.transaction('rw', db.saves, db.eventChunks, db.commandLogs, async () => {
    await db.eventChunks.where('slot').equals(slot).delete();
    await db.eventChunks.bulkPut(chunks);
    await db.commandLogs.put({ slot, commands });
    await db.saves.put({
      slot, savedAt: save.savedAt, day, playerName, seed: save.creation.seed, head, chunkCount: chunks.length,
    });
  });
}

/** Đọc và validate lại (checksum, schema, bất biến); save hỏng ném SnapshotError. */
export async function readSave(db: SaveDatabase, slot: string): Promise<SaveFile> {
  return db.transaction('r', db.saves, db.eventChunks, db.commandLogs, async () => {
    const row = await db.saves.get(slot);
    if (!row) throw new Error(`Không có save ở ô "${slot}"`);
    const chunks = await db.eventChunks.where('slot').equals(slot).sortBy('index');
    if (chunks.length !== row.chunkCount) throw new Error('Save hỏng: thiếu dữ liệu sự kiện');
    const commandRow = await db.commandLogs.get(slot);
    const save: SaveFile = {
      ...row.head,
      events: chunks.flatMap((c) => c.events),
      commands: commandRow?.commands ?? [],
    };
    return parseSaveFile(save).save;
  });
}

export async function listSaves(db: SaveDatabase): Promise<SaveMeta[]> {
  const rows = await db.saves.orderBy('savedAt').reverse().toArray();
  return rows.map(({ slot, savedAt, day, playerName, seed }) => ({ slot, savedAt, day, playerName, seed }));
}

export async function deleteSave(db: SaveDatabase, slot: string): Promise<void> {
  await db.transaction('rw', db.saves, db.eventChunks, db.commandLogs, async () => {
    await db.saves.delete(slot);
    await db.eventChunks.where('slot').equals(slot).delete();
    await db.commandLogs.delete(slot);
  });
}
