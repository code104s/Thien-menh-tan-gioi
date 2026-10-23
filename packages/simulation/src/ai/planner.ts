/**
 * Bước 6: NPC Utility AI (docs/09 mục 7).
 * - Chỉ lập kế hoạch khi rảnh (không có action đang chạy) và đến lượt đánh giá lại.
 * - Mỗi mục tiêu khả thi có điểm nguyên; chọn cao nhất, hòa → thứ tự GOAL_TYPES → ID mục tiêu.
 * - Hysteresis: chỉ bỏ kế hoạch dở dang khi hết cam kết VÀ mục tiêu mới hơn margin điểm.
 * - Bước không thực hiện được → bỏ kế hoạch, thử lại ngày hôm sau (không lặp trong cùng tick).
 */
import type { SimContext } from '../core/context.ts';
import { DAYS_PER_MONTH } from '../core/calendar.ts';
import { compareIds, sortedValues } from '../core/ids.ts';
import { divCeil } from '../core/math.ts';
import { getStream } from '../core/rng.ts';
import { runningActionOf, startAction } from '../core/scheduler.ts';
import { breakthroughBlocker, breakthroughCost } from '../rules/breakthrough.ts';
import { isProgressCapped } from '../rules/cultivation.ts';
import { joinBlocker } from '../actions/faction.ts';
import { hopDistances, shortestPath } from '../world/graph.ts';
import { livingMembersOf } from '../world/selectors.ts';
import { unresolvedRecords } from '../systems/causality.ts';
import {
  GOAL_TYPES, type Cultivator, type EntityId, type GoalType, type PlannedStep, type WorldEvent, type WorldState,
} from '../types.ts';

export interface GoalOption {
  goal: GoalType;
  score: number;
  targetId: EntityId;
  steps: PlannedStep[];
}

export function processNpcPlanning(state: WorldState, ctx: SimContext): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (const c of sortedValues(state.characters)) {
    if (!c.alive || c.isPlayer) continue;
    if (!c.needsReview && state.day < c.nextReviewDay) continue;
    if (runningActionOf(state, c.id)) continue;
    events.push(...planAndAct(state, ctx, c));
  }
  return events;
}

function planAndAct(state: WorldState, ctx: SimContext, c: Cultivator): WorldEvent[] {
  const ai = ctx.data.balance.ai;
  const best = chooseGoal(evaluateGoals(state, ctx, c));
  const plan = c.plan;
  const keepCurrent = plan !== null && plan.steps.length > 0
    && !(best && state.day >= plan.committedUntil && best.score > plan.score + ai.switchMargin);
  if (!keepCurrent) {
    c.plan = best
      ? { goal: best.goal, score: best.score, committedUntil: state.day + ai.commitmentDays, steps: best.steps }
      : null;
  }
  c.needsReview = false;
  const step = c.plan?.steps[0];
  if (!c.plan || !step) {
    c.plan = null;
    c.nextReviewDay = state.day + ai.reviewIntervalDays;
    return [];
  }
  const result = startAction(state, {
    actorId: c.id,
    type: step.actionType,
    ...(step.targetId !== undefined ? { targetId: step.targetId } : {}),
    durationDays: step.durationDays,
    source: 'npc',
  }, ctx);
  if (!result.ok) {
    c.plan = null;
    c.nextReviewDay = state.day + 1;
    return [];
  }
  const remaining = c.plan.steps.slice(1);
  c.plan = remaining.length > 0 ? { ...c.plan, steps: remaining } : null;
  c.nextReviewDay = state.day + ai.reviewIntervalDays;
  return result.events;
}

export function chooseGoal(options: readonly GoalOption[]): GoalOption | null {
  let best: GoalOption | null = null;
  for (const option of options) {
    if (option.score <= 0) continue;
    if (!best
      || option.score > best.score
      || (option.score === best.score && (GOAL_TYPES.indexOf(option.goal) < GOAL_TYPES.indexOf(best.goal)
        || (option.goal === best.goal && compareIds(option.targetId, best.targetId) < 0)))) {
      best = option;
    }
  }
  return best;
}

/** Liệt kê mục tiêu khả thi kèm điểm và kế hoạch. Tiêu thụ RNG theo thứ tự cố định. */
export function evaluateGoals(state: WorldState, ctx: SimContext, c: Cultivator): GoalOption[] {
  const { ai, economy } = ctx.data.balance;
  const s = ai.scores;
  const rng = getStream(state.rng, state.seed, `plan:${c.id}`);
  const jitter = () => rng.nextInt(ai.jitter * 2 + 1) - ai.jitter;
  const technique = c.techniqueId ? ctx.data.techniques[c.techniqueId] : undefined;
  const monthlyCost = technique?.stonesPerMonth ?? 0;
  const capped = isProgressCapped(ctx.data, c);
  const affordableMonths = monthlyCost === 0
    ? ai.planCultivateMonths
    : Math.min(ai.planCultivateMonths, Math.floor(c.spiritStones / monthlyCost));
  const cultivateStep: PlannedStep = { actionType: 'cultivate', durationDays: affordableMonths * DAYS_PER_MONTH };
  const here = state.locations[c.locationId]!;
  const options: GoalOption[] = [];

  // Đột phá.
  let stonesNeeded = monthlyCost * ai.planCultivateMonths;
  if (breakthroughBlocker(ctx.data, c, state.day) === null) {
    const cost = breakthroughCost(ctx.data, c);
    if (c.spiritStones >= cost) {
      options.push({
        goal: 'breakthrough',
        score: s.breakthrough + (c.personality.riskTolerance - 50) * s.breakthroughRiskWeight + jitter(),
        targetId: c.id,
        steps: [{ actionType: 'breakthrough', durationDays: ctx.data.balance.breakthrough.durationDays }],
      });
    } else {
      stonesNeeded = Math.max(stonesNeeded, cost);
    }
  }

  // Dưỡng thương.
  if (c.injury >= s.healMinInjury && c.spiritStones >= economy.healStonesPerMonth) {
    const months = Math.max(1, Math.min(
      divCeil(c.injury, economy.healInjuryRecovery),
      Math.floor(c.spiritStones / economy.healStonesPerMonth),
      ctx.data.balance.actions.healDays[1] / DAYS_PER_MONTH,
    ));
    options.push({
      goal: 'heal',
      score: c.injury * s.healPerInjury + jitter(),
      targetId: c.id,
      steps: [{ actionType: 'heal', durationDays: months * DAYS_PER_MONTH }],
    });
  }

  // Thu thập tài nguyên: tại chỗ, hoặc nơi gần nhất còn tài nguyên trong bán kính.
  const gatherSpot = nearest(state, c.locationId, ai.seekRadiusHops, (id) => state.locations[id]!.resourceStock > 0,
    (id) => state.locations[id]!.resourceStock);
  if (gatherSpot) {
    const poor = c.spiritStones < stonesNeeded;
    options.push({
      goal: 'gather',
      score: (poor ? s.gatherPoor : s.gatherComfortable) + c.personality.greed * s.gatherGreedWeight + jitter(),
      targetId: gatherSpot,
      steps: [...travelSteps(state, c.locationId, gatherSpot), { actionType: 'gather', durationDays: ctx.data.balance.actions.gatherDays }],
    });
  }

  // Tu luyện tại chỗ.
  if (!capped && affordableMonths > 0) {
    options.push({
      goal: 'cultivate',
      score: s.cultivate + c.personality.ambition * s.cultivateAmbitionWeight + jitter(),
      targetId: c.locationId,
      steps: [cultivateStep],
    });
  }

  // Tìm nơi linh khí cao hơn để tu luyện.
  if (!capped && affordableMonths > 0) {
    const spot = nearest(state, c.locationId, ai.seekRadiusHops,
      (id) => state.locations[id]!.spiritualEnergyBp - here.spiritualEnergyBp >= ai.seekMinEnergyGainBp,
      (id) => state.locations[id]!.spiritualEnergyBp);
    if (spot) {
      const gain = state.locations[spot]!.spiritualEnergyBp - here.spiritualEnergyBp;
      const loyaltyPenalty = c.factionId ? c.personality.loyalty * s.seekLoyaltyWeight : 0;
      options.push({
        goal: 'seek_energy',
        score: Math.floor(gain / s.seekEnergyDivisor) + c.personality.ambition - loyaltyPenalty + jitter(),
        targetId: spot,
        steps: [...travelSteps(state, c.locationId, spot), cultivateStep],
      });
    }
  }
  // Làm nhiệm vụ tông môn: về trụ sở (tối đa bán kính) rồi nhận nhiệm vụ.
  const faction = c.factionId ? state.factions[c.factionId] : undefined;
  if (faction && !faction.dissolved && faction.treasury > 0) {
    const travel = travelSteps(state, c.locationId, faction.seatLocationId).slice(0, ai.seekRadiusHops);
    const arrives = travel.length === 0 || travel.at(-1)!.targetId === faction.seatLocationId;
    options.push({
      goal: 'duty',
      score: s.duty + c.personality.loyalty * s.dutyLoyaltyWeight - (c.spiritStones < stonesNeeded ? 0 : s.duty / 2) + jitter(),
      targetId: faction.id,
      steps: arrives ? [...travel, { actionType: 'duty', durationDays: ctx.data.balance.actions.dutyDays }] : travel,
    });
  }

  // Tán tu trung thành tìm tông môn để bái sư: trụ sở gần nhất còn nhận người.
  if (!c.factionId && c.personality.loyalty >= s.joinMinLoyalty) {
    const dist = hopDistances(state.locations, c.locationId);
    const target = sortedValues(state.factions)
      .filter((f) => !f.dissolved && (dist.get(f.seatLocationId) ?? Infinity) <= ai.seekRadiusHops)
      .filter((f) => joinBlocker(state, ctx, { ...c, locationId: f.seatLocationId }, f) === null)
      .sort((a, b) => dist.get(a.seatLocationId)! - dist.get(b.seatLocationId)!
        || livingMembersOf(state, a.id).length - livingMembersOf(state, b.id).length || compareIds(a.id, b.id))[0];
    if (target) {
      options.push({
        goal: 'join_faction',
        score: s.joinFaction + c.personality.loyalty * s.joinLoyaltyWeight + jitter(),
        targetId: target.id,
        steps: [...travelSteps(state, c.locationId, target.seatLocationId),
          { actionType: 'join_faction', targetId: target.id, durationDays: ctx.data.balance.actions.joinDays }],
      });
    }
  }
  // Đối đầu kẻ thù đang ở cùng địa điểm khi oán đủ sâu.
  const grudges = unresolvedRecords(state, c.id, 'grudge')
    .filter((r) => r.intensity >= s.confrontMinIntensity && state.characters[r.towardId]?.alive
      && state.characters[r.towardId]!.locationId === c.locationId);
  const fiercest = grudges.sort((a, b) => b.intensity - a.intensity || compareIds(a.towardId, b.towardId))[0];
  if (fiercest) {
    options.push({
      goal: 'confront',
      score: Math.floor(fiercest.intensity * c.personality.riskTolerance / s.confrontRiskDivisor) + jitter(),
      targetId: fiercest.towardId,
      steps: [{ actionType: 'confront', targetId: fiercest.towardId, durationDays: 1 }],
    });
  }
  return options;
}

/**
 * Địa điểm thỏa `accept` trong bán kính `radius` cạnh: ít cạnh nhất, rồi `preference` cao nhất, rồi ID.
 */
function nearest(
  state: WorldState,
  from: EntityId,
  radius: number,
  accept: (id: EntityId) => boolean,
  preference: (id: EntityId) => number,
): EntityId | null {
  const dist = hopDistances(state.locations, from);
  let best: EntityId | null = null;
  for (const [id, hops] of dist) {
    if (hops > radius || !accept(id)) continue;
    if (best === null) { best = id; continue; }
    const bestHops = dist.get(best)!;
    if (hops < bestHops
      || (hops === bestHops && (preference(id) > preference(best)
        || (preference(id) === preference(best) && compareIds(id, best) < 0)))) {
      best = id;
    }
  }
  return best;
}

function travelSteps(state: WorldState, from: EntityId, to: EntityId): PlannedStep[] {
  if (from === to) return [];
  const path = shortestPath(state.locations, from, to) ?? [];
  const steps: PlannedStep[] = [];
  for (let i = 1; i < path.length; i++) {
    const edge = state.locations[path[i - 1]!]!.edges.find((e) => e.to === path[i])!;
    steps.push({ actionType: 'travel', targetId: path[i]!, durationDays: edge.travelDays });
  }
  return steps;
}
