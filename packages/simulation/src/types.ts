/**
 * Kiểu dữ liệu domain theo docs/08_DATA_CONTRACTS_V0_3.md.
 * Mọi số là safe integer: Fx = ×1000, Bp = phần vạn, Stat = 0..100.
 */
import type { Sfc32State } from './core/rng.ts';

export type { Sfc32State };
export type EntityId = string;
export type Day = number;
export type Fx = number;
export type Bp = number;
export type Stat = number;

export const REALMS = ['qi', 'foundation', 'golden_core'] as const;
export type Realm = (typeof REALMS)[number];
export const STAGES = ['early', 'middle', 'late', 'perfect'] as const;
export type Stage = (typeof STAGES)[number];
export const SEVERITIES = ['critical', 'important', 'info'] as const;
export type Severity = (typeof SEVERITIES)[number];
export const VISIBILITIES = ['public', 'faction', 'witnesses', 'secret'] as const;
export type Visibility = (typeof VISIBILITIES)[number];
export const FACTION_RANKS = ['leader', 'elder', 'disciple'] as const;
export type FactionRank = (typeof FACTION_RANKS)[number];
export const DEATH_CAUSES = ['old_age', 'injury', 'breakthrough', 'dispute', 'duel'] as const;
export type DeathCause = (typeof DEATH_CAUSES)[number];
export const MINT_SOURCES = ['vein_extraction', 'location_gather', 'location_regen'] as const;
export type MintSource = (typeof MINT_SOURCES)[number];
export const BURN_SINKS = ['cultivation', 'breakthrough', 'faction_upkeep', 'unclaimed_estate', 'pill_consumed'] as const;
export type BurnSink = (typeof BURN_SINKS)[number];
export const LOCATION_KINDS = ['sect_seat', 'wild', 'town', 'secret_realm'] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];
export const FACTION_STRATEGIES = ['consolidate', 'expand', 'defend', 'recruit'] as const;
export type FactionStrategy = (typeof FACTION_STRATEGIES)[number];
export const GOAL_TYPES = [
  'breakthrough', 'heal', 'gather', 'cultivate', 'seek_energy', 'duty', 'join_faction', 'confront',
] as const;
export type GoalType = (typeof GOAL_TYPES)[number];
export const ACTION_TYPES = [
  'travel', 'cultivate', 'seclusion', 'gather', 'duty', 'heal', 'breakthrough', 'join_faction', 'leave_faction',
  'confront',
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];
export const ACTION_STATUSES = ['running', 'completed', 'cancelled', 'failed'] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];
export const CANCELLATION_POLICIES = ['refund_full', 'refund_prorated', 'refund_half_remaining', 'none'] as const;
export type CancellationPolicy = (typeof CANCELLATION_POLICIES)[number];
export const ACTION_SOURCES = ['player', 'npc', 'faction'] as const;
export type ActionSource = (typeof ACTION_SOURCES)[number];
export const CAUSAL_TYPES = ['favor', 'grudge', 'debt', 'betrayal'] as const;
export type CausalType = (typeof CAUSAL_TYPES)[number];
export const DISPUTE_PHASES = ['tension', 'skirmish', 'settlement'] as const;
export type DisputePhase = (typeof DISPUTE_PHASES)[number];

export const WORLD_EVENT_TYPES = [
  'world_created', 'character_born', 'character_died', 'stage_advanced',
  'breakthrough_succeeded', 'breakthrough_failed',
  'action_completed', 'action_failed', 'action_cancelled', 'command_rejected',
  'faction_joined', 'faction_left', 'leader_succeeded', 'leader_vacant', 'faction_dissolved',
  'strategy_changed', 'dispute_started', 'dispute_skirmish', 'dispute_ended', 'territory_transferred',
  'stipend_shortfall', 'duel_fought', 'dao_mark_left', 'seclusion_started', 'seclusion_ended',
  'choice_resolved',
] as const;
export type WorldEventType = (typeof WORLD_EVENT_TYPES)[number];

export interface Counters {
  action: number;
  event: number;
  causal: number;
  dispute: number;
  choice: number;
}

export interface Ledger {
  minted: Record<MintSource, number>;
  burned: Record<BurnSink, number>;
}

export interface WorldState {
  schemaVersion: 2;
  contentVersion: string;
  seed: string;
  /** ADR-16: phiên bản generator địa hình đã sinh thế giới này; 0 = save cũ (v1) không có địa hình. */
  terrainGenVersion: number;
  /** Digest TerrainModel lúc sinh; null khi terrainGenVersion = 0. */
  terrainDigest: string | null;
  day: Day;
  playerId: EntityId;
  gameOver: { day: Day; cause: DeathCause; eventId: EntityId } | null;
  rng: Record<string, Sfc32State>;
  counters: Counters;
  eventSeq: number;
  lastCommandSeq: number;
  /** Tổng linh thạch lúc tạo thế giới, dùng cho bất biến bảo toàn. */
  initialStoneSupply: number;
  locations: Record<EntityId, Location>;
  spiritVeins: Record<EntityId, SpiritVein>;
  characters: Record<EntityId, Cultivator>;
  factions: Record<EntityId, Faction>;
  actions: Record<EntityId, ScheduledAction>;
  disputes: Record<EntityId, Dispute>;
  causalRecords: Record<EntityId, CausalRecord>;
  pendingNews: NewsItem[];
  pendingChoices: PlayerChoice[];
  ledger: Ledger;
}

export interface LocationEdge {
  to: EntityId;
  travelDays: number;
}

export interface Location {
  id: EntityId;
  name: string;
  kind: LocationKind;
  edges: LocationEdge[];
  spiritualEnergyBp: Bp;
  resourceStock: number;
  resourceRegenPerMonth: number;
  /** Trần tái sinh tài nguyên (= 3 × giá trị khởi tạo). */
  resourceCap: number;
  veinId: EntityId | null;
  ownerFactionId: EntityId | null;
  daoMarkIds: EntityId[];
  /** ADR-16: id biome của ô neo; null = save cũ không có địa hình. */
  biomeId: string | null;
  /** ADR-16: chỉ số ô neo trong TerrainModel; null = save cũ không có địa hình. */
  anchorCell: number | null;
}

export interface SpiritVein {
  id: EntityId;
  locationId: EntityId;
  name: string;
  reserve: number;
  yieldPerMonth: number;
}

export interface Personality {
  ambition: Stat;
  greed: Stat;
  loyalty: Stat;
  riskTolerance: Stat;
}

export interface MemoryEntry {
  eventId: EntityId;
  learnedDay: Day;
  salience: Stat;
}

export interface PlannedStep {
  actionType: ActionType;
  targetId?: EntityId;
  durationDays: number;
}

export interface NpcPlan {
  goal: GoalType;
  score: number;
  committedUntil: Day;
  steps: PlannedStep[];
}

export interface Cultivator {
  id: EntityId;
  name: string;
  isPlayer: boolean;
  alive: boolean;
  deathDay: Day | null;
  deathCause: DeathCause | null;
  birthDay: Day;
  lifespanDays: number;
  locationId: EntityId;
  factionId: EntityId | null;
  factionRank: FactionRank | null;
  realm: Realm;
  stage: Stage;
  progress: Fx;
  spiritRootBp: Bp;
  techniqueId: string | null;
  insight: Stat;
  foundation: Stat;
  daoHeart: Stat;
  injury: Stat;
  /** Nguồn gây thương tích gần nhất; dùng làm nguyên nhân tử vong khi injury chạm 100. */
  lastInjuryCause: DeathCause | null;
  spiritStones: number;
  breakthroughCooldownUntil: Day;
  personality: Personality;
  relations: Record<EntityId, number>;
  memory: MemoryEntry[];
  plan: NpcPlan | null;
  nextReviewDay: Day;
  needsReview: boolean;
}

export interface Faction {
  id: EntityId;
  /** Khóa mẫu trong game-data/factions.json. */
  templateId: string;
  name: string;
  seatLocationId: EntityId;
  leaderId: EntityId | null;
  treasury: number;
  stability: Stat;
  relations: Record<EntityId, number>;
  strategy: FactionStrategy;
  strategyChosenDay: Day;
  disputeCooldowns: Record<EntityId, Day>;
  dissolved: boolean;
}

export interface ScheduledAction {
  id: EntityId;
  actorId: EntityId;
  type: ActionType;
  targetId?: EntityId;
  locationId: EntityId;
  startDay: Day;
  dueDay: Day;
  priority: number;
  seq: number;
  status: ActionStatus;
  reservedCosts: { spiritStones: number };
  cancellationPolicy: CancellationPolicy;
  source: ActionSource;
  meta: { progressGained: Fx };
}

export interface Dispute {
  id: EntityId;
  veinId: EntityId;
  attackerId: EntityId;
  defenderId: EntityId;
  phase: DisputePhase;
  startDay: Day;
  skirmishCount: number;
  attackerScore: number;
  defenderScore: number;
  causeEventId: EntityId;
  /** Lựa chọn của người chơi nếu thuộc một bên; null = chưa chọn / không liên quan. */
  playerStance: 'fight' | 'avoid' | null;
}

/** Giá trị payload: tạm thời là JSON phẳng; union theo từng loại event được bổ sung ở Phase 2–3. */
export type PayloadValue = string | number | boolean | null | string[] | number[];
export type EventPayload = Record<string, PayloadValue>;

export interface WorldEvent {
  id: EntityId;
  seq: number;
  day: Day;
  type: WorldEventType;
  severity: Severity;
  visibility: Visibility;
  actorId?: EntityId;
  targetId?: EntityId;
  factionIds: EntityId[];
  locationId?: EntityId;
  causeEventId?: EntityId;
  witnessIds: EntityId[];
  chronicle: boolean;
  payload: EventPayload;
}

export interface CausalRecord {
  id: EntityId;
  sourceEventId: EntityId;
  holderId: EntityId;
  towardId: EntityId;
  type: CausalType;
  intensity: Stat;
  amount?: number;
  createdDay: Day;
  resolvedByEventId: EntityId | null;
}

export interface NewsItem {
  eventId: EntityId;
  recipientId: EntityId;
  deliverDay: Day;
  /** Sao từ event gốc để xét interrupt khi tin đến trễ (event không nằm trong snapshot). */
  severity: Severity;
  type: WorldEventType;
}

export interface PlayerChoiceOption {
  id: string;
  label: string;
}

export const CHOICE_KINDS = ['dispute_participation'] as const;
export type ChoiceKind = (typeof CHOICE_KINDS)[number];

export interface PlayerChoice {
  id: EntityId;
  kind: ChoiceKind;
  /** Thực thể mà lựa chọn nói tới (vd. dispute). */
  subjectId: EntityId;
  eventId: EntityId;
  createdDay: Day;
  expiresDay: Day;
  options: PlayerChoiceOption[];
  defaultOptionId: string;
}

export type PlayerCommandPayload =
  | { type: 'START_ACTION'; actionType: ActionType; targetId?: EntityId; durationDays: number }
  | { type: 'CANCEL_ACTION'; actionId: EntityId }
  | { type: 'RESOLVE_CHOICE'; choiceId: EntityId; optionId: string };

export interface PlayerCommand {
  commandId: string;
  seq: number;
  issuedAtDay: Day;
  actorId: EntityId;
  payload: PlayerCommandPayload;
}
