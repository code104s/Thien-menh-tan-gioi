# ASSET_RESEARCH — Nghiên cứu nguồn sinh bản đồ và asset giao diện

Phiên bản 0.1 · 2026-10-24 · Trạng thái: **nghiên cứu, chưa tích hợp, chưa mua asset**.
Tài liệu đi kèm: `WORLD_MAP_TECH_PLAN.md` (kiến trúc đề xuất và kế hoạch).

## 0. Phương pháp kiểm chứng

| Việc | Cách làm | Kết quả |
|---|---|---|
| Lấy source | `git clone --depth 1` cả 4 repo vào scratchpad (ngoài dự án) | 4/4 clone được |
| Giấy phép | Đọc `LICENSE`, `package.json`, README, `ASSET-LICENSE.md` | Xem bảng §1 |
| Thuật toán | Đọc trực tiếp file generator chính | Xem §2–§5 |
| Hiệu năng mapgen4 | Chạy pipeline (điểm → mesh → độ cao → mưa → sông) trong Node 24.18 bằng `tsx`, không render | Bảng §2.4 |
| Tính tất định | Chạy 2 lần cùng seed, so digest FNV mảng độ cao | Trùng khớp |
| Phương án tự viết | Prototype địa hình hex chỉ dùng số nguyên (`int-terrain-proto.mts`, nằm ở scratchpad, **không** đưa vào repo) | Bảng §6 |
| Asset UI | Tìm kiếm web; itch.io chặn truy cập tự động (Cloudflare) nên không đọc được trang license của gói itch.io | §7 |

Máy đo: máy dev hiện tại, Windows 11, Node 24.18. Số liệu dùng để so sánh tương đối, không phải ngưỡng nghiệm thu.

## 1. Tổng quan bốn repo

| | mapgen4 | Fantasy-Map-Generator (FMG) | Labyrinthos.js | procedural-tilemap-lab |
|---|---|---|---|---|
| Giấy phép code | **Apache-2.0** | **MIT** | **AGPL-3.0** (chỉ ghi trong `package.json` và README "Yantra Works 2023 AGPL", không có file LICENSE) | **MIT** |
| Giấy phép asset | — | MIT chung repo | — | **CC0 1.0** (một phần ảnh sinh bằng OpenAI image generation) |
| Thương mại đóng nguồn | Được, giữ LICENSE + ghi chú thay đổi | Được, giữ thông báo bản quyền | **Không phù hợp**: phân phối qua web buộc công bố toàn bộ source theo AGPL | Được |
| Commit gần nhất | 2026-03-29 (README gắn nhãn *unmaintained*) | 2026-10-23, v1.155.0 (rất sôi động) | 2024-03-04, v1.1.2 | 2026-07-24 (repo mới, 1 tác giả) |
| Ngôn ngữ / quy mô | TS lỏng (esbuild, không typecheck), ~3,6k dòng | TS, ~145k dòng trong `src/` (src 22 MB, public 16 MB) | JS + Babel/Browserify, ~4,7k dòng | JS thuần, ~30k dòng, không có build |
| Dependency runtime | delaunator (ISC), fast-2d-poisson-disk-sampling (MIT), flatqueue (ISC), simplex-noise (MIT), gl-matrix (MIT), `@redblobgames/prng` (Apache-2.0, **cài từ URL GitHub**, không qua npm) | d3, delaunator, three, quill, driver.js, polylabel, lineclip, alea, zod + jQuery/jQuery UI nạp bằng `<script>` | không có | không có |
| Quy mô bản đồ | Một vùng hoang dã 1000×1000, 25k vùng Voronoi | Lục địa/thế giới: quốc gia, văn hóa, tôn giáo, đường xá | Mê cung, dungeon, tilemap cục bộ | Tilemap top-down cục bộ (đồng cỏ, rừng, núi, dungeon) |
| Seed | Seed số → `makeRandFloat(seed)` truyền tường minh | Ghi đè **toàn cục** `Math.random = aleaPRNG(seed)`; 41 lần gọi `Math.random()` trong generators | Mersenne Twister trong `TileMap`, nhưng 9 file vẫn gọi `Math.random` trực tiếp | Hash số nguyên (`Math.imul`) theo seed + salt; `Math.random` chỉ ở UI |
| Web Worker | **Có sẵn** (`worker.ts`, truyền ArrayBuffer transferable) | Không (pipeline chạy trên main thread) | Không | Không |
| Render | WebGL2, phép chiếu xiên | SVG qua d3 (+ three.js cho 3D) | Không có / ví dụ | Canvas 2D |

## 2. mapgen4 (Red Blob Games)

### 2.1 Thuật toán
1. **Điểm**: Poisson-disk 2 lớp, gồm điểm biên trong/ngoài và điểm đỉnh núi (`mountainSpacing = 35`), sau đó là điểm thường (`spacing = 5.5`).
2. **Mesh**: Delaunay (`delaunator`) → dual mesh nửa cạnh (`dual-mesh/`), có "ghost structure" để xử lý biên.
3. **Độ cao** (`map.ts`): trường khoảng cách BFS từ các tam giác đỉnh núi, có nhiễu jitter → hình núi. Trộn với simplex fbm 6 tầng và bản đồ ràng buộc 128×128 (sinh bằng noise + tham số `island`, người dùng có thể "vẽ" thêm). `Math.pow(2, mountain_sharpness)` điều khiển độ nhọn.
4. **Mưa**: sắp xếp vùng theo hướng gió (`Math.cos/sin` góc gió), mang ẩm theo gió, có mưa địa hình (rain shadow) và bốc hơi.
5. **Sông**: cây dòng chảy xuống dốc trên tam giác (`assignDownslope` bằng hàng đợi ưu tiên `flatqueue`), cộng dồn lưu lượng từ độ ẩm (`assignFlow`), rồi lọc theo ngưỡng `lg_min_flow`.
6. **Biome**: **không có biome rời rạc**. Màu được tra trong shader theo (độ cao × lượng mưa) qua `colormap.ts`.

### 2.2 Trích xuất dữ liệu cho Simulation Core
Kết quả nằm trong các `Float32Array`: `elevation_r/t`, `rainfall_r`, `moisture_t`, `flow_s`, `s_downslope_t`. Muốn dùng phải gom 25k vùng thành 14 địa điểm (cluster) và lượng tử hóa sang số nguyên. Tất cả là số thực float32 và dùng `Math.pow/cos/sin/sqrt` → **vi phạm ADR-02** nếu đặt trong `packages/simulation`.

### 2.3 Khả năng mở rộng tu tiên
- Linh mạch: chọn được từ trường khoảng cách núi + lưu lượng sông (đỉnh núi, nơi hợp lưu).
- Tông môn, bí cảnh, vùng cấm, lãnh thổ: **không có sẵn**, phải tự viết toàn bộ. Tác giả cũng ghi rằng towns, roads, nations "để cho dự án tương lai".

### 2.4 Hiệu năng đo được (Node 24, không render, seed 187)

| spacing | Vùng | Tam giác | Điểm (ms) | Mesh (ms) | Độ cao + mưa (ms) | Sông (ms) | **Tổng (ms)** | Digest 2 lần chạy |
|---|---|---|---|---|---|---|---|---|
| 10 | 7 695 | 15 386 | 14,3 | 27,0 | 24,1 | 7,0 | **72** | `1c6c9bd4` = `1c6c9bd4` |
| 5,5 (mặc định) | 25 476 | 50 948 | 26,4 | 51,6 | 41,8 | 7,6 | **127** | `891798b2` = `891798b2` |
| 3 | 85 157 | 170 310 | 111,6 | 131,8 | 114,1 | 44,6 | **402** | `713b0326` = `713b0326` |

Ghi chú: `painting.ts` gọi `document.getElementById` ngay ở cấp module nên không import được trong worker hoặc Node. Bản đo đã chép lại `Generator.generate()` (bỏ phần núi do người vẽ). Tính tất định chỉ được chứng minh **trên cùng một engine**. `Math.pow/cos/sin` có thể khác nhau ở bit cuối giữa V8, SpiderMonkey và JavaScriptCore.

### 2.5 Rủi ro tích hợp
Không bật được TS strict (`noUncheckedIndexedAccess` sẽ báo lỗi hàng loạt). Renderer là WebGL2, trái ADR-01 (Canvas 2D). Một dependency cài từ URL GitHub. Repo không còn được bảo trì.

## 3. Fantasy-Map-Generator (Azgaar)

### 3.1 Thuật toán (pipeline khai báo trong `src/generators/generation-pipeline.ts`, 40+ bước)
`grid` (lưới vuông có jitter → Voronoi) → `heightmap` (template: hill, range, trough, strait, mask…) → `markupGrid`/hồ trũng → `temperatures` (vĩ độ + độ cao) → `precipitation` (gió) → `regraph` (mesh "pack" mịn hơn) → `rivers` (xuống dốc, xử lý trũng, đo độ rộng) → `biomes` (ma trận **độ ẩm × nhiệt độ**, khoảng 13 biome kiểu Whittaker) → `cultures` → `burgs` (thành thị) → `states` (bành trướng theo chi phí địa hình) → `routes` → `religions` → `provinces` → `markets`/`production`/`military` → `markers` → `zones` (vùng sự kiện: dịch bệnh, xâm lược…).

### 3.2 Trích xuất dữ liệu
Trạng thái nằm trong các biến **toàn cục** `grid` và `pack` (`pack.cells.h`, `pack.cells.biome`, `pack.rivers`, `pack.states`…). Generator là class gắn vào global (`var Biomes: BiomesGenerator`), còn jQuery, `aleaPRNG` và `FlatQueue` là global nạp bằng `<script>`. Lấy dữ liệu sạch chỉ có 2 cách: (a) chạy cả app trong trình duyệt rồi export `.map`/JSON, hoặc (b) tách generator, việc này đụng chạm hàng trăm chỗ.

### 3.3 Khả năng mở rộng tu tiên
Đây là repo có **nhiều khái niệm gần nhất**. `states-generator` giống lãnh thổ tông môn, `zones-generator` giống vùng cấm, `markers` giống bí cảnh và di tích, `routes` giống đường đi giữa địa điểm. Tuy vậy quy mô (lục địa, hàng nghìn ô, hàng chục quốc gia) lớn hơn nhiều so với MVP (14 địa điểm, 3 tông môn).

### 3.4 Hiệu năng
Có benchmark Playwright riêng (seed `benchmark`, 10k ô, đo generate + vẽ + zoom/pan). Pipeline chạy trên main thread, không có worker.

### 3.5 Rủi ro tích hợp
- `Math.random = aleaPRNG(seed)` ghi đè toàn cục. Nếu chạy chung `sim.worker` thì sẽ phá cam kết "không dùng Math.random trong domain", vì mọi chỗ gọi `Math.random` đều bị ảnh hưởng.
- Kéo theo d3, jQuery, three, quill… làm bundle phình to rất nhiều.
- Generator vẫn đọc hoặc ghi DOM ở một số chỗ (35 file trong `src/generators` có tham chiếu `window.`, `document.` hoặc `d3.`).
- Repo thay đổi hằng ngày nên fork sẽ lệch nhanh.

## 4. Labyrinthos.js (Yantra Works)

- **Thuật toán**: mê cung (Aldous-Broder 2D/3D, Recursive Backtrack, Binary Tree, Eller, Growing Tree, Hunt-and-Kill, Recursive Division, Spiral Backtrack, Trémaux, Thomas Hunter, Beattie-Schoberth rooms, Metroidvania), cellular automata, Voronoi; địa hình (Perlin, Diamond-Square, Fault Line); L-System; TileMap có query/merge/transform; export Tiled JSON.
- **Seed**: `TileMap.seed()` dùng Mersenne Twister, nhưng 9 file (DiamondSquare, noise, SpiralBacktrack, BeattieSchoberth…) gọi `Math.random` trực tiếp → **không tái lập được**.
- **Dùng được cho**: nội thất bí cảnh (dungeon, mê cung) ở giai đoạn sau MVP.
- **Kết luận**: **loại**. AGPL-3.0 buộc công bố toàn bộ source của game khi phục vụ người chơi qua web. Repo đã ngừng phát triển từ 2024 và seed không đầy đủ. Các thuật toán đều là kiến thức giáo khoa, có thể tự viết dưới dạng số nguyên khi cần.

## 5. procedural-tilemap-lab (dungeoncrab0606)

- **Thuật toán**: tilemap top-down theo seed (đồng cỏ, đường, rừng, núi, dungeon với nhiều topology hành lang). Noise là hash số nguyên `Math.imul`, có fbm salt, đặt trong `noiseHash.js`. Đặt quái và prop qua `mapPlacement.js`, có "biome recipes" và Material Lab để chỉnh prop.
- **Trích xuất**: `createMapIntegrationSnapshot(seed)`, `isMapTilePassable(seed, pos)` và "AI integration bundle" (code + JSON + PNG).
- **Điểm hay**: noise **số nguyên thuần** nên tất định giữa các engine, rất hợp với ADR-02. Đây là mẫu tham khảo tốt cho phần noise của phương án tự viết.
- **Hạn chế**: quy mô cảnh cục bộ chứ không phải bản đồ vùng. Là JS thuần, không có kiểu. Repo mới, chỉ một người duy trì. Asset cây và cầu thang sinh bằng AI: CC0 chỉ có hiệu lực "trong phạm vi chủ repo nắm quyền", nên quyền tác giả của ảnh AI chưa rõ ràng về pháp lý. Rủi ro thấp nhưng nên tránh cho asset chủ đạo.
- **Kết luận**: không dùng cho MVP. Có thể tham khảo cho bản đồ bí cảnh cục bộ sau MVP.

## 6. Kiểm chứng phương án tự triển khai (prototype số nguyên)

Thiết kế: lưới hex odd-r; value noise hash `Math.imul` + smoothstep fixed-point, fbm 4 tầng; độ cao trừ falloff ở rìa; **priority-flood** (Barnes 2014) để lấp trũng và lấy hướng chảy; cộng dồn lưu lượng; bảng tra biome 4 dải độ cao × 3 dải ẩm; "địa khí" = độ cao + hợp lưu sông + nhiễu → chọn 5 linh mạch cách nhau ≥ 6 ô; chọn 14 địa điểm cách nhau ≥ 7 ô; **Dijkstra đa nguồn** theo chi phí biome → mỗi ô thuộc một địa điểm, cạnh nối các vùng kề nhau kèm chi phí đường đi. Không dùng `Math.sin/cos/sqrt/pow`, không dùng `Math.random`.

| Lưới | Ô | Noise (ms) | Flood + sông (ms) | Biome + linh mạch + vùng (ms) | **Tổng (ms)** | Đất | Ô sông | Địa điểm / cạnh | Digest |
|---|---|---|---|---|---|---|---|---|---|
| 64×48 | 3 072 | 2,5–3,4 | 4,7–5,6 | 4,8 | **12–13** | 92,4 % | 490 | 14 / 28 | `2b44b8bb` (2 lần trùng) |
| 128×96 | 12 288 | 5,8 | 11,6 | 13,1 | **31** | 88,4 % | 2 060 | 14 / 29 | `8227f0a6` |
| 256×192 | 49 152 | 12,3 | 31,2 | 42,1 | **86** | 88,0 % | 8 516 | 14 / 27 | `3a0e72ea` |
| 64×48, seed `bench-002` | 3 072 | 2,5 | 4,7 | 4,9 | **12** | 84,8 % | 416 | 14 / 28 | `9b5fe773` |

Nhận xét:
- Ở quy mô MVP (khoảng 3k ô), toàn bộ pipeline nhanh hơn mapgen4 khoảng 10 lần và nhỏ hơn hai bậc so với ngân sách 1 giây cho tạo thế giới.
- Tham số chưa được chỉnh: đất quá nhiều, núi quá ít. Cần tinh chỉnh falloff và ngưỡng (task W2 trong kế hoạch).
- Vùng biển không đi được, nên đồ thị chỉ liên thông nếu mọi địa điểm cùng nằm trên khối đất lớn nhất. Bản thật phải ràng buộc điều này (xem plan §4.3).

## 7. Nghiên cứu UI

### 7.1 Hai gói được nêu tên
| Tên trong yêu cầu | Kết quả tìm kiếm | Ghi chú |
|---|---|---|
| "Xianxia UI & Formation Circles" | **Không tìm thấy** listing trùng tên trên itch.io, Unity Asset Store hay Fab | Gần nhất: [Sci-Fi UI: Circle Elements](https://ahintoflime.itch.io/sci-fi-ui-circles-pack) (48 vòng tròn PNG 512/1024, trắng trên nền trong, từ $2,50, phong cách sci-fi); [Stylized Magic Circles VFX](https://www.fab.com/listings/2abded31-36c4-4d0f-a80f-5014217aa566) (6 texture vòng phép); các mảnh UI tiên hiệp sinh bằng AI trên [Summer Engine](https://www.summerengine.com/asset-store/star-soul-era-tooltip-panel-1024x512-97921bdc) (ảnh rời, có rủi ro nguồn gốc AI) |
| "Eastern Fantasy UI — Jade Pavilion" | **Không tìm thấy** | Gần nhất: [Celestial Jade — Dialogue & Quest UI](https://diwa2100.itch.io/celestial-jade-dialogue-quest-ui) và [Combat HUD](https://diwa2100.itch.io/celestial-jade-combat-hud) (cartoon, ngọc/vàng/son, PNG 1x/2x, $1–1,99; **chưa đọc được điều khoản license**); [Fantasy Asia UI Set](https://creativemarket.com/oniks_astarit/291857083-Fantasy-Asia-UI-Set) ([ArtStation](https://www.artstation.com/marketplace/p/Gmabz/fantasy-asia-ui-set)): 80 phần tử vector SVG/PNG/AI/EPS màu trắng để tô lại, license theo bậc của marketplace (cần kiểm tra bậc "game/sản phẩm bán ra") |

**Việc cần chủ dự án làm**: nếu hai gói trên là sản phẩm cụ thể, hãy gửi URL listing để kiểm chứng license. Cho đến khi có URL, tài liệu này coi hai tên đó là **hướng mỹ thuật**: (1) *trận pháp*: vòng tròn đồng tâm, quẻ bát quái, phù văn; (2) *Ngọc Các*: khung ngọc bích viền vàng, mái ngói, lụa.

### 7.2 Kỹ thuật dùng SVG / PNG / 9-slice với React (Vite 8, React 19)

| Kỹ thuật | Cách làm không cần thêm dependency | Dùng cho | Lưu ý |
|---|---|---|---|
| **SVG thủ tục** | Viết component TSX trả về `<svg>`: vòng đồng tâm, 8 quẻ (Unicode U+2630–2637 ☰☱☲☳☴☵☶☷), vạch chia, `stroke-dasharray` làm thanh tiến độ vòng | Trận pháp tu luyện/đột phá, ấn triện, khung bản đồ | Không tốn tiền asset, tự đổi màu theo CSS var và dark mode. Animation `rotate` phải tắt khi `prefers-reduced-motion` |
| SVG tệp tĩnh | `import url from './frame.svg?url'` (Vite có sẵn) | Họa tiết trang trí | Inline thành component cần `vite-plugin-svgr`, tức dependency mới, **tránh** |
| PNG/WebP | `import png from './x.png'` + CSS `image-set(url(a.webp) 1x, url(a@2x.webp) 2x)` | Asset raster mua về, chân dung | Cần đặt ngân sách dung lượng, nén WebP/AVIF |
| **9-slice** | CSS `border-image: url(frame.svg) 24 fill / 24px round;` (hỗ trợ ở mọi trình duyệt hiện đại) | Khung panel, nút, hộp thoại | Asset nguồn phải để góc đủ rộng. Dùng SVG thì không vỡ khi scale |
| 9-slice trên Canvas | 9 lệnh `drawImage` từ một `ImageBitmap` | Nhãn địa danh trên bản đồ | Bake một lần, cache lại |
| Phông chữ | Tự host font OFL có **đủ dấu tiếng Việt**: Be Vietnam Pro (đang dùng), Noto Serif, Alegreya, Playfair Display | Tiêu đề kiểu cổ phong | Font thư pháp Hán (Ma Shan Zheng, ZCOOL…) **không có dấu tiếng Việt**: chỉ dùng cho chữ Hán trang trí trong SVG, không dùng cho nội dung |

### 7.3 Thiết kế màn hình (đề xuất, dựa trên view model hiện có)
Nguyên tắc ở `10_UI_WIREFRAME.md` vẫn giữ: chữ rõ hơn đồ họa, mọi số liệu lấy từ view model. Trang trí là lớp phủ có thể tắt.

| Màn | Bố cục | Dữ liệu (`packages/shared/src/view.ts`) | Họa tiết |
|---|---|---|---|
| **Tu luyện** | Trận pháp ở giữa: vòng ngoài là tiến độ tầng (`progressPct`), vòng trong là 4 tiểu cảnh. Hai bên là chỉ số. Dưới cùng là hành động đang chạy | `PlayerView.realmName/stageName/progressPct`, `currentAction.daysLeft/totalDays`, `LocationView.energyPct` | Bát quái xoay chậm khi đang tu luyện. Vòng mờ đi khi bị thương (`injury`) |
| **Công pháp** | Danh sách cuộn trúc giản, chi tiết bên phải | `techniqueName` + `techniques.json` (`speedBp`, `stonesPerMonth`, `breakthroughModBp`, `minSpiritRootBp`) | Khung 9-slice "trúc giản". Cần thêm `TechniqueView` vào view model (thay đổi contract nhỏ) |
| **Đột phá** | Hộp thoại: trận pháp có cung tỉ lệ thành công, lý do chặn hiện ngay dưới tâm | `breakthroughChancePct`, `breakthroughBlocker`, chi phí từ `ActionOption` | Cung đỏ son (rủi ro) và vàng (thành công). Không thêm hiệu ứng che khuất con số |
| **Tông môn** | Hồ sơ tông môn + bảng quan hệ + bản đồ thu nhỏ chỉ tô lãnh địa | `FactionView.*`, `DisputeView` | Ấn triện màu theo tông môn, khung "Ngọc Các" |
| **Nhân vật** | Chân dung (placeholder SVG theo cảnh giới) + thuộc tính + quan hệ đã biết | `PlayerView`, `CharacterView` (thông tin chưa biết hiện "?") | Nền lụa, viền theo cảnh giới (Luyện Khí: đồng, Trúc Cơ: bạc, Kim Đan: vàng) |
| **World Map** | Canvas địa hình hex + lớp phủ lãnh thổ, linh mạch, tranh chấp, Đạo Ngân | Xem `WORLD_MAP_TECH_PLAN.md` §5 | Khung giấy cổ 9-slice quanh canvas, la bàn bát quái góc dưới |

## 8. Kết luận ngắn

1. **Không nhúng source** của repo nào vào Simulation Core: mapgen4 và FMG dùng số thực/lượng giác, FMG còn ghi đè `Math.random` toàn cục.
2. **Loại hẳn Labyrinthos.js** vì AGPL-3.0.
3. **Tự viết** bộ sinh địa hình số nguyên trên lưới hex. Prototype đã chứng minh chạy 12–13 ms và tất định. Mượn **ý tưởng** (không chép code) từ: mapgen4 (trường khoảng cách núi, cây dòng chảy), FMG (ma trận biome, bành trướng lãnh thổ theo chi phí, zone), tilemap-lab (hash noise `Math.imul`).
4. **Chưa mua asset.** MVP dùng SVG thủ tục + CSS token + `border-image`. Chỉ mua sau khi có URL listing và license đã đọc.

## Nguồn
- https://github.com/redblobgames/mapgen4 · https://www.redblobgames.com/maps/mapgen4/
- https://github.com/Azgaar/Fantasy-Map-Generator
- https://github.com/yantra-core/Labyrinthos.js
- https://github.com/dungeoncrab0606/procedural-tilemap-lab
- Barnes, Lehman, Mulla (2014), *Priority-Flood: An Optimal Depression-Filling and Watershed-Labeling Algorithm*
- Asset tham khảo: các link trong §7.1
