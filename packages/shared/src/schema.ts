/**
 * Zod schema tại ranh giới (save/import, worker message). Khớp chính xác kiểu domain trong
 * @tmtg/simulation — sai lệch sẽ làm `tsc` báo lỗi ở các dòng `AssertEqual` cuối file.
 */
import { z } from 'zod';
import {
  ACTION_SOURCES, ACTION_STATUSES, ACTION_TYPES, BURN_SINKS, CANCELLATION_POLICIES, CAUSAL_TYPES, CHOICE_KINDS,
  DEATH_CAUSES, DISPUTE_PHASES, FACTION_RANKS, FACTION_STRATEGIES, GOAL_TYPES, LOCATION_KINDS,
  MINT_SOURCES, REALMS, SEVERITIES, STAGES, VISIBILITIES, WORLD_EVENT_TYPES,
  type CausalRecord, type Cultivator, type Dispute, type Faction, type Location, type PlayerCommand,
  type ScheduledAction, type SpiritVein, type WorldEvent, type WorldState,
} from '@tmtg/simulation';

const id = z.string().regex(/^[a-z]+_[0-9]+$/, 'ID phải có dạng tiền tố_số');
const int = z.int();
const nonNeg = z.int().min(0);
const stat = z.int().min(0).max(100);
const relation = z.int().min(-100).max(100);
const uint32 = z.int().min(0).max(0xffffffff);
const recordOf = <T extends z.ZodType>(value: T) => z.record(z.string(), value);
const allKeys = <K extends string, T extends z.ZodType>(keys: readonly K[], value: T) =>
  z.object(Object.fromEntries(keys.map((k) => [k, value])) as Record<K, T>);

export const sfc32StateSchema = z.object({ a: uint32, b: uint32, c: uint32, d: uint32 });

export const locationSchema = z.object({
  id,
  name: z.string().min(1),
  kind: z.enum(LOCATION_KINDS),
  edges: z.array(z.object({ to: id, travelDays: z.int().positive() })),
  spiritualEnergyBp: nonNeg,
  resourceStock: nonNeg,
  resourceRegenPerMonth: nonNeg,
  resourceCap: nonNeg,
  veinId: id.nullable(),
  ownerFactionId: id.nullable(),
  daoMarkIds: z.array(id),
});

export const spiritVeinSchema = z.object({
  id,
  locationId: id,
  name: z.string().min(1),
  reserve: nonNeg,
  yieldPerMonth: nonNeg,
});

export const cultivatorSchema = z.object({
  id,
  name: z.string().min(1),
  isPlayer: z.boolean(),
  alive: z.boolean(),
  deathDay: int.nullable(),
  deathCause: z.enum(DEATH_CAUSES).nullable(),
  birthDay: int,
  lifespanDays: nonNeg,
  locationId: id,
  factionId: id.nullable(),
  factionRank: z.enum(FACTION_RANKS).nullable(),
  realm: z.enum(REALMS),
  stage: z.enum(STAGES),
  progress: nonNeg,
  spiritRootBp: nonNeg,
  techniqueId: z.string().nullable(),
  insight: stat,
  foundation: stat,
  daoHeart: stat,
  injury: stat,
  lastInjuryCause: z.enum(DEATH_CAUSES).nullable(),
  spiritStones: nonNeg,
  breakthroughCooldownUntil: int,
  personality: z.object({ ambition: stat, greed: stat, loyalty: stat, riskTolerance: stat }),
  relations: recordOf(relation),
  memory: z.array(z.object({ eventId: id, learnedDay: int, salience: stat })).max(32),
  plan: z
    .object({
      goal: z.enum(GOAL_TYPES),
      score: int,
      committedUntil: int,
      steps: z
        .array(z.object({ actionType: z.enum(ACTION_TYPES), targetId: id.exactOptional(), durationDays: z.int().positive() }))
        .min(1)
        .max(3),
    })
    .nullable(),
  nextReviewDay: int,
  needsReview: z.boolean(),
});

export const factionSchema = z.object({
  id,
  templateId: z.string().min(1),
  name: z.string().min(1),
  seatLocationId: id,
  leaderId: id.nullable(),
  treasury: nonNeg,
  stability: stat,
  relations: recordOf(relation),
  strategy: z.enum(FACTION_STRATEGIES),
  strategyChosenDay: int,
  disputeCooldowns: recordOf(int),
  dissolved: z.boolean(),
});

export const scheduledActionSchema = z.object({
  id,
  actorId: id,
  type: z.enum(ACTION_TYPES),
  targetId: id.exactOptional(),
  locationId: id,
  startDay: int,
  dueDay: int,
  priority: int,
  seq: z.int().positive(),
  status: z.enum(ACTION_STATUSES),
  reservedCosts: z.object({ spiritStones: nonNeg }),
  cancellationPolicy: z.enum(CANCELLATION_POLICIES),
  source: z.enum(ACTION_SOURCES),
  meta: z.object({ progressGained: nonNeg }),
});

export const disputeSchema = z.object({
  id,
  veinId: id,
  attackerId: id,
  defenderId: id,
  phase: z.enum(DISPUTE_PHASES),
  startDay: int,
  skirmishCount: nonNeg,
  attackerScore: nonNeg,
  defenderScore: nonNeg,
  causeEventId: id,
  playerStance: z.enum(['fight', 'avoid']).nullable(),
});

const payloadValue = z.union([z.string(), int, z.boolean(), z.null(), z.array(z.string()), z.array(int)]);

export const worldEventSchema = z.object({
  id,
  seq: z.int().positive(),
  day: int,
  type: z.enum(WORLD_EVENT_TYPES),
  severity: z.enum(SEVERITIES),
  visibility: z.enum(VISIBILITIES),
  actorId: id.exactOptional(),
  targetId: id.exactOptional(),
  factionIds: z.array(id),
  locationId: id.exactOptional(),
  causeEventId: id.exactOptional(),
  witnessIds: z.array(id),
  chronicle: z.boolean(),
  payload: recordOf(payloadValue),
});

export const causalRecordSchema = z.object({
  id,
  sourceEventId: id,
  holderId: id,
  towardId: id,
  type: z.enum(CAUSAL_TYPES),
  intensity: stat,
  amount: nonNeg.exactOptional(),
  createdDay: int,
  resolvedByEventId: id.nullable(),
});

export const playerCommandSchema = z.object({
  commandId: z.string().min(1).max(64),
  seq: z.int().positive(),
  issuedAtDay: int,
  actorId: id,
  payload: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('START_ACTION'),
      actionType: z.enum(ACTION_TYPES),
      targetId: id.exactOptional(),
      durationDays: z.int().positive(),
    }),
    z.object({ type: z.literal('CANCEL_ACTION'), actionId: id }),
    z.object({ type: z.literal('RESOLVE_CHOICE'), choiceId: id, optionId: z.string().min(1) }),
  ]),
});

export const worldStateSchema = z.object({
  schemaVersion: z.literal(1),
  contentVersion: z.string().min(1),
  seed: z.string().min(1),
  day: nonNeg,
  playerId: id,
  gameOver: z.object({ day: int, cause: z.enum(DEATH_CAUSES), eventId: id }).nullable(),
  rng: recordOf(sfc32StateSchema),
  counters: z.object({ action: nonNeg, event: nonNeg, causal: nonNeg, dispute: nonNeg, choice: nonNeg }),
  eventSeq: nonNeg,
  lastCommandSeq: nonNeg,
  initialStoneSupply: nonNeg,
  locations: recordOf(locationSchema),
  spiritVeins: recordOf(spiritVeinSchema),
  characters: recordOf(cultivatorSchema),
  factions: recordOf(factionSchema),
  actions: recordOf(scheduledActionSchema),
  disputes: recordOf(disputeSchema),
  causalRecords: recordOf(causalRecordSchema),
  pendingNews: z.array(z.object({
    eventId: id, recipientId: id, deliverDay: int, severity: z.enum(SEVERITIES), type: z.enum(WORLD_EVENT_TYPES),
  })),
  pendingChoices: z.array(z.object({
    id,
    kind: z.enum(CHOICE_KINDS),
    subjectId: id,
    eventId: id,
    createdDay: int,
    expiresDay: int,
    options: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })).min(1),
    defaultOptionId: z.string().min(1),
  })),
  ledger: z.object({ minted: allKeys(MINT_SOURCES, nonNeg), burned: allKeys(BURN_SINKS, nonNeg) }),
});

// ── Kiểm tra lúc biên dịch: schema ⇔ kiểu domain ────────────────────────────
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type AssertEqual<A, B> = Equal<A, B> extends true ? true : { error: 'Schema lệch kiểu domain'; schema: A; domain: B };
const ok = <T extends true>(): T => true as T;

export const schemaTypeChecks = [
  ok<AssertEqual<z.infer<typeof locationSchema>, Location>>(),
  ok<AssertEqual<z.infer<typeof spiritVeinSchema>, SpiritVein>>(),
  ok<AssertEqual<z.infer<typeof cultivatorSchema>, Cultivator>>(),
  ok<AssertEqual<z.infer<typeof factionSchema>, Faction>>(),
  ok<AssertEqual<z.infer<typeof scheduledActionSchema>, ScheduledAction>>(),
  ok<AssertEqual<z.infer<typeof disputeSchema>, Dispute>>(),
  ok<AssertEqual<z.infer<typeof worldEventSchema>, WorldEvent>>(),
  ok<AssertEqual<z.infer<typeof causalRecordSchema>, CausalRecord>>(),
  ok<AssertEqual<z.infer<typeof playerCommandSchema>, PlayerCommand>>(),
  ok<AssertEqual<z.infer<typeof worldStateSchema>, WorldState>>(),
] as const;
