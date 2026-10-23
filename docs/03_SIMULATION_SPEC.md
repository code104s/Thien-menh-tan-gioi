# 03 — Quy tắc mô phỏng và thứ tự xử lý

## Đơn vị thời gian
Một tick là một ngày mô phỏng, xử lý nguyên tử. Lệnh người chơi được áp dụng tại ranh giới trước ngày. Không dùng thời gian thực làm nguồn kết quả.

## Thứ tự tick đề xuất
1. Nhận/validate lệnh đến hạn; 2. xử lý scheduled actions đến hạn theo (day, priority, entityId, sequence); 3. cập nhật tuổi, sức khỏe, tử vong; 4. cộng tiến độ tu luyện; 5. NPC đủ điều kiện đánh giá lại mục tiêu; 6. giải quyết kết quả hành động và biến cố; 7. kinh tế ở ranh giới tháng, chiến lược tông môn ở ranh giới quý; 8. ghi causal records, lịch sử; 9. kiểm tra interrupt; 10. phát state patch/snapshot. Claude phải chốt thứ tự chính xác và test trước khi code.

## Hành động
Mỗi hành động có actor, type, target, location, startDay, dueDay, reservedCosts, cancellationPolicy, status. Kiểm tra điều kiện lúc bắt đầu và khi kết thúc; chi phí chỉ bị trừ một lần. Xử lý actor chết, mục tiêu biến mất, địa điểm thay đổi, hành động bị hủy. Sự kiện hoàn tất idempotent.

## NPC Utility AI
Tạo mục tiêu hợp lệ, tính điểm nhu cầu + tính cách + lợi ích − rủi ro − chi phí. Tie-break ổn định. Đánh giá lại khi hoàn thành hành động, có sự kiện Critical hoặc đến kỳ. Dùng kế hoạch ngắn 1–3 bước, tránh GOAP vô hạn. Có thời gian cam kết và hysteresis chống đổi mục tiêu liên tục.

## Tu luyện
Tiến độ phụ thuộc tốc độ cơ bản × linh căn × công pháp × linh khí vùng × trạng thái. Mỗi hệ số có giới hạn. Đạt viên mãn phải đột phá theo điều kiện; dùng RNG xác định. Thất bại có hậu quả rõ và không tự động giết nhân vật trừ khi luật cho phép. Tuổi thọ và tử vong áp dụng chung.

## Tông môn
Mỗi tháng cập nhật thu/chi, dự trữ và hỗ trợ thành viên; mỗi quý chọn chiến lược. Không cho kho âm trừ khi có cơ chế nợ rõ ràng. Tranh chấp linh mạch đòi điều kiện quan hệ, nhu cầu và lực lượng. Chuyển quyền sở hữu phải là giao dịch nguyên tử.

## Nhân quả và thông tin
Quan hệ ân/oán gắn với sự kiện gốc. NPC chỉ phản ứng với thông tin đã biết; tin tức truyền theo nhân chứng, thư tín hoặc công khai. Không tạo thù hận từ sự kiện bí mật mà NPC chưa biết. Sử ký chỉ ghi sự kiện đã xảy ra.

## Bế quan và ngắt
Skip Until dừng ở hành động hoàn tất, Critical interrupt, giới hạn thời gian hoặc lệnh người chơi. Important interrupt tùy thiết lập. Khi bế quan dài hạn, không bỏ qua lịch hành động, chết do tuổi hoặc sự kiện tranh chấp.
