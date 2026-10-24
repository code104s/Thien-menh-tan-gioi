import type { LocationView, ViewModel } from '@tmtg/shared';

/** Màu tông môn và hình đánh dấu địa điểm, dùng chung cho sơ đồ và bản đồ địa hình. */
export const FACTION_COLORS = ['#b5452f', '#3b7ea1', '#4a8f5c'];
export const NEUTRAL = '#8a8172';
export const RADIUS = 13;

export function factionColor(view: ViewModel, factionId: string | null): string {
  if (!factionId) return NEUTRAL;
  const index = view.factions.findIndex((f) => f.id === factionId);
  return FACTION_COLORS[index] ?? NEUTRAL;
}

/** Hình đánh dấu địa điểm: ■ trụ sở, ▲ thị trấn, ● còn lại. Dùng chung cho sơ đồ và bản đồ địa hình. */
export function drawMarker(g: CanvasRenderingContext2D, l: LocationView, x: number, y: number, r: number) {
  g.beginPath();
  if (l.kind === 'sect_seat') g.rect(x - r, y - r, r * 2, r * 2);
  else if (l.kind === 'town') { g.moveTo(x, y - r - 2); g.lineTo(x + r + 2, y + r - 2); g.lineTo(x - r - 2, y + r - 2); g.closePath(); }
  else g.arc(x, y, r, 0, Math.PI * 2);
}

export function markerText(l: LocationView): string {
  return `${l.veinName ? '◆' : ''}${l.disputed ? '⚔' : ''}${l.daoMark ? '✦' : ''}`;
}
