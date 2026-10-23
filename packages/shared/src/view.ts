/**
 * View model gửi từ worker sang UI. UI chỉ đọc dữ liệu này, không bao giờ thấy WorldState.
 * Thông tin người chơi chưa biết được thay bằng null / '?'.
 */
import type { ActionType, EntityId, LocationKind, PlayerCommandPayload, Severity } from '@tmtg/simulation';

export type Speed = 0 | 1 | 10 | 100;

export interface ActionOption {
  /** Khóa ổn định cho React. */
  key: string;
  label: string;
  group: 'tu_luyen' | 'di_chuyen' | 'tai_nguyen' | 'tong_mon' | 'doi_dau';
  command: PlayerCommandPayload;
  cost: number;
  enabled: boolean;
  /** Lý do không thực hiện được (tiếng Việt), null nếu được. */
  reason: string | null;
}

export interface CurrentActionView {
  id: EntityId;
  type: ActionType;
  label: string;
  daysLeft: number;
  totalDays: number;
  cancellable: boolean;
  cancelHint: string;
}

export interface PlayerView {
  id: EntityId;
  name: string;
  alive: boolean;
  realmName: string;
  stageName: string;
  /** 0..100 */
  progressPct: number;
  ageYears: number;
  lifespanYears: number;
  injury: number;
  spiritStones: number;
  insight: number;
  foundation: number;
  daoHeart: number;
  spiritRootPct: number;
  techniqueName: string;
  factionId: EntityId | null;
  factionName: string | null;
  rankName: string | null;
  locationId: EntityId;
  locationName: string;
  breakthroughChancePct: number | null;
  breakthroughBlocker: string | null;
  currentAction: CurrentActionView | null;
}

export interface LocationView {
  id: EntityId;
  name: string;
  kind: LocationKind;
  kindName: string;
  ownerFactionId: EntityId | null;
  ownerName: string | null;
  veinName: string | null;
  veinReserve: number | null;
  energyPct: number;
  resourceStock: number;
  edges: { to: EntityId; travelDays: number }[];
  disputed: boolean;
  daoMark: boolean;
  /** Nhân vật người chơi biết đang ở đây (cùng địa điểm hoặc cùng tông môn). */
  characterIds: EntityId[];
}

export interface CharacterView {
  id: EntityId;
  name: string;
  isPlayer: boolean;
  alive: boolean;
  factionName: string | null;
  rankName: string | null;
  /** null = người chơi không biết. */
  locationName: string | null;
  realmText: string;
  relationToPlayer: number | null;
  known: boolean;
}

export interface FactionView {
  id: EntityId;
  name: string;
  leaderName: string | null;
  memberCount: number;
  /** Chỉ biết kho của tông môn mình. */
  treasury: number | null;
  stability: number | null;
  strategyName: string | null;
  territoryNames: string[];
  veinCount: number;
  relations: { factionId: EntityId; name: string; value: number }[];
  dissolved: boolean;
  isPlayerFaction: boolean;
}

export interface DisputeView {
  id: EntityId;
  attackerName: string;
  defenderName: string;
  veinName: string;
  round: number;
  attackerScore: number;
  defenderScore: number;
  playerStance: 'fight' | 'avoid' | null;
}

export interface ChoiceView {
  id: EntityId;
  title: string;
  text: string;
  options: { id: string; label: string }[];
  defaultOptionId: string;
  expiresDate: string;
}

export interface FeedEntry {
  eventId: EntityId;
  day: number;
  date: string;
  text: string;
  severity: Severity;
  chronicle: boolean;
}

export interface ViewModel {
  seed: string;
  day: number;
  date: string;
  player: PlayerView;
  locations: LocationView[];
  characters: CharacterView[];
  factions: FactionView[];
  disputes: DisputeView[];
  actions: ActionOption[];
  choices: ChoiceView[];
  gameOver: { date: string; causeText: string } | null;
}

export interface SkipSummary {
  fromDay: number;
  toDay: number;
  fromDate: string;
  toDate: string;
  entries: FeedEntry[];
  playerBefore: { realmName: string; stageName: string; progressPct: number };
  playerAfter: { realmName: string; stageName: string; progressPct: number };
}
