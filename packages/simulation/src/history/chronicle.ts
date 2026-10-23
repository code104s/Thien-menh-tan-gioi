/**
 * Sử ký (GDD "Nhân quả và lịch sử"): chỉ dựng từ event có chronicle = true, không bịa thêm.
 * Mỗi dòng gồm mốc thời gian, tác nhân, đối tượng, nguyên nhân (causeEventId) và kết quả.
 */
import type { GameData } from '@tmtg/game-data';
import { formatDate } from '../core/calendar.ts';
import { realmName } from '../rules/realm.ts';
import type { DeathCause, Realm, WorldEvent, WorldState } from '../types.ts';

export interface ChronicleEntry {
  eventId: string;
  seq: number;
  day: number;
  date: string;
  type: WorldEvent['type'];
  actorId?: string;
  targetId?: string;
  causeEventId?: string;
  text: string;
}

const DEATH_TEXT: Record<DeathCause, string> = {
  old_age: 'thọ nguyên cạn kiệt',
  injury: 'thương thế quá nặng',
  breakthrough: 'tẩu hỏa nhập ma sau lần đột phá',
  dispute: 'tử thương trong tranh chấp',
  duel: 'trọng thương sau trận đấu',
};

const TIER_TEXT: Record<string, string> = { minor: 'nhẹ', major: 'nặng', catastrophic: 'tẩu hỏa' };
export const STAGE_TEXT: Record<string, string> = { early: 'sơ kỳ', middle: 'trung kỳ', late: 'hậu kỳ', perfect: 'viên mãn' };
export const ACTION_TEXT: Record<string, string> = {
  travel: 'di chuyển', cultivate: 'tu luyện', seclusion: 'bế quan', gather: 'thu thập tài nguyên', duty: 'nhiệm vụ tông môn',
  heal: 'dưỡng thương', breakthrough: 'đột phá', join_faction: 'bái sư', leave_faction: 'rời tông môn', confront: 'đối đầu',
};
export const STRATEGY_TEXT: Record<string, string> = {
  consolidate: 'củng cố', expand: 'bành trướng', defend: 'phòng thủ', recruit: 'chiêu mộ',
};

export function buildChronicle(state: WorldState, data: GameData, events: readonly WorldEvent[]): ChronicleEntry[] {
  return events
    .filter((e) => e.chronicle)
    .sort((a, b) => a.seq - b.seq)
    .map((e) => ({
      eventId: e.id,
      seq: e.seq,
      day: e.day,
      date: formatDate(e.day),
      type: e.type,
      ...(e.actorId !== undefined ? { actorId: e.actorId } : {}),
      ...(e.targetId !== undefined ? { targetId: e.targetId } : {}),
      ...(e.causeEventId !== undefined ? { causeEventId: e.causeEventId } : {}),
      text: describeEvent(state, data, e),
    }));
}

/** Câu mô tả tiếng Việt cho một event (dùng cho Sử ký và bảng biến cố). */
export function describeEvent(state: WorldState, data: GameData, e: WorldEvent): string {
  const name = (id: unknown): string => {
    if (typeof id !== 'string') return 'vô chủ';
    return state.characters[id]?.name ?? state.factions[id]?.name ?? state.locations[id]?.name
      ?? state.spiritVeins[id]?.name ?? id;
  };
  const realm = (r: unknown) => (typeof r === 'string' ? realmName(data, r as Realm) : '?');
  const p = e.payload;
  const actor = name(e.actorId);
  const target = name(e.targetId);
  switch (e.type) {
    case 'world_created':
      return `Thiên Khuyết năm thứ nhất: thế giới hình thành, các thế lực ${(p['factions'] as string[]).join(', ')} phân tranh.`;
    case 'character_died':
      return `${actor} (${realm(p['realm'])}) qua đời — ${DEATH_TEXT[p['cause'] as DeathCause] ?? String(p['cause'])}.`;
    case 'breakthrough_succeeded':
      return `${actor} đột phá ${realm(p['toRealm'])} thành công.`;
    case 'breakthrough_failed':
      return `${actor} đột phá ${realm(p['targetRealm'])} thất bại (${TIER_TEXT[String(p['tier'])] ?? p['tier']}).`;
    case 'faction_joined':
      return `${actor} bái nhập ${name(p['factionId'])}.`;
    case 'faction_left':
      return `${actor} rời bỏ ${name(p['factionId'])}${p['wasLeader'] ? ' dù đang giữ chức tông chủ' : ''}.`;
    case 'leader_succeeded':
      return `${actor} kế nhiệm chức tông chủ ${name(p['factionId'])}.`;
    case 'leader_vacant':
      return `${name(p['factionId'])} khuyết tông chủ.`;
    case 'faction_dissolved':
      return `${name(p['factionId'])} tan rã, lãnh địa thành vô chủ.`;
    case 'dispute_started':
      return `${actor} khởi tranh đoạt ${name(p['veinId'])} của ${target} — nguyên nhân: ${String(p['reason'])}.`;
    case 'dispute_ended': {
      const vein = name(p['veinId']);
      switch (p['outcome']) {
        case 'attacker_won': return `${actor} đoạt được ${vein} từ ${target} sau ${String(p['rounds'])} trận.`;
        case 'defender_held': return `${target} giữ vững ${vein} trước ${actor}.`;
        case 'conceded': return `${target} nhượng ${vein} cho ${actor} mà không giao tranh.`;
        default: return `${actor} và ${target} đình chiến quanh ${vein}.`;
      }
    }
    case 'territory_transferred':
      return p['from'] === null
        ? `${name(p['to'])} chiếm ${name(p['locationId'])} vô chủ.`
        : `${name(p['locationId'])} chuyển từ ${name(p['from'])} sang ${name(p['to'])}.`;
    case 'duel_fought':
      return `${actor} thách đấu ${target}; ${name(p['winnerId'])} thắng.`;
    case 'dao_mark_left':
      return `${actor} lưu lại Đạo Ngân tại ${name(p['locationId'])}; linh khí nơi đây tăng.`;
    case 'seclusion_started':
      return `${actor} bắt đầu bế quan ${Math.round(Number(p['plannedDays']) / 360)} năm.`;
    case 'seclusion_ended':
      return `${actor} ${p['early'] ? 'xuất quan sớm' : 'xuất quan'}.`;
    case 'stage_advanced':
      return `${actor} tiến lên ${realm(p['realm'])} ${STAGE_TEXT[String(p['stage'])] ?? ''}.`;
    case 'action_completed':
      return `${actor} hoàn tất ${ACTION_TEXT[String(p['actionType'])] ?? p['actionType']}${typeof p['gathered'] === 'number' ? `, thu được ${p['gathered']} linh thạch` : ''}${typeof p['pay'] === 'number' ? `, nhận ${p['pay']} linh thạch` : ''}.`;
    case 'action_failed':
      return `${actor}: ${ACTION_TEXT[String(p['actionType'])] ?? p['actionType']} thất bại — ${String(p['reason'] ?? '')}.`;
    case 'action_cancelled':
      return `${actor} dừng ${ACTION_TEXT[String(p['actionType'])] ?? p['actionType']}${Number(p['refund']) > 0 ? `, hoàn ${p['refund']} linh thạch` : ''}.`;
    case 'command_rejected':
      return `Không thể thực hiện: ${String(p['reason'])}.`;
    case 'choice_resolved':
      return p['defaulted'] ? 'Không trả lời kịp, mặc định chọn né tránh.' : `Đã chọn: ${p['optionId'] === 'fight' ? 'tham chiến' : 'né tránh'}.`;
    case 'strategy_changed':
      return `${name(p['factionId'])} chuyển chiến lược sang ${STRATEGY_TEXT[String(p['to'])] ?? p['to']}.`;
    case 'dispute_skirmish':
      return `Giao tranh vòng ${String(p['round'])} giữa ${actor} và ${target} (${String(p['attackerScore'])} – ${String(p['defenderScore'])}).`;
    case 'stipend_shortfall':
      return `${name(p['factionId'])} thiếu linh thạch trả bổng lộc.`;
    default:
      return `${actor}: ${e.type}.`;
  }
}
