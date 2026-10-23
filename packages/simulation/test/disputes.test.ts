import { gameData } from '@tmtg/game-data';
import { describe, expect, it } from 'vitest';
import { assertInvariants } from '../src/core/invariants.ts';
import { factionId } from '../src/core/ids.ts';
import { startAction } from '../src/core/scheduler.ts';
import { tick } from '../src/core/tick.ts';
import { decideStrategy, findDisputeTarget, processQuarterly } from '../src/systems/factions.ts';
import { livingMembersOf, territoryOf } from '../src/world/selectors.ts';
import { PLAYER_ID } from '../src/worldgen/generate.ts';
import type { WorldEvent, WorldState } from '../src/types.ts';
import { ctx, frozenWorld, setStones } from './helpers.ts';

const A = factionId(1);
const B = factionId(2);
const C = factionId(3);

/** Thế giới ở ranh giới quý, A nghèo và kình địch với B. */
function rivals(seed = 'dsp', origin: Parameters<typeof frozenWorld>[1] = { kind: 'rogue' }): WorldState {
  const s = frozenWorld(seed, origin);
  s.day = 90;
  s.factions[A]!.relations[B] = -60;
  s.factions[B]!.relations[A] = -60;
  s.initialStoneSupply -= s.factions[A]!.treasury;
  s.factions[A]!.treasury = 0;
  return s;
}

/** Cân bằng sức mạnh: mọi thành viên A và B cùng một cảnh giới/tầng. */
function equalize(s: WorldState) {
  for (const id of [A, B]) {
    for (const c of livingMembersOf(s, id)) Object.assign(c, { realm: 'qi', stage: 'late', progress: 0 });
  }
  const a = livingMembersOf(s, A);
  const b = livingMembersOf(s, B);
  while (a.length > b.length) a.pop()!.factionId = null as never;
  while (b.length > a.length) b.pop()!.factionId = null as never;
  for (const c of Object.values(s.characters)) if (c.factionId === null) c.factionRank = null;
}

const types = (events: WorldEvent[]) => events.map((e) => e.type);

describe('chiến lược quý', () => {
  it('thứ tự ưu tiên: phòng thủ → bành trướng → chiêu mộ → củng cố', () => {
    const s = rivals();
    equalize(s);
    expect(decideStrategy(s, ctx, s.factions[A]!)).toBe('expand');
    s.factions[A]!.relations[B] = 0;
    expect(findDisputeTarget(s, ctx, s.factions[A]!)).toBeNull();
    const members = livingMembersOf(s, A);
    expect(decideStrategy(s, ctx, s.factions[A]!)).toBe(members.length < 5 ? 'recruit' : 'consolidate');
    // Yếu hơn 70% đối thủ kề bên → phòng thủ.
    for (const c of livingMembersOf(s, B)) Object.assign(c, { realm: 'golden_core', stage: 'early', progress: 0 });
    expect(decideStrategy(s, ctx, s.factions[A]!)).toBe('defend');
  });

  it('mục tiêu tranh chấp tôn trọng quan hệ, thời gian chờ và tỉ lệ sức mạnh', () => {
    const s = rivals();
    equalize(s);
    const f = s.factions[A]!;
    const target = findDisputeTarget(s, ctx, f)!;
    expect(s.locations[target.locationId]!.ownerFactionId).toBe(B);
    f.disputeCooldowns[B] = s.day + 1;
    expect(findDisputeTarget(s, ctx, f)?.id).not.toBe(target.id);
    f.disputeCooldowns[B] = 0;
    for (const c of livingMembersOf(s, B)) Object.assign(c, { realm: 'foundation', stage: 'perfect', progress: 0 });
    expect(findDisputeTarget(s, ctx, f)?.id).not.toBe(target.id);
  });
});

describe('quan hệ tông môn theo quý (regression)', () => {
  it('không trôi về 0 khi thành viên hai bên chưa có quan hệ với nhau', () => {
    const s = rivals();
    for (let q = 1; q <= 8; q++) {
      s.day = q * 90;
      processQuarterly(s, ctx);
    }
    // Trước khi sửa, −60 bị kéo dần về 0 (10%/quý) và tranh chấp không thể khởi phát.
    expect(s.factions[C]!.relations[A]).toBe(s.factions[A]!.relations[C]);
    expect(s.factions[B]!.relations[A]).toBeLessThanOrEqual(-60);
  });

  it('dịch về trung bình quan hệ thực có giữa thành viên', () => {
    const s = rivals();
    const a = livingMembersOf(s, A)[0]!;
    const b = livingMembersOf(s, B)[0]!;
    a.relations[b.id] = 40;
    // Chặn khởi tranh chấp để chỉ đo phần trôi quan hệ.
    s.factions[A]!.disputeCooldowns[B] = 99_999;
    s.factions[B]!.disputeCooldowns[A] = 99_999;
    processQuarterly(s, ctx);
    expect(s.factions[A]!.relations[B]).toBe(-60 + 10);
  });
});

describe('tranh chấp linh mạch', () => {
  it('chênh lệch ≥ 2×: bên phòng thủ nhượng bộ, chuyển quyền nguyên tử, ghi oán và thời gian chờ', () => {
    const s = rivals();
    for (const c of livingMembersOf(s, B)) if (c.factionRank !== 'leader') { c.factionId = null; c.factionRank = null; }
    Object.assign(s.characters[s.factions[B]!.leaderId!]!, { realm: 'qi', stage: 'early', progress: 0 });
    const target = findDisputeTarget(s, ctx, s.factions[A]!)!;
    s.factions[A]!.strategy = 'expand';
    const events = processQuarterly(s, ctx);
    expect(types(events)).toEqual(expect.arrayContaining(['dispute_started', 'dispute_ended', 'territory_transferred']));
    expect(events.find((e) => e.type === 'dispute_ended')!.payload['outcome']).toBe('conceded');
    expect(s.locations[target.locationId]!.ownerFactionId).toBe(A);
    expect(s.disputes).toEqual({});
    expect(s.factions[A]!.disputeCooldowns[B]).toBe(90 + gameData.balance.dispute.cooldownDays);
    const grudge = Object.values(s.causalRecords).find((r) => r.type === 'grudge')!;
    expect(grudge).toMatchObject({ holderId: B, towardId: A });
    expect(events.find((e) => e.id === grudge.sourceEventId)!.type).toBe('dispute_ended');
    assertInvariants(s);
  });

  it('cân sức: giao tranh theo quý, tối đa 3 vòng, có thương tích, kết thúc gỡ tranh chấp', () => {
    const s = rivals('dsp-even');
    equalize(s);
    s.factions[A]!.strategy = 'expand';
    const all: WorldEvent[] = [...processQuarterly(s, ctx)];
    expect(Object.keys(s.disputes)).toHaveLength(1);
    const injuries = () => livingMembersOf(s, A).reduce((sum, c) => sum + c.injury, 0);
    const before = injuries();
    for (let q = 2; q <= 5 && Object.keys(s.disputes).length > 0; q++) {
      s.day = q * 90;
      all.push(...processQuarterly(s, ctx));
      assertInvariants(s);
    }
    const rounds = all.filter((e) => e.type === 'dispute_skirmish');
    expect(rounds.length).toBeGreaterThanOrEqual(1);
    expect(rounds.length).toBeLessThanOrEqual(3);
    expect(injuries()).toBeGreaterThan(before);
    expect(all.filter((e) => e.type === 'dispute_ended')).toHaveLength(1);
    expect(s.disputes).toEqual({});
    // Không lúc nào có hai chủ: mỗi linh mạch thuộc đúng một địa điểm, mỗi địa điểm một chủ.
    for (const v of Object.values(s.spiritVeins)) expect(s.locations[v.locationId]!.veinId).toBe(v.id);
  });

  it('linh mạch vô chủ kề lãnh địa được chiếm ngay, không cần tranh chấp', () => {
    const s = rivals();
    const target = findDisputeTarget(s, ctx, s.factions[A]!)!;
    s.locations[target.locationId]!.ownerFactionId = null;
    s.factions[A]!.strategy = 'expand';
    const events = processQuarterly(s, ctx);
    expect(types(events)).toContain('territory_transferred');
    expect(types(events)).not.toContain('dispute_started');
    expect(territoryOf(s, A).map((l) => l.id)).toContain(target.locationId);
  });
});

describe('người chơi trong tranh chấp', () => {
  it('thành viên không bế quan nhận lựa chọn tham chiến; đang bế quan thì mặc định vắng mặt', () => {
    const s = rivals('dsp-p', { kind: 'join_faction', factionIndex: 1 });
    equalize(s);
    s.characters[PLAYER_ID]!.factionId = B;
    s.characters[PLAYER_ID]!.factionRank = 'disciple';
    s.factions[A]!.strategy = 'expand';
    const events = processQuarterly(s, ctx);
    const started = events.find((e) => e.type === 'dispute_started')!;
    expect(started.severity).toBe('critical');
    expect(s.pendingChoices).toHaveLength(1);
    expect(s.pendingChoices[0]).toMatchObject({ kind: 'dispute_participation', eventId: started.id, defaultOptionId: 'avoid' });

    const t = rivals('dsp-p', { kind: 'join_faction', factionIndex: 1 });
    equalize(t);
    t.characters[PLAYER_ID]!.factionId = B;
    t.characters[PLAYER_ID]!.factionRank = 'disciple';
    setStones(t, PLAYER_ID, 5000);
    const r = startAction(t, { actorId: PLAYER_ID, type: 'seclusion', durationDays: 720, source: 'player' }, ctx);
    expect(r.ok).toBe(true);
    t.factions[A]!.strategy = 'expand';
    processQuarterly(t, ctx);
    expect(t.pendingChoices).toEqual([]);
    expect(Object.values(t.disputes)[0]!.playerStance).toBe('avoid');
  });

  it('tick ở ranh giới quý chạy bước 5', () => {
    const s = rivals();
    s.day = 89;
    s.factions[A]!.strategy = 'expand';
    equalize(s);
    tick(s, [], ctx);
    expect(Object.keys(s.disputes).length + s.counters.dispute).toBe(0);
    const r = tick(s, [], ctx);
    expect(r.day).toBe(90);
    expect(s.counters.dispute).toBe(1);
  });
});
