# THIÊN MỆNH TÀN GIỚI — Bộ bàn giao Claude Code
Phiên bản 0.2 | Nền tảng: web game chơi đơn | Ngôn ngữ tài liệu, giao diện và báo cáo: tiếng Việt; định danh code: tiếng Anh.

## Thứ tự đọc
1. `docs/01_PRODUCT_GDD.md`
2. `docs/02_TECH_ARCHITECTURE.md`
3. `docs/03_SIMULATION_SPEC.md`
4. `docs/04_DATA_CONTRACTS.md`
5. `docs/05_MVP_ROADMAP.md`
6. `docs/06_TEST_ACCEPTANCE.md`
7. `CLAUDE.md`
8. `PROMPT_FOR_CLAUDE.md`

### Kết quả Phase 0 (đã duyệt 2026-10-24, ưu tiên cao hơn 02–04 khi mâu thuẫn)
9. `docs/07_ADR_PHASE0.md` — các quyết định kiến trúc
10. `docs/08_DATA_CONTRACTS_V0_3.md` — hợp đồng dữ liệu và bất biến
11. `docs/09_SIM_RULES_V0_3.md` — thứ tự tick, công thức, AI, tông môn, tranh chấp
12. `docs/10_UI_WIREFRAME.md` — wireframe giao diện
13. `docs/11_TASK_BREAKDOWN.md` — task Phase 1–5, package, benchmark

### Bản đồ thế giới (ADR-16, đã duyệt 2026-10-24; W1–W4 đã triển khai, W5–W7 chưa)
14. `docs/ASSET_RESEARCH.md` — khảo sát mapgen4, FMG, Labyrinthos, tilemap-lab và asset UI
15. `docs/WORLD_MAP_TECH_PLAN.md` — kiến trúc địa hình hex số nguyên, task W0–W7

## Chạy dự án
Yêu cầu Node ≥ 22.12 và pnpm 9.
```bash
pnpm install
pnpm dev            # web game tại http://localhost:5173
pnpm check          # lint + typecheck + toàn bộ test
pnpm build          # bản build production (apps/web/dist)
pnpm sim run --seed thien-khuyet-01 --years 20 --save-at-year 5
pnpm sim report --seed bench-002 --years 30   # thống kê + Sử ký một seed
pnpm sim bench --seeds 10 --years 100
```

## Mục tiêu
Tạo một web game tu tiên nơi người chơi lựa chọn hành động và thời gian trôi, trong khi NPC và tông môn tự vận hành. Thế giới có seed, lịch sử phát sinh từ sự kiện thật, quan hệ nhân quả và hệ thống tu luyện có rủi ro.

## Phạm vi MVP khóa
1 khu vực được sinh theo seed; 20 NPC; 3 tông môn; Luyện Khí, Trúc Cơ, Kim Đan; chuỗi tranh đoạt linh mạch; lựa chọn có hậu quả; bế quan 10 năm; lưu/tải; nhật ký lịch sử. Không làm Unity, multiplayer, backend, LLM runtime, bản đồ 3D hay hệ thống chiến đấu thời gian thực.

## Quy trình
Claude đọc tài liệu, báo cáo mâu thuẫn và đề xuất thiết kế Phase 0. Chỉ code sau khi chủ dự án duyệt. Ưu tiên vertical slice hơn mở rộng nội dung.
