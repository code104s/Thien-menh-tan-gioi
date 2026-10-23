# 01 — Tài liệu thiết kế game (GDD) — MVP

## Ý tưởng cốt lõi
**Thiên Mệnh Tàn Giới** là web game tu tiên chơi đơn, kết hợp lựa chọn của người chơi với mô phỏng thế giới độc lập. Người chơi xuất phát từ tu sĩ cấp thấp tại khu vực sinh theo seed. Khi người chơi tu luyện, di chuyển hay bế quan, các tu sĩ và tông môn khác vẫn hành động. Không có tuyến nhiệm vụ chính bắt buộc hay định mệnh nhân vật được chọn.

## Năm trụ cột
1. Thế giới vận hành kể cả khi người chơi không can thiệp.
2. Tu luyện tốn thời gian/tài nguyên và có rủi ro.
3. Lựa chọn làm thay đổi WorldState, không chỉ đổi hội thoại.
4. Sử ký phát sinh từ event log thực tế.
5. Seed và lựa chọn khác nhau tạo khả năng chơi lại.

## Bối cảnh
Thiên Khuyết làm thiên địa tổn thương, linh mạch suy kiệt và bí cảnh xuất hiện. Các tông môn tranh giành linh thạch và địa bàn. Đạo Ngân Thiên Địa là dấu tích tu sĩ mạnh để lại trên vùng đất, có thể ảnh hưởng tài nguyên hoặc sinh cơ duyên về sau. Đây là cơ chế tương lai; MVP chỉ cần ghi sự kiện và 1–2 tác động đơn giản.

## Vòng lặp chính
Quan sát thế giới → chọn hành động → đặt thời gian thực hiện → mô phỏng NPC và thế lực → nhận kết quả, lịch sử, biến cố → chọn tiếp. Hỗ trợ Pause, 1×, 10×, 100× và Skip Until. Biến cố Critical tự ngắt; Important tùy cài đặt; Informational chỉ ghi log.

## Tu luyện MVP
Ba cảnh giới: Luyện Khí → Trúc Cơ → Kim Đan. Mỗi cảnh giới có sơ/trung/hậu/viên mãn. Thuộc tính tối thiểu: linh căn, ngộ tính, căn cơ, đạo tâm, tu vi, tuổi thọ, linh thạch, thương tích. Công pháp có điều kiện học, hiệu suất, tiêu hao và rủi ro. Đột phá kiểm tra điều kiện và dùng seeded RNG; thất bại có thể gây thương tích, giảm căn cơ hoặc mất tuổi thọ. NPC và người chơi tuân cùng luật.

## NPC
20 NPC quan trọng có tuổi, cảnh giới, tính cách, mục tiêu, tông môn, vị trí, quan hệ và ký ức có chọn lọc. Mục tiêu khả thi: tu luyện, kiếm linh thạch, mua vật tư, tìm nơi linh khí cao, chuẩn bị đột phá, hỗ trợ hoặc đối đầu nhân vật khác. Không cần hội thoại AI tự do.

## Thế lực
3 tông môn với lãnh địa, thành viên, kho linh thạch, thu/chi định kỳ, quan hệ ngoại giao và mục tiêu chiến lược. Tranh chấp linh mạch do nhu cầu tài nguyên và tương quan lực lượng kích hoạt. Chưa mô phỏng trận đánh thời gian thực; dùng giải quyết theo giai đoạn.

## Nhân quả và lịch sử
Ghi ân, oán, nợ, phản bội giữa các thực thể; không dùng một thanh thiện/ác đơn giản. Sự kiện phải có điều kiện, cooldown và hậu quả cụ thể. Sử ký gồm mốc năm, tác nhân, đối tượng, nguyên nhân và kết quả, được tạo từ simulation.

## Vertical slice cần chơi được
Người chơi chọn gia nhập một tông môn, làm tán tu hoặc tìm tài nguyên. Hai tông môn cạnh tranh linh mạch; NPC tăng tu vi và thay đổi quan hệ. Người chơi có thể bế quan 10 năm; khi xuất quan xem tông môn nào thắng, ai đã đột phá hoặc chết, và lựa chọn mới nào mở ra.

## Ngoài phạm vi
Không multiplayer, Unity, thế giới vô hạn, 9 cảnh giới đầy đủ, hàng nghìn NPC, AI sinh hội thoại, mô phỏng 3D hoặc combat realtime.
