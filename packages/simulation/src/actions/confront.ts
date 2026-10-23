/**
 * Đối đầu cá nhân (docs/09 mục 10): không gây chết trực tiếp, thương tích do đấu kẹp ở 95.
 * Oán của người khởi xướng với đối thủ được đánh dấu đã giải sau trận — đó là "thời gian chờ"
 * tự nhiên cho NPC (cần oán mới ≥ ngưỡng mới đấu tiếp).
 */
import type { ActionRule } from '../core/context.ts';
import { createEvent } from '../core/events.ts';
import { mulDiv } from '../core/math.ts';
import { getStream } from '../core/rng.ts';
import { realmPower } from '../rules/realm.ts';
import { unresolvedRecords } from '../systems/causality.ts';
import type { Cultivator, ScheduledAction, WorldState } from '../types.ts';

function opponentBlocker(state: WorldState, actor: Cultivator, targetId: string | undefined): string | null {
  const target = targetId ? state.characters[targetId] : undefined;
  if (!target || !target.alive) return 'Đối thủ không tồn tại';
  if (target.id === actor.id) return 'Không thể tự đối đầu';
  if (target.locationId !== actor.locationId) return 'Đối thủ không ở đây';
  return null;
}

/** Thêm thương tích do đấu, không vượt trần (nếu đã vượt trần từ trước thì giữ nguyên). */
function duelInjury(c: Cultivator, amount: number, cap: number): void {
  const next = Math.min(c.injury + amount, Math.max(c.injury, cap));
  if (next > c.injury) c.lastInjuryCause = 'duel';
  c.injury = next;
}

export const confrontRule: ActionRule = {
  costSink: 'cultivation',
  priority: 60,
  cancellationPolicy: 'none',
  cost: () => 0,
  duration: () => 1,
  validateStart: (state, request) => opponentBlocker(state, state.characters[request.actorId]!, request.targetId),
  validateComplete: (state, action) => opponentBlocker(state, state.characters[action.actorId]!, action.targetId),
  onComplete: (state: WorldState, action: ScheduledAction, ctx) => {
    const cfg = ctx.data.balance.actions;
    const rng = getStream(state.rng, state.seed, `duel:${action.id}`);
    const a = state.characters[action.actorId]!;
    const b = state.characters[action.targetId!]!;
    const roll = (c: Cultivator) => mulDiv(realmPower(ctx.data, c.realm, c.stage), 8000 + rng.nextInt(4001), 10_000);
    const scoreA = roll(a);
    const scoreB = roll(b);
    // Hòa thì người bị thách đấu giữ thế thắng.
    const [winner, loser] = scoreA > scoreB ? [a, b] : [b, a];
    duelInjury(loser, rng.nextRange(...cfg.duelLoserInjury), cfg.duelInjuryCap);
    duelInjury(winner, rng.nextRange(...cfg.duelWinnerInjury), cfg.duelInjuryCap);
    const event = createEvent(state, {
      type: 'duel_fought',
      severity: a.isPlayer || b.isPlayer ? 'critical' : 'info',
      visibility: 'witnesses',
      chronicle: true,
      actorId: a.id,
      targetId: b.id,
      locationId: a.locationId,
      payload: { winnerId: winner.id, loserId: loser.id, actorScore: scoreA, targetScore: scoreB },
    });
    for (const grudge of unresolvedRecords(state, a.id, 'grudge')) {
      if (grudge.towardId === b.id) grudge.resolvedByEventId = event.id;
    }
    return { events: [event] };
  },
};
