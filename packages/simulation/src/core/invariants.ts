/** Kiểm tra bất biến của WorldState (docs/08, mục "Bất biến"). Trả danh sách vi phạm, không ném lỗi. */
import { gameData as defaultGameData, type GameData } from '@tmtg/game-data';
import { stageThresholdFx } from '../rules/realm.ts';
import { isConnected } from '../world/graph.ts';
import { contestedVeinLocation, stoneSupply } from '../worldgen/generate.ts';
import { biomeHasTag } from '../worldgen/terrain/biome.ts';
import { createHexGrid, hexDistance } from '../worldgen/terrain/hexGrid.ts';
import { TERRAIN_GEN_VERSION, generateTerrain, type TerrainModel } from '../worldgen/terrain/index.ts';
import { largestLandMass } from '../worldgen/terrain/sites.ts';
import { BURN_SINKS, REALMS, STAGES, type EntityId, type WorldState } from '../types.ts';
import { sortedKeys } from './ids.ts';

export type InvariantCode =
  | 'I1_REFERENCE' | 'I2_NUMBER' | 'I3_ACTIONS' | 'I4_LEADER' | 'I5_VEIN' | 'I6_DISPUTE'
  | 'I7_GRAPH' | 'I8_STONES' | 'I9_REALM' | 'I10_GAME_OVER' | 'I11_COUNTERS'
  | 'I12_TERRAIN' | 'I13_TERRAIN' | 'I14_TERRAIN';

export interface InvariantViolation {
  code: InvariantCode;
  message: string;
}

const STAT_FIELDS = ['insight', 'foundation', 'daoHeart', 'injury'] as const;

export function checkInvariants(state: WorldState, data: GameData = defaultGameData): InvariantViolation[] {
  const out: InvariantViolation[] = [];
  const fail = (code: InvariantCode, message: string) => out.push({ code, message });
  const { locations, characters, factions, spiritVeins, actions, disputes, causalRecords } = state;
  const entityExists = (id: string) =>
    id in locations || id in characters || id in factions || id in spiritVeins;

  // I2 — mọi số là safe integer.
  walkNumbers(state, '$', (path, value) => {
    if (!Number.isSafeInteger(value)) fail('I2_NUMBER', `${path} = ${value} không phải safe integer`);
  });

  // I1 — ID khớp khóa và tham chiếu hợp lệ.
  for (const [table, record] of Object.entries({ locations, characters, factions, spiritVeins, actions, disputes, causalRecords })) {
    for (const [key, entity] of Object.entries(record)) {
      if (entity.id !== key) fail('I1_REFERENCE', `${table}.${key} có id ${entity.id}`);
    }
  }
  for (const c of Object.values(characters)) {
    if (!locations[c.locationId]) fail('I1_REFERENCE', `${c.id}.locationId → ${c.locationId}`);
    if (c.factionId !== null && !factions[c.factionId]) fail('I1_REFERENCE', `${c.id}.factionId → ${c.factionId}`);
    if ((c.factionId === null) !== (c.factionRank === null)) fail('I1_REFERENCE', `${c.id} factionId/factionRank không đồng bộ`);
    if (c.techniqueId !== null && !data.techniques[c.techniqueId]) fail('I1_REFERENCE', `${c.id}.techniqueId → ${c.techniqueId}`);
    for (const target of Object.keys(c.relations)) {
      if (!characters[target]) fail('I1_REFERENCE', `${c.id}.relations → ${target}`);
    }
    if (c.alive !== (c.deathDay === null) || c.alive !== (c.deathCause === null)) {
      fail('I1_REFERENCE', `${c.id} trạng thái sống/chết không nhất quán`);
    }
    if (c.isPlayer !== (c.id === state.playerId)) fail('I1_REFERENCE', `${c.id}.isPlayer sai`);
  }
  if (!characters[state.playerId]) fail('I1_REFERENCE', `playerId → ${state.playerId}`);
  for (const f of Object.values(factions)) {
    if (!locations[f.seatLocationId]) fail('I1_REFERENCE', `${f.id}.seatLocationId → ${f.seatLocationId}`);
    for (const other of [...Object.keys(f.relations), ...Object.keys(f.disputeCooldowns)]) {
      if (!factions[other] || other === f.id) fail('I1_REFERENCE', `${f.id} quan hệ với ${other}`);
    }
  }
  for (const l of Object.values(locations)) {
    if (l.ownerFactionId !== null && !factions[l.ownerFactionId]) fail('I1_REFERENCE', `${l.id}.ownerFactionId → ${l.ownerFactionId}`);
  }
  for (const a of Object.values(actions)) {
    if (!characters[a.actorId]) fail('I1_REFERENCE', `${a.id}.actorId → ${a.actorId}`);
    if (!locations[a.locationId]) fail('I1_REFERENCE', `${a.id}.locationId → ${a.locationId}`);
    if (a.targetId !== undefined && !entityExists(a.targetId)) fail('I1_REFERENCE', `${a.id}.targetId → ${a.targetId}`);
  }
  for (const d of Object.values(disputes)) {
    if (!spiritVeins[d.veinId] || !factions[d.attackerId] || !factions[d.defenderId]) {
      fail('I1_REFERENCE', `${d.id} tham chiếu không hợp lệ`);
    }
  }
  for (const r of Object.values(causalRecords)) {
    if (!entityExists(r.holderId) || !entityExists(r.towardId)) fail('I1_REFERENCE', `${r.id} tham chiếu không hợp lệ`);
  }
  for (const news of state.pendingNews) {
    if (!characters[news.recipientId]) fail('I1_REFERENCE', `tin ${news.eventId} → ${news.recipientId}`);
  }

  // I2 — tài nguyên không âm, Stat trong [0, 100].
  const nonNegative: [string, number][] = [
    ...Object.values(characters).map((c): [string, number] => [`${c.id}.spiritStones`, c.spiritStones]),
    ...Object.values(factions).map((f): [string, number] => [`${f.id}.treasury`, f.treasury]),
    ...Object.values(spiritVeins).map((v): [string, number] => [`${v.id}.reserve`, v.reserve]),
    ...Object.values(locations).map((l): [string, number] => [`${l.id}.resourceStock`, l.resourceStock]),
    ...Object.values(actions).map((a): [string, number] => [`${a.id}.reservedCosts`, a.reservedCosts.spiritStones]),
  ];
  for (const [path, value] of nonNegative) if (value < 0) fail('I2_NUMBER', `${path} = ${value} âm`);
  for (const c of Object.values(characters)) {
    for (const field of STAT_FIELDS) {
      if (c[field] < 0 || c[field] > 100) fail('I2_NUMBER', `${c.id}.${field} = ${c[field]} ngoài [0, 100]`);
    }
  }

  // I3 — tối đa 1 action đang chạy cho người sống, 0 cho người chết; bảng chỉ chứa action running.
  const running = new Map<string, number>();
  for (const a of Object.values(actions)) {
    if (a.status !== 'running') fail('I3_ACTIONS', `${a.id} có status ${a.status} nhưng vẫn nằm trong bảng`);
    if (a.dueDay < a.startDay) fail('I3_ACTIONS', `${a.id} dueDay < startDay`);
    if (a.dueDay < state.day) fail('I3_ACTIONS', `${a.id} quá hạn (dueDay ${a.dueDay} < day ${state.day})`);
    running.set(a.actorId, (running.get(a.actorId) ?? 0) + 1);
  }
  for (const [actorId, count] of running) {
    const actor = characters[actorId];
    if (actor && !actor.alive) fail('I3_ACTIONS', `${actorId} đã chết nhưng còn ${count} action`);
    if (count > 1) fail('I3_ACTIONS', `${actorId} có ${count} action đang chạy`);
  }

  // I4 — tông chủ hợp lệ, mỗi tông tối đa 1.
  for (const f of Object.values(factions)) {
    const leaders = Object.values(characters).filter((c) => c.alive && c.factionId === f.id && c.factionRank === 'leader');
    if (leaders.length > 1) fail('I4_LEADER', `${f.id} có ${leaders.length} tông chủ`);
    if (f.leaderId === null) {
      if (leaders.length > 0) fail('I4_LEADER', `${f.id} trống chức nhưng có thành viên rank leader`);
    } else {
      const leader = characters[f.leaderId];
      if (!leader || !leader.alive || leader.factionId !== f.id || leader.factionRank !== 'leader') {
        fail('I4_LEADER', `${f.id}.leaderId ${f.leaderId} không hợp lệ`);
      }
    }
  }

  // I5 — linh mạch ↔ địa điểm hai chiều.
  for (const v of Object.values(spiritVeins)) {
    if (locations[v.locationId]?.veinId !== v.id) fail('I5_VEIN', `${v.id} không khớp ${v.locationId}`);
  }
  for (const l of Object.values(locations)) {
    if (l.veinId !== null && spiritVeins[l.veinId]?.locationId !== l.id) fail('I5_VEIN', `${l.id}.veinId ${l.veinId} không khớp`);
  }

  // I6 — tối đa 1 tranh chấp mỗi linh mạch.
  const disputedVeins = new Set<string>();
  for (const d of Object.values(disputes)) {
    if (disputedVeins.has(d.veinId)) fail('I6_DISPUTE', `${d.veinId} có nhiều tranh chấp`);
    disputedVeins.add(d.veinId);
    if (d.attackerId === d.defenderId) fail('I6_DISPUTE', `${d.id} tự tranh chấp với chính mình`);
  }

  // I7 — đồ thị liên thông, đối xứng.
  if (!isConnected(locations)) fail('I7_GRAPH', 'Đồ thị địa điểm không liên thông');
  for (const l of Object.values(locations)) {
    for (const e of l.edges) {
      const back = locations[e.to]?.edges.find((x) => x.to === l.id);
      if (!back || back.travelDays !== e.travelDays) fail('I7_GRAPH', `Cạnh ${l.id}→${e.to} không đối xứng`);
    }
  }

  // I8 — bảo toàn linh thạch.
  const burned = BURN_SINKS.reduce((sum, k) => sum + state.ledger.burned[k], 0);
  const expected = state.initialStoneSupply + state.ledger.minted.location_regen - burned;
  const actual = stoneSupply(state);
  if (actual !== expected) fail('I8_STONES', `Tổng linh thạch ${actual} ≠ kỳ vọng ${expected}`);

  // I9 — cảnh giới, tầng, tiến độ.
  for (const c of Object.values(characters)) {
    if (!REALMS.includes(c.realm) || !STAGES.includes(c.stage)) {
      fail('I9_REALM', `${c.id} cảnh giới/tầng không hợp lệ`);
      continue;
    }
    const threshold = stageThresholdFx(data, c.realm);
    const ok = c.stage === 'perfect' ? c.progress <= threshold : c.progress < threshold;
    if (c.progress < 0 || !ok) fail('I9_REALM', `${c.id}.progress ${c.progress} sai với ngưỡng ${threshold}`);
  }

  // I10 — game over ⇔ người chơi chết.
  const player = characters[state.playerId];
  if (player && (state.gameOver !== null) === player.alive) fail('I10_GAME_OVER', 'gameOver không khớp trạng thái người chơi');

  // I11 — bộ đếm.
  if (state.eventSeq !== state.counters.event) fail('I11_COUNTERS', `eventSeq ${state.eventSeq} ≠ counters.event ${state.counters.event}`);
  for (const a of Object.values(actions)) {
    if (a.seq > state.counters.action) fail('I11_COUNTERS', `${a.id}.seq vượt counters.action`);
  }

  // I12/I14 (phần cấu trúc, rẻ) — trường địa hình nhất quán với terrainGenVersion (ADR-16).
  // Phần cần sinh lại địa hình nằm ở checkTerrainInvariants, không chạy mỗi tick.
  const terrainParams = data.balance.worldgen.terrain;
  const cellCount = terrainParams.width * terrainParams.height;
  if (state.terrainGenVersion === 0) {
    if (state.terrainDigest !== null) fail('I12_TERRAIN', 'Save không địa hình nhưng có terrainDigest');
    for (const l of Object.values(locations)) {
      if (l.biomeId !== null || l.anchorCell !== null) fail('I12_TERRAIN', `${l.id} có trường địa hình trong save không địa hình`);
    }
  } else {
    if (state.terrainDigest === null) fail('I12_TERRAIN', 'Thiếu terrainDigest');
    const anchors = new Set<number>();
    const [minDays, maxDays] = data.balance.worldgen.travelDays;
    for (const l of Object.values(locations)) {
      if (l.biomeId === null || !data.biomes.some((b) => b.id === l.biomeId)) fail('I12_TERRAIN', `${l.id}.biomeId không hợp lệ`);
      if (l.anchorCell === null || l.anchorCell >= cellCount) fail('I12_TERRAIN', `${l.id}.anchorCell ngoài lưới`);
      else if (anchors.has(l.anchorCell)) fail('I12_TERRAIN', `${l.id} trùng ô neo ${l.anchorCell}`);
      else anchors.add(l.anchorCell);
      for (const e of l.edges) {
        if (e.travelDays < minDays || e.travelDays > maxDays) fail('I14_TERRAIN', `Cạnh ${l.id}→${e.to} travelDays ${e.travelDays} ngoài khoảng`);
      }
    }
  }

  return out;
}

export type TerrainStatus =
  | { status: 'ok'; model: TerrainModel }
  | { status: 'unavailable'; reason: 'legacy_save' | 'unsupported_version' | 'digest_mismatch' };

/**
 * Sinh lại địa hình của một thế giới để hiển thị/kiểm tra (ADR-16). Không đổi state.
 * `unavailable` không phải lỗi save: mô phỏng không phụ thuộc địa hình sau worldgen, UI dùng bản đồ cũ.
 */
export function regenerateTerrain(state: WorldState, data: GameData = defaultGameData): TerrainStatus {
  if (state.terrainGenVersion === 0) return { status: 'unavailable', reason: 'legacy_save' };
  if (state.terrainGenVersion !== TERRAIN_GEN_VERSION) return { status: 'unavailable', reason: 'unsupported_version' };
  const model = generateTerrain(state.seed, data);
  if (model.digest !== state.terrainDigest) return { status: 'unavailable', reason: 'digest_mismatch' };
  return { status: 'ok', model };
}

/**
 * I12–I14 phần cần TerrainModel (docs/08). `model` phải là kết quả `regenerateTerrain` với status 'ok'.
 * Chạy trong test worldgen và khi tải save, không chạy mỗi tick.
 */
export function checkTerrainInvariants(state: WorldState, model: TerrainModel, data: GameData = defaultGameData): InvariantViolation[] {
  const out: InvariantViolation[] = [];
  const fail = (code: InvariantCode, message: string) => out.push({ code, message });
  if (model.digest !== state.terrainDigest || model.terrainGenVersion !== state.terrainGenVersion) {
    return [{ code: 'I12_TERRAIN', message: 'TerrainModel không khớp terrainDigest/terrainGenVersion của state' }];
  }
  const grid = createHexGrid(model.width, model.height);
  const mass = largestLandMass(grid, model.biome, data);
  const ids = sortedKeys(state.locations);
  const anchorOf = new Map<EntityId, number>();
  ids.forEach((id, k) => {
    const l = state.locations[id]!;
    const cell = l.anchorCell;
    if (cell === null) return; // đã báo ở checkInvariants
    anchorOf.set(id, cell);
    const biome = data.biomes[model.biome[cell]!];
    // I12 — ô neo là đất đi được, không phải vùng cấm, thuộc đúng vùng của địa điểm.
    if (!biome || biome.travelCost <= 0) fail('I12_TERRAIN', `${id} đặt trên ô không đi được`);
    if (biomeHasTag(data, model.biome[cell]!, 'forbidden')) fail('I12_TERRAIN', `${id} đặt trên vùng cấm`);
    if (model.cellLocation[cell] !== k) fail('I12_TERRAIN', `cellLocation tại ô neo của ${id} = ${model.cellLocation[cell]}, cần ${k}`);
    // I13 — cùng khối đất chính, biomeId khớp ô neo.
    if (!mass[cell]) fail('I13_TERRAIN', `${id} nằm ngoài khối đất chính`);
    if (biome && l.biomeId !== biome.id) fail('I13_TERRAIN', `${id}.biomeId ${l.biomeId} ≠ ${biome.id}`);
  });

  // I14 — linh mạch "tự do" (không ở trụ sở, không phải linh mạch tranh chấp) có địa khí ≥ mọi nút không trụ sở,
  // không linh mạch, trừ nút bị loại vì nằm trong minVeinSpacing của một linh mạch.
  const seats = sortedKeys(state.factions).map((f) => state.factions[f]!.seatLocationId);
  if (seats.length >= 2) {
    const contested = contestedVeinLocation(state.locations, seats);
    const qiOf = (id: EntityId) => model.qi[anchorOf.get(id) ?? -1] ?? -1;
    const veinSites = ids.filter((id) => state.locations[id]!.veinId !== null);
    const spacing = data.balance.worldgen.terrain.minVeinSpacing;
    const nearVein = (id: EntityId) => veinSites.some((v) =>
      anchorOf.has(v) && anchorOf.has(id) && hexDistance(grid, anchorOf.get(v)!, anchorOf.get(id)!) < spacing);
    const free = veinSites.filter((id) => !seats.includes(id) && id !== contested);
    const veinless = ids.filter((id) => !seats.includes(id) && state.locations[id]!.veinId === null && !nearVein(id));
    for (const v of free) {
      for (const l of veinless) {
        if (qiOf(v) < qiOf(l)) fail('I14_TERRAIN', `Linh mạch tại ${v} (qi ${qiOf(v)}) yếu hơn nút trống ${l} (qi ${qiOf(l)})`);
      }
    }
  }
  return out;
}

export function assertInvariants(state: WorldState, data?: GameData): void {
  const violations = checkInvariants(state, data);
  if (violations.length > 0) {
    throw new Error(`Vi phạm bất biến (ngày ${state.day}):\n${violations.map((v) => `  [${v.code}] ${v.message}`).join('\n')}`);
  }
}

function walkNumbers(value: unknown, path: string, visit: (path: string, n: number) => void): void {
  if (typeof value === 'number') {
    visit(path, value);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => walkNumbers(v, `${path}[${i}]`, visit));
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) walkNumbers(v, `${path}.${k}`, visit);
  }
}
