/**
 * Sinh thế giới từ seed (docs/09 mục 14, docs/08 › Quy tắc worldgen v2). Không gian lấy từ địa hình hex (ADR-16);
 * mọi lựa chọn ngẫu nhiên còn lại dùng luồng `worldgen`. Thuật toán hữu hạn bước, không có vòng "thử lại tới khi đúng".
 */
import { gameData as defaultGameData, type FactionTemplate, type GameData } from '@tmtg/game-data';
import { DAYS_PER_YEAR } from '../core/calendar.ts';
import { createEvent } from '../core/events.ts';
import { characterId, compareIds, factionId, locationId, sortedKeys, veinId } from '../core/ids.ts';
import { clamp, mulBp } from '../core/math.ts';
import { getStream, type RngStream } from '../core/rng.ts';
import { baseLifespanDays, stageThresholdFx } from '../rules/realm.ts';
import { hopDistances } from '../world/graph.ts';
import { biomeHasTag } from './terrain/biome.ts';
import { hexDistance, neighborsOf } from './terrain/hexGrid.ts';
import { generateTerrainWorld } from './terrain/index.ts';
import {
  BURN_SINKS, MINT_SOURCES,
  type BurnSink, type Cultivator, type EntityId, type FactionRank, type Ledger, type Location,
  type LocationEdge, type LocationKind, type MintSource, type Personality, type Realm, type SpiritVein, type Stage,
  type WorldEvent, type WorldState,
} from '../types.ts';

export type PlayerOrigin =
  | { kind: 'join_faction'; factionIndex: 0 | 1 | 2 }
  | { kind: 'rogue' }
  | { kind: 'resource_seeker' };

export interface WorldGenParams {
  seed: string;
  origin: PlayerOrigin;
  playerName?: string;
  data?: GameData;
}

export interface GeneratedWorld {
  state: WorldState;
  events: WorldEvent[];
}

export const PLAYER_ID = characterId(0);
const FACTION_COUNT = 3;
const TOWN_COUNT = 2;
const SECRET_REALM_COUNT = 1;

type Range = readonly [number, number];
const roll = (rng: RngStream, [lo, hi]: Range) => rng.nextRange(lo, hi);

export function emptyLedger(): Ledger {
  const minted = Object.fromEntries(MINT_SOURCES.map((k) => [k, 0])) as Record<MintSource, number>;
  const burned = Object.fromEntries(BURN_SINKS.map((k) => [k, 0])) as Record<BurnSink, number>;
  return { minted, burned };
}

export function generateWorld(params: WorldGenParams): GeneratedWorld {
  const data = params.data ?? defaultGameData;
  const cfg = data.balance.worldgen;
  const state: WorldState = {
    schemaVersion: 2,
    contentVersion: data.contentVersion,
    seed: params.seed,
    terrainGenVersion: 0,
    terrainDigest: null,
    day: 0,
    playerId: PLAYER_ID,
    gameOver: null,
    rng: {},
    counters: { action: 0, event: 0, causal: 0, dispute: 0, choice: 0 },
    eventSeq: 0,
    lastCommandSeq: 0,
    initialStoneSupply: 0,
    locations: {},
    spiritVeins: {},
    characters: {},
    factions: {},
    actions: {},
    disputes: {},
    causalRecords: {},
    pendingNews: [],
    pendingChoices: [],
    ledger: emptyLedger(),
  };
  const rng = getStream(state.rng, params.seed, 'worldgen');

  // 1. Địa hình (ADR-16): địa điểm, cạnh và travelDays suy ra từ lưới hex; luồng RNG địa hình là cục bộ.
  const terrain = generateTerrainWorld(params.seed, data);
  state.terrainGenVersion = terrain.model.terrainGenVersion;
  state.terrainDigest = terrain.model.digest;
  const { biome: cellBiome, qi } = terrain.model;
  const { grid } = terrain;
  const n = terrain.sites.length;
  const locIds = Array.from({ length: n }, (_, i) => locationId(i + 1));
  const anchorOf = new Map<EntityId, number>(locIds.map((id, i) => [id, terrain.sites[i]!]));
  const anchor = (id: EntityId): number => anchorOf.get(id)!;
  const biomeAt = (id: EntityId) => data.biomes[cellBiome[anchor(id)]!]!;
  const adjacency = new Map<EntityId, LocationEdge[]>(locIds.map((id) => [id, []]));
  for (const e of terrain.edges) {
    adjacency.get(locIds[e.a]!)!.push({ to: locIds[e.b]!, travelDays: e.travelDays });
    adjacency.get(locIds[e.b]!)!.push({ to: locIds[e.a]!, travelDays: e.travelDays });
  }
  const [energyMin, energyMax] = data.balance.cultivation.energyClampBp;

  for (const id of locIds) {
    state.locations[id] = {
      id,
      name: '',
      kind: 'wild',
      edges: adjacency.get(id)!.sort((x, y) => compareIds(x.to, y.to)),
      spiritualEnergyBp: clamp(roll(rng, cfg.spiritualEnergyBp) + biomeAt(id).energyModBp, energyMin, energyMax),
      resourceStock: 0,
      resourceRegenPerMonth: 0,
      resourceCap: 0,
      veinId: null,
      ownerFactionId: null,
      daoMarkIds: [],
      biomeId: biomeAt(id).id,
      anchorCell: anchor(id),
    };
  }
  const loc = (id: EntityId): Location => state.locations[id]!;
  const byQi = (a: EntityId, b: EntityId) => qi[anchor(b)]! - qi[anchor(a)]! || compareIds(a, b);

  // 2. Trụ sở: điểm = địa khí ô neo + seatMountainBonus nếu một ô kề có núi (ô neo đã được thưởng núi trong qi);
  //    cách nhau ≥ minSeatDistance cạnh, nới điều kiện nếu không đủ.
  const around: number[] = [];
  const seatScore = new Map(locIds.map((id) => {
    const count = neighborsOf(grid, anchor(id), around);
    const mountainNearby = around.slice(0, count).some((c) => biomeHasTag(data, cellBiome[c]!, 'mountain'));
    return [id, qi[anchor(id)]! + (mountainNearby ? cfg.terrain.seatMountainBonus : 0)];
  }));
  const order = [...locIds].sort((a, b) => seatScore.get(b)! - seatScore.get(a)! || compareIds(a, b));
  const seats: EntityId[] = [];
  for (const minDist of [cfg.minSeatDistance, 1]) {
    for (const candidate of order) {
      if (seats.length === FACTION_COUNT) break;
      if (seats.includes(candidate)) continue;
      const dist = hopDistances(state.locations, candidate);
      if (seats.every((s) => (dist.get(s) ?? Infinity) >= minDist)) seats.push(candidate);
    }
  }

  // 3. Tông môn: chọn 3 mẫu; tông 0 và 1 là cặp kình địch.
  const templates = rng.shuffle(data.factionTemplates).slice(0, FACTION_COUNT);
  const facIds = templates.map((_, i) => factionId(i + 1));
  templates.forEach((template, i) => {
    const id = facIds[i]!;
    const seat = loc(seats[i]!);
    seat.kind = 'sect_seat';
    seat.name = template.seatName;
    seat.ownerFactionId = id;
    state.factions[id] = {
      id,
      templateId: template.id,
      name: template.name,
      seatLocationId: seat.id,
      leaderId: null,
      treasury: roll(rng, cfg.factionTreasury),
      stability: 70,
      relations: {},
      strategy: 'consolidate',
      strategyChosenDay: 0,
      disputeCooldowns: {},
      dissolved: false,
    };
  });
  for (let i = 0; i < FACTION_COUNT; i++) {
    for (let j = i + 1; j < FACTION_COUNT; j++) {
      const value = roll(rng, i === 0 && j === 1 ? cfg.rivalRelation : cfg.otherRelation);
      state.factions[facIds[i]!]!.relations[facIds[j]!] = value;
      state.factions[facIds[j]!]!.relations[facIds[i]!] = value;
    }
  }

  // 4. Linh mạch tranh chấp: nút không phải trụ sở gần trụ sở tông 0 nhất (hòa → gần tông 1), thuộc tông 1.
  const contestedId = contestedVeinLocation(state.locations, seats);
  loc(contestedId).ownerFactionId = facIds[1]!;
  const veinLocations: EntityId[] = [contestedId];
  veinLocations.push(...seats);
  // Mỗi tông môn thêm một nút hoang dã kề trụ sở làm lãnh địa (nếu còn).
  for (let i = 0; i < FACTION_COUNT; i++) {
    const free = loc(seats[i]!).edges.map((e) => loc(e.to)).filter((l) => l.kind === 'wild' && l.ownerFactionId === null);
    if (free.length > 0) rng.pick(free).ownerFactionId = facIds[i]!;
  }
  // Linh mạch còn lại: nút hoang dã địa khí cao nhất, cách các linh mạch khác ≥ minVeinSpacing ô (nới nếu thiếu).
  const spare = locIds.filter((id) => !veinLocations.includes(id) && loc(id).kind === 'wild').sort(byQi);
  for (const spacing of [cfg.terrain.minVeinSpacing, 0]) {
    for (const id of spare) {
      if (veinLocations.length >= cfg.veinCount) break;
      if (veinLocations.includes(id)) continue;
      if (veinLocations.every((v) => hexDistance(grid, anchor(v), anchor(id)) >= spacing)) veinLocations.push(id);
    }
  }

  // 5. Bí cảnh: nút trống xa các trụ sở nhất (tổng khoảng cách hex); thị trấn: nút trống dễ đi nhất.
  const isPlain = (id: EntityId) => !veinLocations.includes(id) && loc(id).kind === 'wild' && loc(id).ownerFactionId === null;
  const seatDistance = (id: EntityId) => seats.reduce((sum, s) => sum + hexDistance(grid, anchor(s), anchor(id)), 0);
  locIds.filter(isPlain)
    .sort((a, b) => seatDistance(b) - seatDistance(a) || compareIds(a, b))
    .slice(0, SECRET_REALM_COUNT)
    .forEach((id) => { loc(id).kind = 'secret_realm'; });
  locIds.filter(isPlain)
    .sort((a, b) => biomeAt(a).travelCost - biomeAt(b).travelCost || compareIds(a, b))
    .slice(0, TOWN_COUNT)
    .forEach((id) => { loc(id).kind = 'town'; });

  // 6. Tên, tài nguyên, linh mạch.
  const prefixes = rng.shuffle(data.names.placePrefixes);
  let prefixIndex = 0;
  for (const id of locIds) {
    const l = loc(id);
    if (l.kind !== 'sect_seat') {
      const suffixes = data.names.placeSuffixes[l.kind as Exclude<LocationKind, 'sect_seat'>];
      l.name = `${prefixes[prefixIndex++ % prefixes.length]!} ${rng.pick(suffixes)}`;
    }
    if (l.kind === 'wild' || l.kind === 'secret_realm') {
      l.resourceStock = mulBp(roll(rng, cfg.resourceStock), biomeAt(id).resourceModBp);
      l.resourceRegenPerMonth = roll(rng, cfg.resourceRegenPerMonth);
      l.resourceCap = l.resourceStock * 3;
    }
  }
  // Trữ lượng và sản lượng roll như cũ, rồi xếp hạng theo địa khí: mạch mạnh nhất ở nơi địa khí cao nhất.
  const reserves = veinLocations.map(() => roll(rng, cfg.veinReserve)).sort((a, b) => b - a);
  const yields = veinLocations.map(() => roll(rng, cfg.veinYieldPerMonth)).sort((a, b) => b - a);
  const qiRank = new Map(veinLocations.slice().sort(byQi).map((id, rank) => [id, rank]));
  veinLocations.slice().sort(compareIds).forEach((locId, i) => {
    const id = veinId(i + 1);
    const l = loc(locId);
    const rank = qiRank.get(locId)!;
    const vein: SpiritVein = {
      id,
      locationId: locId,
      name: `${l.name} ${data.names.veinSuffix}`,
      reserve: reserves[rank]!,
      yieldPerMonth: yields[rank]!,
    };
    state.spiritVeins[id] = vein;
    l.veinId = id;
    l.spiritualEnergyBp = clamp(l.spiritualEnergyBp + cfg.veinEnergyBonusBp, energyMin, energyMax);
  });

  // 7. Nhân vật.
  const nameCombos: string[] = [];
  for (const s of data.names.surnames) for (const g of data.names.givenNames) nameCombos.push(`${s} ${g}`);
  const names = rng.shuffle(nameCombos);
  let nameIndex = 0;
  const nextName = () => names[nameIndex++]!;

  const goldenLeaderFaction = rng.nextInt(FACTION_COUNT);
  const roster: { factionIndex: number | null; rank: FactionRank | null }[] = [];
  const memberPlan = templates.map(() => ({ elders: rng.nextRange(1, 2), disciples: rng.nextRange(3, 4) }));
  const minRogues = 2;
  while (memberPlan.reduce((sum, m) => sum + 1 + m.elders + m.disciples, 0) > cfg.npcCount - minRogues) {
    const largest = memberPlan.reduce((best, m) => (m.disciples > best.disciples ? m : best));
    largest.disciples--;
  }
  memberPlan.forEach((m, i) => {
    roster.push({ factionIndex: i, rank: 'leader' });
    for (let k = 0; k < m.elders; k++) roster.push({ factionIndex: i, rank: 'elder' });
    for (let k = 0; k < m.disciples; k++) roster.push({ factionIndex: i, rank: 'disciple' });
  });
  while (roster.length < cfg.npcCount) roster.push({ factionIndex: null, rank: null });

  const rogueSpots = locIds.filter((id) => loc(id).kind !== 'sect_seat');
  roster.forEach((slot, i) => {
    const id = characterId(i + 1);
    const template = slot.factionIndex === null ? null : templates[slot.factionIndex]!;
    const profile = npcProfile(rng, slot.rank, slot.factionIndex === goldenLeaderFaction);
    const location = template ? seats[slot.factionIndex!]! : rng.pick(rogueSpots);
    const c = makeCultivator(rng, data, {
      id,
      name: nextName(),
      isPlayer: false,
      realm: profile.realm,
      stage: profile.stage,
      ageYears: profile.ageYears,
      spiritRootBp: roll(rng, profile.root),
      statRange: profile.stats,
      spiritStones: roll(rng, profile.stones),
      locationId: location,
      factionId: template ? facIds[slot.factionIndex!]! : null,
      factionRank: slot.rank,
      preferredTechnique: template ? template.techniqueId : rng.pick(['tan_tu_tam_phap', 'dan_khi_quyet']),
      personality: randomPersonality(rng, template),
    });
    c.nextReviewDay = rng.nextInt(data.balance.ai.reviewIntervalDays);
    state.characters[id] = c;
    if (slot.rank === 'leader') state.factions[c.factionId!]!.leaderId = id;
  });

  // 8. Người chơi.
  const origin = params.origin;
  const joinIndex = origin.kind === 'join_faction' ? origin.factionIndex : null;
  let playerLocation: EntityId;
  if (joinIndex !== null) {
    playerLocation = seats[joinIndex]!;
  } else if (origin.kind === 'resource_seeker') {
    playerLocation = locIds
      .filter((id) => loc(id).kind === 'wild' || loc(id).kind === 'secret_realm')
      .sort((a, b) => loc(b).resourceStock - loc(a).resourceStock || compareIds(a, b))[0]!;
  } else {
    playerLocation = locIds.find((id) => loc(id).kind === 'town') ?? rogueSpots[0]!;
  }
  const playerCfg = cfg.player;
  state.characters[PLAYER_ID] = makeCultivator(rng, data, {
    id: PLAYER_ID,
    name: params.playerName?.trim() || nextName(),
    isPlayer: true,
    realm: 'qi',
    stage: 'early',
    ageYears: playerCfg.ageYears,
    exactAge: true,
    startProgressZero: true,
    spiritRootBp: roll(rng, playerCfg.spiritRootBp),
    statRange: [40, 60],
    spiritStones: playerCfg.spiritStones,
    locationId: playerLocation,
    factionId: joinIndex === null ? null : facIds[joinIndex]!,
    factionRank: joinIndex === null ? null : 'disciple',
    preferredTechnique: joinIndex === null ? 'dan_khi_quyet' : templates[joinIndex]!.techniqueId,
    personality: { ambition: 50, greed: 50, loyalty: 50, riskTolerance: 50 },
  });
  state.characters[PLAYER_ID]!.plan = null;

  // 9. Tổng cung linh thạch ban đầu (bất biến bảo toàn).
  state.initialStoneSupply = stoneSupply(state);

  const factionNames = sortedKeys(state.factions).map((id) => state.factions[id]!.name);
  const events = [
    createEvent(state, {
      type: 'world_created',
      severity: 'info',
      visibility: 'public',
      chronicle: true,
      factionIds: sortedKeys(state.factions),
      payload: { seed: params.seed, factions: factionNames },
    }),
  ];
  return { state, events };
}

/**
 * Địa điểm của linh mạch tranh chấp (09 §9): nút không phải trụ sở gần trụ sở tông thứ nhất nhất,
 * hòa → gần trụ sở tông thứ hai hơn, hòa → id. Chỉ phụ thuộc đồ thị và trụ sở (đều không đổi sau worldgen).
 */
export function contestedVeinLocation(locations: Record<EntityId, Location>, seats: readonly EntityId[]): EntityId {
  const distFrom0 = hopDistances(locations, seats[0]!);
  const distFrom1 = hopDistances(locations, seats[1]!);
  return sortedKeys(locations)
    .filter((id) => !seats.includes(id))
    .sort((a, b) => distFrom0.get(a)! - distFrom0.get(b)! || distFrom1.get(a)! - distFrom1.get(b)! || compareIds(a, b))[0]!;
}

/** Σ ví + kho + giữ chỗ + trữ lượng linh mạch + tài nguyên địa điểm. */
export function stoneSupply(state: WorldState): number {
  let total = 0;
  for (const c of Object.values(state.characters)) total += c.spiritStones;
  for (const f of Object.values(state.factions)) total += f.treasury;
  for (const a of Object.values(state.actions)) total += a.reservedCosts.spiritStones;
  for (const v of Object.values(state.spiritVeins)) total += v.reserve;
  for (const l of Object.values(state.locations)) total += l.resourceStock;
  return total;
}

interface NpcProfile {
  realm: Realm;
  stage: Stage;
  ageYears: Range;
  root: Range;
  stats: Range;
  stones: Range;
}

function npcProfile(rng: RngStream, rank: FactionRank | null, goldenLeader: boolean): NpcProfile {
  switch (rank) {
    case 'leader':
      return goldenLeader
        ? { realm: 'golden_core', stage: 'early', ageYears: [150, 250], root: [12_000, 17_000], stats: [55, 90], stones: [500, 1200] }
        : { realm: 'foundation', stage: rng.pick(['late', 'perfect'] as const), ageYears: [90, 150], root: [11_000, 16_000], stats: [50, 85], stones: [300, 800] };
    case 'elder':
      return rng.nextInt(3) === 0
        ? { realm: 'qi', stage: 'perfect', ageYears: [40, 70], root: [9_000, 14_000], stats: [40, 80], stones: [100, 300] }
        : { realm: 'foundation', stage: rng.pick(['early', 'middle'] as const), ageYears: [50, 100], root: [9_000, 15_000], stats: [45, 80], stones: [100, 300] };
    case 'disciple':
      return { realm: 'qi', stage: rng.pick(['early', 'middle', 'late'] as const), ageYears: [16, 35], root: [7_000, 13_000], stats: [30, 75], stones: [20, 80] };
    case null:
      return rng.nextInt(5) === 0
        ? { realm: 'foundation', stage: 'early', ageYears: [45, 90], root: [8_000, 13_000], stats: [35, 75], stones: [80, 250] }
        : { realm: 'qi', stage: rng.pick(['middle', 'late', 'perfect'] as const), ageYears: [20, 70], root: [6_000, 11_000], stats: [30, 75], stones: [30, 200] };
  }
}

function randomPersonality(rng: RngStream, template: FactionTemplate | null): Personality {
  const bias = template?.personalityBias ?? { ambition: 0, greed: 0, loyalty: 0, riskTolerance: 0 };
  return {
    ambition: clamp(rng.nextRange(20, 80) + bias.ambition, 0, 100),
    greed: clamp(rng.nextRange(20, 80) + bias.greed, 0, 100),
    loyalty: clamp(rng.nextRange(20, 80) + bias.loyalty, 0, 100),
    riskTolerance: clamp(rng.nextRange(20, 80) + bias.riskTolerance, 0, 100),
  };
}

interface CultivatorSpec {
  id: EntityId;
  name: string;
  isPlayer: boolean;
  realm: Realm;
  stage: Stage;
  ageYears: number | Range;
  exactAge?: boolean;
  startProgressZero?: boolean;
  spiritRootBp: number;
  statRange: Range;
  spiritStones: number;
  locationId: EntityId;
  factionId: EntityId | null;
  factionRank: FactionRank | null;
  preferredTechnique: string;
  personality: Personality;
}

function makeCultivator(rng: RngStream, data: GameData, spec: CultivatorSpec): Cultivator {
  const years = typeof spec.ageYears === 'number' ? spec.ageYears : roll(rng, spec.ageYears);
  const ageDays = years * DAYS_PER_YEAR + (spec.exactAge ? 0 : rng.nextInt(DAYS_PER_YEAR));
  const threshold = stageThresholdFx(data, spec.realm);
  const preferred = data.techniques[spec.preferredTechnique];
  const techniqueId = preferred && spec.spiritRootBp >= preferred.minSpiritRootBp ? preferred.id : 'dan_khi_quyet';
  return {
    id: spec.id,
    name: spec.name,
    isPlayer: spec.isPlayer,
    alive: true,
    deathDay: null,
    deathCause: null,
    birthDay: -ageDays,
    lifespanDays: baseLifespanDays(data, spec.realm),
    locationId: spec.locationId,
    factionId: spec.factionId,
    factionRank: spec.factionRank,
    realm: spec.realm,
    stage: spec.stage,
    progress: spec.startProgressZero ? 0 : rng.nextInt(threshold),
    spiritRootBp: spec.spiritRootBp,
    techniqueId,
    insight: roll(rng, spec.statRange),
    foundation: roll(rng, spec.statRange),
    daoHeart: roll(rng, spec.statRange),
    injury: 0,
    lastInjuryCause: null,
    spiritStones: spec.spiritStones,
    breakthroughCooldownUntil: 0,
    personality: spec.personality,
    relations: {},
    memory: [],
    plan: null,
    nextReviewDay: 0,
    needsReview: false,
  };
}
