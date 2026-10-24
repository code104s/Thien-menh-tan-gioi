/**
 * Bản đồ địa hình hex (ADR-16): lớp nền và lớp lãnh thổ bake sẵn, mỗi khung chỉ drawImage hai lớp đó
 * rồi vẽ đường đi, địa điểm và nhãn theo tọa độ màn hình. Cuộn để phóng quanh con trỏ, kéo để di chuyển,
 * nhấp để chọn địa điểm (ưu tiên dấu địa điểm, sau đó vùng chứa ô được nhấp), nhấp đúp để về khung.
 */
import { gameData } from '@tmtg/game-data';
import type { LocationView, ViewModel } from '@tmtg/shared';
import { createHexGrid, type TerrainModel } from '@tmtg/simulation';
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { useUi } from '../../app/store.ts';
import { cellCenter, fitTransform, mapSize, pixelToCell, territoryBorders, zoomAround, type HexMap } from './hexGeometry.ts';
import { FACTION_COLORS, drawMarker, factionColor, markerText } from './markers.ts';
import { HEX_SIZE, bakeBase, bakeTerritory } from './terrainLayers.ts';

const MARKER_RADIUS = 9;
const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const DRAG_THRESHOLD = 4;

interface Camera { zoom: number; panX: number; panY: number }
const HOME: Camera = { zoom: 1, panX: 0, panY: 0 };

/** Chủ sở hữu (chỉ số tông môn) của từng ô, suy ra từ vùng → địa điểm → ownerFactionId (ADR-13). */
export function cellOwners(terrain: TerrainModel, view: ViewModel): Int16Array {
  const ownerOfLocation = view.locations.map((l) => view.factions.findIndex((f) => f.id === l.ownerFactionId));
  const owners = new Int16Array(terrain.cellLocation.length).fill(-1);
  terrain.cellLocation.forEach((k, i) => { if (k >= 0) owners[i] = ownerOfLocation[k] ?? -1; });
  return owners;
}

export function TerrainMap({ view, terrain }: { view: ViewModel; terrain: TerrainModel }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const selected = useUi((s) => s.selectedLocationId);
  // Nhãn đọc màu từ token CSS: đổi chế độ trang trí thì vẽ lại.
  const ornate = useUi((s) => s.ornate);
  const [camera, setCamera] = useState<Camera>(HOME);
  const drag = useRef<{ x: number; y: number; start: Camera; moved: boolean } | null>(null);

  const map: HexMap = useMemo(() => ({ cols: terrain.width, rows: terrain.height, size: HEX_SIZE }), [terrain]);
  const grid = useMemo(() => createHexGrid(terrain.width, terrain.height), [terrain]);
  // Bake dư độ phân giải để phóng ~1,5× vẫn nét.
  const bakeScale = useMemo(() => Math.min(3, (window.devicePixelRatio || 1) * 1.5), []);
  const base = useMemo(() => bakeBase(terrain, grid, gameData, bakeScale), [terrain, grid, bakeScale]);
  const ownerKey = view.locations.map((l) => l.ownerFactionId ?? '-').join(',');
  const territory = useMemo(() => {
    const owners = cellOwners(terrain, view);
    return bakeTerritory(terrain, grid, owners, FACTION_COLORS, bakeScale, territoryBorders(grid.neighbor, owners));
    // Chỉ bake lại khi quyền sở hữu đổi (event territory_transferred), không phải mỗi lần view đổi.
  }, [terrain, grid, bakeScale, ownerKey]);
  const anchors = useMemo(
    () => new Map(view.locations.map((l) => [l.id, cellCenter(map, l.anchorCell!)])),
    // Ô neo không đổi sau worldgen.
    [map, view.seed],
  );

  const transformFor = (canvas: HTMLCanvasElement, c: Camera) =>
    fitTransform(map, canvas.clientWidth, canvas.clientHeight, c.zoom, c.panX, c.panY);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      performance.mark('map:frame:start');
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.floor(w * dpr)) canvas.width = Math.floor(w * dpr);
      if (canvas.height !== Math.floor(h * dpr)) canvas.height = Math.floor(h * dpr);
      const g = canvas.getContext('2d')!;
      const css = getComputedStyle(canvas);
      const ink = css.getPropertyValue('--ink').trim() || '#2b241c';
      const paper = css.getPropertyValue('--paper').trim() || '#f3ecdf';
      const t = transformFor(canvas, camera);
      const { width, height } = mapSize(map);

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      g.setTransform(dpr * t.scale, 0, 0, dpr * t.scale, dpr * t.offsetX, dpr * t.offsetY);
      g.drawImage(base.canvas, 0, 0, width, height);
      g.drawImage(territory.canvas, 0, 0, width, height);

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const screen = (id: string) => {
        const [x, y] = anchors.get(id)!;
        return [x * t.scale + t.offsetX, y * t.scale + t.offsetY] as const;
      };
      const byId = new Map(view.locations.map((l) => [l.id, l]));

      // Đường đi giữa địa điểm (cạnh đồ thị) và số ngày.
      g.setLineDash([5, 4]);
      g.lineWidth = 1.6;
      g.strokeStyle = ink;
      g.globalAlpha = 0.55;
      for (const l of view.locations) {
        const [ax, ay] = screen(l.id);
        for (const e of l.edges) {
          if (e.to < l.id) continue;
          const [bx, by] = screen(e.to);
          g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
        }
      }
      g.setLineDash([]);
      g.globalAlpha = 1;
      g.font = '11px system-ui, sans-serif';
      g.textAlign = 'center';
      for (const l of view.locations) {
        const [ax, ay] = screen(l.id);
        for (const e of l.edges) {
          if (e.to < l.id || !byId.has(e.to)) continue;
          const [bx, by] = screen(e.to);
          label(g, `${e.travelDays}n`, (ax + bx) / 2, (ay + by) / 2 + 4, ink, paper);
        }
      }

      // Địa điểm, dấu hiệu và tên.
      for (const l of view.locations) {
        const [x, y] = screen(l.id);
        g.fillStyle = factionColor(view, l.ownerFactionId);
        g.strokeStyle = ink;
        g.lineWidth = l.id === selected ? 3 : 1.5;
        drawMarker(g, l, x, y, MARKER_RADIUS);
        g.fill(); g.stroke();
        if (l.id === view.player.locationId) {
          g.strokeStyle = '#e0b84c'; g.lineWidth = 3;
          g.beginPath(); g.arc(x, y, MARKER_RADIUS + 5, 0, Math.PI * 2); g.stroke();
        }
        const marks = markerText(l);
        if (marks) {
          g.fillStyle = '#fdf8ee';
          g.font = 'bold 10px system-ui, sans-serif';
          g.fillText(marks, x, y + 3.5);
        }
        g.font = l.id === selected ? 'bold 12px system-ui, sans-serif' : '12px system-ui, sans-serif';
        label(g, l.name, x, y + MARKER_RADIUS + 15, ink, paper);
      }
      g.textAlign = 'start';
      performance.measure('map:frame', 'map:frame:start');
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
    // transformFor chỉ phụ thuộc map + camera.
  }, [view, base, territory, anchors, camera, selected, map, ornate]);

  // Cuộn chuột: listener gốc không passive để chặn cuộn trang.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      setCamera((c) => {
        const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, c.zoom * (event.deltaY < 0 ? 1.2 : 1 / 1.2)));
        if (zoom === c.zoom) return c;
        const pan = zoomAround(map, canvas.clientWidth, canvas.clientHeight, c, zoom,
          event.clientX - rect.left, event.clientY - rect.top);
        return zoom === MIN_ZOOM ? HOME : { zoom, ...pan };
      });
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [map]);

  const pick = (canvas: HTMLCanvasElement, sx: number, sy: number): LocationView | null => {
    const t = transformFor(canvas, camera);
    let best: { l: LocationView; d: number } | null = null;
    for (const l of view.locations) {
      const [x, y] = anchors.get(l.id)!;
      const d = Math.hypot(x * t.scale + t.offsetX - sx, y * t.scale + t.offsetY - sy);
      if (d < MARKER_RADIUS + 8 && (!best || d < best.d)) best = { l, d };
    }
    if (best) return best.l;
    const cell = pixelToCell(map, (sx - t.offsetX) / t.scale, (sy - t.offsetY) / t.scale);
    const k = cell >= 0 ? terrain.cellLocation[cell]! : -1;
    return k >= 0 ? view.locations[k] ?? null : null;
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, start: camera, moved: false };
  };
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    d.moved = true;
    setCamera({ zoom: d.start.zoom, panX: d.start.panX + dx, panY: d.start.panY + dy });
  };
  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const hit = pick(canvas, event.clientX - rect.left, event.clientY - rect.top);
    if (hit) useUi.setState({ selectedLocationId: hit.id, tab: 'here' });
  };

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { drag.current = null; }}
      onDoubleClick={() => setCamera(HOME)}
      aria-label="Bản đồ địa hình khu vực"
    />
  );
}

/** Chữ có viền nền để đọc được trên mọi biome. */
function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, ink: string, paper: string) {
  g.lineWidth = 3;
  g.strokeStyle = paper;
  g.lineJoin = 'round';
  g.strokeText(text, x, y);
  g.fillStyle = ink;
  g.fillText(text, x, y);
}
