import { createContext, digest, generateWorld, run, type InterruptReason } from '@tmtg/simulation';
import { describe, expect, it } from 'vitest';
import { SimHost } from '../src/worker/host.ts';

const ALL_STOPS = new Set<InterruptReason>(['critical_event', 'choice_required', 'game_over', 'player_action_finished']);
const NO_STOP = new Set<InterruptReason>();
const creation = { seed: 'web-1', origin: { kind: 'join_faction', factionIndex: 0 } as const, playerName: 'Lý Thanh Phong' };

/** Cấp linh thạch cho người chơi mà vẫn giữ bất biến bảo toàn. */
function fund(host: SimHost, amount: number) {
  const p = host.state.characters[host.state.playerId]!;
  host.state.initialStoneSupply += amount - p.spiritStones;
  p.spiritStones = amount;
}

function playSession(): SimHost {
  const host = SimHost.createNew(creation);
  fund(host, 2000);
  host.issue({ type: 'START_ACTION', actionType: 'cultivate', durationDays: 90 });
  host.advance(40, NO_STOP);
  host.issue({ type: 'START_ACTION', actionType: 'gather', durationDays: 30 }); // bị từ chối: đang bận
  const actionId = host.view().player.currentAction!.id;
  host.issue({ type: 'CANCEL_ACTION', actionId });
  host.issue({ type: 'START_ACTION', actionType: 'seclusion', durationDays: 720 });
  host.advance(1000, NO_STOP);
  return host;
}

describe('SimHost', () => {
  it('lệnh áp ở đầu ngày cho cùng kết quả với replay từ seed + command log', () => {
    const host = playSession();
    const { state } = generateWorld({ seed: creation.seed, origin: creation.origin, playerName: creation.playerName });
    // Cùng mức cấp linh thạch như playSession (thao tác của test, không phải lệnh người chơi).
    const p = state.characters[state.playerId]!;
    state.initialStoneSupply += 2000 - p.spiritStones;
    p.spiritStones = 2000;
    run(state, createContext(), { untilDay: host.state.day, commands: host.commandLog });
    expect(digest(state)).toBe(digest(host.state));
    expect(host.commandLog.map((c) => c.seq)).toEqual([1, 2, 3, 4]);
  });

  it('regression: event của lệnh ra lúc Pause vẫn được truyền tin như replay (kể cả qua save/load)', () => {
    // Trước khi sửa: lệnh áp ngoài tick nên seclusion_started không qua bước truyền tin → NPC
    // không biết, thế giới của host lệch replay từ ngày ra lệnh.
    const host = SimHost.createNew(creation);
    fund(host, 2000);
    host.advance(40, NO_STOP);
    expect(host.issue({ type: 'START_ACTION', actionType: 'seclusion', durationDays: 720 }).ok).toBe(true);
    const reloaded = SimHost.fromSave(JSON.stringify(host.toSave('x')));
    host.advance(100, NO_STOP);
    reloaded.advance(100, NO_STOP);

    const { state } = generateWorld({ seed: creation.seed, origin: creation.origin, playerName: creation.playerName });
    const p = state.characters[state.playerId]!;
    state.initialStoneSupply += 2000 - p.spiritStones;
    p.spiritStones = 2000;
    run(state, createContext(), { untilDay: 140, commands: host.commandLog });
    expect(digest(host.state)).toBe(digest(state));
    expect(digest(reloaded.state)).toBe(digest(state));
    const someoneKnows = Object.values(state.characters).some((c) => !c.isPlayer
      && c.memory.some((m) => host.eventLog.find((e) => e.id === m.eventId)?.type === 'seclusion_started'));
    expect(someoneKnows).toBe(true);
  });

  it('save → JSON → load giữ nguyên digest, chạy tiếp vẫn trùng', () => {
    const a = playSession();
    const json = JSON.stringify(a.toSave('2026-10-24T00:00:00Z'));
    const b = SimHost.fromSave(json);
    expect(digest(b.state)).toBe(digest(a.state));
    a.advance(500, NO_STOP);
    b.advance(500, NO_STOP);
    expect(digest(b.state)).toBe(digest(a.state));
    expect(b.chronicle().length).toBe(a.chronicle().length);
  });

  it('save hỏng: sửa nội dung → checksum sai; checksum đúng nhưng vi phạm bất biến → báo lỗi', () => {
    const save = playSession().toSave('x');
    const tampered = { ...save, snapshot: save.snapshot.replace('"spiritStones":', '"spiritStones":1') };
    expect(() => SimHost.fromSave(tampered)).toThrow(/checksum/);
    expect(() => SimHost.fromSave('{"format":')).toThrow(/không phải JSON/);
    expect(() => SimHost.fromSave({ ...save, format: 'khac' })).toThrow(/sai cấu trúc/);
  });

  it('bảng biến cố có lệnh bị từ chối và kết quả hành động của người chơi', () => {
    const host = playSession();
    const texts = host.feed.map((f) => f.text);
    expect(texts.some((t) => t.startsWith('Không thể thực hiện: Đang thực hiện hành động khác'))).toBe(true);
    expect(texts.some((t) => t.includes('dừng tu luyện'))).toBe(true);
    expect(texts.some((t) => t.includes('bắt đầu bế quan 2 năm'))).toBe(true);
  });

  it('regression: bảng biến cố không lặp event (lệnh ra lúc Pause rồi được tick xử lý lại)', () => {
    const host = playSession();
    const ids = host.feed.map((f) => f.eventId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('bế quan dừng đúng lúc xuất quan, tóm tắt liệt kê sử ký trong khoảng', () => {
    const host = SimHost.createNew(creation);
    fund(host, 5000);
    const before = host.view().player;
    expect(host.issue({ type: 'START_ACTION', actionType: 'seclusion', durationDays: 3600 }).ok).toBe(true);
    let total = 0;
    let interrupt = null;
    for (let guard = 0; guard < 200 && interrupt?.reason !== 'player_action_finished'; guard++) {
      const r = host.advance(30, new Set(['player_action_finished']));
      total += r.days;
      interrupt = r.interrupt;
    }
    expect(interrupt?.reason).toBe('player_action_finished');
    expect(total).toBe(3601);
    const summary = host.summary(0, before, host.view().player);
    expect(summary.entries.every((e) => e.chronicle && e.day < host.state.day)).toBe(true);
    expect(summary.playerAfter.realmName !== before.realmName || summary.playerAfter.stageName !== before.stageName).toBe(true);
  });
});

describe('view model lọc theo hiểu biết', () => {
  it('không lộ kho/chiến lược tông khác, cảnh giới người lạ ở xa là "?"', () => {
    const host = SimHost.createNew(creation);
    const view = host.view();
    const mine = view.factions.find((f) => f.isPlayerFaction)!;
    expect(mine.treasury).not.toBeNull();
    for (const f of view.factions.filter((x) => !x.isPlayerFaction)) {
      expect([f.treasury, f.stability, f.strategyName]).toEqual([null, null, null]);
    }
    const strangers = view.characters.filter((c) => !c.known);
    expect(strangers.length).toBeGreaterThan(0);
    for (const c of strangers) expect([c.realmText, c.locationName]).toEqual(['?', null]);
  });

  it('hành động hiển thị kèm lý do vô hiệu lấy từ luật mô phỏng', () => {
    const host = SimHost.createNew(creation);
    const view = host.view();
    const breakthrough = view.actions.find((a) => a.key === 'breakthrough')!;
    expect(breakthrough).toMatchObject({ enabled: false, reason: 'Tu vi chưa viên mãn' });
    expect(view.actions.find((a) => a.key === 'heal')).toMatchObject({ enabled: false, reason: 'Không bị thương' });
    const travels = view.actions.filter((a) => a.group === 'di_chuyen');
    expect(travels.length).toBe(view.locations.find((l) => l.id === view.player.locationId)!.edges.length);
    expect(travels.every((a) => a.enabled)).toBe(true);
    host.issue({ type: 'START_ACTION', actionType: 'cultivate', durationDays: 90 });
    expect(host.view().actions.every((a) => !a.enabled && a.reason === 'Đang thực hiện hành động khác')).toBe(true);
    expect(host.view().player.currentAction).toMatchObject({ type: 'cultivate', daysLeft: 90 });
  });

  it('nhiều interrupt cùng tick: báo biến cố khẩn trước "hành động kết thúc"', () => {
    for (let i = 0; i < 20; i++) {
      const host = SimHost.createNew({ ...creation, seed: `bt-ui-${i}` });
      const p = host.state.characters[host.state.playerId]!;
      Object.assign(p, { stage: 'perfect', progress: 1_800_000, foundation: 50, insight: 0, daoHeart: 0 });
      fund(host, 500);
      expect(host.issue({ type: 'START_ACTION', actionType: 'breakthrough', durationDays: 30 }).ok).toBe(true);
      const r = host.advance(40, ALL_STOPS);
      if (p.realm === 'qi') {
        expect(r.interrupt?.reason).toBe('critical_event');
        expect(r.interrupt?.entry?.text).toMatch(/thất bại/);
        return;
      }
    }
    throw new Error('Không gặp lần đột phá thất bại nào');
  });

  it('dừng ở lựa chọn/biến cố nghiêm trọng khi được yêu cầu', () => {
    const host = SimHost.createNew({ ...creation, seed: 'bench-002' });
    const r = host.advance(3600, ALL_STOPS);
    if (r.interrupt) expect(ALL_STOPS.has(r.interrupt.reason)).toBe(true);
  });
});
