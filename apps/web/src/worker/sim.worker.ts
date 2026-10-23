/**
 * Web Worker chạy mô phỏng (ADR-05). Thời gian thực chỉ quyết định tốc độ gọi tick, không là đầu vào domain.
 * - Pause/1×/10×/100×: mỗi 50 ms chạy speed × 0,05 ngày (dồn phần lẻ).
 * - Skip Until: chạy theo lô 30 ngày, nhả luồng giữa các lô để nhận PAUSE/COMMAND.
 */
import { toWorkerSchema, type FromWorker, type InterruptKind, type Speed, type ViewModel } from '@tmtg/shared';
import type { InterruptReason } from '@tmtg/simulation';
import { SimHost } from './host.ts';

interface WorkerScope {
  postMessage(message: FromWorker): void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
}
const scope = self as unknown as WorkerScope;
const post = (message: FromWorker) => scope.postMessage(message);

const FRAME_MS = 50;
const SKIP_BATCH_DAYS = 30;

let host: SimHost | null = null;
let speed: Speed = 0;
let stopOnImportant = true;
let budget = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let skip: { untilDay: number; fromDay: number; before: ViewModel['player'] } | null = null;

function stopReasons(): Set<InterruptReason> {
  const reasons = new Set<InterruptReason>(['critical_event', 'choice_required', 'game_over', 'player_action_finished']);
  if (stopOnImportant) reasons.add('important_event');
  return reasons;
}

function clearTimer() {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

function publish(newFeed: ReturnType<SimHost['advance']>['newFeed'] = []) {
  if (!host) return;
  post({ type: 'STATE', view: host.view(), newFeed, speed, running: speed > 0 || skip !== null });
}

function halt() {
  speed = 0;
  skip = null;
  budget = 0;
  clearTimer();
}

type InterruptEntry = Extract<FromWorker, { type: 'INTERRUPTED' }>['entry'];

function handleInterrupt(reason: InterruptKind, entry: InterruptEntry) {
  if (!host) return;
  const summary = skip ? host.summary(skip.fromDay, skip.before, host.view().player) : null;
  halt();
  publish();
  post({ type: 'INTERRUPTED', reason, entry, summary });
}

function frame() {
  timer = null;
  if (!host || speed === 0) return;
  budget += (speed * FRAME_MS) / 1000;
  const days = Math.floor(budget);
  budget -= days;
  if (days > 0) {
    const result = host.advance(days, stopReasons());
    if (result.interrupt) {
      publish(result.newFeed);
      handleInterrupt(result.interrupt.reason, result.interrupt.entry);
      return;
    }
    publish(result.newFeed);
  }
  timer = setTimeout(frame, FRAME_MS);
}

function skipBatch() {
  timer = null;
  if (!host || !skip) return;
  const remaining = skip.untilDay - host.state.day;
  if (remaining <= 0) {
    handleInterrupt('skip_done', null);
    return;
  }
  const result = host.advance(Math.min(SKIP_BATCH_DAYS, remaining), stopReasons());
  publish(result.newFeed);
  if (result.interrupt) {
    handleInterrupt(result.interrupt.reason, result.interrupt.entry);
    return;
  }
  timer = setTimeout(skipBatch, 0);
}

function ready() {
  if (!host) return;
  halt();
  post({ type: 'READY', view: host.view(), feed: [...host.feed], speed, stopOnImportant });
}

scope.onmessage = (event) => {
  const parsed = toWorkerSchema.safeParse(event.data);
  if (!parsed.success) {
    post({ type: 'ERROR', message: `Tin nhắn không hợp lệ: ${parsed.error.issues[0]?.message ?? '?'}` });
    return;
  }
  const message = parsed.data;
  try {
    switch (message.type) {
      case 'INIT_NEW':
        host = SimHost.createNew({
          seed: message.seed, origin: message.origin, ...(message.playerName ? { playerName: message.playerName } : {}),
        });
        ready();
        return;
      case 'INIT_LOAD':
        host = SimHost.fromSave(message.save);
        ready();
        return;
      case 'SET_SETTINGS':
        stopOnImportant = message.stopOnImportant;
        return;
      case 'CHRONICLE_REQUEST':
        if (host) post({ type: 'CHRONICLE', entries: host.chronicle() });
        return;
    }
    if (!host) throw new Error('Chưa khởi tạo thế giới');
    switch (message.type) {
      case 'COMMAND': {
        const result = host.issue(message.payload);
        post({ type: 'COMMAND_RESULT', ok: result.ok, reason: result.reason });
        publish(result.newFeed);
        return;
      }
      case 'SET_SPEED':
        skip = null;
        clearTimer();
        speed = message.speed;
        budget = 0;
        publish();
        if (speed > 0) timer = setTimeout(frame, FRAME_MS);
        return;
      case 'SKIP_UNTIL':
        halt();
        skip = { untilDay: host.state.day + message.days, fromDay: host.state.day, before: host.view().player };
        publish();
        timer = setTimeout(skipBatch, 0);
        return;
      case 'PAUSE':
        if (skip) handleInterrupt('skip_done', null);
        else { halt(); publish(); }
        return;
      case 'SAVE_REQUEST':
        post({ type: 'SAVE_DATA', slot: message.slot, save: host.toSave(new Date().toISOString()) });
        return;
    }
  } catch (error) {
    halt();
    post({ type: 'ERROR', message: (error as Error).message });
  }
};
