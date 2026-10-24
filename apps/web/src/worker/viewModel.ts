/**
 * Dựng view model từ WorldState, lọc theo những gì người chơi biết (4.2).
 * Người chơi biết vị trí/cảnh giới của nhân vật cùng địa điểm hoặc cùng tông môn, hoặc người có quan hệ.
 * Kho, ổn định, chiến lược chỉ thấy được ở tông môn của mình.
 */
import type {
  ActionOption, ChoiceView, CharacterView, DisputeView, FactionView, LocationView, PlayerView, ViewModel,
} from '@tmtg/shared';
import {
  ACTION_TEXT, DAYS_PER_MONTH, DAYS_PER_YEAR, STAGE_TEXT, STRATEGY_TEXT, ageInYears, breakthroughBlocker,
  breakthroughChanceBp, breakthroughTarget, divCeil, formatDate, livingMembersOf, previewAction, realmName,
  runningActionOf, sortedValues, STAGES, stageThresholdFx, territoryOf,
  type ActionType, type Cultivator, type PlayerCommandPayload, type SimContext, type WorldState,
} from '@tmtg/simulation';

const KIND_TEXT = { sect_seat: 'Trụ sở tông môn', wild: 'Hoang dã', town: 'Thị trấn', secret_realm: 'Bí cảnh' } as const;
const RANK_TEXT = { leader: 'Tông chủ', elder: 'Trưởng lão', disciple: 'Đệ tử' } as const;
const DEATH_TEXT = {
  old_age: 'thọ nguyên cạn kiệt', injury: 'thương thế quá nặng', breakthrough: 'tẩu hỏa nhập ma khi đột phá',
  dispute: 'tử thương trong tranh chấp', duel: 'trọng thương sau trận đấu',
} as const;

export function buildViewModel(state: WorldState, ctx: SimContext): ViewModel {
  const data = ctx.data;
  const player = state.characters[state.playerId]!;
  const known = (c: Cultivator) =>
    c.id === player.id || c.locationId === player.locationId
    || (player.factionId !== null && c.factionId === player.factionId)
    || player.relations[c.id] !== undefined;
  const factionName = (id: string | null) => (id ? state.factions[id]?.name ?? null : null);

  const characters: CharacterView[] = sortedValues(state.characters).map((c) => {
    const isKnown = known(c);
    return {
      id: c.id,
      name: c.name,
      isPlayer: c.isPlayer,
      alive: c.alive,
      factionName: factionName(c.factionId),
      rankName: c.factionRank ? RANK_TEXT[c.factionRank] : null,
      locationName: isKnown && c.alive ? state.locations[c.locationId]!.name : null,
      realmText: isKnown ? `${realmName(data, c.realm)} ${STAGE_TEXT[c.stage]}` : '?',
      relationToPlayer: c.isPlayer ? null : player.relations[c.id] ?? null,
      known: isKnown,
    };
  });

  const disputedVeins = new Set(Object.values(state.disputes).map((d) => d.veinId));
  const locations: LocationView[] = sortedValues(state.locations).map((l) => {
    const vein = l.veinId ? state.spiritVeins[l.veinId] : undefined;
    return {
      id: l.id,
      name: l.name,
      kind: l.kind,
      kindName: KIND_TEXT[l.kind],
      ownerFactionId: l.ownerFactionId,
      ownerName: factionName(l.ownerFactionId),
      veinName: vein?.name ?? null,
      veinReserve: vein?.reserve ?? null,
      energyPct: Math.floor(l.spiritualEnergyBp / 100),
      resourceStock: l.resourceStock,
      edges: l.edges.map((e) => ({ ...e })),
      disputed: vein !== undefined && disputedVeins.has(vein.id),
      daoMark: l.daoMarkIds.length > 0,
      biomeName: data.biomes.find((b) => b.id === l.biomeId)?.name ?? null,
      anchorCell: l.anchorCell,
      characterIds: sortedValues(state.characters).filter((c) => c.alive && c.locationId === l.id && known(c)).map((c) => c.id),
    };
  });

  const factions: FactionView[] = sortedValues(state.factions).map((f) => {
    const mine = f.id === player.factionId && player.alive;
    const territory = territoryOf(state, f.id);
    return {
      id: f.id,
      name: f.name,
      leaderName: f.leaderId ? state.characters[f.leaderId]!.name : null,
      memberCount: livingMembersOf(state, f.id).length,
      treasury: mine ? f.treasury : null,
      stability: mine ? f.stability : null,
      strategyName: mine ? STRATEGY_TEXT[f.strategy] ?? f.strategy : null,
      territoryNames: territory.map((l) => l.name),
      veinCount: territory.filter((l) => l.veinId).length,
      relations: sortedValues(state.factions).filter((o) => o.id !== f.id)
        .map((o) => ({ factionId: o.id, name: o.name, value: f.relations[o.id] ?? 0 })),
      dissolved: f.dissolved,
      isPlayerFaction: mine,
    };
  });

  const disputes: DisputeView[] = sortedValues(state.disputes).map((d) => ({
    id: d.id,
    attackerName: state.factions[d.attackerId]!.name,
    defenderName: state.factions[d.defenderId]!.name,
    veinName: state.spiritVeins[d.veinId]!.name,
    round: d.skirmishCount,
    attackerScore: d.attackerScore,
    defenderScore: d.defenderScore,
    playerStance: d.playerStance,
  }));

  const choices: ChoiceView[] = state.pendingChoices.map((c) => {
    const d = state.disputes[c.subjectId];
    const text = d
      ? `${state.factions[d.attackerId]!.name} tranh đoạt ${state.spiritVeins[d.veinId]!.name} của ${state.factions[d.defenderId]!.name}. Tông môn triệu tập đệ tử. Tham chiến sẽ chịu thương tích nhưng được tông chủ ghi ân; né tránh thì an toàn.`
      : 'Có biến cố cần bạn quyết định.';
    return {
      id: c.id, title: 'Tranh đoạt linh mạch', text, options: c.options.map((o) => ({ ...o })),
      defaultOptionId: c.defaultOptionId, expiresDate: formatDate(c.expiresDay),
    };
  });

  return {
    seed: state.seed,
    day: state.day,
    date: formatDate(state.day),
    player: playerView(state, ctx, player),
    locations,
    characters,
    factions,
    disputes,
    actions: player.alive ? actionOptions(state, ctx, player, known) : [],
    choices,
    gameOver: state.gameOver
      ? { date: formatDate(state.gameOver.day), causeText: DEATH_TEXT[state.gameOver.cause] }
      : null,
  };
}

function playerView(state: WorldState, ctx: SimContext, p: Cultivator): PlayerView {
  const data = ctx.data;
  const threshold = stageThresholdFx(data, p.realm);
  const target = breakthroughTarget(p);
  const blocker = target ? breakthroughBlocker(data, p, state.day) : 'Đã đạt cảnh giới cao nhất của phiên bản này';
  const action = runningActionOf(state, p.id);
  const technique = p.techniqueId ? data.techniques[p.techniqueId] : undefined;
  const faction = p.factionId ? state.factions[p.factionId] : undefined;
  return {
    id: p.id,
    name: p.name,
    alive: p.alive,
    realmName: realmName(data, p.realm),
    stageName: STAGE_TEXT[p.stage]!,
    stageIndex: STAGES.indexOf(p.stage),
    progressPct: Math.floor((p.progress * 100) / threshold),
    ageYears: ageInYears(p.birthDay, state.day),
    lifespanYears: Math.floor(p.lifespanDays / DAYS_PER_YEAR),
    injury: p.injury,
    spiritStones: p.spiritStones,
    insight: p.insight,
    foundation: p.foundation,
    daoHeart: p.daoHeart,
    spiritRootPct: Math.floor(p.spiritRootBp / 100),
    techniqueName: technique?.name ?? 'Không có',
    factionId: p.factionId,
    factionName: faction?.name ?? null,
    rankName: p.factionRank ? RANK_TEXT[p.factionRank] : null,
    locationId: p.locationId,
    locationName: state.locations[p.locationId]!.name,
    breakthroughChancePct: target && blocker === null ? Math.floor(breakthroughChanceBp(data, p, state.day) / 100) : null,
    breakthroughBlocker: blocker,
    currentAction: action
      ? {
        id: action.id,
        type: action.type,
        label: actionLabel(state, action.type, action.targetId),
        daysLeft: action.dueDay - state.day,
        totalDays: action.dueDay - action.startDay,
        cancellable: true,
        cancelHint: CANCEL_HINT[action.cancellationPolicy],
      }
      : null,
  };
}

const CANCEL_HINT = {
  refund_full: 'Dừng lại sẽ được hoàn toàn bộ linh thạch.',
  refund_prorated: 'Dừng lại sẽ được hoàn linh thạch theo số ngày còn lại.',
  refund_half_remaining: 'Xuất quan sớm: mất 10% tu vi tăng trong lần bế quan, hoàn 50% linh thạch của phần còn lại.',
  none: 'Dừng lại sẽ không được hoàn gì.',
} as const;

function actionLabel(state: WorldState, type: ActionType, targetId?: string): string {
  const target = targetId
    ? state.locations[targetId]?.name ?? state.characters[targetId]?.name ?? state.factions[targetId]?.name
    : undefined;
  const base = ACTION_TEXT[type] ?? type;
  const capitalized = base.charAt(0).toUpperCase() + base.slice(1);
  return target ? `${capitalized}: ${target}` : capitalized;
}

function actionOptions(
  state: WorldState, ctx: SimContext, p: Cultivator, known: (c: Cultivator) => boolean,
): ActionOption[] {
  const options: ActionOption[] = [];
  const add = (key: string, label: string, group: ActionOption['group'], actionType: ActionType, durationDays: number, targetId?: string) => {
    const preview = previewAction(state, {
      actorId: p.id, type: actionType, durationDays, source: 'player', ...(targetId ? { targetId } : {}),
    }, ctx);
    const command: PlayerCommandPayload = {
      type: 'START_ACTION', actionType, durationDays: preview.durationDays || durationDays, ...(targetId ? { targetId } : {}),
    };
    options.push({ key, label, group, command, cost: preview.cost, enabled: preview.ok, reason: preview.reason });
  };
  const here = state.locations[p.locationId]!;

  add('cultivate-90', 'Tu luyện 3 tháng', 'tu_luyen', 'cultivate', 90);
  add('cultivate-360', 'Tu luyện 1 năm', 'tu_luyen', 'cultivate', 360);
  add('seclusion', 'Bế quan… (giá theo năm)', 'tu_luyen', 'seclusion', 360);
  add('breakthrough', 'Đột phá', 'tu_luyen', 'breakthrough', 30);
  const healMonths = Math.min(6, Math.max(1, divCeil(Math.max(p.injury, 1), ctx.data.balance.economy.healInjuryRecovery)));
  add('heal', `Dưỡng thương ${healMonths} tháng`, 'tu_luyen', 'heal', healMonths * DAYS_PER_MONTH);
  for (const edge of here.edges) {
    add(`travel-${edge.to}`, `Đi ${state.locations[edge.to]!.name} (${edge.travelDays} ngày)`, 'di_chuyen', 'travel', edge.travelDays, edge.to);
  }
  add('gather', `Thu thập tài nguyên (còn ${here.resourceStock})`, 'tai_nguyen', 'gather', 30);
  if (p.factionId) {
    add('duty', 'Làm nhiệm vụ tông môn', 'tong_mon', 'duty', 30);
    add('leave', 'Rời tông môn', 'tong_mon', 'leave_faction', 1);
  } else {
    for (const f of sortedValues(state.factions)) {
      if (!f.dissolved && f.seatLocationId === here.id) add(`join-${f.id}`, `Bái nhập ${f.name}`, 'tong_mon', 'join_faction', 7, f.id);
    }
  }
  for (const c of sortedValues(state.characters)) {
    if (c.alive && !c.isPlayer && c.locationId === here.id && known(c)) {
      add(`confront-${c.id}`, `Thách đấu ${c.name}`, 'doi_dau', 'confront', 1, c.id);
    }
  }
  return options;
}

