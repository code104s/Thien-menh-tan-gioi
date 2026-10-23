/** Đột phá cảnh giới (docs/09 mục 3). NPC và người chơi dùng chung. */
import type { GameData } from '@tmtg/game-data';
import { DAYS_PER_YEAR } from '../core/calendar.ts';
import { createEvent } from '../core/events.ts';
import { clamp, divFloor, lerpTable } from '../core/math.ts';
import { getStream } from '../core/rng.ts';
import { applyInjury } from '../systems/lifecycle.ts';
import { leaveDaoMark } from '../systems/daomark.ts';
import { isProgressCapped, nextRealm } from './cultivation.ts';
import { baseLifespanDays } from './realm.ts';
import type { Cultivator, Day, Realm, WorldEvent, WorldState } from '../types.ts';

type TargetRealm = Exclude<Realm, 'qi'>;

export function breakthroughTarget(c: Cultivator): TargetRealm | null {
  return nextRealm(c.realm) as TargetRealm | null;
}

/** Lý do chưa thể đột phá (không xét linh thạch), hoặc null nếu đủ điều kiện. */
export function breakthroughBlocker(data: GameData, c: Cultivator, day: Day): string | null {
  const cfg = data.balance.breakthrough;
  const target = breakthroughTarget(c);
  if (!target) return 'Đã đạt cảnh giới cao nhất của phiên bản này';
  if (!isProgressCapped(data, c)) return 'Tu vi chưa viên mãn';
  if (c.injury > cfg.maxInjury) return 'Thương tích quá nặng để đột phá';
  if (day < c.breakthroughCooldownUntil) return `Kinh mạch chưa hồi phục (còn ${c.breakthroughCooldownUntil - day} ngày)`;
  if (c.foundation < cfg.minFoundation[target]) return 'Căn cơ chưa đủ vững';
  return null;
}

export function breakthroughCost(data: GameData, c: Cultivator): number {
  const target = breakthroughTarget(c);
  return target ? data.balance.breakthrough.costStones[target] : 0;
}

/** Phần trăm tuổi thọ đã dùng (0..100+). */
function lifeUsedPercent(c: Cultivator, day: Day): number {
  return c.lifespanDays > 0 ? divFloor((day - c.birthDay) * 100, c.lifespanDays) : 100;
}

export function breakthroughChanceBp(data: GameData, c: Cultivator, day: Day): number {
  const cfg = data.balance.breakthrough;
  const target = breakthroughTarget(c);
  if (!target) return 0;
  const technique = c.techniqueId ? data.techniques[c.techniqueId] : undefined;
  const chance = cfg.baseChanceBp[target]
    + (c.insight - 50) * cfg.insightBpPerPoint
    + (c.daoHeart - 50) * cfg.daoHeartBpPerPoint
    + (c.foundation - 50) * cfg.foundationBpPerPoint
    + (technique?.breakthroughModBp ?? 0)
    - c.injury * cfg.injuryBpPerPoint
    - lerpTable(data.curves.breakthroughAgePenaltyBp, lifeUsedPercent(c, day));
  return clamp(chance, ...cfg.chanceClampBp);
}

/** Tung đột phá trên luồng `breakthrough:<id>` và áp hậu quả. Gọi khi action đột phá hoàn tất. */
export function resolveBreakthrough(state: WorldState, data: GameData, c: Cultivator): WorldEvent[] {
  const target = breakthroughTarget(c);
  if (!target) return [];
  const cfg = data.balance.breakthrough;
  const rng = getStream(state.rng, state.seed, `breakthrough:${c.id}`);
  const chanceBp = breakthroughChanceBp(data, c, state.day);
  const fromRealm = c.realm;
  const factionIds = c.factionId ? [c.factionId] : [];

  if (rng.rollBp(chanceBp)) {
    c.realm = target;
    c.stage = 'early';
    c.progress = 0;
    c.lifespanDays = Math.max(c.lifespanDays, baseLifespanDays(data, target));
    const succeeded = createEvent(state, {
      type: 'breakthrough_succeeded',
      severity: c.isPlayer ? 'critical' : 'important',
      visibility: 'public',
      chronicle: true,
      actorId: c.id,
      locationId: c.locationId,
      factionIds,
      payload: { fromRealm, toRealm: target, chanceBp },
    });
    return [succeeded, ...(target === 'golden_core' ? leaveDaoMark(state, data, c, succeeded.id) : [])];
  }

  const roll = rng.nextInt(10_000);
  const f = cfg.failure;
  const [tierName, tier] = roll < f.minorBp ? ['minor', f.minor] as const
    : roll < f.minorBp + f.majorBp ? ['major', f.major] as const
      : ['catastrophic', f.catastrophic] as const;
  applyInjury(c, tier.injury, 'breakthrough');
  c.foundation = clamp(c.foundation - tier.foundationLoss, 0, 100);
  c.lifespanDays = Math.max(0, c.lifespanDays - tier.lifespanLossYears * DAYS_PER_YEAR);
  c.progress = Math.max(0, c.progress - divFloor(c.progress * tier.progressLossBp, 10_000));
  c.breakthroughCooldownUntil = state.day + cfg.cooldownDays;
  return [createEvent(state, {
    type: 'breakthrough_failed',
    severity: c.isPlayer ? 'critical' : 'info',
    visibility: 'faction',
    chronicle: tierName !== 'minor',
    actorId: c.id,
    locationId: c.locationId,
    factionIds,
    payload: { targetRealm: target, chanceBp, tier: tierName, injury: c.injury },
  })];
}
