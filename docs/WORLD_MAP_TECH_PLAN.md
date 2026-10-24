# WORLD_MAP_TECH_PLAN — Kế hoạch kỹ thuật bản đồ thế giới

Phiên bản 0.2 · 2026-10-24 · Trạng thái: **kiến trúc §2 đã duyệt** (ADR-16). W0–W4 xong (2026-10-23): đồ thị địa điểm suy ra từ địa hình; schema v2, protocol `TERRAIN` và renderer chưa làm (W5–W7). Khi tài liệu này mâu thuẫn với 07/08, ưu tiên 07/08.
Dữ liệu nền: `ASSET_RESEARCH.md`. Theo `CLAUDE.md`, mọi thay đổi kiến trúc và cân bằng nền tảng cần được duyệt trước.

## 1. Hiện trạng và ràng buộc

| Hiện trạng | Tham chiếu |
|---|---|
| Thế giới là **đồ thị trừu tượng** 14 địa điểm: cây ngẫu nhiên + 4 cạnh thêm, `travelDays` ∈ [3, 15] được roll độc lập với không gian | `worldgen/generate.ts` §1, `balance.json › worldgen` |
| Bố cục bản đồ do lực đẩy-kéo trên main thread, chỉ để hiển thị | `apps/web/src/app/layout.ts` |
| Bản đồ vẽ bằng Canvas 2D: hình tròn/vuông/tam giác + đường thẳng | `MapCanvas.tsx` |
| Lãnh thổ = `Location.ownerFactionId` (một nguồn sự thật duy nhất) | ADR-13 |

Ràng buộc bắt buộc:
- **ADR-02**: trong `packages/simulation` cấm `Math.random/pow/exp/log*/sin/cos/tan/sqrt/hypot/fround…`, chỉ dùng số nguyên an toàn. `Math.imul` và `Math.floor` **được phép** (xem `eslint.config.js`).
- **ADR-03**: RNG sfc32 theo luồng. Thêm luồng mới không được làm lệch các luồng khác.
- **ADR-01**: Canvas 2D. Chỉ xét PixiJS khi benchmark chứng minh là cần.
- **11_TASK_BREAKDOWN**: không thêm package nếu chưa hỏi.
- Phạm vi MVP đã khóa: 1 khu vực, 14 địa điểm, 3 tông môn, 5 linh mạch, 1 bí cảnh, 2 thị trấn.

## 2. Kiến trúc đề xuất duy nhất cho MVP

> **"Địa hình hex số nguyên, tự triển khai, sinh trong worldgen; Simulation chỉ tiêu thụ đồ thị được suy ra từ địa hình."**

```
seed ──► packages/simulation/src/worldgen/terrain/   (số nguyên, tất định giữa mọi engine)
          hexGrid → noise → elevation → priorityFlood/rivers → moisture → biome
                 → qiField (địa khí) → chọn địa điểm → regions (Dijkstra đa nguồn)
                 → đồ thị địa điểm + travelDays
                          │
          ┌───────────────┴──────────────────┐
          ▼                                  ▼
  WorldState.locations / spiritVeins    TerrainModel (không lưu trong snapshot,
  (như hiện tại, thêm vài trường suy ra) tái sinh từ seed + terrainGenVersion)
          │                                  │
   tick hằng ngày (không bao giờ          sim.worker gửi một lần (TERRAIN,
   đọc tới ô địa hình)                    ArrayBuffer transferable khoảng 15–20 KB)
                                             ▼
                                apps/web: TerrainRenderer (Canvas 2D)
                                lớp nền bake 1 lần → ImageBitmap
                                lớp phủ: lãnh thổ, linh mạch, tranh chấp, Đạo Ngân, nhân vật
```

### 2.1 Lý do chọn
1. **Tôn trọng ADR-02 mà không cần ngoại lệ.** Toàn bộ địa hình là số nguyên (`Int16Array`/`Uint8Array`), dùng hash noise `Math.imul` + smoothstep fixed-point. Prototype ở `ASSET_RESEARCH §6` đã chứng minh: 3 072 ô mất 12–13 ms và digest trùng nhau qua nhiều lần chạy.
2. **Địa hình có ý nghĩa gameplay.** `travelDays` lấy từ chi phí đường đi qua núi, rừng, đầm. Linh mạch đặt ở nơi có địa khí cao. Trụ sở tông môn ưu tiên núi. Không gian và số liệu nhất quán với nhau, điều mà đồ thị hiện tại chưa có.
3. **Tick không chậm đi.** Tick vẫn chạy trên 14 `Location`. Benchmark Phase 3 (khoảng 33–39k tick/giây) giữ nguyên vì không có vòng lặp nào trên ô.
4. **Snapshot không phình.** `TerrainModel` là hàm thuần của `(seed, terrainGenVersion, game-data)`, nên snapshot chỉ cần lưu thêm `terrainGenVersion`.
5. **Không thêm dependency.** Không cần delaunator, simplex-noise, d3…
6. **Lãnh thổ động có sẵn mà không thêm state.** Ô → địa điểm (`cellLocation`) → `ownerFactionId`, tức là một selector thuần theo ADR-13.

### 2.2 Vì sao lưới hex thay vì Voronoi
Voronoi/Delaunay cần hình học số thực (`delaunator` + robust predicates), trái ADR-02 và là dependency mới. Hex cho 6 láng giềng đều nhau, khoảng cách cube nguyên và chỉ số mảng phẳng. Vẻ "hữu cơ" (bờ biển mềm, sông cong) được thêm **ở lớp render** trong `apps/web`, nơi dùng số thực là hợp lệ vì chỉ mang tính trang trí, không ảnh hưởng domain.

## 3. Thuật toán chi tiết (packages/simulation/src/worldgen/terrain/)

| Bước | File dự kiến | Thuật toán | Nguồn ý tưởng |
|---|---|---|---|
| Lưới | `hexGrid.ts` | Hex odd-r W×H (MVP 64×48 = 3 072 ô), `neighbors(i)`, `hexDistance(a,b)` qua tọa độ cube | Red Blob Games, *Hexagonal Grids* |
| Noise | `noise.ts` | `hash2(salt,x,y)` bằng `Math.imul` → value noise 16-bit, smoothstep fixed-point ×256, fbm 4 tầng biên độ 8/4/2/1. Salt = `cyrb128(seed + "|terrain:" + layer)` | tilemap-lab `noiseHash.js` (chỉ ý tưởng) |
| Độ cao | `elevation.ts` | fbm − falloff rìa (bậc hai, số nguyên) + **dãy núi**: trường khoảng cách BFS từ 2–4 "long mạch" (đỉnh chọn bằng luồng RNG `worldgen:terrain`), giảm dần theo bước có jitter | mapgen4 `calculateMountainDistance` |
| Sông | `hydrology.ts` | **Priority-flood** (heap nhị phân, tie-break theo index) → `downstream[i]`, thứ tự topo → cộng dồn `flow`. Ô có `flow ≥ riverThreshold` là sông | Barnes 2014; mapgen4 `assignFlow` |
| Độ ẩm | `climate.ts` | fbm ẩm + thưởng ẩm theo khoảng cách BFS tới sông/biển. **Bỏ** mô phỏng gió của mapgen4 trong MVP vì cần lượng giác | FMG `precipitation` (đơn giản hóa) |
| Biome | `biome.ts` + `game-data/data/biomes.json` | Bảng tra `[dải độ cao][dải ẩm] → biomeId`. Mỗi biome có `travelCost`, `energyModBp`, `resourceModBp`, `color` (màu chỉ dùng ở web) | FMG `biomesMatrix` |
| Địa khí | `qi.ts` | `qi = elev + min(cap, flow×k) + bonusNúi + nhiễu nhỏ` (số nguyên) | — |
| Địa điểm | `sites.ts` | Chỉ trên **khối đất liên thông lớn nhất**. Chọn tham lam theo điểm số, cách nhau ≥ `minSiteSpacing`. Loại địa điểm gán theo luật ở §4 | — |
| Vùng | `regions.ts` | Dijkstra đa nguồn, chi phí = `biome.travelCost` (biển không đi được) → `cellLocation[i]`. Hai vùng kề nhau tạo một cạnh với chi phí đường tốt nhất qua biên | FMG `states` expand (ý tưởng) |
| Đồ thị | `graph.ts` | Từ các cạnh vùng: **MST + `extraEdges` cạnh rẻ nhất** (giữ `extraEdges = 4` để cân bằng gần với hiện tại). `travelDays = clamp(floorDiv(cost, k), 3, 15)` | — |

Toàn bộ là hữu hạn bước, không có vòng "thử lại tới khi đúng" (giữ nguyên nguyên tắc của `generate.ts`).

## 4. Mở rộng tu tiên

| Tính năng | MVP (trong phạm vi đã khóa) | Sau MVP (cần duyệt riêng) |
|---|---|---|
| **Linh mạch** | 5 linh mạch đặt tại địa điểm có `qi` cao nhất, cách nhau ≥ N ô. Trữ lượng và sản lượng vẫn roll trong `balance.worldgen` nhưng được xếp hạng theo `qi` (mạch mạnh nhất ở nơi địa khí mạnh nhất). `spiritualEnergyBp` = base + `biome.energyModBp` | Linh mạch có "dòng chảy" dọc long mạch trên bản đồ, cạn dần theo `reserve` |
| **Tông môn** | Trụ sở: điểm = `qi` + kề núi + khoảng cách hop ≥ `minSeatDistance` (giữ luật hiện tại). Linh mạch tranh chấp vẫn tìm theo hop như cũ | Phong cách tông môn ảnh hưởng chọn địa thế (Huyết Sát chọn đầm, Thanh Vân chọn núi) |
| **Bí cảnh** | 1 bí cảnh tại ô có biome cực đoan (núi tuyết, rừng rậm) xa trụ sở nhất | Bản đồ nội thất bí cảnh tự sinh (BSP/cellular automata số nguyên). **Không** dùng Labyrinthos (AGPL) |
| **Vùng cấm** | Chỉ là **tag địa hình** (ô "tử khí" / hỏa sơn): chi phí đi cao, tức chỉ làm `travelDays` dài hơn. Không thêm cơ chế mới | `LocationKind = 'forbidden_zone'` có nguy hiểm, cơ duyên, thời gian mở/đóng |
| **Lãnh thổ động** | Selector `cellOwner(i) = locations[cellLocation[i]].ownerFactionId`. Renderer tô lại lớp phủ khi nhận event `territory_transferred` (phát từ `transferLocationOwnership`) | Ảnh hưởng mềm (vùng đệm), lãnh thổ tính theo ô thay vì theo địa điểm |
| **Đạo Ngân** | Marker trên ô trung tâm của địa điểm có `daoMarkIds` | Hiệu ứng lan trên ô lân cận |

## 5. Render (apps/web)

- `TerrainRenderer` (file mới `apps/web/src/components/map/terrain.ts`):
  - **Lớp nền** (bake một lần cho mỗi seed): tô hex theo `biome.color`, hillshade = chênh độ cao với láng giềng tây-bắc, sông là polyline nối tâm ô có độ dày ∝ log(flow) (số thực được phép ở đây), bờ biển làm mềm bằng nội suy Chaikin. Kết quả giữ trong `ImageBitmap`.
  - **Lớp lãnh thổ**: tô alpha theo tông môn + đường biên giữa các ô khác chủ. Chỉ bake lại khi quyền sở hữu thay đổi (hiếm, theo quý).
  - **Lớp động** (mỗi khung): địa điểm, nhãn (khung 9-slice), ⚔ tranh chấp, ◆ linh mạch, vòng vàng người chơi.
- Zoom/pan bằng transform đơn giản. Hit-test: pixel → hex → `cellLocation`.
- `computeLayout()` (lực đẩy-kéo) **bị loại bỏ**, thay bằng tâm vùng (trung bình tọa độ ô trong vùng).
- Protocol worker: thêm `{ type: 'TERRAIN'; width; height; elevation: Int16Array; biome: Uint8Array; flow: Uint16Array; cellLocation: Uint8Array; terrainGenVersion }`, gửi sau `READY` và sau `LOAD`. Dữ liệu chuyển dạng transferable nên không copy.
- Ngân sách: worldgen ≤ 50 ms trong worker; bake nền ≤ 30 ms; vẽ một khung ≤ 4 ms ở 1280×800. Đo bằng route `/bench` đã thiết kế ở `11_TASK_BREAKDOWN`.

**Web Worker**: không cần worker mới. Địa hình sinh trong `sim.worker` hiện có, ngay trong `generateWorld`, nên main thread không bị chặn. Nếu sau này lưới lớn hơn 50k ô (khoảng 86 ms theo prototype) vẫn ổn trong worker.

## 6. Hợp đồng dữ liệu và save/load

| Thay đổi | Mức ảnh hưởng | Xử lý |
|---|---|---|
| `WorldState.terrainGenVersion: number`, `terrainDigest: string \| null` | Schema | `schemaVersion 1 → 2`, migration v1 điền `0`/`null` = "đồ thị cũ, không có địa hình": UI rơi về bản đồ lực đẩy-kéo cũ. Digest sinh lại không khớp cũng rơi về bản đồ cũ |
| `Location.biomeId: string \| null`, `Location.anchorCell: number \| null` | Schema + Zod | Cùng migration v2 (`null`) |
| `game-data/data/biomes.json` | `contentVersion` tăng | Zod validate |
| RNG địa hình `worldgen:terrain` | ADR-03 | sfc32 **cục bộ**, không ghi vào `WorldState.rng`, để sinh lại khi tải save không làm đổi state. Luồng `worldgen` giữ cho NPC/tông môn |
| Digest của mọi seed thay đổi | Test/bench | Tạo lại `bench-results/` baseline mới và ghi chú trong báo cáo. Test determinism vẫn là "2 lần chạy = cùng digest" |

Bất biến mới (bổ sung vào `checkInvariants` khi có `TerrainModel`): mọi địa điểm nằm trên đất; đồ thị liên thông; `cellLocation` chỉ trỏ tới địa điểm tồn tại; mỗi linh mạch ở ô có `qi ≥ ngưỡng`.

## 7. Các lựa chọn bị loại

| # | Lựa chọn | Lý do loại |
|---|---|---|
| A | **Nhúng mapgen4** vào simulation | Float32 + `Math.pow/cos/sin/sqrt` vi phạm ADR-02; tất định chỉ trong cùng engine; không bật được TS strict; `painting.ts` chạm DOM ở cấp module; renderer WebGL2 trái ADR-01; một dependency cài từ URL GitHub; repo *unmaintained*; 25k vùng là thừa cho 14 địa điểm |
| A′ | mapgen4 **chỉ ở lớp web** (trang trí), sim giữ đồ thị cũ | Hai nguồn sự thật cho "không gian". Địa hình không ảnh hưởng `travelDays`, linh mạch hay tông môn, nên không đạt yêu cầu "trích xuất dữ liệu cho Simulation Core". Thêm 6 dependency |
| B | **Tích hợp FMG** | ~145k dòng; state toàn cục `pack`/`grid`; `Math.random = aleaPRNG(seed)` ghi đè toàn cục, phá luật tất định của cả worker; d3 + jQuery + three; không có worker; quy mô lục địa lệch MVP |
| B′ | Dùng FMG **offline** để vẽ tay một bản đồ cố định rồi nhập JSON | Mất khả năng chơi lại theo seed (trụ cột 5 của GDD) và tốn công chuyển đổi định dạng `.map` |
| C | **Labyrinthos.js** | AGPL-3.0 không tương thích game thương mại đóng nguồn; 9 file dùng `Math.random`; ngừng phát triển từ 2024; chỉ phù hợp dungeon/mê cung |
| D | **procedural-tilemap-lab** | Quy mô cảnh cục bộ, không phải bản đồ vùng; JS thuần không kiểu; repo mới một người duy trì; asset AI có nguồn gốc pháp lý chưa rõ. Giữ làm tham khảo cho noise số nguyên |
| E | Giữ nguyên đồ thị lực đẩy-kéo hiện tại | Chi phí 0 nhưng không có biome, sông, núi; linh mạch, bí cảnh, vùng cấm không có ý nghĩa không gian. Đây là **phương án dự phòng** nếu kế hoạch không được duyệt |
| F | Địa hình chỉ để trình diễn, sinh "quanh" đồ thị hiện có | Không đổi digest, nhưng hình học mâu thuẫn số liệu (cạnh 3 ngày có thể vắt ngang núi lớn) và sim không tận dụng được gì |
| G | Voronoi với `delaunator` trong sim | Hình học số thực, dependency mới, vi phạm ADR-02 |
| H | PixiJS/WebGL | ADR-01: chưa có benchmark chứng minh cần. 3k hex bake sẵn trên Canvas 2D là đủ |

### 7.1 Tái sử dụng source hay tự triển khai

| Tiêu chí | Tái sử dụng (mapgen4/FMG) | **Tự triển khai (đề xuất)** |
|---|---|---|
| Tuân ADR-02/03 | Không, phải bọc hoặc fork sâu | Có, ngay từ thiết kế |
| Tất định giữa các trình duyệt | Không bảo đảm (float + lượng giác) | Có (chỉ số nguyên) |
| Dependency mới | 6 (mapgen4) đến hơn 9 (FMG) | 0 |
| Kích thước bundle tăng thêm | Nhỏ (mapgen4) đến rất lớn (FMG) | Vài KB |
| Mức hợp với 14 địa điểm | Thấp (quá chi tiết, phải gom cụm) | Cao (thiết kế đúng quy mô) |
| Chất lượng hình ảnh ban đầu | **Cao hơn** | Trung bình, cần tinh chỉnh renderer |
| Công sức | Thấp lúc đầu, cao về sau (fork, bọc, cập nhật) | Khoảng 6–9 ngày dev (bảng §8) |
| Nghĩa vụ license | Apache: giữ LICENSE và ghi chú thay đổi; MIT: giữ thông báo bản quyền | Không có (chỉ mượn ý tưởng thuật toán, không chép code) |
| Rủi ro bảo trì | Upstream unmaintained (mapgen4) hoặc thay đổi liên tục (FMG) | Tự chủ hoàn toàn |

## 8. Kế hoạch triển khai (chỉ bắt đầu sau khi được duyệt)

| # | Task | Phụ thuộc | Độ khó | Tệp | Test / nghiệm thu |
|---|---|---|---|---|---|
| W0 ✅ | ADR-16 "Địa hình số nguyên" + cập nhật 08 (contract) + ghi chú 09 §14 | — | S | `docs/07_ADR_PHASE0.md`, `docs/08_…`, `docs/09_…` | Kiến trúc đã duyệt 2026-10-24; chờ duyệt nội dung contract trước W1 |
| W1 ✅ | `hexGrid` + `noise` số nguyên (2026-10-24, 17 test; chưa nối vào `generateWorld`) | W0 | S | `worldgen/terrain/hexGrid.ts`, `noise.ts` | Vector cố định cho `hash2`; láng giềng biên; lint không báo API bị cấm |
| W2 ✅ | Độ cao + long mạch + priority-flood + sông + độ ẩm (2026-10-24; 100 seed: đất 62–66 %, khối đất lớn nhất ≥ 97,8 %, 93–217 ô sông, ~1,6 ms/seed) | W1 | M | `elevation.ts`, `hydrology.ts`, `climate.ts` | 100 seed: không còn trũng nội địa sau khi lấp; mọi ô đất chảy được ra biển; tỉ lệ đất 55–75 %; có ≥ 1 sông |
| W3 ✅ | Biome + `biomes.json` + `qi` (2026-10-24; 100 seed: núi 22 % đất, vùng cấm 0,3–13 % và có ở mọi seed; top-30 qi ≈ 66 % núi / 62 % sông; ~2,7 ms/seed cho W2+W3) | W2 | S | `biome.ts`, `qi.ts`, `game-data/data/biomes.json` | Zod validate; mọi ô có biome hợp lệ |
| W4 ✅ | Địa điểm + vùng + đồ thị + nối vào `generateWorld` (2026-10-23; 100 seed: không seed nào phải nới khoảng cách, `travelDays` trung bình 8,5, 17 cạnh/seed, ~10 ms/seed cho toàn pipeline; tranh chấp trong 10 năm: 103/200 seed so với 104/200 của đồ thị cũ, **chưa đạt 8/10**, xem §9. Đo lại sau review (2026-10-24): 10 seed nghiệm thu `bench-000…009` 6/10 so với 5/10 của main trong 10 năm, 8/10 so với 6/10 trong 50 năm; 50 seed 25/50 so với 31/50) | W3 | L | `sites.ts`, `regions.ts`, `graph.ts`, `index.ts`, `types.ts`, `generate.ts` | 100 seed: đúng 14 địa điểm, đồ thị liên thông, `travelDays` ∈ [3,15], 5 linh mạch, ≥ 8/10 seed có tranh chấp trong 10 năm (giữ nghiệm thu 3.4) |
| W5 | Schema v2 + migration + bất biến mới + baseline bench mới | W4 | M | `shared/src/schema.ts`, `save.ts`, `core/invariants.ts`, `bench-results/` | Save v1 vẫn tải được; round-trip v2 giữ digest; `pnpm sim bench` không chậm quá 5 % |
| W6 | Protocol `TERRAIN` + `TerrainRenderer` + hit-test + bỏ `layout.ts` | W4 | L | `worker/sim.worker.ts`, `shared/src/protocol.ts`, `components/map/*` | Bake nền ≤ 30 ms, khung ≤ 4 ms (route `/bench`); bấm địa điểm chọn đúng; lãnh thổ đổi màu sau khi chuyển quyền |
| W7 | (UI, có thể làm song song W6) Token màu "Ngọc Các", SVG trận pháp, khung `border-image` cho các màn trong `ASSET_RESEARCH §7.3` | W0 | M | `apps/web/src/styles.css`, `components/ornaments/*` | Tắt được trang trí; `prefers-reduced-motion`; độ tương phản chữ đạt WCAG AA |

Lệnh nghiệm thu chung: `pnpm check` xanh và `pnpm sim bench --seeds 10 --years 100`. Báo cáo theo định dạng trong `CLAUDE.md`.

## 9. Rủi ro còn lại

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| `travelDays` từ địa hình làm lệch cân bằng tranh chấp và di chuyển | Thấp (đã đo ở W4) | Tỉ lệ seed có tranh chấp trong 10 năm không đổi (51,5 % so với 52 %, 200 seed). Mục tiêu ≥ 8/10 chưa đạt **trước cả W4**. Nguyên nhân chính: quan hệ khởi đầu roll trong [−40, −25] trong khi ngưỡng khởi tranh chấp là ≤ −30, nên ~30 % seed không bao giờ tranh chấp; khi B có tông chủ Kim Đan thì A thường không đủ 80 % sức mạnh. Cần chủ dự án duyệt chỉnh cân bằng |
| Hex trông "game bàn cờ" | Trung bình | Làm mềm bờ biển, sông cong, hillshade ở lớp render; ô 12–16 px để lưới khó thấy |
| Prototype: đất quá nhiều (85–92 %), núi ít | Thấp | Tinh chỉnh falloff + long mạch ở W2, có test tỉ lệ |
| Đồ thị không liên thông nếu địa điểm rơi trên đảo | Thấp | Chỉ đặt địa điểm trên khối đất lớn nhất; bất biến kiểm tra liên thông |
| Mọi digest/benchmark cũ mất hiệu lực | Chắc chắn | Ghi rõ trong ADR-16; tạo lại baseline một lần |
| Asset UI tên trong yêu cầu không xác minh được | Thấp | MVP không phụ thuộc asset mua; contract asset (9-slice, SVG) cho phép thay sau |

## 10. Quyết định cần chủ dự án chốt

1. ~~Duyệt kiến trúc §2~~ → **đã duyệt 2026-10-24** (ADR-16).
2. Kích thước lưới MVP: contract đang dùng mặc định **64×48**. Đây là tham số trong `balance.worldgen.terrain`, nên đổi được trước W1 mà không sửa contract.
3. Chấp nhận schema v2 và tạo lại baseline benchmark?
4. Vùng cấm trong MVP chỉ là tag chi phí đi lại (đề xuất), hay mở rộng phạm vi?
5. Gửi URL hai gói "Xianxia UI & Formation Circles" và "Jade Pavilion" nếu muốn kiểm chứng license trước khi mua.
