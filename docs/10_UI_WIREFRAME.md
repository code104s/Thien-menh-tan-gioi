# 10 — Wireframe giao diện MVP

Nguyên tắc: chữ rõ hơn đồ họa; mọi thông tin hiển thị lấy từ **view model** do worker gửi, UI không đọc `WorldState` thô. Toàn bộ chữ trên UI bằng tiếng Việt. Desktop trước (≥ 1280px), không bắt buộc mobile trong MVP.

## Màn 1 — Khởi đầu

```
┌──────────────────────────────────────────────────────────┐
│                 THIÊN MỆNH TÀN GIỚI                        │
│  Seed: [ thien-khuyet-01        ] [Ngẫu nhiên]             │
│  Tên nhân vật: [ ............... ]                         │
│  Xuất thân:                                                │
│   ( ) Gia nhập Thanh Vân Tông   — bổng lộc, công pháp      │
│   ( ) Gia nhập Huyết Sát Môn                               │
│   ( ) Gia nhập Vạn Pháp Các                                │
│   ( ) Tán tu                    — tự do, không bổng lộc    │
│   ( ) Tìm tài nguyên            — bắt đầu nơi hoang dã     │
│                         [Bắt đầu]   [Tải game]  [Nhập save]│
└──────────────────────────────────────────────────────────┘
```
(Tên tông môn chỉ là ví dụ; tên thật sinh theo seed.)

## Màn 2 — Màn chính

```
┌─ Năm 12, Tháng 4, Ngày 17 ─ [⏸][1×][10×][100×][Bế quan/Skip ▾] ─ [Lưu][Menu]┐
│┌──────────── BẢN ĐỒ (Canvas 2D) ────────────┐┌──── BẢNG BÊN ───────────────┐│
││   ○ Hắc Phong Lĩnh ── ○ Linh Tuyền Cốc ◆    ││ [Bản thân][Nơi này][Tông môn]││
││        │                    │               ││ Lý Thanh Phong              ││
││   ■ Thanh Vân Tông ─── ○ Thạch Trấn         ││ Luyện Khí hậu kỳ  ▓▓▓▓░ 78% ││
││        │                    │               ││ Tuổi 31 / 100  Thương 5     ││
││   ○ Mê Vụ Lâm ───────── ▲ Huyết Sát Môn     ││ Linh thạch 214              ││
││ Chú thích: ■▲● trụ sở, ◆ linh mạch,          ││ Đang: Tu luyện (còn 41 ngày)││
││ màu = tông môn sở hữu, ⚔ đang tranh chấp     ││ ── Hành động ──             ││
│└─────────────────────────────────────────────┘│ [Tu luyện] [Bế quan]        ││
│┌──── BIẾN CỐ GẦN ĐÂY ─────────────────────────┐│ [Di chuyển▾][Thu thập]      ││
││ ⚠ N12 T4 Huyết Sát Môn khiêu khích tranh       ││ [Làm nhiệm vụ][Dưỡng thương]││
││   Linh Tuyền Cốc với Thanh Vân Tông            ││ [Đột phá] (chưa đủ điều kiện:││
││ • N12 T3 Trương Mặc đột phá Trúc Cơ            ││   tu vi chưa viên mãn)      ││
││ Lọc: [Tất cả▾]                                 │└─────────────────────────────┘│
│└───────────────────────────────────────────────┘                              │
└───────────────────────────────────────────────────────────────────────────────┘
```
- Nút hành động không khả thi vẫn hiện nhưng mờ, kèm **lý do** (lấy từ validator của simulation).
- Nhấp địa điểm/nhân vật trên bản đồ → bảng bên chuyển tab tương ứng.
- Nhân vật chỉ hiển thị thông tin người chơi **đã biết**; thông tin chưa biết hiện "?".

## Màn 3 — Hộp thoại

**Bế quan**
```
┌── Bế quan ───────────────────────────┐
│ Thời gian: [ 10 ] năm  (1–10)         │
│ Công pháp: Thanh Vân Quyết (5 lt/tháng)│
│ Chi phí giữ chỗ: 600 linh thạch       │
│ Dự kiến tu vi: +~3 tầng nhỏ           │
│ [x] Ngắt khi có biến cố Quan trọng    │
│             [Hủy]   [Bắt đầu bế quan] │
└───────────────────────────────────────┘
```

**Ngắt khi bế quan (ADR-06)**
```
┌── Biến cố khẩn ───────────────────────┐
│ Năm 17: Tông chủ Thanh Vân Tông tọa hóa│
│ Bạn đã bế quan 5 năm 2 tháng.          │
│ [Tiếp tục bế quan]                     │
│ [Xuất quan sớm] — mất 10% tu vi tăng    │
│   trong lần bế quan, hoàn 50% linh thạch│
└────────────────────────────────────────┘
```

**Lựa chọn (PlayerChoice)** — ví dụ tham chiến: tiêu đề, bối cảnh, 2–3 lựa chọn, hệ quả đã biết, hạn chót.

**Xuất quan / tóm tắt** — sau Skip dài: "Trong 10 năm qua" gồm: tông môn thắng/thua tranh chấp, ai đột phá, ai chết, thay đổi lãnh địa, lựa chọn mới mở. Lấy từ event log.

## Màn 4 — Sử ký và Tông môn

```
┌── Sử ký ─────────────── [Theo năm ▾] [Lọc tông môn ▾] ┐
│ Năm 1  • Thiên Khuyết năm thứ nhất, thế giới hình thành│
│ Năm 7  • Huyết Sát Môn tranh đoạt Linh Tuyền Cốc —      │
│          nguyên nhân: kho cạn; kết quả: chiếm được      │
│ Năm 9  • Lý Thanh Phong (bạn) bế quan                   │
│ ...                                                     │
└─────────────────────────────────────────────────────────┘
```
Mỗi dòng: mốc năm, tác nhân, đối tượng, nguyên nhân (`causeEventId`), kết quả — đúng yêu cầu GDD. Bấm vào dòng → xem chuỗi nhân quả.

Tab **Tông môn**: tông chủ, thành viên, kho, lãnh địa, quan hệ ngoại giao (thanh −100..100), chiến lược hiện tại, tranh chấp đang diễn ra.

## Màn 5 — Game over
Nguyên nhân và năm mất, tóm tắt cuộc đời người chơi, nút [Xem Sử ký] [Seed mới] [Xuất save].
