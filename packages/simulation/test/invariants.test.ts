import { describe, expect, it } from 'vitest';
import { checkInvariants, type InvariantCode } from '../src/core/invariants.ts';
import { factionId } from '../src/core/ids.ts';
import { PLAYER_ID, generateWorld } from '../src/worldgen/generate.ts';
import type { ScheduledAction, WorldState } from '../src/types.ts';

const fresh = (): WorldState => generateWorld({ seed: 'inv', origin: { kind: 'join_faction', factionIndex: 0 } }).state;
const codes = (s: WorldState): InvariantCode[] => [...new Set(checkInvariants(s).map((v) => v.code))];
const npc = (s: WorldState) => s.characters['chr_0005']!;

function action(s: WorldState, overrides: Partial<ScheduledAction> = {}): ScheduledAction {
  s.counters.action++;
  return {
    id: `act_${String(s.counters.action).padStart(6, '0')}`,
    actorId: 'chr_0005',
    type: 'cultivate',
    locationId: npc(s).locationId,
    startDay: 0,
    dueDay: 30,
    priority: 0,
    seq: s.counters.action,
    status: 'running',
    reservedCosts: { spiritStones: 0 },
    cancellationPolicy: 'refund_prorated',
    source: 'npc',
    meta: { progressGained: 0 },
    ...overrides,
  };
}

describe('checkInvariants', () => {
  it('thế giới mới sinh không vi phạm', () => {
    expect(checkInvariants(fresh())).toEqual([]);
  });

  const cases: [string, InvariantCode, (s: WorldState) => void][] = [
    ['tham chiếu địa điểm hỏng', 'I1_REFERENCE', (s) => { npc(s).locationId = 'loc_999'; }],
    ['khóa và id lệch', 'I1_REFERENCE', (s) => { npc(s).id = 'chr_0999'; }],
    ['factionRank không đi kèm factionId', 'I1_REFERENCE', (s) => {
      const rogue = Object.values(s.characters).find((c) => c.factionId === null && !c.isPlayer)!;
      rogue.factionRank = 'disciple';
    }],
    ['số thực', 'I2_NUMBER', (s) => { npc(s).progress = 1.5; }],
    ['linh thạch âm', 'I2_NUMBER', (s) => { npc(s).spiritStones = -1; }],
    ['Stat ngoài khoảng', 'I2_NUMBER', (s) => { npc(s).injury = 101; }],
    ['hai action cùng lúc', 'I3_ACTIONS', (s) => {
      const a = action(s); const b = action(s);
      s.actions[a.id] = a; s.actions[b.id] = b;
    }],
    ['action của người chết', 'I3_ACTIONS', (s) => {
      const a = action(s);
      s.actions[a.id] = a;
      Object.assign(npc(s), { alive: false, deathDay: 0, deathCause: 'old_age' });
    }],
    ['action đã hoàn tất còn trong bảng', 'I3_ACTIONS', (s) => { const a = action(s, { status: 'completed' }); s.actions[a.id] = a; }],
    ['tông chủ không thuộc tông', 'I4_LEADER', (s) => { s.factions[factionId(1)]!.leaderId = s.factions[factionId(2)]!.leaderId; }],
    ['hai tông chủ', 'I4_LEADER', (s) => {
      const f = s.factions[factionId(1)]!;
      const member = Object.values(s.characters).find((c) => c.factionId === f.id && c.factionRank === 'elder')!;
      member.factionRank = 'leader';
    }],
    ['linh mạch lệch địa điểm', 'I5_VEIN', (s) => { Object.values(s.spiritVeins)[0]!.locationId = 'loc_001'; s.spiritVeins['vein_01']!.locationId = 'loc_014'; }],
    ['hai tranh chấp một linh mạch', 'I6_DISPUTE', (s) => {
      for (const id of ['dsp_0001', 'dsp_0002']) {
        s.disputes[id] = {
          id, veinId: 'vein_01', attackerId: factionId(1), defenderId: factionId(2), phase: 'tension',
          startDay: 0, skirmishCount: 0, attackerScore: 0, defenderScore: 0, causeEventId: 'evt_00000001', playerStance: null,
        };
      }
    }],
    ['cạnh một chiều', 'I7_GRAPH', (s) => { s.locations['loc_001']!.edges[0]!.travelDays += 1; }],
    ['đồ thị đứt', 'I7_GRAPH', (s) => { for (const l of Object.values(s.locations)) l.edges = []; }],
    ['linh thạch sinh từ hư không', 'I8_STONES', (s) => { npc(s).spiritStones += 1; }],
    ['tiến độ vượt ngưỡng', 'I9_REALM', (s) => { npc(s).stage = 'early'; npc(s).progress = 10_000_000; }],
    ['game over khi người chơi còn sống', 'I10_GAME_OVER', (s) => { s.gameOver = { day: 0, cause: 'injury', eventId: 'evt_00000001' }; }],
    ['eventSeq lệch bộ đếm', 'I11_COUNTERS', (s) => { s.eventSeq = 5; }],
  ];

  it.each(cases)('%s → %s', (_label, code, corrupt) => {
    const s = fresh();
    corrupt(s);
    expect(codes(s)).toContain(code);
  });

  it('người chơi chết kèm gameOver là hợp lệ', () => {
    const s = fresh();
    Object.assign(s.characters[PLAYER_ID]!, { alive: false, deathDay: 0, deathCause: 'injury' });
    s.gameOver = { day: 0, cause: 'injury', eventId: 'evt_00000001' };
    expect(codes(s)).not.toContain('I10_GAME_OVER');
  });
});
