import { createContext } from '../src/core/context.ts';
import { generateWorld, type PlayerOrigin } from '../src/worldgen/generate.ts';
import type { PlayerCommand, WorldState } from '../src/types.ts';

export const ctx = createContext();

/** Thế giới với NPC "đóng băng" (không tự lập kế hoạch) để test một luật riêng lẻ. */
export function frozenWorld(seed = 'helpers', origin: PlayerOrigin = { kind: 'join_faction', factionIndex: 0 }): WorldState {
  const { state } = generateWorld({ seed, origin });
  for (const c of Object.values(state.characters)) c.nextReviewDay = Number.MAX_SAFE_INTEGER;
  return state;
}

/** Đặt số dư mà vẫn giữ bất biến bảo toàn linh thạch. */
export function setStones(state: WorldState, id: string, amount: number): void {
  const c = state.characters[id]!;
  state.initialStoneSupply += amount - c.spiritStones;
  c.spiritStones = amount;
}

let seq = 1000;
export function command(state: WorldState, payload: PlayerCommand['payload']): PlayerCommand {
  seq += 1;
  return { commandId: `t-${seq}`, seq, issuedAtDay: state.day, actorId: state.playerId, payload };
}
