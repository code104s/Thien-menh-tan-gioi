/** Ngữ cảnh mô phỏng: nội dung game và luật của từng loại hành động. */
import { gameData as defaultGameData, type GameData } from '@tmtg/game-data';
import { defaultActionRules } from '../actions/index.ts';
import type {
  ActionSource, ActionType, BurnSink, CancellationPolicy, EntityId, EventPayload, ScheduledAction, WorldEvent,
  WorldState,
} from '../types.ts';

export interface ActionRequest {
  actorId: EntityId;
  type: ActionType;
  targetId?: EntityId;
  durationDays: number;
  source: ActionSource;
}

export interface CompletionResult {
  /** Event phát sinh thêm (sau event action_completed). */
  events?: WorldEvent[];
  /** Gộp vào payload của event action_completed. */
  payload?: EventPayload;
}

/** Luật của một loại hành động. Lý do từ chối là chuỗi tiếng Việt hiển thị được cho người chơi. */
export interface ActionRule {
  costSink: BurnSink;
  priority: number;
  cancellationPolicy: CancellationPolicy;
  /** Thời lượng thực tế; mặc định dùng request.durationDays. */
  duration?(state: WorldState, request: ActionRequest, ctx: SimContext): number;
  /** Chi phí linh thạch giữ chỗ lúc bắt đầu. */
  cost(state: WorldState, request: ActionRequest, ctx: SimContext): number;
  /** null = hợp lệ. Gọi lúc bắt đầu. */
  validateStart(state: WorldState, request: ActionRequest, ctx: SimContext): string | null;
  /** Event khi action vừa được tạo. */
  onStart?(state: WorldState, action: ScheduledAction, ctx: SimContext): WorldEvent[];
  /** null = hợp lệ. Gọi lại lúc kết thúc (docs/09 mục 6). */
  validateComplete?(state: WorldState, action: ScheduledAction, ctx: SimContext): string | null;
  /** Hiệu ứng khi hoàn tất; chỉ được gọi đúng một lần cho mỗi action. */
  onComplete?(state: WorldState, action: ScheduledAction, ctx: SimContext): CompletionResult;
  /** Hiệu ứng khi bị hủy (không gọi khi thất bại). */
  onCancel?(state: WorldState, action: ScheduledAction, ctx: SimContext): WorldEvent[];
}

export type ActionRegistry = Partial<Record<ActionType, ActionRule>>;

export interface SimContext {
  data: GameData;
  actions: ActionRegistry;
}

export function createContext(overrides: Partial<SimContext> = {}): SimContext {
  return { data: defaultGameData, actions: defaultActionRules, ...overrides };
}
