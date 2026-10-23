# 02 — Kiến trúc kỹ thuật web

## Stack
Vite + React + TypeScript; Zustand chỉ quản lý state giao diện; Simulation Core TypeScript thuần; Web Worker chạy mô phỏng; IndexedDB/Dexie lưu local; Zod kiểm tra dữ liệu tại ranh giới; Vitest test. Canvas 2D trước, chỉ chọn PixiJS nếu spike chứng minh cần thiết. Không backend trong MVP.

## Ranh giới module
`apps/web/`: UI, worker adapter, presentation. `packages/simulation/`: core, cultivation, NPC, factions, events, history. `packages/game-data/`: dữ liệu JSON. `packages/shared/`: schema và message contract. `tests/`: determinism, scenarios, benchmark.

## Hướng phụ thuộc
UI → controller/worker protocol → pure simulation → game data. Storage adapter lưu snapshot serializable. Domain không import React, DOM, Worker hoặc IndexedDB.

## Lệnh và sự kiện
Command là yêu cầu có actor, action, target, day, commandId; được validate trước khi thực thi. Event là kết quả bất biến có eventId, day, type, actor, payload. Không cho UI tự sửa WorldState. Chống xử lý lệnh trùng bằng commandId.

## Determinism
RNG có seed và trạng thái lưu được; không dùng `Math.random`, thời gian hệ thống hoặc thứ tự lặp không ổn định trong domain. Quy định rõ thứ tự tick, tie-break theo ID và sequence. Test cùng seed + commands phải cho cùng canonical digest.

## Worker protocol
UI gửi INIT, COMMAND, ADVANCE, SKIP_UNTIL, SAVE_REQUEST. Worker trả READY, STATE_PATCH/SNAPSHOT, EVENTS, INTERRUPTED, ERROR. Không gửi toàn bộ WorldState sau mỗi ngày nếu không cần.

## Lưu/tải
Snapshot gồm schemaVersion, contentVersion, day, seed, rngState, entities, scheduler, event cursor và command deduplication state. IndexedDB lưu bản snapshot nguyên tử. Tải lại phải giữ đúng lịch hành động và RNG. Cần kế hoạch migration trước khi thay schema.

## Hiệu năng
NPC lập kế hoạch theo lịch hoặc biến cố, không chạy full AI mỗi frame. Kinh tế tính theo tháng, chiến lược tông môn theo quý. Skip dài hạn được batch ở đoạn an toàn nhưng không được vượt mốc chết, đột phá, chiến tranh hay event quan trọng. Benchmark ở headless runner và browser.

## Bảo mật và vận hành
MVP offline-first, không cần API key. Không thực thi mã từ nội dung sự kiện; dữ liệu được validate. Lưu trữ local có nút export/import save và xử lý save hỏng.
