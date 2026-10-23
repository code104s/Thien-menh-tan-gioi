/**
 * Áp dụng lệnh người chơi ở đầu ngày (bước 0). Lệnh có seq ≤ lastCommandSeq bị bỏ qua im lặng (idempotent);
 * lệnh sai điều kiện sinh event `command_rejected` và không đổi state nào khác ngoài lastCommandSeq.
 */
import type { SimContext } from './context.ts';
import { createEvent } from './events.ts';
import { finishAction, startAction } from './scheduler.ts';
import { resolveChoice } from '../systems/choices.ts';
import type { PlayerCommand, WorldEvent, WorldState } from '../types.ts';

export function applyCommands(state: WorldState, commands: readonly PlayerCommand[], ctx: SimContext): WorldEvent[] {
  const events: WorldEvent[] = [];
  const ordered = [...commands].sort((a, b) => a.seq - b.seq);
  for (const command of ordered) {
    if (command.issuedAtDay !== state.day) {
      throw new Error(`Lệnh ${command.commandId} dành cho ngày ${command.issuedAtDay}, đang xử lý ngày ${state.day}`);
    }
    if (command.seq <= state.lastCommandSeq) continue;
    state.lastCommandSeq = command.seq;
    const reason = applyOne(state, command, ctx, events);
    if (reason !== null) {
      events.push(createEvent(state, {
        type: 'command_rejected',
        severity: 'info',
        visibility: 'secret',
        chronicle: false,
        actorId: command.actorId,
        payload: { commandId: command.commandId, commandType: command.payload.type, reason },
      }));
    }
  }
  return events;
}

/** Trả lý do từ chối, hoặc null nếu đã áp dụng. */
function applyOne(state: WorldState, command: PlayerCommand, ctx: SimContext, events: WorldEvent[]): string | null {
  if (state.gameOver) return 'Trò chơi đã kết thúc';
  if (command.actorId !== state.playerId) return 'Chỉ người chơi được ra lệnh';
  const payload = command.payload;
  switch (payload.type) {
    case 'START_ACTION': {
      const result = startAction(state, {
        actorId: command.actorId,
        type: payload.actionType,
        ...(payload.targetId !== undefined ? { targetId: payload.targetId } : {}),
        durationDays: payload.durationDays,
        source: 'player',
      }, ctx);
      if (!result.ok) return result.reason;
      events.push(...result.events);
      return null;
    }
    case 'CANCEL_ACTION': {
      const action = state.actions[payload.actionId];
      if (!action || action.actorId !== command.actorId) return 'Không có hành động này để hủy';
      events.push(...finishAction(state, action.id, 'cancelled', ctx, { reason: 'Người chơi hủy' }));
      return null;
    }
    case 'RESOLVE_CHOICE': {
      const result = resolveChoice(state, payload.choiceId, payload.optionId);
      if (!result.ok) return result.reason;
      events.push(...result.events);
      return null;
    }
  }
}
