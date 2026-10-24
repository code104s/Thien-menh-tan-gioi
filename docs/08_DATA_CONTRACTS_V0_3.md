# 08 — Hợp đồng dữ liệu v0.3

Thay thế `04_DATA_CONTRACTS.md` cho mục đích triển khai. Các bất biến trong 04 vẫn giữ nguyên và được bổ sung ở cuối tài liệu này.
Mọi số là safe integer; `Fx` = ×1000, `Bp` = phần vạn (xem ADR-02).

## Sửa đổi so với v0.2

| Mã | Thay đổi | Lý do |
|---|---|---|
| A1, A2 | `ScheduledAction` thêm `locationId`, `priority`, `seq`, `cancellationPolicy`, `source`; `status` bỏ `planned`, thêm `failed` | Khớp spec 03, xử lý actor chết / mục tiêu mất |
| A3 | `Faction.leaderId: EntityId \| null` | Cho phép trống chức |
| A4 | Bỏ `monthlyIncome/monthlyExpense` lưu sẵn; tính từ linh mạch, lãnh địa và bổng lộc | Không tạo tài nguyên từ hư không |
| A6 | `PlayerCommand` thêm `seq`; payload là union có kiểu | Thống nhất command, chống trùng |
| B | Thêm `spiritRootBp`, `techniqueId`, `injury`, `alive`, `deathDay`, `birthDay`, `lifespanDays`, `relations`, `memory`, `plan`; thêm `SpiritVein`, `Dispute`, `Technique`, `severity`, `visibility` | Đủ dữ liệu cho GDD và test |
| D | `history` và `processedCommandIds` rời khỏi `WorldState`; thay bằng `eventSeq`, `lastCommandSeq` | Snapshot không phình |
| — | `ageDays` → `birthDay` (tuổi = `day − birthDay`) | Không phải cập nhật tuổi mỗi tick |
| — | `territoryIds`, `memberIds` thành selector | Một nguồn sự thật (ADR-13) |

## Bổ sung khi triển khai Phase 1 (2026-10-24)
Nguồn sự thật cho kiểu là `packages/simulation/src/types.ts`; schema Zod ở `packages/shared/src/schema.ts` được `tsc` kiểm tra khớp chính xác.

| Thay đổi | Lý do |
|---|---|
| `WorldState.initialStoneSupply` | Mốc cho bất biến bảo toàn linh thạch (#8) |
| `Counters.choice` | Cấp ID cho `PlayerChoice` (`chc_0001`) |
| `Location.resourceCap` | Lưu trần tái sinh (= 3 × trữ lượng khởi tạo) thay vì suy ra |
| `Faction.templateId`, `Technique.factionTemplateId` | Liên kết tông môn sinh theo seed với mẫu trong game-data |
| Event `command_rejected` | Ghi lại lệnh bị từ chối kèm lý do |
| `WorldEvent.payload` tạm là JSON phẳng | Union có kiểu theo từng loại event sẽ thêm ở Phase 2–3 |
| Bất biến #11: `eventSeq = counters.event`, `action.seq ≤ counters.action` | Phát hiện bộ đếm lệch |
| *(Phase 2)* `Cultivator.lastInjuryCause` | Ghi đúng nguyên nhân tử vong khi thương tích chạm 100 (vd. `breakthrough`) |
| *(Phase 2)* `ActionRule` có thêm `duration`, `onStart`, `onCancel`; `onComplete` trả `{ events, payload }` | Thời lượng cố định (travel, gather, breakthrough), event bế quan, phạt xuất quan sớm |
| *(Phase 3)* `ActionType` thêm `leave_faction` | Task 3.2 yêu cầu rời tông môn |
| *(Phase 3)* `Dispute.playerStance: 'fight' \| 'avoid' \| null` | Ghi lựa chọn tham chiến của người chơi |
| *(Phase 3)* `PlayerChoice.kind`, `PlayerChoice.subjectId` | Biết lựa chọn thuộc tranh chấp nào |
| *(Phase 3)* `NewsItem.severity`, `NewsItem.type` | Tin đến trễ vẫn xét interrupt/ký ức đúng mức dù event không nằm trong snapshot |

### Phase 4 — worker, save file
- **Lệnh khi Pause** được áp ngay ở ranh giới đầu ngày hiện tại (`applyCommands` trước tick). Event của chúng được đưa vào tick kế tiếp qua tham số `tick(..., preApplied)` để truyền tin/interrupt y như bước 0 — kết quả trùng replay từ seed + command log (có regression test).
- **SaveFile** (`packages/shared/src/saveFile.ts`): `{ format, schemaVersion, contentVersion, savedAt, creation{seed, origin, playerName?}, snapshot, events, commands, pendingEventIds, checksum }`. `checksum` = FNV-1a 64 trên snapshot + events + commands + pendingEventIds (`savedAt` không tính). Event log chỉ giữ event Sử ký, event có salience > 0 và event của người chơi.
- **IndexedDB** (Dexie): bảng `saves`, `eventChunks` (1000 event/chunk), `commandLogs`; ghi/xóa trong một transaction.
- **Interrupt** cùng tick được xếp ưu tiên: game_over > choice_required > critical > important > player_action_finished.

### Diễn giải luật khi triển khai Phase 3
- **Quan hệ tông môn theo quý** (09 §11): chỉ lấy trung bình trên các cặp thành viên *đã có* quan hệ; không có cặp nào thì không dịch. Tính cả cặp 0 làm mọi kình địch trôi về 0 sau ~1 năm (đã có regression test).
- **Bổng lộc thiếu** (09 §5): thành viên không được trả đủ bị trừ 5 `personality.loyalty`.
- **Linh mạch vô chủ** (09 §9): tông môn `expand` chiếm ngay, không mở tranh chấp.
- **Phản ứng nhân quả** chỉ xảy ra với người biết tin ngay lúc event xảy ra (event không lưu trong snapshot); tin `public` đến trễ chỉ ghi ký ức.
- **Thời gian chờ đối đầu** (09 §10): không thêm trường; oán của người khởi xướng được đánh dấu đã giải sau trận, NPC cần oán mới ≥ 60 mới đấu tiếp. Người chơi được chủ động thách đấu.
- **Interrupt** chỉ dựa trên event người chơi đã biết trong tick (`processNews` trả `playerKnown`), cộng action của người chơi, lựa chọn mới và cái chết của người chơi.

## Bổ sung ADR-16 — địa hình (W0, 2026-10-24, schema v2)
Đã duyệt. **W1–W4 đã triển khai** (đồ thị địa điểm suy ra từ địa hình). **Chưa triển khai (W5):** T1, T2 (`schemaVersion 2`, `terrainGenVersion`, `terrainDigest`, `biomeId`, `anchorCell`), migration, I12–I14. **W6:** T5. Các khối kiểu bên dưới đã được cập nhật theo v2, đánh dấu `// v2`.

#### Ghi chú triển khai W4 (2026-10-23)
- **Hàm:** `generateTerrainWorld(seed, data): { model, grid, sites, edges }` (`worldgen/terrain/index.ts`). `sites[k]` là ô neo của `loc_(k+1)`, sắp tăng theo chỉ số ô. `generateTerrain(seed, data)` trả riêng `model` đúng chữ ký hợp đồng. `TERRAIN_GEN_VERSION = 1`.
- **Digest địa hình:** FNV-1a 64 theo byte (`core/digest.ts › Fnv1a64`, 4 limb 16-bit, không BigInt), cho kết quả trùng `fnv1a64` trên cùng dãy byte. Mỗi giá trị băm thành 4 byte little-endian, theo thứ tự `width, height, elevation, moisture, biome, downstream, flow, qi, cellLocation`.
- **Tham số:** `minSiteSpacing = 8`, `minVeinSpacing = 10`, `travelCostPerDay = 5`. `CONTENT_VERSION 0.3.0 → 0.4.0`.
- **Nới khoảng cách địa điểm:** s, ⌊s/2⌋, …, 1. Linh mạch: `minVeinSpacing`, rồi 0.
- **Chi phí cạnh:** min(`cost[u] + cost[v]`) trên các cặp ô biên kề nhau; `cost` là tổng `travelCost` từ ô neo tới ô (không tính ô neo).
- **Trụ sở** *(sửa sau review)*: tham số riêng `seatMountainBonus = 150`, chỉ cộng khi 1 trong 6 ô **kề** có tag `mountain`. Không tính ô neo vì `qi` của ô neo đã có `qiMountainBonus` (trước đây bị cộng hai lần).
- **Liên thông** *(sửa sau review)*: `buildSiteGraph` ném `DeterminismError` nếu MST có ít hơn `locationCount − 1` cạnh, kiểm tra **trước** khi thêm `extraEdges`.
- **Linh mạch:** roll `veinCount` trữ lượng và sản lượng như cũ, sắp giảm dần, gán theo hạng `qi` của ô neo (hòa → id).
- **Thứ tự gán loại:** bí cảnh trước (tổng khoảng cách hex tới 3 trụ sở lớn nhất, hòa → id), rồi 2 thị trấn (`travelCost` của biome ô neo nhỏ nhất, hòa → id).
- **Linh khí:** kẹp theo `cultivation.energyClampBp` ([6000, 16000]) cả lúc tạo lẫn sau thưởng linh mạch.
- **Tài nguyên:** `resourceStock = mulBp(roll, biome.resourceModBp)`.

| Mã | Thay đổi | Lý do |
|---|---|---|
| T1 | `WorldState.schemaVersion: 2`; thêm `terrainGenVersion: number`, `terrainDigest: string \| null` | Biết state được sinh bởi generator địa hình nào, phát hiện địa hình sinh lại bị lệch |
| T2 | `Location.biomeId: string \| null`, `Location.anchorCell: number \| null` | Biome của ô trung tâm (dùng cho hiển thị và Sử ký); điểm neo trên bản đồ. `null` = save cũ không có địa hình |
| T3 | Kiểu `TerrainModel` (không nằm trong snapshot) | Dữ liệu ô cho worldgen và render |
| T4 | `game-data/data/biomes.json` + `balance.worldgen.terrain` | Bảng tra biome và tham số địa hình là nội dung, không hard-code |
| T5 | Message worker `TERRAIN` | Gửi địa hình cho UI một lần, dạng transferable |
| T6 | Bất biến I12–I14 | Ràng buộc mới giữa địa điểm, linh mạch và địa hình |
| T7 | `travelDays` **suy ra** từ chi phí đường đi thay vì roll; `balance.worldgen.travelDays` trở thành khoảng kẹp | Không gian và số liệu nhất quán |

### TerrainModel

```ts
// packages/simulation/src/worldgen/terrain/types.ts — không thuộc WorldState, không vào snapshot.
interface TerrainModel {
  terrainGenVersion: number;        // = TERRAIN_GEN_VERSION của generator đã sinh ra nó
  width: number;                    // hex odd-r; ô i ↔ (x = i % width, y = floor(i / width))
  height: number;
  elevation: Int16Array;            // ≤ 0 = biển; > 0 = đất
  moisture: Uint16Array;            // 0..1000
  biome: Uint8Array;                // chỉ số vào gameData.biomes
  downstream: Int32Array;           // ô hạ lưu sau priority-flood; −1 = biển / cửa sông
  flow: Uint16Array;                // lưu lượng cộng dồn, bão hòa ở 65535
  qi: Int16Array;                   // địa khí; −1 = biển
  cellLocation: Int16Array;         // chỉ số địa điểm (0..13, theo thứ tự id) hoặc −1
  digest: string;                   // FNV-1a 64 (ADR-11) trên mọi mảng trên + kích thước
}
```
- `generateTerrain(seed: string, data: GameData): TerrainModel` là hàm thuần. Cấm số thực trong mọi giá trị trung gian. Chia lấy nguyên qua `floorDiv` của `core/math.ts`.
- `generateWorld` gọi `generateTerrain` trước, sau đó gán `state.terrainGenVersion = model.terrainGenVersion` và `state.terrainDigest = model.digest`.
- Kích thước truyền qua worker với lưới 64×48: khoảng 3 072 × 15 byte ≈ 46 KB, transferable nên không copy.

### Game-data

```ts
// biomes.json — chỉ số trong mảng = giá trị trong TerrainModel.biome (thứ tự là một phần của TERRAIN_GEN_VERSION).
// W3: 13 biome (Biển, Hoang Nguyên, Thảo Nguyên, Đầm Lầy, Đồi Đá, Rừng, Rừng Rậm, Cao Nguyên, Núi Rừng,
// Vân Sơn, Núi Đá, Núi Tuyết, Tử Khí Đầm). GameData.biomes giữ nguyên thứ tự file.
interface BiomeDef {
  id: string;                       // 'bien', 'rung_ram', 'nui_tuyet', 'tu_khi_dam' ...
  name: string;                     // tiếng Việt, hiển thị
  travelCost: number;               // chi phí qua 1 ô, số nguyên 0..20; 0 = không đi được (biển)
  energyModBp: number;              // [−5000, 5000]; cộng vào spiritualEnergyBp của địa điểm có anchorCell thuộc biome này
  resourceModBp: number;            // hệ số trữ lượng tài nguyên khởi tạo, kẹp [5000, 20000]
  tags: ('water' | 'mountain' | 'forbidden')[];
  color: string;                    // '#rrggbb', chỉ UI dùng
}

// balance.json › worldgen.terrain — phần W2 đã triển khai (Zod ở game-data/src/index.ts)
interface TerrainParams {
  width: number; height: number;                 // MVP 64 × 48
  noiseCellSize: number; octaves: number;        // fbm value noise, đơn vị tọa độ của cellPoint (8 × 7 mỗi ô)
  noiseAmplitude: number;                        // biên độ noise độ cao
  landTargetBp: number;                          // tỉ lệ ô trên mực nước biển; thay "landBias" cố định
                                                 // (độ cao được dịch theo phân vị → 62–66 % đất trên 100 seed)
  edgeFalloff: number; seaLevel: number;
  ridgeCount: [number, number];                  // số long mạch (núi) [min, max]
  ridgeLength: [number, number];                 // số bước đi ngẫu nhiên mỗi long mạch
  ridgeHeight: number; ridgeFalloffPerStep: number; // độ cao thêm = ridgeHeight − bước × falloff, điều biến noise ×[0,5; 1,5)
  rainCellSize: number;                          // noise mưa: mỗi ô đất góp 1..8 đơn vị lưu lượng
  riverFlowThreshold: number;
  moistureCellSize: number;
  moistureWaterBonus: number;                    // ≤ 1000; thưởng ẩm cạnh biển/sông
  moistureWaterFalloff: number;                  // giảm mỗi bước hex
  // — W3 (đã triển khai) —
  elevationBandsBp: number[];                    // ngưỡng theo PHÂN VỊ ô đất (Bp), tăng nghiêm ngặt trong (0, 10000);
  moistureBandsBp: number[];                     //   thay ngưỡng tuyệt đối → núi luôn ≈ 22 % đất trên 100 seed
  biomeMatrix: string[][];                       // [dải độ cao][dải ẩm] → BiomeDef.id; chỉ biome đất (travelCost > 0)
  waterBiomeId: string;                          // biome có tag 'water', travelCost = 0
  forbiddenBiomeId: string;                      // biome có tag 'forbidden' (vùng cấm)
  forbiddenOnBiomes: string[];                   // vùng cấm chỉ phủ lên các biome nền này…
  forbiddenNoiseCellSize: number;                // …tại ô có fbm('forbidden') ≥ forbiddenThreshold
  forbiddenThreshold: number;                    // 0..65535
  qiElevationPoints: number;                     // qi = hạng độ cao trong ô đất × points / số ô đất
  qiFlowWeight: number; qiFlowCap: number;       //    + min(cap, flow × weight)
  qiMountainBonus: number;                       //    + thưởng nếu biome có tag 'mountain'
  qiNoiseAmplitude: number; qiNoiseCellSize: number; // + noise nhỏ; kẹp [0, 32767]; biển = −1
  // — W4 —
  minSiteSpacing: number;                        // khoảng cách hex tối thiểu giữa địa điểm
  minVeinSpacing: number;
  seatMountainBonus: number;                     // thưởng điểm trụ sở khi một ô kề ô neo là núi
  travelCostPerDay: number;                      // travelDays = clamp(floorDiv(cost, k), travelDays[0], travelDays[1])
}
```
Giữ nguyên: `locationCount`, `extraEdges`, `veinCount`, `minSeatDistance`, các khoảng roll trữ lượng. `travelDays` chuyển thành khoảng kẹp.

### Quy tắc worldgen v2 (thay 09 §14 ở phần đồ thị)
1. Địa điểm chỉ đặt trên **khối đất liên thông lớn nhất** (`travelCost > 0`), cách nhau ≥ `minSiteSpacing`. Chọn tham lam theo điểm số, tie-break theo chỉ số ô.
2. Cạnh = các cặp vùng kề nhau. Chọn **MST** (tie-break `(cost, idA, idB)`) + `extraEdges` cạnh còn lại rẻ nhất. Đồ thị vẫn liên thông và đối xứng (I7).
3. Trụ sở: điểm = `qi` + thưởng kề tag `mountain`, vẫn ràng buộc `minSeatDistance` theo hop. Linh mạch giữ cấu trúc hiện tại (`generate.ts` bước 4): 1 linh mạch tranh chấp theo 09 §9 + 1 linh mạch ở mỗi trụ sở. Các linh mạch còn lại (tới `veinCount`) là địa điểm hoang dã có `qi` cao nhất, cách các linh mạch khác ≥ `minVeinSpacing` ô. Nếu không đủ ứng viên thì nới ràng buộc khoảng cách một cách tất định, như `minSeatDistance`.
4. Bí cảnh: địa điểm không chủ, không linh mạch, có `anchorCell` xa trụ sở nhất (tổng khoảng cách hex). Thị trấn: địa điểm không chủ, không linh mạch, `travelCost` thấp nhất.
5. `spiritualEnergyBp = roll(spiritualEnergyBp) + biome.energyModBp (+ veinEnergyBonusBp)`, kẹp [6000, 16000]. Tài nguyên khởi tạo nhân `resourceModBp`.
6. Ô có tag `forbidden` (vùng cấm) chỉ ảnh hưởng chi phí đường đi. Địa điểm không bao giờ đặt trên ô `forbidden` trong MVP.

### Protocol worker (bổ sung)

```ts
// WorkerToUi, gửi ngay sau READY (khởi tạo hoặc LOAD) khi terrainGenVersion > 0
| { type: 'TERRAIN'; status: 'ok'; terrain: TerrainModel }
| { type: 'TERRAIN'; status: 'unavailable'; reason: 'legacy_save' | 'digest_mismatch' }
```
`unavailable` → UI dùng bố cục lực đẩy-kéo (`layout.ts`) và hiện cảnh báo nhỏ. Simulation không bị ảnh hưởng.
View model: `LocationView` thêm `biomeName: string | null` và `anchorCell: number | null`.

### Migration v1 → v2
`MIGRATIONS[1]`: đặt `terrainGenVersion = 0`, `terrainDigest = null`, mỗi `Location` thêm `biomeId = null` và `anchorCell = null`. `terrainGenVersion = 0` nghĩa là "đồ thị cũ, không có địa hình". Save v1 vẫn chơi tiếp được với bản đồ kiểu cũ. `SaveFile.schemaVersion` đi theo snapshot.

## Kiểu cơ bản

```ts
type EntityId = string;      // có tiền tố, xem ADR-12
type Day = number;           // số nguyên ≥ 0
type Fx = number;            // ×1000
type Bp = number;            // 10000 = 100%
type Stat = number;          // 0..100

type Realm = 'qi' | 'foundation' | 'golden_core';
type Stage = 'early' | 'middle' | 'late' | 'perfect';
type Severity = 'critical' | 'important' | 'info';
type Visibility = 'public' | 'faction' | 'witnesses' | 'secret';
type FactionRank = 'leader' | 'elder' | 'disciple';

interface Sfc32State { a: number; b: number; c: number; d: number } // uint32
```

## WorldState

```ts
interface WorldState {
  schemaVersion: 2;                                // v2: ADR-16
  contentVersion: string;
  seed: string;
  terrainGenVersion: number;                       // v2; 0 = save cũ không có địa hình
  terrainDigest: string | null;                    // v2; digest TerrainModel lúc sinh
  day: Day;
  playerId: EntityId;
  gameOver: { day: Day; cause: DeathCause; eventId: EntityId } | null;

  rng: Record<string, Sfc32State>;                 // tạo lười theo streamKey
  counters: { action: number; event: number; causal: number; dispute: number };
  eventSeq: number;                                // seq của event cuối đã phát
  lastCommandSeq: number;                          // chống lệnh trùng

  locations: Record<EntityId, Location>;
  spiritVeins: Record<EntityId, SpiritVein>;
  characters: Record<EntityId, Cultivator>;
  factions: Record<EntityId, Faction>;
  actions: Record<EntityId, ScheduledAction>;      // chỉ action status = 'running'
  disputes: Record<EntityId, Dispute>;             // đang diễn ra
  causalRecords: Record<EntityId, CausalRecord>;
  pendingNews: NewsItem[];                         // sắp theo (deliverDay, eventSeq, recipientId)
  pendingChoices: PlayerChoice[];                  // lựa chọn đang chờ người chơi
  ledger: { minted: Record<MintSource, number>; burned: Record<BurnSink, number> };
}

type MintSource = 'vein_extraction' | 'location_gather' | 'location_regen';
type BurnSink = 'cultivation' | 'breakthrough' | 'faction_upkeep' | 'unclaimed_estate' | 'pill_consumed';
```

Ghi chú: linh thạch khai thác từ linh mạch là **chuyển** từ trữ lượng tự nhiên sang ví, nhưng vẫn ghi `minted` để đối soát dòng tiền vào nền kinh tế lưu thông. Bất biến tổng xem cuối tài liệu.

## Thế giới

```ts
interface Location {
  id: EntityId;
  name: string;
  kind: 'sect_seat' | 'wild' | 'town' | 'secret_realm';
  edges: { to: EntityId; travelDays: number }[];   // sắp theo `to`, đối xứng; v2: suy ra từ chi phí địa hình
  biomeId: string | null;                          // v2; biome của anchorCell, null = save cũ
  anchorCell: number | null;                       // v2; chỉ số ô trung tâm trong TerrainModel
  spiritualEnergyBp: Bp;                           // hệ số linh khí, kẹp [6000, 16000]
  resourceStock: number;                           // linh thạch nhặt được, hữu hạn
  resourceRegenPerMonth: number;
  veinId: EntityId | null;
  ownerFactionId: EntityId | null;                 // NGUỒN DUY NHẤT về lãnh địa
  daoMarkIds: EntityId[];                          // Đạo Ngân (MVP: tối đa 1 tác động)
}

interface SpiritVein {
  id: EntityId;
  locationId: EntityId;
  name: string;
  reserve: number;                                 // trữ lượng còn lại
  yieldPerMonth: number;                           // khai thác tối đa mỗi tháng
}
```

## Nhân vật

```ts
interface Cultivator {
  id: EntityId;
  name: string;
  isPlayer: boolean;
  alive: boolean;
  deathDay: Day | null;
  deathCause: DeathCause | null;
  birthDay: Day;                                   // có thể âm với NPC khởi tạo lớn tuổi
  lifespanDays: number;

  locationId: EntityId;
  factionId: EntityId | null;                      // NGUỒN DUY NHẤT về thành viên
  factionRank: FactionRank | null;

  realm: Realm;
  stage: Stage;
  progress: Fx;                                    // trong tầng hiện tại
  spiritRootBp: Bp;                                // linh căn, kẹp [5000, 20000]
  techniqueId: string | null;                      // tham chiếu game-data
  insight: Stat;                                   // ngộ tính
  foundation: Stat;                                // căn cơ
  daoHeart: Stat;                                  // đạo tâm
  injury: Stat;                                    // 0 = khỏe; ≥ 100 = tử vong
  spiritStones: number;                            // số dư khả dụng (không gồm phần đã giữ chỗ)
  breakthroughCooldownUntil: Day;

  personality: { ambition: Stat; greed: Stat; loyalty: Stat; riskTolerance: Stat };
  relations: Record<EntityId, number>;             // thiện cảm -100..100, chỉ lưu khác 0
  memory: MemoryEntry[];                           // tối đa 32
  plan: NpcPlan | null;                            // null với người chơi
  nextReviewDay: Day;
  needsReview: boolean;
}

type DeathCause = 'old_age' | 'injury' | 'breakthrough' | 'dispute' | 'duel';

interface MemoryEntry { eventId: EntityId; learnedDay: Day; salience: Stat }

interface NpcPlan {
  goal: GoalType;
  score: number;                                   // điểm utility lúc chọn
  committedUntil: Day;                             // hysteresis
  steps: PlannedStep[];                            // 1..3
}
type GoalType = 'cultivate' | 'gather' | 'duty' | 'seek_energy' | 'breakthrough'
              | 'heal' | 'join_faction' | 'confront';
interface PlannedStep { actionType: ActionType; targetId?: EntityId; durationDays: number }
```

## Tông môn

```ts
interface Faction {
  id: EntityId;
  name: string;
  seatLocationId: EntityId;
  leaderId: EntityId | null;                       // null = trống chức
  treasury: number;                                // không âm
  stability: Stat;
  relations: Record<EntityId, number>;             // -100..100 với tông môn khác
  strategy: 'consolidate' | 'expand' | 'defend' | 'recruit';
  strategyChosenDay: Day;
  disputeCooldowns: Record<EntityId, Day>;         // không khởi tranh chấp với X trước ngày này
  dissolved: boolean;
}
// Selector: territoryIds(state, f) và memberIds(state, f) — sắp theo id.
```

## Nội dung tĩnh (game-data, không nằm trong snapshot)

```ts
interface Technique {
  id: string;
  name: string;
  minRealm: Realm;
  minSpiritRootBp: Bp;
  speedBp: Bp;                                     // kẹp [5000, 15000]
  stonesPerMonth: number;
  breakthroughModBp: number;                       // cộng/trừ vào tỉ lệ đột phá
  factionId: string | null;                        // công pháp riêng của tông môn
}
```
Ngoài ra: `realms.json` (ngưỡng, tuổi thọ, sức mạnh), `names.json`, `factions.json`, `balance.json`, `curves.json` (bảng tra phi tuyến).

## Hành động

```ts
type ActionType = 'travel' | 'cultivate' | 'seclusion' | 'gather' | 'duty'
                | 'heal' | 'breakthrough' | 'join_faction' | 'confront';

interface ScheduledAction {
  id: EntityId;
  actorId: EntityId;
  type: ActionType;
  targetId?: EntityId;
  locationId: EntityId;
  startDay: Day;
  dueDay: Day;
  priority: number;                                // nhỏ hơn xử lý trước
  seq: number;                                     // = counters.action lúc tạo
  status: 'running' | 'completed' | 'cancelled' | 'failed';
  reservedCosts: { spiritStones: number };         // đã trừ khỏi ví lúc tạo
  cancellationPolicy: 'refund_full' | 'refund_prorated' | 'refund_half_remaining' | 'none';
  source: 'player' | 'npc' | 'faction';
  meta: { progressGained: Fx };                    // dùng cho xuất quan sớm
}
```

Vòng đời: tạo → trừ ví sang `reservedCosts` (một lần) → `running` → kết thúc đúng một trong `completed | cancelled | failed` → bị xóa khỏi `actions` và ghi event. Không có đường chuyển nào khác.

## Tranh chấp

```ts
interface Dispute {
  id: EntityId;
  veinId: EntityId;
  attackerId: EntityId;
  defenderId: EntityId;
  phase: 'tension' | 'skirmish' | 'settlement';
  startDay: Day;
  skirmishCount: number;                           // 0..3
  attackerScore: number;
  defenderScore: number;
  causeEventId: EntityId;
}
```

## Sự kiện, nhân quả, tin tức

```ts
interface WorldEvent {
  id: EntityId;
  seq: number;
  day: Day;
  type: WorldEventType;
  severity: Severity;
  visibility: Visibility;
  actorId?: EntityId;
  targetId?: EntityId;
  factionIds: EntityId[];
  locationId?: EntityId;
  causeEventId?: EntityId;
  witnessIds: EntityId[];                          // chụp lúc xảy ra
  chronicle: boolean;                              // có đưa vào Sử ký không
  payload: WorldEventPayload;                      // union theo type, có Zod
}

interface CausalRecord {
  id: EntityId;
  sourceEventId: EntityId;
  holderId: EntityId;                              // người mang ân/oán
  towardId: EntityId;                              // đối tượng
  type: 'favor' | 'grudge' | 'debt' | 'betrayal';
  intensity: Stat;
  amount?: number;                                 // dùng cho debt
  createdDay: Day;
  resolvedByEventId: EntityId | null;
}

interface NewsItem { eventId: EntityId; recipientId: EntityId; deliverDay: Day }

interface PlayerChoice {
  id: EntityId;
  eventId: EntityId;
  createdDay: Day;
  expiresDay: Day;                                 // hết hạn → áp dụng defaultOptionId
  options: { id: string; label: string }[];
  defaultOptionId: string;
}
```

Danh sách `WorldEventType` MVP: `world_created`, `character_born`, `character_died`, `stage_advanced`, `breakthrough_succeeded`, `breakthrough_failed`, `action_completed`, `action_failed`, `action_cancelled`, `faction_joined`, `faction_left`, `leader_succeeded`, `leader_vacant`, `faction_dissolved`, `strategy_changed`, `dispute_started`, `dispute_skirmish`, `dispute_ended`, `territory_transferred`, `stipend_shortfall`, `duel_fought`, `dao_mark_left`, `seclusion_started`, `seclusion_ended`, `choice_resolved`.

## Lệnh người chơi

```ts
interface PlayerCommand {
  commandId: string;                               // UUID do UI sinh, chỉ để log
  seq: number;                                     // tăng dần, quyết định idempotency
  issuedAtDay: Day;                                // worker đóng dấu = ngày áp dụng
  actorId: EntityId;                               // phải = playerId
  payload:
    | { type: 'START_ACTION'; actionType: ActionType; targetId?: EntityId; durationDays: number }
    | { type: 'CANCEL_ACTION'; actionId: EntityId }
    | { type: 'RESOLVE_CHOICE'; choiceId: EntityId; optionId: string };
}
```
Quy tắc: `seq ≤ lastCommandSeq` → bỏ qua, không lỗi (idempotent). Lệnh sai điều kiện → event `command_rejected` không đổi state khác ngoài `lastCommandSeq`. Command log được ghi để replay.

## Bất biến (kiểm tra bằng `checkInvariants`)
1. Mọi ID duy nhất; mọi tham chiếu trỏ tới thực thể tồn tại (nhân vật chết vẫn tồn tại với `alive = false`).
2. Mọi số là safe integer; `spiritStones`, `treasury`, `reserve`, `resourceStock` ≥ 0; Stat trong [0, 100].
3. Mỗi nhân vật sống có **tối đa 1** action `running`; nhân vật chết có **0**.
4. `Faction.leaderId` (nếu khác null) là thành viên sống của tông môn đó với `factionRank = 'leader'`; mỗi tông môn tối đa 1 leader.
5. Mỗi linh mạch thuộc đúng một địa điểm; mỗi địa điểm tối đa 1 chủ (bảo đảm bởi cấu trúc).
6. Tối đa 1 `Dispute` đang diễn ra cho mỗi linh mạch.
7. Đồ thị địa điểm liên thông, cạnh đối xứng.
8. **Bảo toàn linh thạch:** Σ ví + Σ kho + Σ `reservedCosts` + Σ `reserve` + Σ `resourceStock` = tổng ban đầu + Σ regen − Σ burned.
9. `realm/stage/progress` hợp lệ: `progress < threshold(realm, stage)` trừ tầng `perfect` (được bằng đúng ngưỡng).
10. `gameOver ≠ null` ⇔ người chơi `alive = false`.
11. `eventSeq = counters.event`, `action.seq ≤ counters.action` (bổ sung Phase 1).

Bất biến v2 (ADR-16). Chỉ áp dụng khi `terrainGenVersion > 0`. Kiểm tra cần `TerrainModel`, nên chạy trong test worldgen và khi tải save, **không** chạy mỗi tick:

12. `generateTerrain(seed).digest = terrainDigest`, và mọi `anchorCell` là ô đất (`travelCost > 0`), không có tag `forbidden`, và `cellLocation[anchorCell]` trỏ đúng địa điểm đó.
13. Mọi `anchorCell` nằm trên cùng một khối đất liên thông. `Location.biomeId = biomes[biome[anchorCell]].id`.
14. Mọi `travelDays` nằm trong `balance.worldgen.travelDays`. Mỗi linh mạch "tự do" (không phải linh mạch tranh chấp, không ở trụ sở) có `qi[anchorCell]` ≥ `qi` của mọi địa điểm hoang dã không có linh mạch, trừ khi bị loại vì `minVeinSpacing`.
