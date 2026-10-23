/** Tra cứu cảnh giới/tầng từ game-data. */
import type { GameData } from '@tmtg/game-data';
import { FX_ONE } from '../core/math.ts';
import { DAYS_PER_YEAR } from '../core/calendar.ts';
import { STAGES, type Realm, type Stage } from '../types.ts';

function realmData(data: GameData, realm: Realm) {
  const r = data.realms.realms.find((x) => x.id === realm);
  if (!r) throw new Error(`Không có dữ liệu cảnh giới ${realm}`);
  return r;
}

/** Tu vi (Fx) cần để hoàn thành một tầng của cảnh giới. */
export function stageThresholdFx(data: GameData, realm: Realm): number {
  return realmData(data, realm).daysPerStage * FX_ONE;
}

export function baseLifespanDays(data: GameData, realm: Realm): number {
  return realmData(data, realm).lifespanYears * DAYS_PER_YEAR;
}

export function realmPower(data: GameData, realm: Realm, stage: Stage): number {
  return realmData(data, realm).power[STAGES.indexOf(stage)]!;
}

export function realmName(data: GameData, realm: Realm): string {
  return realmData(data, realm).name;
}
