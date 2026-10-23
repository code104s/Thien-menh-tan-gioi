import { gameData } from '@tmtg/game-data';
import { describe, expect, it } from 'vitest';
import { chooseGoal, evaluateGoals, type GoalOption } from '../src/ai/planner.ts';
import { assertInvariants } from '../src/core/invariants.ts';
import { run } from '../src/core/runner.ts';
import { stageThresholdFx } from '../src/rules/realm.ts';
import { generateWorld } from '../src/worldgen/generate.ts';
import type { NpcPlan, WorldState } from '../src/types.ts';
import { ctx, frozenWorld, setStones } from './helpers.ts';

const NPC = 'chr_0005';
const goals = (s: WorldState) => evaluateGoals(s, ctx, s.characters[NPC]!);
const best = (s: WorldState) => chooseGoal(goals(s));

describe('chooseGoal', () => {
  const opt = (goal: GoalOption['goal'], score: number, targetId = 'x'): GoalOption => ({ goal, score, targetId, steps: [] });
  it('điểm cao nhất; hòa → thứ tự GOAL_TYPES → ID; bỏ điểm ≤ 0', () => {
    expect(chooseGoal([opt('cultivate', 500), opt('gather', 600)])!.goal).toBe('gather');
    expect(chooseGoal([opt('cultivate', 500), opt('heal', 500)])!.goal).toBe('heal');
    expect(chooseGoal([opt('gather', 500, 'loc_009'), opt('gather', 500, 'loc_002')])!.targetId).toBe('loc_002');
    expect(chooseGoal([opt('gather', 0), opt('cultivate', -5)])).toBeNull();
  });
});

describe('đánh giá mục tiêu', () => {
  it('bị thương nặng và có tiền → dưỡng thương', () => {
    const s = frozenWorld();
    setStones(s, NPC, 200);
    s.characters[NPC]!.injury = 90;
    expect(best(s)!.goal).toBe('heal');
  });

  it('viên mãn, đủ điều kiện, đủ tiền → đột phá; thiếu tiền → thu thập (nghèo)', () => {
    const s = frozenWorld();
    const c = s.characters[NPC]!;
    Object.assign(c, { stage: 'perfect', progress: stageThresholdFx(gameData, c.realm), foundation: 60, injury: 0 });
    setStones(s, NPC, 500);
    expect(best(s)!.goal).toBe('breakthrough');
    setStones(s, NPC, 10);
    const gather = goals(s).find((g) => g.goal === 'gather')!;
    expect(gather.score).toBeGreaterThanOrEqual(gameData.balance.ai.scores.gatherPoor - gameData.balance.ai.jitter);
    expect(goals(s).some((g) => g.goal === 'breakthrough' || g.goal === 'cultivate')).toBe(false);
  });

  it('chỗ hiện tại cạn tài nguyên → kế hoạch đi tới nơi còn tài nguyên rồi thu thập (≤ 3 bước)', () => {
    const s = frozenWorld();
    const c = s.characters[NPC]!;
    s.locations[c.locationId]!.resourceStock = 0;
    const gather = goals(s).find((g) => g.goal === 'gather');
    if (!gather) return; // không có nơi nào trong bán kính — hợp lệ
    expect(gather.steps.length).toBeLessThanOrEqual(3);
    expect(gather.steps.at(-1)!.actionType).toBe('gather');
    expect(gather.steps.slice(0, -1).every((st) => st.actionType === 'travel')).toBe(true);
  });

  it('cùng state cho cùng đánh giá (RNG theo luồng plan:<id>)', () => {
    const a = frozenWorld();
    const b = frozenWorld();
    expect(goals(a)).toEqual(goals(b));
  });
});

describe('hysteresis', () => {
  it('giữ kế hoạch dở dang khi chưa hết cam kết, đổi khi hết cam kết và mục tiêu mới vượt margin', () => {
    const s = frozenWorld();
    const c = s.characters[NPC]!;
    const here = s.locations[c.locationId]!;
    const neighbor = here.edges[0]!;
    const stalePlan: NpcPlan = {
      goal: 'seek_energy', score: 1, committedUntil: 100,
      steps: [{ actionType: 'travel', targetId: neighbor.to, durationDays: neighbor.travelDays }],
    };
    c.plan = structuredCloneish(stalePlan);
    c.needsReview = true;
    run(s, ctx, { untilDay: 1 });
    expect(s.actions[Object.keys(s.actions)[0]!]!.type).toBe('travel');

    const t = frozenWorld();
    const d = t.characters[NPC]!;
    d.plan = { ...structuredCloneish(stalePlan), committedUntil: 0 };
    d.needsReview = true;
    run(t, ctx, { untilDay: 1 });
    expect(Object.values(t.actions)[0]!.type).not.toBe('travel');
  });
});

describe('NPC tự vận hành 30 năm', () => {
  it.each(['ai-1', 'ai-2', 'ai-3'])('%s: bất biến giữ, không đổi mục tiêu quá 12 lần/năm, có hoạt động', (seed) => {
    const { state } = generateWorld({ seed, origin: { kind: 'rogue' } });
    const switches = new Map<string, number>();
    let previous = new Map(Object.values(state.characters).map((c) => [c.id, c.plan]));
    const actionTypes = new Set<string>();
    for (let day = 1; day <= 30 * 360; day++) {
      run(state, ctx, {
        untilDay: day,
        onEvents: (events) => {
          for (const e of events) if (e.type === 'action_completed') actionTypes.add(String(e.payload['actionType']));
        },
      });
      for (const c of Object.values(state.characters)) {
        const prev = previous.get(c.id);
        if (prev && prev.steps.length > 0 && c.plan && c.plan !== prev && c.plan.goal !== prev.goal) {
          const key = `${c.id}@${Math.floor((day - 1) / 360)}`;
          switches.set(key, (switches.get(key) ?? 0) + 1);
        }
      }
      previous = new Map(Object.values(state.characters).map((c) => [c.id, c.plan]));
      if (day % 360 === 0) assertInvariants(state);
    }
    for (const [key, count] of switches) expect(count, key).toBeLessThanOrEqual(12);
    expect([...actionTypes]).toEqual(expect.arrayContaining(['cultivate', 'gather']));
  });
});

function structuredCloneish<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
