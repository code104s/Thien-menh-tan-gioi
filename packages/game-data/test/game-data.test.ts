import { describe, expect, it } from 'vitest';
import { gameData, parseGameData, rawGameData } from '../src/index.ts';

describe('game-data', () => {
  it('nội dung mặc định hợp lệ', () => {
    expect(gameData.realms.realms.map((r) => r.id)).toEqual(['qi', 'foundation', 'golden_core']);
    expect(gameData.factionTemplates.length).toBeGreaterThanOrEqual(3);
    expect(Object.keys(gameData.techniques).length).toBeGreaterThan(0);
  });

  it('đủ tên để sinh 20 NPC không trùng', () => {
    const { surnames, givenNames } = gameData.names;
    expect(surnames.length * givenNames.length).toBeGreaterThan(gameData.balance.worldgen.npcCount * 10);
    expect(gameData.names.placePrefixes.length).toBeGreaterThanOrEqual(gameData.balance.worldgen.locationCount);
  });

  it('từ chối số thực', () => {
    const balance = JSON.parse(JSON.stringify(rawGameData.balance)) as { cultivation: { baseGainFx: number } };
    balance.cultivation.baseGainFx = 1.5;
    expect(() => parseGameData({ ...rawGameData, balance })).toThrow();
  });

  it('từ chối tham chiếu công pháp không tồn tại', () => {
    const factions = JSON.parse(JSON.stringify(rawGameData.factions)) as { factions: { techniqueId: string }[] };
    factions.factions[0]!.techniqueId = 'khong_ton_tai';
    expect(() => parseGameData({ ...rawGameData, factions })).toThrow(/công pháp không tồn tại/);
  });

  it('từ chối tham số địa hình ngoài miền', () => {
    const balance = JSON.parse(JSON.stringify(rawGameData.balance)) as { worldgen: { terrain: Record<string, unknown> } };
    balance.worldgen.terrain['moistureWaterBonus'] = 1200;
    expect(() => parseGameData({ ...rawGameData, balance })).toThrow();
    balance.worldgen.terrain['moistureWaterBonus'] = 350;
    balance.worldgen.terrain['ridgeCount'] = [4, 2];
    expect(() => parseGameData({ ...rawGameData, balance })).toThrow();
  });

  it('biome: thứ tự ổn định, tham chiếu chéo hợp lệ', () => {
    expect(gameData.biomes[0]!.id).toBe('bien');
    const clone = () => JSON.parse(JSON.stringify(rawGameData.balance)) as {
      worldgen: { terrain: { biomeMatrix: string[][]; waterBiomeId: string; forbiddenBiomeId: string } };
    };
    const unknownId = clone();
    unknownId.worldgen.terrain.biomeMatrix[0]![0] = 'khong_ton_tai';
    expect(() => parseGameData({ ...rawGameData, balance: unknownId })).toThrow(/biome không tồn tại/);
    const badShape = clone();
    badShape.worldgen.terrain.biomeMatrix.pop();
    expect(() => parseGameData({ ...rawGameData, balance: badShape })).toThrow(/hàng/);
    const waterInMatrix = clone();
    waterInMatrix.worldgen.terrain.biomeMatrix[0]![0] = 'bien';
    expect(() => parseGameData({ ...rawGameData, balance: waterInMatrix })).toThrow(/biome đất/);
    const wrongTag = clone();
    wrongTag.worldgen.terrain.forbiddenBiomeId = 'rung';
    expect(() => parseGameData({ ...rawGameData, balance: wrongTag })).toThrow(/tag forbidden/);
    const dupBiomes = { biomes: [...rawGameData.biomes.biomes, rawGameData.biomes.biomes[1]!] };
    expect(() => parseGameData({ ...rawGameData, biomes: dupBiomes })).toThrow(/Trùng biome/);
  });

  it('từ chối bảng tra không tăng', () => {
    expect(() => parseGameData({ ...rawGameData, curves: { breakthroughAgePenaltyBp: [[0, 0], [0, 1]] } })).toThrow();
  });
});
