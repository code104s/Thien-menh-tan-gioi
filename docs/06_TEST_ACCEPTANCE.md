# 06 — Kế hoạch kiểm thử và tiêu chí nghiệm thu

## Determinism
- 10 seeds × cùng chuỗi lệnh × 2 lần chạy → canonical digest giống nhau.
- Save ở năm 5, load rồi chạy đến năm 20 → digest bằng chạy liền 20 năm.
- Seed khác thường tạo thế giới khác; không ép mọi cặp seed phải khác.

## Sinh thế giới
- Graph địa điểm liên thông; ID duy nhất; nơi bắt đầu tiếp cận được; tông môn và tài nguyên ở vị trí hợp lệ.
- Không có hai chủ sở hữu cùng lúc; generator luôn kết thúc với seeds kiểm thử.

## Tu luyện
- Không vượt cảnh giới khi chưa đủ điều kiện.
- NPC và người chơi cùng quy tắc.
- Đột phá dùng seeded RNG; thất bại có hậu quả và không tạo giá trị NaN.
- Tuổi thọ và tử vong xử lý nhất quán khi skip nhiều năm.

## NPC
- NPC không chi tiêu quá số dư, không thực hiện hành động sau khi chết.
- Mục tiêu có điều kiện hợp lệ, không chuyển qua lại liên tục.
- Hành động hủy/hoàn tất không nhân đôi hiệu ứng.

## Tông môn
- Thu/chi đúng lịch, không tạo tài nguyên ngoài nguồn đã định.
- Tranh chấp linh mạch có nguyên nhân và kết quả, không có quyền sở hữu kép.
- Tông chủ chết có quy tắc kế nhiệm hoặc tình trạng trống chức hợp lệ.

## Nhân quả và lịch sử
- Lựa chọn thay đổi state, tạo event và quan hệ liên quan.
- NPC không phản ứng với thông tin bí mật chưa được truyền đến.
- Sử ký khớp event log, không ghi sự kiện không xảy ra.

## Giao diện và lưu trữ
- Pause không tiến ngày; 1×/10×/100× điều khiển được.
- Skip Until ngắt khi Critical hoặc đạt mốc.
- Export/import save có validate và báo lỗi save hỏng.

## Hiệu năng mục tiêu, cần đo
- 100 năm / 20 NPC / 3 tông môn dưới 10 giây ở headless trên PC mục tiêu là ngưỡng tham khảo, không được tuyên bố đạt trước benchmark.
- Worker không khóa tương tác UI khi mô phỏng dài hạn.

## Báo cáo nghiệm thu
Mỗi phase cần lệnh test, số PASS/FAIL, benchmark nếu có, bug tồn đọng, commit và danh sách giới hạn đã biết.
