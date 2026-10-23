/** Công thức tu luyện (docs/09 mục 2). Áp dụng như nhau cho NPC và người chơi. */
import type { GameData } from '@tmtg/game-data';
import { BP_ONE, clamp, mulBp } from '../core/math.ts';
import { stageThresholdFx } from './realm.ts';
import { REALMS, STAGES, type Cultivator, type Location, type Realm, type Stage } from '../types.ts';

/** Tu vi (Fx) nhận được trong một ngày luyện công. Mỗi hệ số bị kẹp; nhân theo thứ tự cố định. */
export function dailyGainFx(data: GameData, c: Cultivator, location: Location, seclusion: boolean): number {
  const cfg = data.balance.cultivation;
  const technique = c.techniqueId ? data.techniques[c.techniqueId] : undefined;
  const techniqueBp = technique ? technique.speedBp : cfg.noTechniqueSpeedBp;
  const stateBp = clamp(BP_ONE - c.injury * cfg.injuryPenaltyBpPerPoint, cfg.stateMinBp, BP_ONE)
    + (seclusion ? cfg.seclusionBonusBp : 0);
  let gain = cfg.baseGainFx;
  gain = mulBp(gain, clamp(c.spiritRootBp, ...cfg.spiritRootClampBp));
  gain = mulBp(gain, clamp(techniqueBp, ...cfg.techniqueClampBp));
  gain = mulBp(gain, clamp(location.spiritualEnergyBp, ...cfg.energyClampBp));
  gain = mulBp(gain, stateBp);
  return gain;
}

/** Đã viên mãn và đầy tu vi: không tu thêm được, phải đột phá (hoặc đã chạm trần Kim Đan). */
export function isProgressCapped(data: GameData, c: Cultivator): boolean {
  return c.stage === 'perfect' && c.progress >= stageThresholdFx(data, c.realm);
}

export function nextStage(stage: Stage): Stage | null {
  return STAGES[STAGES.indexOf(stage) + 1] ?? null;
}

export function nextRealm(realm: Realm): Realm | null {
  return REALMS[REALMS.indexOf(realm) + 1] ?? null;
}

/**
 * Cộng tu vi: tự lên tầng nhỏ khi đủ ngưỡng (phần dư chuyển sang tầng mới), kẹp ở tầng viên mãn.
 * Trả số tu vi thực nhận và danh sách tầng vừa đạt.
 */
export function addProgress(data: GameData, c: Cultivator, gainFx: number): { gained: number; reached: Stage[] } {
  const threshold = stageThresholdFx(data, c.realm);
  const before = c.progress;
  const reached: Stage[] = [];
  let gained = 0;
  let pending = gainFx;
  let progress = before;
  while (pending > 0) {
    if (c.stage === 'perfect') {
      const room = threshold - progress;
      const take = Math.min(room, pending);
      progress += take;
      gained += take;
      break;
    }
    const room = threshold - progress;
    if (pending < room) {
      progress += pending;
      gained += pending;
      break;
    }
    pending -= room;
    gained += room;
    progress = 0;
    c.stage = nextStage(c.stage)!;
    reached.push(c.stage);
  }
  c.progress = progress;
  return { gained, reached };
}

/** Thứ hạng tu vi để so sánh (cảnh giới, tầng, tiến độ). */
export function cultivationRank(c: Cultivator): [number, number, number] {
  return [REALMS.indexOf(c.realm), STAGES.indexOf(c.stage), c.progress];
}
