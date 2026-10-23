/**
 * Giao thức UI ↔ worker (docs/02, ADR-05). Tin nhắn UI → worker được validate bằng Zod tại worker;
 * tin nhắn worker → UI là nội bộ, chỉ định kiểu TypeScript.
 */
import { ACTION_TYPES } from '@tmtg/simulation';
import { z } from 'zod';
import { originSchema, saveFileSchema, type SaveFile } from './saveFile.ts';
import type { FeedEntry, SkipSummary, Speed, ViewModel } from './view.ts';
import type { ChronicleEntry } from '@tmtg/simulation';

const entityId = z.string().regex(/^[a-z]+_[0-9]+$/);

export const commandPayloadSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('START_ACTION'),
    actionType: z.enum(ACTION_TYPES),
    targetId: entityId.exactOptional(),
    durationDays: z.int().positive().max(3600),
  }),
  z.object({ type: z.literal('CANCEL_ACTION'), actionId: entityId }),
  z.object({ type: z.literal('RESOLVE_CHOICE'), choiceId: entityId, optionId: z.string().min(1).max(32) }),
]);

export const toWorkerSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('INIT_NEW'),
    seed: z.string().min(1).max(64),
    origin: originSchema,
    playerName: z.string().max(32).exactOptional(),
  }),
  z.object({ type: z.literal('INIT_LOAD'), save: saveFileSchema }),
  z.object({ type: z.literal('COMMAND'), payload: commandPayloadSchema }),
  z.object({ type: z.literal('SET_SPEED'), speed: z.union([z.literal(0), z.literal(1), z.literal(10), z.literal(100)]) }),
  z.object({ type: z.literal('SKIP_UNTIL'), days: z.int().min(1).max(3600) }),
  z.object({ type: z.literal('PAUSE') }),
  z.object({ type: z.literal('SET_SETTINGS'), stopOnImportant: z.boolean() }),
  z.object({ type: z.literal('SAVE_REQUEST'), slot: z.string().min(1).max(32) }),
  z.object({ type: z.literal('CHRONICLE_REQUEST') }),
]);

export type ToWorker = z.infer<typeof toWorkerSchema>;

export type InterruptKind = 'critical_event' | 'important_event' | 'player_action_finished' | 'choice_required' | 'game_over' | 'skip_done';

export type FromWorker =
  | { type: 'READY'; view: ViewModel; feed: FeedEntry[]; speed: Speed; stopOnImportant: boolean }
  | { type: 'STATE'; view: ViewModel; newFeed: FeedEntry[]; speed: Speed; running: boolean }
  | { type: 'INTERRUPTED'; reason: InterruptKind; entry: FeedEntry | null; summary: SkipSummary | null }
  | { type: 'COMMAND_RESULT'; ok: boolean; reason: string | null }
  | { type: 'SAVE_DATA'; slot: string; save: SaveFile }
  | { type: 'CHRONICLE'; entries: ChronicleEntry[] }
  | { type: 'ERROR'; message: string };
