# 11 — Phân rã công việc Phase 1–5 và benchmark harness

Độ khó: S (≤ nửa ngày), M (1–2 ngày), L (3+ ngày). Mỗi task kết thúc bằng test chạy được và báo cáo theo định dạng trong `CLAUDE.md`.

## Package dự kiến (cần duyệt cùng Phase 1)

| Package | Dùng ở | Phase |
|---|---|---|
| `typescript`, `vitest`, `tsx`, `eslint`, `typescript-eslint` | toàn repo (dev) | 1 |
| `zod` | shared | 1 |
| `fast-check` | test property-based (dev) | 1 |
| `vite`, `@vitejs/plugin-react`, `react`, `react-dom`, `zustand` | web | 4 |
| `dexie`, `fake-indexeddb` (dev) | web storage | 4 |

Không thêm package nào khác nếu chưa hỏi.

## Phase 1 — Nền tảng mô phỏng thuần

| # | Task | Phụ thuộc | Độ khó | Tệp | Test / nghiệm thu |
|---|---|---|---|---|---|
| 1.1 | Workspace pnpm, tsconfig strict, ESLint cấm API không tất định, script `test`/`lint`/`typecheck` | — | S | `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.js` | `pnpm lint` bắt được `Math.random` trong file mẫu |
| 1.2 | Toán fixed-point: `mulBp`, `clamp`, `lerpTable`, assert safe integer | 1.1 | S | `packages/simulation/src/core/math.ts` | Test biên, tràn số, bảng tra |
| 1.3 | RNG sfc32 + cyrb128 + luồng lười + `nextInt` không bias | 1.2 | M | `core/rng.ts` | Test vector cố định; serialize/khôi phục giữa chừng cho cùng chuỗi; phân bố `nextInt` (chi-square đơn giản) |
| 1.4 | Canonical JSON + FNV-1a 64 digest | 1.1 | S | `core/digest.ts` | Đổi thứ tự key không đổi digest; đổi một số đổi digest |
| 1.5 | Zod schema cho `WorldState`, entity, command, event | 1.1 | M | `packages/shared/src/schema/*.ts` | Schema khớp kiểu TS (`z.infer`), từ chối số thực/âm |
| 1.6 | Lịch, `sortedKeys`, cấp ID | 1.2 | S | `core/calendar.ts`, `core/ids.ts` | Định dạng Năm/Tháng/Ngày; ID tăng đều |
| 1.7 | Game data khởi điểm: realms, balance, curves, names, techniques | 1.5 | S | `packages/game-data/*.json`, `index.ts` | Zod validate toàn bộ JSON |
| 1.8 | World generator (địa điểm, linh mạch, tông môn, 20 NPC, người chơi) | 1.3, 1.6, 1.7 | L | `worldgen/*.ts` | 100 seed: graph liên thông, ID duy nhất, đúng 20 NPC + 1 người chơi, tranh chấp khả thi; generator luôn kết thúc |
| 1.9 | `checkInvariants` (10 bất biến trong 08) | 1.5 | M | `core/invariants.ts` | Mỗi bất biến có test state hỏng tương ứng |
| 1.10 | Khung tick 10 bước (bước nghiệp vụ là stub), scheduler action, áp dụng lệnh, chống trùng `seq` | 1.8, 1.9 | M | `core/tick.ts`, `core/scheduler.ts`, `core/commands.ts` | Lệnh trùng không áp dụng 2 lần; thứ tự `(priority, actorId, seq)` |
| 1.11 | Snapshot serialize/deserialize + migration registry (rỗng) | 1.4, 1.10 | S | `core/snapshot.ts` | Round-trip giữ nguyên digest |
| 1.12 | CLI headless: `run`, `replay`, `digest` | 1.11 | S | `tools/headless/src/cli.ts` | `pnpm sim run --seed x --years 20` in digest |
| 1.13 | Test determinism nền | 1.12 | S | `tests/determinism/*.test.ts` | 10 seed × 2 lần cùng digest; save năm 5 → load → năm 20 = chạy liền |

**Cổng nghiệm thu Phase 1:** `pnpm lint && pnpm typecheck && pnpm test` xanh; báo cáo số test PASS/FAIL và digest mẫu.

## Phase 2 — Tu luyện và NPC tự chủ

| # | Task | Phụ thuộc | Độ khó | Test chính |
|---|---|---|---|---|
| 2.1 | Tu vi hằng ngày, lên tầng nhỏ, trần Kim Đan | P1 | M | Không vượt tầng sai; hệ số bị kẹp |
| 2.2 | Lão hóa, thương tích, tử vong, xử lý tài sản | 2.1 | M | Skip 100 năm: mọi người quá tuổi thọ đều chết đúng ngày; không action sau khi chết |
| 2.3 | Action: travel, cultivate, gather, heal, breakthrough + giữ chỗ chi phí | 2.1 | L | Chi phí trừ đúng một lần; hủy hoàn đúng policy; bảo toàn linh thạch |
| 2.4 | Đột phá + hậu quả thất bại | 2.3 | M | Chạy 10 000 lần: tỉ lệ ≈ công thức (±2%); không NaN; không chết trực tiếp |
| 2.5 | Utility AI + kế hoạch 1–3 bước + hysteresis | 2.3 | L | Không đổi mục tiêu > 12 lần/năm; không chi quá số dư; không action bất khả thi |
| 2.6 | Người chơi dùng cùng luật (START/CANCEL_ACTION, seclusion, xuất quan sớm) | 2.3 | M | Cùng hàm validate cho NPC và người chơi |

**Nghiệm thu:** 100 năm headless, 10 seed: có NPC đột phá Trúc Cơ, có NPC chết già, `checkInvariants` xanh mỗi 360 ngày.

## Phase 3 — Tông môn, kinh tế, nhân quả

| # | Task | Phụ thuộc | Độ khó | Test chính |
|---|---|---|---|---|
| 3.1 | Kinh tế tháng: linh mạch, duy trì, bổng lộc, sổ cái | P2 | M | Bảo toàn linh thạch; kho không âm |
| 3.2 | Gia nhập/rời tông môn, kế nhiệm, giải tán | 3.1 | M | Tông chủ chết → đúng người kế nhiệm hoặc trống chức |
| 3.3 | Chiến lược quý | 3.1 | M | Chiến lược đổi theo trạng thái tài nguyên |
| 3.4 | Tranh chấp linh mạch 3 giai đoạn + chuyển quyền nguyên tử | 3.3 | L | Không sở hữu kép; có nguyên nhân/kết quả; ≥ 8/10 seed có tranh chấp trong 10 năm |
| 3.5 | Tin tức, ký ức, nhân quả, quan hệ | 3.2 | L | NPC không phản ứng với tin chưa nhận; grudge gắn event gốc |
| 3.6 | Đối đầu cá nhân, Đạo Ngân | 3.5 | M | Đấu không gây chết trực tiếp |
| 3.7 | Interrupt + PlayerChoice | 3.4, 3.5 | M | Skip dừng đúng mốc; lựa chọn hết hạn áp default |
| 3.8 | Sử ký từ event log | 3.5 | S | Mọi dòng Sử ký trỏ tới event thật |

## Phase 4 — Web UI có thể chơi

| # | Task | Phụ thuộc | Độ khó |
|---|---|---|---|
| 4.1 | Vite app, worker adapter, protocol Zod (INIT, COMMAND, SET_SPEED, ADVANCE, SKIP_UNTIL, PAUSE, SAVE_REQUEST, LOAD / READY, STATE_PATCH, EVENTS, INTERRUPTED, CHOICE_REQUIRED, SAVED, ERROR) | P1 (làm song song được từ P2) | M |
| 4.2 | View model + selector (chỉ dữ liệu người chơi đã biết) | 4.1, P3 | M |
| 4.3 | Màn khởi đầu, màn chính, bản đồ Canvas 2D | 4.2 | L |
| 4.4 | Bảng nhân vật/tông môn/biến cố, hành động có lý do vô hiệu | 4.3 | M |
| 4.5 | Điều khiển thời gian, bế quan, hộp thoại ngắt và lựa chọn | 4.4 | M |
| 4.6 | Dexie lưu/tải nguyên tử, export/import, phát hiện save hỏng | 4.1 | M |
| 4.7 | Sử ký, tóm tắt xuất quan, game over | 4.4 | M |

**Nghiệm thu:** chơi từ màn khởi đầu → bế quan 10 năm → xem tóm tắt → lưu, tải lại → tiếp tục; Pause không tiến ngày; UI không đơ khi Skip.

## Phase 5 — Kiểm thử và hoàn thiện
10 seed × replay; 100 năm headless; cân bằng theo số liệu (tỉ lệ đột phá, số tranh chấp, tỉ lệ tử vong); benchmark headless + browser; sửa P0/P1; build `pnpm build`; báo cáo nghiệm thu.

## Benchmark harness (thiết kế, cài ở 1.12 và 4.1)
- **Headless:** `pnpm sim bench --seeds 10 --years 100` → JSON + bảng Markdown: thời gian (ms), tick/giây, heap đỉnh, kích thước snapshot, số event, digest cuối.
- **Browser:** route `/bench` chạy cùng kịch bản trong worker, đo thêm độ trễ khung hình UI (long task > 50ms) trong lúc Skip.
- Ngưỡng tham khảo 100 năm < 10 giây chỉ **ghi nhận**, không assert cho đến khi có số đo nền.
- Kịch bản lệnh cố định cho người chơi nằm trong `tests/fixtures/commands/*.json` để mọi lần đo so sánh được.
