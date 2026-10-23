# 07 — Quyết định kiến trúc (ADR) — Phase 0

Trạng thái: **Đã duyệt** bởi chủ dự án ngày 2026-10-24 (duyệt toàn bộ phương án khuyến nghị).
Tài liệu này thay thế các điểm mâu thuẫn trong 02–04. Khi có xung đột, thứ tự ưu tiên: 07 → 08 → 09 → tài liệu gốc.

## ADR-01 — Stack và monorepo
- **pnpm workspaces** (pnpm 9, Node ≥ 22; máy dev hiện có Node 24).
- TypeScript strict (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- Vite + React cho `apps/web`; Zustand chỉ giữ state giao diện; Zod tại ranh giới; Dexie cho IndexedDB; Vitest cho test.
- Canvas 2D cho bản đồ. PixiJS chỉ xét lại nếu benchmark render chứng minh cần.
- Cấu trúc:
  ```
  apps/web/              UI, worker adapter, presentation, view model
  packages/shared/       Zod schema, worker protocol, kiểu Command/Event
  packages/simulation/   core, cultivation, npc, factions, economy, causality, history, worldgen
  packages/game-data/    JSON nội dung + contentVersion
  tools/headless/        CLI run / replay / bench
  tests/                 determinism, scenario, invariant, benchmark
  ```
- Hướng phụ thuộc: `web → shared → simulation → game-data`. `simulation` không import React, DOM, Worker, Dexie, `Date`, `performance`, `crypto`.

## ADR-02 — Toán học trong domain: số nguyên / fixed-point
- Mọi số trong `WorldState` là **safe integer** (`Number.isSafeInteger`).
- Hai đơn vị chuẩn:
  - `Fx` — fixed-point ×1000 (tu vi, tiến độ). Hiển thị = `Fx / 1000`.
  - `Bp` — basis point, `10000 = 100%` (tỉ lệ, hệ số nhân).
- Phép nhân hệ số: `mulBp(x, bp) = Math.floor(x * bp / 10000)`; yêu cầu `x * bp < 2^53` (assert trong debug).
- **Cấm** trong `packages/simulation`: `Math.random`, `Math.pow`, `Math.exp`, `Math.log*`, `Math.sin/cos/tan`, `Math.sqrt`, `**`, `Date`, `performance`. Đường cong phi tuyến dùng **bảng tra + nội suy tuyến tính** đặt trong `game-data`.
- Chặn bằng ESLint `no-restricted-properties` / `no-restricted-syntax` + test quét mã nguồn.

## ADR-03 — RNG: sfc32 nhiều luồng
- Thuật toán sfc32 (state 4 × uint32, serialize được dưới dạng `{a,b,c,d}`).
- Mỗi luồng khởi tạo từ `hash32x4(seed + "|" + streamKey)` (cyrb128), sau đó bỏ 12 giá trị đầu.
- Luồng được tạo **lười** khi lần đầu dùng, lưu trong `WorldState.rng[streamKey]`.
- Khóa luồng: `worldgen`, `plan:<characterId>`, `breakthrough:<characterId>`, `dispute:<disputeId>`, `duel:<actionId>`, `event:<eventType>`.
- API: `nextU32`, `nextInt(maxExclusive)` (rejection sampling, không modulo bias), `rollBp(chanceBp)`, `pickWeighted`, `shuffleStable`.
- Mục đích: thêm nội dung/NPC không làm lệch RNG của thực thể khác.

## ADR-04 — Lịch
- 1 tick = 1 ngày. **30 ngày/tháng, 12 tháng/năm, 360 ngày/năm, quý = 90 ngày.**
- `day = 0` là Năm 1, Tháng 1, Ngày 1 của kỷ nguyên Thiên Khuyết.
- Ranh giới tháng: `day % 30 === 0`; ranh giới quý: `day % 90 === 0` (không xử lý ở `day = 0`).

## ADR-05 — Tốc độ thời gian
- Pause = 0; 1× = 1 ngày/giây; 10× = 10 ngày/giây; 100× = 100 ngày/giây.
- Skip Until = chạy tối đa tốc lực theo lô (mặc định 30 ngày/lô), nhả luồng giữa các lô để nhận PAUSE/COMMAND.
- Thời gian thực chỉ quyết định **tốc độ gọi tick**, không bao giờ là đầu vào của domain.

## ADR-06 — Interrupt khi bế quan
- Critical interrupt khi người chơi đang bế quan: **dừng đồng hồ**, hiện hộp thoại:
  - **Tiếp tục bế quan** — không mất gì.
  - **Xuất quan sớm** — giữ tiến độ đã tích lũy trừ 10% phần tu vi tăng trong lần bế quan này; hoàn 50% linh thạch đã giữ chỗ cho số ngày còn lại.
- Sự kiện cần người chơi tham gia khi đang bế quan (ví dụ tông môn gọi tham chiến) được coi là **vắng mặt**, không bị phạt trung thành.

## ADR-07 — Người chơi chết
- **Game over**: `WorldState.gameOver = { day, cause, eventId }`, simulation từ chối mọi lệnh tiếp theo.
- *(Làm rõ khi triển khai Phase 2)* Thế giới vẫn tiếp tục vận hành nếu tick tiếp được gọi (NPC, tông môn không đóng băng); interrupt `game_over` chỉ phát đúng tick người chơi chết. Nếu đóng băng thế giới, action NPC sẽ quá hạn và vi phạm bất biến I3.
- Màn hình Sử ký hiển thị toàn bộ lịch sử; người chơi có thể bắt đầu seed mới. Không có cơ chế kế thừa trong MVP.

## ADR-08 — Truyền tin tối giản
- Mỗi event có `visibility`: `public` | `faction` | `witnesses` | `secret`.
- `witnesses`: nhân vật cùng địa điểm biết ngay. `faction`: thành viên tông môn của actor/target biết ngay. `public`: mọi người biết sau **7 ngày**. `secret`: chỉ actor/target.
- Tin được xếp hàng trong `pendingNews` và giao ở bước 7 của tick. NPC chỉ phản ứng với event có trong `memory`.

## ADR-09 — Tranh chấp linh mạch theo quý, 3 giai đoạn
- Khiêu khích (1 quý) → Giao tranh (1–3 quý) → Kết thúc (thắng / giữ được / đình chiến).
- Chuyển quyền sở hữu là **một hàm nguyên tử duy nhất** (`transferLocationOwnership`) và một event.
- Chi tiết công thức ở `09_SIM_RULES_V0_3.md`.

## ADR-10 — Event log tách khỏi snapshot
- Snapshot **không** chứa toàn bộ history; chỉ chứa `eventSeq` (con trỏ).
- Event log lưu theo chunk 1000 event trong IndexedDB; command log lưu riêng để replay.
- Chống lệnh trùng bằng `lastCommandSeq` (số tăng dần) thay cho danh sách `processedCommandIds`.

## ADR-11 — Digest chuẩn hóa
- Canonical JSON: sắp xếp key đệ quy, mảng giữ nguyên thứ tự, không có `undefined`, chỉ số nguyên.
- Băm **FNV-1a 64-bit** (BigInt, không phụ thuộc thư viện). Dùng cho test, không dùng cho bảo mật.
- `digest(state)` chỉ tính ở checkpoint (test, save), không tính mỗi tick.

## ADR-12 — Định danh
- ID có tiền tố và đệm số, không bao giờ là chuỗi số thuần: `loc_001`, `chr_0000` (người chơi), `chr_0001…`, `fac_01`, `vein_01`, `act_000001`, `evt_00000001`, `cr_000001`, `dsp_0001`.
- Bộ đếm ID nằm trong `WorldState.counters`. Mọi vòng lặp trên `Record` phải đi qua `sortedKeys()`.

## ADR-13 — Một nguồn sự thật cho quan hệ sở hữu
- `Location.ownerFactionId` là nguồn duy nhất cho lãnh địa; `territoryIds` là **selector** suy ra.
- `Cultivator.factionId` là nguồn duy nhất cho thành viên; `memberIds` là **selector** suy ra.
- Tránh hai nơi lưu cùng một sự thật → loại bỏ lớp lỗi "sở hữu kép".

## ADR-14 — Kinh tế đóng có sổ cái
- Linh thạch chỉ **được tạo** từ: trữ lượng linh mạch, trữ lượng tài nguyên địa điểm, tái sinh tài nguyên theo tháng. Chỉ **bị hủy** khi: tiêu hao tu luyện, đột phá, duy trì tông môn, tài sản vô chủ.
- `WorldState.ledger` ghi tổng tạo/hủy theo nguồn. Bất biến: tổng linh thạch hiện có = ban đầu + tạo − hủy.

## ADR-15 — Lưu/tải
- `schemaVersion = 1`, `contentVersion` lấy từ `game-data`. Bảng `migrations[v]` tồn tại từ v1 (rỗng).
- Dexie: bảng `saves`, `eventChunks`, `commandLogs`; ghi **một transaction** cho cả ba.
- Export: một file JSON `{ format: "tmtg-save", schemaVersion, contentVersion, snapshot, events, commands, checksum }`. Import: Zod → checksum → migration → `checkInvariants` → hoặc báo "Save hỏng" kèm lý do.
- Tự lưu: khi Skip Until kết thúc, khi Pause, khi tab ẩn (`visibilitychange`) — logic thuộc UI, không ảnh hưởng domain.

## ADR-16 — Địa hình số nguyên sinh trong worldgen
Trạng thái: **Đã duyệt** bởi chủ dự án ngày 2026-10-24 (kiến trúc §2 của `WORLD_MAP_TECH_PLAN.md`). Nghiên cứu nền ở `ASSET_RESEARCH.md`. Hợp đồng dữ liệu ở `08_DATA_CONTRACTS_V0_3.md` › "Bổ sung ADR-16".

**Bối cảnh.** Đồ thị 14 địa điểm hiện tại không gắn với không gian nào: `travelDays` được roll độc lập, bản đồ chỉ là bố cục lực đẩy-kéo. Linh mạch, trụ sở, bí cảnh không có lý do địa lý. Các thư viện bản đồ đã khảo sát (mapgen4, FMG) dùng số thực và lượng giác, hoặc ghi đè `Math.random`, nên vi phạm ADR-02/03. Labyrinthos.js theo AGPL-3.0.

**Quyết định.**
- Địa hình được **tự triển khai** trong `packages/simulation/src/worldgen/terrain/`, chỉ dùng số nguyên. Không chép code từ repo bên ngoài và không thêm dependency.
- Lưới **hex odd-r** kích thước `W×H` lấy từ `balance.worldgen.terrain` (MVP: 64×48 = 3 072 ô). Không dùng Voronoi/Delaunay vì chúng cần hình học số thực.
- Pipeline cố định, hữu hạn bước: noise → độ cao (+ long mạch) → priority-flood và sông → độ ẩm → biome (bảng tra) → địa khí (`qi`) → chọn địa điểm → chia vùng bằng Dijkstra đa nguồn → đồ thị địa điểm (MST + `extraEdges` cạnh rẻ nhất) → `travelDays`.
- **Hàm thuần** `generateTerrain(seed, data): TerrainModel`. Kết quả phụ thuộc duy nhất vào `seed`, `TERRAIN_GEN_VERSION` và các tham số địa hình trong game-data.
- **Simulation chỉ tiêu thụ kết quả suy ra.** Sau worldgen, tick không bao giờ đọc ô địa hình. Mọi ảnh hưởng của địa hình được "nướng" vào `Location` (cạnh, `travelDays`, `spiritualEnergyBp`, tài nguyên, `biomeId`) và `SpiritVein` ngay lúc sinh.
- **`TerrainModel` không nằm trong snapshot.** `WorldState` chỉ lưu `terrainGenVersion` và `terrainDigest`. Worker sinh lại địa hình khi `INIT`/`LOAD` để hiển thị. Nếu digest sinh lại không khớp (generator hoặc tham số đã đổi) thì UI rơi về bố cục lực đẩy-kéo và hiện cảnh báo. Simulation không bị ảnh hưởng vì không phụ thuộc địa hình sau worldgen.
- **RNG.** Noise là hàm hash không trạng thái (`Math.imul`, salt từ `cyrb128(seed + "|terrain:" + layer)`). Các lựa chọn rời rạc (đỉnh long mạch, tie-break) dùng một sfc32 **cục bộ**, khởi tạo từ `hash32x4(seed + "|worldgen:terrain")` và **không ghi** vào `WorldState.rng`, để việc sinh lại khi tải save không đổi state. Luồng `worldgen` hiện có giữ nguyên cho tên, tông môn, NPC.
- **Lãnh thổ** vẫn theo ADR-13. Quyền sở hữu của một ô được suy ra bằng `cellLocation[i] → Location.ownerFactionId`, không lưu thêm state.
- **Phạm vi MVP giữ nguyên**: 14 địa điểm, 3 tông môn, 5 linh mạch, 1 bí cảnh, 2 thị trấn, 4 `LocationKind`. *Vùng cấm* chỉ là tag biome (chi phí đi lại cao hoặc không đi được), không có cơ chế mới.
- **Render** thuộc `apps/web` (Canvas 2D theo ADR-01). Số thực được phép ở đây vì chỉ mang tính trang trí: làm mềm bờ biển, sông cong, hillshade. Lớp nền bake một lần thành `ImageBitmap`. Lớp lãnh thổ bake lại khi có event `territory_transferred`.

**Hệ quả.**
- `schemaVersion 1 → 2` (migration ở 08). `CONTENT_VERSION` tăng khi thêm `biomes.json`.
- Mọi digest seed và baseline `bench-results/` cũ **mất hiệu lực**, phải tạo lại một lần ở W5. Test determinism vẫn giữ dạng "2 lần chạy cùng seed = cùng digest".
- Đổi bất kỳ tham số địa hình nào (game-data hoặc code) **bắt buộc** tăng `TERRAIN_GEN_VERSION`. Test golden digest địa hình cho một tập seed cố định sẽ bắt thay đổi vô tình.
- Ngân sách: `generateTerrain` ≤ 50 ms trong worker cho lưới MVP (prototype đo 12–13 ms trên Node 24). Tick/giây không được giảm quá 5 % so với baseline mới.
- Cân bằng: `travelDays` vẫn kẹp trong `balance.worldgen.travelDays` [3, 15] và mật độ cạnh giữ như cũ (cây khung + 4). Mục tiêu "≥ 8/10 seed có tranh chấp trong 10 năm" (09 §9) phải được đo lại.

**Phương án bị loại**: xem `WORLD_MAP_TECH_PLAN.md` §7 (A–H).
