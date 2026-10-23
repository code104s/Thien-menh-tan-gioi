# 05 — Lộ trình và cổng nghiệm thu

## Phase 0 — Phân tích thiết kế (cần phê duyệt)
Bàn giao ADR kiến trúc, schema command/event, thứ tự tick, lựa chọn seeded RNG, save version, benchmark harness, UI wireframe và task breakdown. Không code production trước khi duyệt.

## Phase 1 — Nền tảng mô phỏng thuần
Tạo workspace, TypeScript config, schema, RNG, world generator, clock, scheduler, snapshot và CLI headless. Nghiệm thu: cùng seed/lệnh cùng digest; world graph hợp lệ; save/load không đổi kết quả.

## Phase 2 — Tu luyện và NPC tự chủ
20 NPC, tuổi thọ, 3 cảnh giới, công pháp, luyện công, đột phá, Utility AI và hành động có lịch. Nghiệm thu: NPC có thể tự luyện, tìm tài nguyên, đột phá, chết; không có hành động bất khả thi.

## Phase 3 — Tông môn, kinh tế, nhân quả
3 tông môn, kho, thu/chi, chiến lược quý, tranh chấp linh mạch, quan hệ và event có hậu quả. Nghiệm thu: có thể sinh xung đột từ trạng thái tài nguyên; quyền sở hữu không mâu thuẫn; lịch sử phản ánh đúng event.

## Phase 4 — Web UI có thể chơi
World Map tối giản, nhân vật, tông môn, bảng sự kiện, lựa chọn, Pause/Speed/Skip Until, nhật ký, save/load. Nghiệm thu: người chơi thực hiện hành động và bế quan 10 năm, xem thay đổi thế giới.

## Phase 5 — Kiểm thử và hoàn thiện
Chạy 10 seeds, replay, 100 năm headless, cân bằng, đo hiệu năng và sửa lỗi P0/P1. Bàn giao bản build và báo cáo.

## Ưu tiên
Đúng logic > có thể chơi > UI rõ ràng > đồ họa đẹp > mở rộng nội dung. Không thêm multiplayer, backend hoặc AI hội thoại vào MVP.
