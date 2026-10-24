/**
 * SimHost: bộ điều khiển mô phỏng chạy trong worker, TypeScript thuần (test được trên Node).
 * - Giữ WorldState, command log và event log rút gọn (Sử ký + event có ý nghĩa + event của người chơi).
 * - Lệnh người chơi được áp ngay ở ranh giới đầu ngày hiện tại (state.day chưa được xử lý), tương đương
 *   bước 0 của tick ngày đó, nên replay từ seed + command log cho đúng cùng kết quả.
 */
import {
  SALIENCE, applyCommands, buildChronicle, createContext, describeEvent, formatDate, generateWorld, regenerateTerrain, tick,
  toSnapshot, type TerrainStatus,
  type ChronicleEntry, type InterruptReason, type PlayerCommand, type PlayerCommandPayload, type PlayerOrigin,
  type SimContext, type WorldEvent, type WorldState,
} from '@tmtg/simulation';
import {
  SAVE_FORMAT, parseSaveFile, saveChecksum, type FeedEntry, type SaveFile, type SkipSummary, type ViewModel,
} from '@tmtg/shared';
import { buildViewModel } from './viewModel.ts';

export interface Creation {
  seed: string;
  origin: PlayerOrigin;
  playerName?: string;
}

export interface AdvanceResult {
  days: number;
  newFeed: FeedEntry[];
  interrupt: { reason: InterruptReason; entry: FeedEntry | null } | null;
}

const FEED_LIMIT = 300;
/** Khi một tick có nhiều interrupt, báo cái quan trọng nhất. */
const INTERRUPT_PRIORITY: InterruptReason[] = [
  'game_over', 'choice_required', 'critical_event', 'important_event', 'player_action_finished',
];
const OWN_EVENT_TYPES = new Set(['action_completed', 'action_failed', 'action_cancelled', 'command_rejected', 'choice_resolved']);

export class SimHost {
  readonly ctx: SimContext;
  private readonly log: WorldEvent[] = [];
  private readonly index = new Map<string, WorldEvent>();
  private feedEntries: FeedEntry[] = [];
  /** Event của lệnh đã áp trong ngày hiện tại, chờ tick kế tiếp xử lý (tin tức, interrupt). */
  private pendingStep0: WorldEvent[] = [];

  private constructor(
    public state: WorldState,
    readonly creation: Creation,
    private readonly commands: PlayerCommand[],
    events: readonly WorldEvent[],
    ctx?: SimContext,
  ) {
    this.ctx = ctx ?? createContext();
    for (const e of events) this.keep(e);
    this.feedEntries = events
      .filter((e) => this.isPlayerFacing(e))
      .slice(-FEED_LIMIT)
      .map((e) => this.toFeed(e));
  }

  static createNew(creation: Creation, ctx?: SimContext): SimHost {
    const { state, events } = generateWorld({
      seed: creation.seed, origin: creation.origin, ...(creation.playerName ? { playerName: creation.playerName } : {}),
    });
    const host = new SimHost(state, creation, [], [], ctx);
    for (const e of events) host.keep(e);
    host.feedEntries = events.map((e) => host.toFeed(e));
    return host;
  }

  static fromSave(input: unknown, ctx?: SimContext): SimHost {
    const { save, state } = parseSaveFile(input);
    const creation: Creation = {
      seed: save.creation.seed, origin: save.creation.origin,
      ...(save.creation.playerName !== undefined ? { playerName: save.creation.playerName } : {}),
    };
    const host = new SimHost(state, creation, [...save.commands], save.events, ctx);
    host.pendingStep0 = save.pendingEventIds.map((id) => host.index.get(id)!);
    return host;
  }

  get feed(): readonly FeedEntry[] {
    return this.feedEntries;
  }

  get commandLog(): readonly PlayerCommand[] {
    return this.commands;
  }

  get eventLog(): readonly WorldEvent[] {
    return this.log;
  }

  /** Địa hình để hiển thị (ADR-16): sinh lại từ seed, kiểm digest; không đổi state. */
  terrain(): TerrainStatus {
    return regenerateTerrain(this.state, this.ctx.data);
  }

  view(): ViewModel {
    return buildViewModel(this.state, this.ctx);
  }

  chronicle(): ChronicleEntry[] {
    return buildChronicle(this.state, this.ctx.data, this.log);
  }

  /** Áp lệnh ngay ở đầu ngày hiện tại; trả lý do từ chối nếu có. */
  issue(payload: PlayerCommandPayload): { ok: boolean; reason: string | null; newFeed: FeedEntry[] } {
    const seq = this.state.lastCommandSeq + 1;
    const command: PlayerCommand = {
      commandId: `cmd-${seq}`, seq, issuedAtDay: this.state.day, actorId: this.state.playerId, payload,
    };
    this.commands.push(command);
    const events = applyCommands(this.state, [command], this.ctx);
    this.pendingStep0.push(...events);
    const newFeed = this.absorb(events, []);
    const rejected = events.find((e) => e.type === 'command_rejected');
    return { ok: !rejected, reason: rejected ? String(rejected.payload['reason']) : null, newFeed };
  }

  /** Chạy tối đa `maxDays` ngày, dừng ở interrupt đầu tiên thuộc `stopOn`. */
  advance(maxDays: number, stopOn: ReadonlySet<InterruptReason>): AdvanceResult {
    const newFeed: FeedEntry[] = [];
    for (let i = 0; i < maxDays; i++) {
      const preApplied = this.pendingStep0;
      this.pendingStep0 = [];
      const result = tick(this.state, [], this.ctx, preApplied);
      const fresh = result.events.filter((e) => !preApplied.includes(e));
      newFeed.push(...this.absorb(fresh, result.playerKnown.map((k) => k.eventId)));
      const stop = result.interrupts
        .filter((x) => stopOn.has(x.reason))
        .sort((a, b) => INTERRUPT_PRIORITY.indexOf(a.reason) - INTERRUPT_PRIORITY.indexOf(b.reason))[0];
      if (stop) {
        const event = this.index.get(stop.eventId);
        return { days: i + 1, newFeed, interrupt: { reason: stop.reason, entry: event ? this.toFeed(event) : null } };
      }
    }
    return { days: maxDays, newFeed, interrupt: null };
  }

  summary(fromDay: number, before: ViewModel['player'], after: ViewModel['player']): SkipSummary {
    const entries = this.log
      .filter((e) => e.chronicle && e.day >= fromDay && e.day < this.state.day)
      .map((e) => this.toFeed(e));
    const pick = (p: ViewModel['player']) => ({ realmName: p.realmName, stageName: p.stageName, progressPct: p.progressPct });
    return {
      fromDay, toDay: this.state.day, fromDate: formatDate(fromDay), toDate: formatDate(this.state.day),
      entries, playerBefore: pick(before), playerAfter: pick(after),
    };
  }

  toSave(savedAt: string): SaveFile {
    const snapshot = toSnapshot(this.state);
    const events = [...this.log];
    const commands = [...this.commands];
    const pendingEventIds = this.pendingStep0.map((e) => e.id);
    return {
      format: SAVE_FORMAT,
      schemaVersion: this.state.schemaVersion,
      contentVersion: this.state.contentVersion,
      savedAt,
      creation: {
        seed: this.creation.seed, origin: this.creation.origin,
        ...(this.creation.playerName !== undefined ? { playerName: this.creation.playerName } : {}),
      },
      snapshot,
      events,
      commands,
      pendingEventIds,
      checksum: saveChecksum(snapshot, events, commands, pendingEventIds),
    };
  }

  /** Lưu event cần giữ, trả các mục mới cho bảng biến cố của người chơi. */
  private absorb(events: readonly WorldEvent[], knownIds: readonly string[]): FeedEntry[] {
    for (const e of events) this.keep(e);
    const ids = new Set(knownIds);
    for (const e of events) if (this.isOwn(e)) ids.add(e.id);
    const shown = new Set(this.feedEntries.map((f) => f.eventId));
    const entries = [...ids]
      .filter((id) => !shown.has(id))
      .map((id) => this.index.get(id))
      .filter((e): e is WorldEvent => e !== undefined)
      .sort((a, b) => a.seq - b.seq)
      .map((e) => this.toFeed(e));
    this.feedEntries = [...this.feedEntries, ...entries].slice(-FEED_LIMIT);
    return entries;
  }

  private keep(e: WorldEvent): void {
    if (this.index.has(e.id)) return;
    if (!e.chronicle && SALIENCE[e.type] === 0 && !this.isOwn(e)) return;
    this.log.push(e);
    this.index.set(e.id, e);
  }

  private isOwn(e: WorldEvent): boolean {
    return (e.actorId === this.state.playerId || e.targetId === this.state.playerId) && OWN_EVENT_TYPES.has(e.type)
      || e.actorId === this.state.playerId && SALIENCE[e.type] > 0;
  }

  private isPlayerFacing(e: WorldEvent): boolean {
    return this.isOwn(e) || this.state.characters[this.state.playerId]!.memory.some((m) => m.eventId === e.id);
  }

  private toFeed(e: WorldEvent): FeedEntry {
    return {
      eventId: e.id, day: e.day, date: formatDate(e.day), text: describeEvent(this.state, this.ctx.data, e),
      severity: e.severity, chronicle: e.chronicle,
    };
  }
}
