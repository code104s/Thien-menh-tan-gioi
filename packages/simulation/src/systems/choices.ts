/** Lựa chọn của người chơi (PlayerChoice): giải quyết theo lệnh hoặc tự áp mặc định khi hết hạn. */
import { createEvent } from '../core/events.ts';
import type { PlayerChoice, WorldEvent, WorldState } from '../types.ts';

export type ResolveResult = { ok: true; events: WorldEvent[] } | { ok: false; reason: string };

export function resolveChoice(state: WorldState, choiceId: string, optionId: string, defaulted = false): ResolveResult {
  const choice = state.pendingChoices.find((c) => c.id === choiceId);
  if (!choice) return { ok: false, reason: 'Lựa chọn không còn hiệu lực' };
  if (!choice.options.some((o) => o.id === optionId)) return { ok: false, reason: 'Phương án không hợp lệ' };
  apply(state, choice, optionId);
  state.pendingChoices = state.pendingChoices.filter((c) => c.id !== choiceId);
  return {
    ok: true,
    events: [createEvent(state, {
      type: 'choice_resolved',
      severity: 'info',
      visibility: 'secret',
      chronicle: false,
      actorId: state.playerId,
      causeEventId: choice.eventId,
      payload: { choiceId, kind: choice.kind, subjectId: choice.subjectId, optionId, defaulted },
    })],
  };
}

function apply(state: WorldState, choice: PlayerChoice, optionId: string): void {
  switch (choice.kind) {
    case 'dispute_participation': {
      const dispute = state.disputes[choice.subjectId];
      if (dispute) dispute.playerStance = optionId === 'fight' ? 'fight' : 'avoid';
      return;
    }
  }
}

/** Lựa chọn quá hạn (day > expiresDay) được áp phương án mặc định. */
export function expireChoices(state: WorldState): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (const choice of [...state.pendingChoices]) {
    if (state.day <= choice.expiresDay) continue;
    const result = resolveChoice(state, choice.id, choice.defaultOptionId, true);
    if (result.ok) events.push(...result.events);
  }
  return events;
}
