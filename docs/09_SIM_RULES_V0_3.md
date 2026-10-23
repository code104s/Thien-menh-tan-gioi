# 09 — Luật mô phỏng, thứ tự tick và công thức v0.3

Bổ sung và chốt `03_SIMULATION_SPEC.md`. Mọi con số là **giá trị khởi điểm** đặt trong `game-data/balance.json`; chỉnh cân bằng ở Phase 5 không cần đổi code. Thay đổi công thức (không chỉ số) cần chủ dự án duyệt.

## 1. Thứ tự tick (chốt)
`tick(state, commands) → { state, events, interrupts }` xử lý ngày `D = state.day`:

| Bước | Nội dung | Thứ tự lặp |
|---|---|---|
| 0 | Áp dụng lệnh có `issuedAtDay = D` | theo `seq` |
| 1 | Tử vong (tuổi thọ, `injury ≥ 100`), hủy action của người chết, kế nhiệm tông chủ | theo `characterId` |
| 2 | Hoàn tất action có `dueDay = D`: kiểm tra lại điều kiện → áp hiệu ứng → `completed`/`failed` | theo `(priority, actorId, seq)` |
| 3 | Cộng tu vi cho action `cultivate`/`seclusion` đang chạy; lên tầng nhỏ tự động | theo `characterId` |
| 4 | Nếu `D % 30 = 0` và `D > 0`: kinh tế tháng, hồi thương | theo `factionId`, rồi `characterId` |
| 5 | Nếu `D % 90 = 0` và `D > 0`: chiến lược tông môn, tiến giai đoạn tranh chấp, khởi tranh chấp mới | theo `factionId`, `disputeId` |
| 6 | NPC cần đánh giá lại (`needsReview` hoặc `D ≥ nextReviewDay`) lập kế hoạch, tạo action | theo `characterId` |
| 7 | Giao tin trong `pendingNews` có `deliverDay = D`; cập nhật ký ức, quan hệ, nhân quả | theo `(eventSeq, recipientId)` |
| 8 | Xét interrupt từ các event của tick này | — |
| 9 | `day = D + 1` | — |

Quy tắc: event phát ra trong một bước được xử lý bởi các bước **sau** trong cùng tick, không quay lại bước trước. Tie-break cuối cùng luôn là ID chuỗi so sánh theo code unit (`a < b`).

## 2. Tu luyện

**Ngưỡng tầng** (tu vi cần để lên tầng kế, tính theo "số ngày ở hệ số 1.0"):

| Cảnh giới | Ngày/tầng | Ngưỡng Fx/tầng | Tuổi thọ cơ bản | Sức mạnh (early/mid/late/perfect) |
|---|---|---|---|---|
| Luyện Khí | 1 800 | 1 800 000 | 100 năm | 1 / 2 / 3 / 4 |
| Trúc Cơ | 3 600 | 3 600 000 | 180 năm | 10 / 13 / 16 / 20 |
| Kim Đan | 7 200 | 7 200 000 | 400 năm | 50 / 60 / 70 / 85 |

**Tu vi mỗi ngày** khi đang `cultivate` hoặc `seclusion`:
```
gain = 1000
  × clamp(spiritRootBp, 5000, 20000) / 10000
  × clamp(technique.speedBp, 5000, 15000) / 10000     (không công pháp = 6000)
  × clamp(location.spiritualEnergyBp, 6000, 16000) / 10000
  × stateBp / 10000
stateBp = clamp(10000 − injury × 60, 4000, 10000) + (seclusion ? 2000 : 0)
```
Mỗi phép nhân dùng `mulBp` (làm tròn xuống từng bước, thứ tự cố định như trên).

- Tầng `early → middle → late → perfect`: tự động khi `progress ≥ ngưỡng`, phần dư chuyển sang tầng mới.
- Tầng `perfect`: `progress` kẹp ở ngưỡng. Muốn lên cảnh giới phải dùng action `breakthrough`.
- Kim Đan `perfect` là trần MVP: không tu thêm, NPC chuyển mục tiêu sang tài nguyên/tông môn.

**Chi phí:** `technique.stonesPerMonth` × số tháng (làm tròn lên) giữ chỗ khi bắt đầu action, hủy (`burned.cultivation`) khi hoàn tất. Không đủ tiền → không được bắt đầu (NPC chọn mục tiêu khác).

## 3. Đột phá (action `breakthrough`, 30 ngày)
Điều kiện lúc bắt đầu **và** lúc kết thúc: tầng `perfect`, `progress = ngưỡng`, `injury < 30`, `D ≥ breakthroughCooldownUntil`, `foundation ≥ 30` (lên Trúc Cơ) / `≥ 45` (lên Kim Đan), đủ chi phí (200 / 2 000 linh thạch).

```
chanceBp = base[target]                      (Trúc Cơ 5000, Kim Đan 3000)
         + (insight − 50) × 40
         + (daoHeart − 50) × 30
         + (foundation − 50) × 30
         + technique.breakthroughModBp
         − injury × 50
         − agePenaltyBp                      (bảng tra theo tuổi/tuổi thọ: <60% → 0, 80% → 1000, 95% → 2500)
chanceBp = clamp(chanceBp, 500, 9000)
```
Tung `rollBp(chanceBp)` trên luồng `breakthrough:<id>`.

- **Thành công:** lên cảnh giới mới tầng `early`, `progress = 0`, `lifespanDays = max(hiện tại, tuổi thọ cơ bản mới)`, event `breakthrough_succeeded` (severity `important`, `public`, chronicle).
- **Thất bại:** tung mức độ trên cùng luồng:
  - 60% nhẹ: `injury += 25`, `progress −= 20%` ngưỡng (kẹp 0).
  - 35% nặng: `injury += 45`, `foundation −= 8`, `lifespanDays −= 5 năm`.
  - 5% tẩu hỏa: `injury += 70`, `foundation −= 15`, `lifespanDays −= 20 năm`.
  - Luôn: `breakthroughCooldownUntil = D + 180`. Tử vong **chỉ** xảy ra qua luật chung `injury ≥ 100` ở bước 1 ngày sau → nguyên nhân `breakthrough`.

## 4. Thương tích và tuổi thọ
- Hồi thương hằng tháng: `injury −= 3` (đang `heal`: `−= 12`, tốn 10 linh thạch/tháng giữ chỗ).
- Tử vong: `D − birthDay ≥ lifespanDays` hoặc `injury ≥ 100`. Khi chết: action đang chạy → `failed`, phần giữ chỗ hoàn về ví rồi cả ví chuyển vào kho tông môn (nếu có) hoặc `burned.unclaimed_estate`.

## 5. Kinh tế tháng (bước 4)
Cho mỗi tông môn chưa giải tán, theo thứ tự id:
1. **Thu:** với mỗi linh mạch thuộc địa điểm do tông môn sở hữu: `take = min(yieldPerMonth, reserve)`; `reserve −= take`; `treasury += take`.
2. **Duy trì:** `upkeep = 20 × số lãnh địa` → `burned.faction_upkeep`. Thiếu → trả hết phần có, `stability −= 5`.
3. **Bổng lộc:** leader 30, elder 15, disciple 5 / tháng, chuyển từ kho sang ví thành viên theo thứ tự (leader → elder → disciple, rồi id). Thiếu → trả đến khi hết, event `stipend_shortfall`, `stability −= 5`, thành viên không được trả `loyalty`-quan hệ với tông môn −5.

Tài nguyên địa điểm: `resourceStock += resourceRegenPerMonth` (kẹp tối đa 3 × giá trị khởi tạo) → `minted.location_regen`.

## 6. Hành động MVP

| Loại | Thời lượng | Chi phí giữ chỗ | Hiệu ứng khi hoàn tất | Hủy |
|---|---|---|---|---|
| `travel` | `travelDays` của cạnh | 0 | đổi `locationId` | none |
| `cultivate` | 30–360 ngày | công pháp × tháng | (tu vi cộng hằng ngày) | refund_prorated |
| `seclusion` | 360–3 600 ngày (người chơi) | công pháp × tháng | như cultivate + 20% | refund_half_remaining (ADR-06) |
| `gather` | 30 ngày | 0 | lấy `min(stock, 20 + 3 × sức mạnh)` từ `resourceStock` | none |
| `duty` | 30 ngày | 0 | +10 linh thạch từ kho tông môn, quan hệ +3 | none |
| `heal` | 30–180 ngày | 10/tháng | (hồi thương tháng ×4) | refund_prorated |
| `breakthrough` | 30 ngày | 200 / 2 000 | mục 3 | refund_full nếu chưa tới ngày tung |
| `join_faction` | 7 ngày tại `seatLocationId` | 0 | nhận nếu tông môn đồng ý (mục 8) | none |
| `confront` | 1 ngày, cùng địa điểm | 0 | đấu, mục 10 | none |

Kiểm tra lại lúc hoàn tất: actor sống, còn ở `locationId` cần thiết, mục tiêu còn tồn tại/sống, điều kiện riêng. Sai → `failed`, hoàn chi phí theo policy.

## 7. NPC Utility AI (bước 6)
Đánh giá lại khi: action vừa kết thúc, nhận tin Critical liên quan bản thân, hoặc mỗi 30 ngày (`nextReviewDay`). Người chơi không qua bước này.

Mỗi mục tiêu khả thi tính điểm nguyên 0..1000:
```
score = need + personalityFit + benefit − risk − cost + jitter
jitter = nextInt(21) − 10   (luồng plan:<id>)
```
Ví dụ `need`: `heal` = injury × 8; `breakthrough` = 900 khi đủ điều kiện; `gather` = 600 nếu spiritStones < chi phí 3 tháng tu luyện; `cultivate` = 400 mặc định; `seek_energy` = (bestNearbyEnergy − currentEnergy)/20; `join_faction` = 300 cho tán tu loyalty ≥ 50; `confront` chỉ khi có grudge intensity ≥ 60 trong ký ức và đối tượng ở cùng địa điểm, × riskTolerance.

- Chọn điểm cao nhất; hòa điểm → thứ tự `GoalType` cố định → id mục tiêu.
- **Hysteresis:** chỉ bỏ kế hoạch hiện tại nếu kế hoạch hết bước, không còn hợp lệ, hoặc `newScore > score + 150` **và** `D ≥ committedUntil` (cam kết tối thiểu 30 ngày).
- Kế hoạch 1–3 bước (ví dụ `travel → cultivate`). Bước không hợp lệ → hủy kế hoạch, `needsReview = true` cho ngày hôm sau (không lặp trong cùng tick → không vòng lặp vô hạn).

## 8. Tông môn (bước 5)
**Chiến lược quý** theo điểm (hòa → thứ tự liệt kê):
- `defend`: đang bị tranh chấp hoặc sức mạnh < 70% đối thủ mạnh nhất kề bên.
- `expand`: kho < 12 tháng chi phí **hoặc** số linh mạch < đối thủ, và có mục tiêu tranh chấp hợp lệ.
- `recruit`: thành viên < 5.
- `consolidate`: mặc định.

**Thu nhận:** chấp nhận `join_faction` nếu `strategy = recruit` hoặc thành viên < 8, quan hệ của người xin với tông môn ≥ 0, và không thuộc tông môn khác. Thành viên mới là `disciple`.

**Kế nhiệm:** tông chủ chết → thành viên sống có (cảnh giới, tầng, progress) cao nhất; hòa → `birthDay` nhỏ hơn; hòa → id. Không còn ai → `leaderId = null`, `stability −= 20`, event `leader_vacant`. Không còn thành viên sống → `dissolved = true`, mọi địa điểm về `ownerFactionId = null`, kho → `burned.unclaimed_estate`.

## 9. Tranh chấp linh mạch (ADR-09)
Sức mạnh tông môn = Σ sức mạnh thành viên sống **không đang bế quan**.

**Khởi phát** (bước 5, tông môn chiến lược `expand`): mục tiêu là linh mạch ở địa điểm của tông môn khác hoặc vô chủ, kề lãnh địa. Điều kiện: quan hệ ≤ −30 (vô chủ: bỏ qua), tỉ lệ sức mạnh ≥ 80%, hết `disputeCooldowns`, linh mạch chưa bị tranh chấp. Chọn mục tiêu có `yieldPerMonth` cao nhất, hòa → id.

| Giai đoạn | Thời gian | Xử lý |
|---|---|---|
| Khiêu khích | 1 quý | Quan hệ hai bên −20; event `dispute_started` (important, public). Nếu sức mạnh tấn công ≥ 2× phòng thủ: bên phòng thủ nhượng bộ → chuyển quyền, kết thúc |
| Giao tranh | 1–3 quý | Mỗi quý: `score += power × (8000 + nextInt(4001)) / 10000` cho mỗi bên (luồng `dispute:<id>`). Mỗi thành viên tham chiến tung thương: `injury += 10..40`; tử vong chỉ qua `injury ≥ 100`. Người chơi là thành viên và không bế quan → nhận `PlayerChoice` "tham chiến / né tránh" |
| Kết thúc | ngay sau giao tranh | Chênh lệch điểm ≥ 30% tổng → bên hơn thắng; hết 3 quý mà không đạt → đình chiến (quan hệ +10). Tấn công thắng → `transferLocationOwnership` (nguyên tử). Bên thua tạo `grudge` với bên thắng. Cooldown 2 năm cho cặp tông môn |

Mục tiêu vertical slice: worldgen bảo đảm ít nhất một linh mạch giáp ranh giữa hai tông môn và quan hệ khởi đầu của họ trong [−40, −25] → tranh chấp xảy ra trong 10 năm ở **≥ 8/10 seed** kiểm thử (mục tiêu cân bằng, đo ở Phase 3/5).

## 10. Đối đầu cá nhân (`confront`)
Không gây chết trực tiếp. Sức mạnh × `(8000 + nextInt(4001))/10000` mỗi bên; bên thua `injury += 15..35` (kẹp tối đa 95 do riêng đấu), bên thắng `injury += 0..10`. Event `duel_fought` visibility `witnesses`. Bên thua tạo grudge (intensity 40) khi biết. Cooldown 1 năm giữa cùng cặp.

## 11. Nhân quả và thông tin (bước 7)
- Event sinh `NewsItem` theo ADR-08. Khi người nhận nhận tin: thêm `MemoryEntry` (đầy 32 → bỏ salience thấp nhất, hòa → cũ nhất).
- Chỉ khi **người mang** biết event gốc mới tạo `CausalRecord`. Ví dụ: bị đánh trọng thương → grudge(nạn nhân → kẻ đánh); tông môn trả bổng lộc lúc khó khăn → favor.
- `relations[toward] += ±intensity / 4` khi tạo, kẹp [−100, 100].
- Quan hệ tông môn mỗi quý dịch về trung bình quan hệ của thành viên với thành viên bên kia × 10%.

## 12. Interrupt (bước 8)

| Severity | Ví dụ | Hành vi |
|---|---|---|
| critical | người chơi bị thương nặng (injury ≥ 60), tông môn của người chơi bị tranh chấp, tông chủ của người chơi chết, có `PlayerChoice` mới, action của người chơi `failed` | luôn ngắt |
| important | tông chủ bất kỳ chết, tranh chấp bắt đầu/kết thúc, NPC người chơi biết đột phá cảnh giới | ngắt nếu bật trong cài đặt |
| info | còn lại | chỉ ghi log |

Skip Until dừng khi: đạt ngày đích, action của người chơi hoàn tất, critical, important (nếu bật), hoặc người chơi bấm Pause. Interrupt chỉ dựa trên event người chơi **đã biết** (qua tin tức) — người chơi không được "biết trước" bí mật.

## 13. Đạo Ngân (tối giản)
Khi một nhân vật Kim Đan chết hoặc đột phá Kim Đan tại địa điểm X: ghi `dao_mark_left`, `spiritualEnergyBp` của X +500 (kẹp 16000). Một địa điểm tối đa 1 tác động.

## 14. Sinh thế giới
- 14 địa điểm: cây khung ngẫu nhiên + 4 cạnh bổ sung, `travelDays` 3–15; 3 trụ sở tông môn cách nhau ≥ 2 cạnh; 5 linh mạch.
  - **ADR-16 (W4 đã triển khai 2026-10-23):** đồ thị được suy ra từ địa hình hex; mô tả "cây khung ngẫu nhiên, `travelDays` 3–15" ở trên không còn đúng. Cây khung là MST của các vùng kề nhau, `travelDays` lấy từ chi phí đường đi, trụ sở và linh mạch xếp theo địa khí. Quy tắc chi tiết ở `08` › "Quy tắc worldgen v2". Số lượng 14/3/5/1/2 không đổi.
- 3 tông môn: mỗi tông 1 tông chủ (Trúc Cơ hậu kỳ trở lên; đúng một tông có Kim Đan sơ kỳ), 1–2 trưởng lão, 3–4 đệ tử; còn lại là tán tu → tổng **20 NPC**.
- Người chơi `chr_0000`: 16 tuổi, Luyện Khí sơ kỳ, linh căn 8000–12000, 50 linh thạch, chọn xuất thân: gia nhập 1 trong 3 tông môn / tán tu / tìm tài nguyên (bắt đầu ở địa điểm hoang dã giàu tài nguyên).
- Tên Hán-Việt sinh từ `names.json` bằng luồng `worldgen`.
- Generator là thuật toán hữu hạn bước (không vòng lặp "thử lại tới khi đúng"); nếu cần sửa graph thì sửa tất định.
