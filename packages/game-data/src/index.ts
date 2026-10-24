/**
 * Nội dung tĩnh của game, validate bằng Zod lúc nạp. Mọi số là safe integer (ADR-02).
 * Đổi số liệu cân bằng → tăng CONTENT_VERSION.
 */
import { z } from 'zod';
import balanceJson from '../data/balance.json' with { type: 'json' };
import biomesJson from '../data/biomes.json' with { type: 'json' };
import curvesJson from '../data/curves.json' with { type: 'json' };
import factionsJson from '../data/factions.json' with { type: 'json' };
import namesJson from '../data/names.json' with { type: 'json' };
import realmsJson from '../data/realms.json' with { type: 'json' };
import techniquesJson from '../data/techniques.json' with { type: 'json' };

export const CONTENT_VERSION = '0.4.0';

const int = z.int();
const nonNeg = z.int().min(0);
const stat = z.int().min(0).max(100);
const bp = z.int().min(0).max(100_000);
const range = z.tuple([int, int]).refine(([lo, hi]) => lo <= hi, 'Khoảng phải có min ≤ max');
const realmId = z.enum(['qi', 'foundation', 'golden_core']);
const nonEmptyStrings = z.array(z.string().min(1)).min(1);
const percentileBands = z
  .array(z.int().min(1).max(9999))
  .min(1)
  .refine((xs) => xs.every((x, i) => i === 0 || xs[i - 1]! < x), 'Ngưỡng phải tăng nghiêm ngặt');

export const realmsSchema = z.object({
  realms: z
    .array(z.object({
      id: realmId,
      name: z.string().min(1),
      daysPerStage: z.int().positive(),
      lifespanYears: z.int().positive(),
      power: z.tuple([nonNeg, nonNeg, nonNeg, nonNeg]),
    }))
    .length(3)
    .refine((rs) => rs.map((r) => r.id).join() === 'qi,foundation,golden_core', 'Cảnh giới phải theo thứ tự'),
  stages: z
    .array(z.object({ id: z.enum(['early', 'middle', 'late', 'perfect']), name: z.string().min(1) }))
    .length(4),
});

const failureTier = z.object({
  injury: stat,
  foundationLoss: stat,
  lifespanLossYears: nonNeg,
  progressLossBp: bp,
});

const byTargetRealm = <T extends z.ZodType>(value: T) => z.object({ foundation: value, golden_core: value });

export const balanceSchema = z.object({
  cultivation: z.object({
    baseGainFx: z.int().positive(),
    spiritRootClampBp: range,
    techniqueClampBp: range,
    energyClampBp: range,
    noTechniqueSpeedBp: bp,
    injuryPenaltyBpPerPoint: nonNeg,
    stateMinBp: bp,
    seclusionBonusBp: bp,
    daoMarkEnergyBp: bp,
  }),
  breakthrough: z.object({
    durationDays: z.int().positive(),
    cooldownDays: nonNeg,
    maxInjury: stat,
    minFoundation: byTargetRealm(stat),
    costStones: byTargetRealm(nonNeg),
    baseChanceBp: byTargetRealm(bp),
    insightBpPerPoint: nonNeg,
    daoHeartBpPerPoint: nonNeg,
    foundationBpPerPoint: nonNeg,
    injuryBpPerPoint: nonNeg,
    chanceClampBp: range,
    failure: z.object({
      minorBp: bp,
      majorBp: bp,
      minor: failureTier,
      major: failureTier,
      catastrophic: failureTier,
    }).refine((f) => f.minorBp + f.majorBp <= 10_000, 'minorBp + majorBp phải ≤ 10000'),
  }),
  actions: z.object({
    cultivateDays: range,
    seclusionDays: range,
    seclusionEarlyExitLossBp: bp,
    gatherDays: z.int().positive(),
    gatherBase: nonNeg,
    gatherPerPower: nonNeg,
    healDays: range,
    dutyDays: z.int().positive(),
    dutyPay: nonNeg,
    dutyRelation: nonNeg,
    joinDays: z.int().positive(),
    joinMaxMembers: z.int().positive(),
    leaveDays: z.int().positive(),
    duelLoserInjury: range,
    duelWinnerInjury: range,
    duelInjuryCap: stat,
  }),
  economy: z.object({
    upkeepPerTerritory: nonNeg,
    stipend: z.object({ leader: nonNeg, elder: nonNeg, disciple: nonNeg }),
    shortfallStabilityLoss: stat,
    monthlyInjuryRecovery: stat,
    healInjuryRecovery: stat,
    healStonesPerMonth: nonNeg,
  }),
  ai: z.object({
    reviewIntervalDays: z.int().positive(),
    commitmentDays: nonNeg,
    switchMargin: nonNeg,
    jitter: nonNeg,
    planCultivateMonths: z.int().positive(),
    seekRadiusHops: z.int().positive(),
    seekMinEnergyGainBp: nonNeg,
    scores: z.object({
      breakthrough: nonNeg,
      breakthroughRiskWeight: nonNeg,
      healPerInjury: nonNeg,
      healMinInjury: stat,
      gatherPoor: nonNeg,
      gatherComfortable: nonNeg,
      gatherGreedWeight: nonNeg,
      cultivate: nonNeg,
      cultivateAmbitionWeight: nonNeg,
      seekEnergyDivisor: z.int().positive(),
      seekLoyaltyWeight: nonNeg,
      duty: nonNeg,
      dutyLoyaltyWeight: nonNeg,
      joinFaction: nonNeg,
      joinLoyaltyWeight: nonNeg,
      joinMinLoyalty: stat,
      confrontMinIntensity: stat,
      confrontRiskDivisor: z.int().positive(),
    }),
  }),
  dispute: z.object({
    maxRelationToStart: z.int().min(-100).max(100),
    minPowerRatioBp: bp,
    concedePowerRatioBp: bp,
    maxSkirmishes: z.int().positive(),
    winMarginBp: bp,
    cooldownDays: nonNeg,
  }),
  worldgen: z.object({
    locationCount: z.int().min(6).max(40),
    extraEdges: nonNeg,
    travelDays: range,
    veinCount: z.int().min(2),
    veinReserve: range,
    veinYieldPerMonth: range,
    spiritualEnergyBp: range,
    veinEnergyBonusBp: bp,
    resourceStock: range,
    resourceRegenPerMonth: range,
    minSeatDistance: z.int().min(1),
    npcCount: z.int().min(9),
    rivalRelation: range,
    otherRelation: range,
    factionTreasury: range,
    player: z.object({
      ageYears: z.int().positive(),
      spiritRootBp: range,
      spiritStones: nonNeg,
    }),
    terrain: z.object({
      width: z.int().min(8).max(256),
      height: z.int().min(8).max(256),
      noiseCellSize: z.int().positive(),
      octaves: z.int().min(1).max(8),
      noiseAmplitude: nonNeg,
      landTargetBp: z.int().min(1000).max(9000),
      edgeFalloff: nonNeg,
      seaLevel: int,
      ridgeCount: range,
      ridgeLength: range,
      ridgeHeight: nonNeg,
      ridgeFalloffPerStep: z.int().positive(),
      rainCellSize: z.int().positive(),
      riverFlowThreshold: z.int().positive(),
      moistureCellSize: z.int().positive(),
      moistureWaterBonus: z.int().min(0).max(1000),
      moistureWaterFalloff: nonNeg,
      /** Ngưỡng theo phân vị ô đất (Bp), tăng nghiêm ngặt trong (0, 10000). */
      elevationBandsBp: percentileBands,
      moistureBandsBp: percentileBands,
      biomeMatrix: z.array(z.array(z.string().min(1)).min(1)).min(1),
      waterBiomeId: z.string().min(1),
      forbiddenBiomeId: z.string().min(1),
      forbiddenOnBiomes: z.array(z.string().min(1)),
      forbiddenNoiseCellSize: z.int().positive(),
      forbiddenThreshold: z.int().min(0).max(0xffff),
      qiElevationPoints: nonNeg,
      qiFlowWeight: nonNeg,
      qiFlowCap: nonNeg,
      qiMountainBonus: nonNeg,
      qiNoiseAmplitude: nonNeg,
      qiNoiseCellSize: z.int().positive(),
      /** W4: khoảng cách hex tối thiểu giữa các địa điểm / giữa các linh mạch (nới dần nếu thiếu chỗ). */
      minSiteSpacing: z.int().positive(),
      minVeinSpacing: nonNeg,
      /** Thưởng điểm trụ sở khi một ô kề ô neo là núi (ô neo đã có qiMountainBonus trong qi). */
      seatMountainBonus: nonNeg,
      /** travelDays = clamp(⌊chi phí đường / travelCostPerDay⌋, travelDays). */
      travelCostPerDay: z.int().positive(),
    }),
  }),
});

const curve = z
  .array(z.tuple([int, int]))
  .min(1)
  .refine((pts) => pts.every((p, i) => i === 0 || pts[i - 1]![0] < p[0]), 'Bảng tra phải tăng nghiêm ngặt theo x');

export const curvesSchema = z.object({ breakthroughAgePenaltyBp: curve });

export const namesSchema = z.object({
  surnames: nonEmptyStrings,
  givenNames: nonEmptyStrings,
  placePrefixes: nonEmptyStrings,
  placeSuffixes: z.object({ wild: nonEmptyStrings, town: nonEmptyStrings, secret_realm: nonEmptyStrings }),
  veinSuffix: z.string().min(1),
});

const personalityBias = z.object({
  ambition: z.int().min(-50).max(50),
  greed: z.int().min(-50).max(50),
  loyalty: z.int().min(-50).max(50),
  riskTolerance: z.int().min(-50).max(50),
});

export const factionsSchema = z.object({
  factions: z
    .array(z.object({
      id: z.string().regex(/^[a-z_]+$/),
      name: z.string().min(1),
      seatName: z.string().min(1),
      techniqueId: z.string().min(1),
      personalityBias,
    }))
    .min(3),
});

export const techniquesSchema = z.object({
  techniques: z.array(z.object({
    id: z.string().regex(/^[a-z_]+$/),
    name: z.string().min(1),
    minRealm: realmId,
    minSpiritRootBp: bp,
    speedBp: bp,
    stonesPerMonth: nonNeg,
    breakthroughModBp: z.int().min(-10_000).max(10_000),
    factionTemplateId: z.string().nullable(),
  })).min(1),
});

export const BIOME_TAGS = ['water', 'mountain', 'forbidden'] as const;

export const biomesSchema = z.object({
  biomes: z.array(z.object({
    id: z.string().regex(/^[a-z_]+$/),
    name: z.string().min(1),
    /** Chi phí qua 1 ô; 0 = không đi được. */
    travelCost: z.int().min(0).max(20),
    energyModBp: z.int().min(-5000).max(5000),
    resourceModBp: z.int().min(5000).max(20_000),
    tags: z.array(z.enum(BIOME_TAGS)),
    color: z.string().regex(/^#[0-9a-f]{6}$/),
  })).min(1).max(255),
});

export type RealmsData = z.infer<typeof realmsSchema>;
export type BalanceData = z.infer<typeof balanceSchema>;
export type CurvesData = z.infer<typeof curvesSchema>;
export type NamesData = z.infer<typeof namesSchema>;
export type FactionTemplate = z.infer<typeof factionsSchema>['factions'][number];
export type TechniqueData = z.infer<typeof techniquesSchema>['techniques'][number];
export type BiomeData = z.infer<typeof biomesSchema>['biomes'][number];
export type BiomeTag = (typeof BIOME_TAGS)[number];

export interface GameData {
  contentVersion: string;
  realms: RealmsData;
  balance: BalanceData;
  curves: CurvesData;
  names: NamesData;
  factionTemplates: FactionTemplate[];
  techniques: Record<string, TechniqueData>;
  /** Chỉ số trong mảng = giá trị lưu trong TerrainModel.biome (ADR-16). */
  biomes: BiomeData[];
}

/** Validate toàn bộ nội dung và kiểm tra tham chiếu chéo; ném lỗi nếu sai. */
export function parseGameData(raw: {
  realms: unknown; balance: unknown; curves: unknown; names: unknown; factions: unknown; techniques: unknown;
  biomes: unknown;
}): GameData {
  const techniqueList = techniquesSchema.parse(raw.techniques).techniques;
  const techniques: Record<string, TechniqueData> = {};
  for (const t of techniqueList) {
    if (techniques[t.id]) throw new Error(`Trùng technique id: ${t.id}`);
    techniques[t.id] = t;
  }
  const factionTemplates = factionsSchema.parse(raw.factions).factions;
  const templateIds = new Set<string>();
  for (const f of factionTemplates) {
    if (templateIds.has(f.id)) throw new Error(`Trùng faction template id: ${f.id}`);
    templateIds.add(f.id);
    if (!techniques[f.techniqueId]) throw new Error(`Tông môn ${f.id} tham chiếu công pháp không tồn tại: ${f.techniqueId}`);
  }
  for (const t of techniqueList) {
    if (t.factionTemplateId !== null && !templateIds.has(t.factionTemplateId)) {
      throw new Error(`Công pháp ${t.id} tham chiếu tông môn không tồn tại: ${t.factionTemplateId}`);
    }
  }
  const balance = balanceSchema.parse(raw.balance);
  const biomes = biomesSchema.parse(raw.biomes).biomes;
  checkBiomeReferences(biomes, balance.worldgen.terrain);
  return {
    contentVersion: CONTENT_VERSION,
    realms: realmsSchema.parse(raw.realms),
    balance,
    curves: curvesSchema.parse(raw.curves),
    names: namesSchema.parse(raw.names),
    factionTemplates,
    techniques,
    biomes,
  };
}

/** Bảng biome khớp dải độ cao × độ ẩm, mọi id tham chiếu tồn tại và đúng tag. */
function checkBiomeReferences(biomes: BiomeData[], terrain: BalanceData['worldgen']['terrain']): void {
  const byId = new Map<string, BiomeData>();
  for (const b of biomes) {
    if (byId.has(b.id)) throw new Error(`Trùng biome id: ${b.id}`);
    byId.set(b.id, b);
  }
  const need = (id: string, where: string, tag?: BiomeTag): BiomeData => {
    const b = byId.get(id);
    if (!b) throw new Error(`${where} tham chiếu biome không tồn tại: ${id}`);
    if (tag && !b.tags.includes(tag)) throw new Error(`${where}: biome ${id} phải có tag ${tag}`);
    return b;
  };
  if (need(terrain.waterBiomeId, 'waterBiomeId', 'water').travelCost !== 0) {
    throw new Error('Biome nước phải có travelCost = 0');
  }
  need(terrain.forbiddenBiomeId, 'forbiddenBiomeId', 'forbidden');
  for (const id of terrain.forbiddenOnBiomes) need(id, 'forbiddenOnBiomes');
  if (terrain.biomeMatrix.length !== terrain.elevationBandsBp.length + 1) {
    throw new Error(`biomeMatrix cần ${terrain.elevationBandsBp.length + 1} hàng (số dải độ cao)`);
  }
  for (const row of terrain.biomeMatrix) {
    if (row.length !== terrain.moistureBandsBp.length + 1) {
      throw new Error(`Mỗi hàng biomeMatrix cần ${terrain.moistureBandsBp.length + 1} cột (số dải độ ẩm)`);
    }
    for (const id of row) {
      const b = need(id, 'biomeMatrix');
      if (b.travelCost === 0 || b.tags.includes('water')) throw new Error(`biomeMatrix chỉ chứa biome đất: ${id}`);
    }
  }
}

export const rawGameData = {
  realms: realmsJson,
  balance: balanceJson,
  curves: curvesJson,
  names: namesJson,
  factions: factionsJson,
  techniques: techniquesJson,
  biomes: biomesJson,
} as const;

/** Nội dung mặc định đã validate. */
export const gameData: GameData = parseGameData(rawGameData);
