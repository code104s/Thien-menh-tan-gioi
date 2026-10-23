# 04 — Hợp đồng dữ liệu (đề xuất, cần Claude rà soát)

Định danh trong mã giữ tiếng Anh để thuận tiện triển khai TypeScript.

```ts
type EntityId = string;
type Day = number;
type Realm = 'qi' | 'foundation' | 'golden_core';
type Stage = 'early' | 'middle' | 'late' | 'perfect';

interface WorldState {
  schemaVersion: number;
  contentVersion: string;
  seed: string;
  day: Day;
  rngState: unknown;
  locations: Record<EntityId, Location>;
  characters: Record<EntityId, Cultivator>;
  factions: Record<EntityId, Faction>;
  scheduledActions: ScheduledAction[];
  causalRecords: CausalRecord[];
  history: WorldEvent[];
  processedCommandIds: string[];
}
interface Location {
  id: EntityId;
  name: string;
  neighborIds: EntityId[];
  spiritualEnergy: number;
  resourceNodes: Record<string, number>;
  ownerFactionId: EntityId | null;
}
interface Cultivator {
  id: EntityId;
  name: string;
  ageDays: number;
  maxAgeDays: number;
  locationId: EntityId;
  factionId: EntityId | null;
  realm: Realm;
  stage: Stage;
  progress: number;
  foundation: number;
  insight: number;
  daoHeart: number;
  spiritStones: number;
  health: number;
  personality: { ambition: number; greed: number; loyalty: number; riskTolerance: number };
  currentGoal: string | null;
}
interface Faction {
  id: EntityId;
  name: string;
  leaderId: EntityId;
  memberIds: EntityId[];
  territoryIds: EntityId[];
  treasury: number;
  monthlyIncome: number;
  monthlyExpense: number;
  stability: number;
  relations: Record<EntityId, number>;
}
interface ScheduledAction {
  id: EntityId;
  actorId: EntityId;
  type: string;
  targetId?: EntityId;
  startDay: Day;
  dueDay: Day;
  status: 'planned' | 'running' | 'completed' | 'cancelled';
  reservedCosts: Record<string, number>;
}
interface WorldEvent {
  id: EntityId;
  day: Day;
  type: string;
  actorId?: EntityId;
  targetId?: EntityId;
  payload: Record<string, unknown>;
}
interface CausalRecord {
  id: EntityId;
  sourceEventId: EntityId;
  actorId: EntityId;
  targetId: EntityId;
  type: 'favor' | 'grudge' | 'debt' | 'betrayal';
  intensity: number;
  resolved: boolean;
}
interface PlayerCommand {
  commandId: string;
  actorId: EntityId;
  issuedAtDay: Day;
  type: string;
  payload: Record<string, unknown>;
}
```

## Bất biến dữ liệu
- ID duy nhất, quan hệ tham chiếu đến thực thể hợp lệ hoặc được đánh dấu đã chết/mất.
- Tài nguyên không âm nếu không có cơ chế nợ; một vị trí không có hai chủ sở hữu cùng lúc.
- Hành động không hoàn tất hai lần; `commandId` không thực thi trùng.
- RNG, scheduler và state sau save/load tạo kết quả mô phỏng như chạy liên tục.
- `unknown` trong ví dụ phải được thay bằng schema cụ thể trước khi code production.
