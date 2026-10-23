import 'fake-indexeddb/auto';
import { digest, type InterruptReason } from '@tmtg/simulation';
import { describe, expect, it } from 'vitest';
import { SaveDatabase, deleteSave, listSaves, readSave, writeSave } from '../src/storage/saves.ts';
import { SimHost } from '../src/worker/host.ts';

let dbCounter = 0;
const freshDb = () => new SaveDatabase(`test-${dbCounter++}`);
const NO_STOP = new Set<InterruptReason>();

function longGame(): SimHost {
  const host = SimHost.createNew({ seed: 'save-db', origin: { kind: 'rogue' } });
  host.advance(360 * 60, NO_STOP);
  return host;
}

describe('lưu trữ IndexedDB', () => {
  it('ghi → đọc giữ nguyên save, event log được chia chunk', async () => {
    const db = freshDb();
    const host = longGame();
    const save = host.toSave('2026-10-24T10:00:00.000Z');
    const chunkSize = 40;
    expect(save.events.length).toBeGreaterThan(chunkSize * 2);
    await writeSave(db, 'slot1', save, 'Người chơi', host.state.day, chunkSize);
    const loaded = await readSave(db, 'slot1');
    expect(loaded).toEqual(save);
    expect(await db.eventChunks.where('slot').equals('slot1').count()).toBe(Math.ceil(save.events.length / chunkSize));
    expect(digest(SimHost.fromSave(loaded).state)).toBe(digest(host.state));
  });

  it('ghi đè ô cũ xóa chunk thừa; danh sách mới nhất trước; xóa sạch', async () => {
    const db = freshDb();
    const big = longGame();
    await writeSave(db, 'auto', big.toSave('2026-01-01T00:00:00.000Z'), 'A', big.state.day, 40);
    const small = SimHost.createNew({ seed: 'small', origin: { kind: 'rogue' } });
    await writeSave(db, 'auto', small.toSave('2026-01-02T00:00:00.000Z'), 'B', 0);
    expect(await db.eventChunks.where('slot').equals('auto').count()).toBe(1);
    expect((await readSave(db, 'auto')).creation.seed).toBe('small');
    await writeSave(db, 'slot2', small.toSave('2026-01-03T00:00:00.000Z'), 'C', 0);
    expect((await listSaves(db)).map((m) => m.slot)).toEqual(['slot2', 'auto']);
    await deleteSave(db, 'auto');
    expect(await db.eventChunks.where('slot').equals('auto').count()).toBe(0);
    expect((await listSaves(db)).map((m) => m.slot)).toEqual(['slot2']);
  });

  it('save bị sửa trong DB bị phát hiện khi đọc', async () => {
    const db = freshDb();
    const host = SimHost.createNew({ seed: 'tamper', origin: { kind: 'rogue' } });
    await writeSave(db, 'slot1', host.toSave('x'), 'A', 0);
    const row = (await db.saves.get('slot1'))!;
    await db.saves.put({ ...row, head: { ...row.head, snapshot: row.head.snapshot.replace('"day":0', '"day":5') } });
    await expect(readSave(db, 'slot1')).rejects.toThrow(/checksum/);
    await db.eventChunks.where('slot').equals('slot1').delete();
    await expect(readSave(db, 'slot1')).rejects.toThrow(/thiếu dữ liệu/);
  });
});
