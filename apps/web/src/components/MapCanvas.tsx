import type { LocationView, ViewModel } from '@tmtg/shared';
import { useEffect, useMemo, useRef, type MouseEvent } from 'react';
import { computeLayout } from '../app/layout.ts';
import { useUi } from '../app/store.ts';

export const FACTION_COLORS = ['#b5452f', '#3b7ea1', '#4a8f5c'];
const NEUTRAL = '#8a8172';
const PADDING = 48;
const RADIUS = 13;

export function factionColor(view: ViewModel, factionId: string | null): string {
  if (!factionId) return NEUTRAL;
  const index = view.factions.findIndex((f) => f.id === factionId);
  return FACTION_COLORS[index] ?? NEUTRAL;
}

/** Bản đồ Canvas 2D: màu = tông môn sở hữu, ◆ linh mạch, ⚔ đang tranh chấp, ✦ Đạo Ngân, vòng vàng = bạn. */
export function MapCanvas({ view }: { view: ViewModel }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const selected = useUi((s) => s.selectedLocationId);
  // Đồ thị cố định theo seed nên chỉ tính bố cục một lần.
  const layout = useMemo(() => computeLayout(view.locations), [view.seed]);

  const toScreen = (canvas: HTMLCanvasElement, l: LocationView) => {
    const p = layout[l.id]!;
    const w = canvas.clientWidth - PADDING * 2;
    const h = canvas.clientHeight - PADDING * 2;
    return { x: PADDING + p.x * w, y: PADDING + p.y * h };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      const g = canvas.getContext('2d')!;
      const css = getComputedStyle(canvas);
      const ink = css.getPropertyValue('--ink').trim() || '#2b241c';
      const inkSoft = css.getPropertyValue('--ink-soft').trim() || '#6b5f50';
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      const byId = new Map(view.locations.map((l) => [l.id, l]));

      g.lineWidth = 1.5;
      g.font = '11px system-ui, sans-serif';
      for (const l of view.locations) {
        const a = toScreen(canvas, l);
        for (const e of l.edges) {
          if (e.to < l.id) continue;
          const b = toScreen(canvas, byId.get(e.to)!);
          g.strokeStyle = inkSoft;
          g.globalAlpha = 0.55;
          g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
          g.globalAlpha = 1;
          g.fillStyle = inkSoft;
          g.fillText(`${e.travelDays}n`, (a.x + b.x) / 2 + 3, (a.y + b.y) / 2 - 3);
        }
      }

      for (const l of view.locations) {
        const { x, y } = toScreen(canvas, l);
        const color = factionColor(view, l.ownerFactionId);
        g.fillStyle = color;
        g.strokeStyle = ink;
        g.lineWidth = l.id === selected ? 3 : 1.5;
        g.beginPath();
        if (l.kind === 'sect_seat') g.rect(x - RADIUS, y - RADIUS, RADIUS * 2, RADIUS * 2);
        else if (l.kind === 'town') { g.moveTo(x, y - RADIUS - 2); g.lineTo(x + RADIUS + 2, y + RADIUS - 2); g.lineTo(x - RADIUS - 2, y + RADIUS - 2); g.closePath(); }
        else g.arc(x, y, RADIUS, 0, Math.PI * 2);
        g.fill(); g.stroke();
        if (l.id === view.player.locationId) {
          g.strokeStyle = '#e0b84c'; g.lineWidth = 3;
          g.beginPath(); g.arc(x, y, RADIUS + 6, 0, Math.PI * 2); g.stroke();
        }
        g.fillStyle = '#fdf8ee';
        g.font = 'bold 12px system-ui, sans-serif';
        g.textAlign = 'center';
        const marks = `${l.veinName ? '◆' : ''}${l.disputed ? '⚔' : ''}${l.daoMark ? '✦' : ''}`;
        if (marks) g.fillText(marks, x, y + 4);
        g.fillStyle = ink;
        g.font = '12px system-ui, sans-serif';
        g.fillText(l.name, x, y + RADIUS + 16);
        g.textAlign = 'start';
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [view, layout, selected]);

  const onClick = (event: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    let best: { id: string; d: number } | null = null;
    for (const l of view.locations) {
      const { x, y } = toScreen(canvas, l);
      const d = Math.hypot(x - mx, y - my);
      if (d < RADIUS + 10 && (!best || d < best.d)) best = { id: l.id, d };
    }
    if (best) useUi.setState({ selectedLocationId: best.id, tab: 'here' });
  };

  return (
    <div className="map">
      <canvas ref={canvasRef} onClick={onClick} aria-label="Bản đồ khu vực" />
      <div className="legend">
        {view.factions.map((f, i) => (
          <span key={f.id}><i style={{ background: FACTION_COLORS[i] }} />{f.name}</span>
        ))}
        <span><i style={{ background: NEUTRAL }} />Vô chủ</span>
        <span>■ trụ sở ▲ thị trấn ● hoang dã · ◆ linh mạch ⚔ tranh chấp ✦ Đạo Ngân · vòng vàng: bạn</span>
      </div>
    </div>
  );
}
