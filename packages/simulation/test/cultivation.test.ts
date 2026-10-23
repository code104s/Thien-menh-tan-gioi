import { gameData } from '@tmtg/game-data';
import { describe, expect, it } from 'vitest';
import { addProgress, dailyGainFx, isProgressCapped } from '../src/rules/cultivation.ts';
import { stageThresholdFx } from '../src/rules/realm.ts';
import { generateWorld } from '../src/worldgen/generate.ts';
import type { Cultivator, Location } from '../src/types.ts';

const { state } = generateWorld({ seed: 'cult', origin: { kind: 'rogue' } });
const base = (): Cultivator => ({
  ...state.characters['chr_0001']!,
  realm: 'qi', stage: 'early', progress: 0, injury: 0, spiritRootBp: 10_000, techniqueId: null,
});
const loc = (energy: number): Location => ({ ...state.locations['loc_001']!, spiritualEnergyBp: energy });
const QI = stageThresholdFx(gameData, 'qi');

describe('dailyGainFx', () => {
  it('hệ số 1.0 cho 1000 Fx × hệ số không công pháp', () => {
    expect(dailyGainFx(gameData, base(), loc(10_000), false)).toBe(600);
    expect(dailyGainFx(gameData, { ...base(), techniqueId: 'van_phap_tam_kinh' }, loc(10_000), false)).toBe(1000);
  });

  it('các hệ số bị kẹp', () => {
    const huge = { ...base(), spiritRootBp: 99_000, techniqueId: 'huyet_sat_cong' };
    const capped = dailyGainFx(gameData, huge, loc(99_000), false);
    expect(capped).toBe(dailyGainFx(gameData, { ...huge, spiritRootBp: 20_000 }, loc(16_000), false));
    expect(dailyGainFx(gameData, { ...base(), spiritRootBp: 1 }, loc(1), false))
      .toBe(dailyGainFx(gameData, { ...base(), spiritRootBp: 5000 }, loc(6000), false));
  });

  it('thương tích làm chậm, có sàn 40%; bế quan +20%', () => {
    const c = { ...base(), techniqueId: 'van_phap_tam_kinh' };
    expect(dailyGainFx(gameData, { ...c, injury: 50 }, loc(10_000), false)).toBe(700);
    expect(dailyGainFx(gameData, { ...c, injury: 100 }, loc(10_000), false)).toBe(400);
    expect(dailyGainFx(gameData, c, loc(10_000), true)).toBe(1200);
  });

  it('luôn là số nguyên không âm', () => {
    for (let root = 0; root <= 25_000; root += 777) {
      for (let injury = 0; injury <= 100; injury += 13) {
        const g = dailyGainFx(gameData, { ...base(), spiritRootBp: root, injury }, loc(root), injury % 2 === 0);
        expect(Number.isSafeInteger(g) && g >= 0).toBe(true);
      }
    }
  });
});

describe('addProgress', () => {
  it('lên tầng nhỏ và chuyển phần dư', () => {
    const c = { ...base(), progress: QI - 100 };
    const r = addProgress(gameData, c, 350);
    expect(r).toEqual({ gained: 350, reached: ['middle'] });
    expect([c.stage, c.progress]).toEqual(['middle', 250]);
  });

  it('nhảy nhiều tầng một lần nếu lượng lớn, không vượt cảnh giới', () => {
    const c = base();
    const r = addProgress(gameData, c, QI * 10);
    expect(r.reached).toEqual(['middle', 'late', 'perfect']);
    expect([c.realm, c.stage, c.progress]).toEqual(['qi', 'perfect', QI]);
    expect(r.gained).toBe(QI * 4);
    expect(isProgressCapped(gameData, c)).toBe(true);
  });

  it('đã viên mãn đầy thì không nhận thêm', () => {
    const c = { ...base(), stage: 'perfect' as const, progress: QI };
    expect(addProgress(gameData, c, 5000)).toEqual({ gained: 0, reached: [] });
    expect(c.progress).toBe(QI);
  });

  it('trần Kim Đan viên mãn', () => {
    const gc = stageThresholdFx(gameData, 'golden_core');
    const c = { ...base(), realm: 'golden_core' as const, stage: 'perfect' as const, progress: gc - 10 };
    expect(addProgress(gameData, c, 1000).gained).toBe(10);
    expect(c.realm).toBe('golden_core');
  });
});
