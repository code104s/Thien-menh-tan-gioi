/**
 * State giao diện (Zustand) + kênh nói chuyện với worker. Không chứa logic mô phỏng:
 * mọi thay đổi thế giới đi qua tin nhắn COMMAND / SET_SPEED / SKIP_UNTIL tới worker.
 */
import type { ChronicleEntry, PlayerCommandPayload, TerrainModel } from '@tmtg/simulation';
import {
  parseSaveFile,
  type FeedEntry, type FromWorker, type InterruptKind, type SaveFile, type SkipSummary, type Speed, type ToWorker,
  type ViewModel,
} from '@tmtg/shared';
import { create } from 'zustand';
import { SaveDatabase, deleteSave, listSaves, readSave, writeSave, type SaveMeta } from '../storage/saves.ts';

export type Screen = 'start' | 'game' | 'chronicle';
export type Tab = 'self' | 'here' | 'faction' | 'people';

export interface InterruptState {
  reason: InterruptKind;
  entry: FeedEntry | null;
  summary: SkipSummary | null;
}

interface UiState {
  screen: Screen;
  view: ViewModel | null;
  feed: FeedEntry[];
  speed: Speed;
  running: boolean;
  stopOnImportant: boolean;
  tab: Tab;
  selectedLocationId: string | null;
  interrupt: InterruptState | null;
  seclusionOpen: boolean;
  savesOpen: boolean;
  saves: SaveMeta[];
  chronicle: ChronicleEntry[];
  notice: string | null;
  error: string | null;
  /** ADR-16: địa hình để vẽ bản đồ; null khi chưa nhận hoặc không dựng được. */
  terrain: TerrainModel | null;
  /** Lý do không có địa hình (UI rơi về sơ đồ cũ); null khi có địa hình hoặc chưa nhận. */
  terrainUnavailable: string | null;
}

const TERRAIN_UNAVAILABLE_TEXT = {
  legacy_save: 'Save cũ chưa có địa hình — hiển thị sơ đồ.',
  unsupported_version: 'Save tạo bởi phiên bản địa hình khác — hiển thị sơ đồ.',
  digest_mismatch: 'Địa hình sinh lại không khớp save — hiển thị sơ đồ.',
} as const;

const db = new SaveDatabase();
let worker: Worker | null = null;
/** Sau khi lệnh bế quan được chấp nhận thì tự Skip Until hết thời gian bế quan. */
let pendingSkipDays: number | null = null;

export const useUi = create<UiState>(() => ({
  screen: 'start',
  view: null,
  feed: [],
  speed: 0,
  running: false,
  stopOnImportant: true,
  tab: 'self',
  selectedLocationId: null,
  interrupt: null,
  seclusionOpen: false,
  savesOpen: false,
  saves: [],
  chronicle: [],
  notice: null,
  error: null,
  terrain: null,
  terrainUnavailable: null,
}));

const set = useUi.setState;

function send(message: ToWorker) {
  if (!worker) {
    worker = new Worker(new URL('../worker/sim.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<FromWorker>) => receive(event.data);
    worker.onerror = (event) => set({ error: `Worker lỗi: ${event.message}` });
  }
  worker.postMessage(message);
}

function receive(message: FromWorker) {
  switch (message.type) {
    case 'READY':
      set({
        screen: 'game', view: message.view, feed: message.feed, speed: message.speed, running: false,
        stopOnImportant: message.stopOnImportant, interrupt: null, selectedLocationId: message.view.player.locationId,
        error: null, terrain: null, terrainUnavailable: null,
      });
      send({ type: 'SET_SETTINGS', stopOnImportant: useUi.getState().stopOnImportant });
      return;
    case 'STATE':
      set((s) => ({
        view: message.view,
        feed: message.newFeed.length > 0 ? [...s.feed, ...message.newFeed].slice(-300) : s.feed,
        speed: message.speed,
        running: message.running,
      }));
      return;
    case 'INTERRUPTED':
      set({ interrupt: { reason: message.reason, entry: message.entry, summary: message.summary }, running: false, speed: 0 });
      if (message.reason === 'skip_done' || message.summary) actions.save('auto');
      return;
    case 'COMMAND_RESULT':
      if (!message.ok) {
        pendingSkipDays = null;
        set({ notice: message.reason });
      } else if (pendingSkipDays !== null) {
        send({ type: 'SKIP_UNTIL', days: pendingSkipDays });
        pendingSkipDays = null;
      }
      return;
    case 'SAVE_DATA':
      void persist(message.slot, message.save);
      return;
    case 'TERRAIN':
      if (message.status === 'ok') set({ terrain: message.terrain, terrainUnavailable: null });
      else set({ terrain: null, terrainUnavailable: TERRAIN_UNAVAILABLE_TEXT[message.reason] });
      return;
    case 'CHRONICLE':
      set({ chronicle: message.entries, screen: 'chronicle' });
      return;
    case 'ERROR':
      set({ error: message.message, running: false });
      return;
  }
}

async function persist(slot: string, save: SaveFile) {
  const view = useUi.getState().view;
  if (slot === '__export') {
    const blob = new Blob([JSON.stringify(save)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `thien-menh-${save.creation.seed}-ngay-${view?.day ?? 0}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  try {
    await writeSave(db, slot, save, view?.player.name ?? '?', view?.day ?? 0);
    set({ saves: await listSaves(db), notice: slot === 'auto' ? null : `Đã lưu vào ô ${slot}.` });
  } catch (error) {
    set({ error: `Không lưu được: ${(error as Error).message}` });
  }
}

export const actions = {
  newGame(seed: string, origin: Extract<ToWorker, { type: 'INIT_NEW' }>['origin'], playerName: string) {
    send({ type: 'INIT_NEW', seed, origin, ...(playerName.trim() ? { playerName: playerName.trim() } : {}) });
  },
  command(payload: PlayerCommandPayload) {
    set({ notice: null });
    send({ type: 'COMMAND', payload });
  },
  startSeclusion(years: number) {
    const days = years * 360;
    pendingSkipDays = days + 1;
    set({ seclusionOpen: false });
    send({ type: 'COMMAND', payload: { type: 'START_ACTION', actionType: 'seclusion', durationDays: days } });
  },
  setSpeed(speed: Speed) {
    send({ type: 'SET_SPEED', speed });
  },
  skip(days: number) {
    send({ type: 'SKIP_UNTIL', days });
  },
  pause() {
    send({ type: 'PAUSE' });
  },
  setStopOnImportant(value: boolean) {
    set({ stopOnImportant: value });
    send({ type: 'SET_SETTINGS', stopOnImportant: value });
  },
  dismissInterrupt() {
    set({ interrupt: null });
  },
  save(slot: string) {
    send({ type: 'SAVE_REQUEST', slot });
  },
  async refreshSaves() {
    try {
      set({ saves: await listSaves(db) });
    } catch (error) {
      set({ error: `Không đọc được danh sách save: ${(error as Error).message}` });
    }
  },
  async load(slot: string) {
    try {
      const save = await readSave(db, slot);
      set({ savesOpen: false, feed: [] });
      send({ type: 'INIT_LOAD', save });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },
  async importFile(file: File) {
    try {
      const { save } = parseSaveFile(await file.text());
      set({ savesOpen: false, feed: [] });
      send({ type: 'INIT_LOAD', save });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },
  async remove(slot: string) {
    await deleteSave(db, slot);
    set({ saves: await listSaves(db) });
  },
  openChronicle() {
    send({ type: 'CHRONICLE_REQUEST' });
  },
};
