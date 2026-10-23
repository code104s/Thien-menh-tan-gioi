/** Thuật toán đồ thị trên địa điểm; duyệt hàng xóm theo thứ tự ID nên kết quả tất định. */
import { compareIds, sortedKeys } from '../core/ids.ts';
import type { EntityId, Location } from '../types.ts';

export function neighborIds(location: Location): EntityId[] {
  return location.edges.map((e) => e.to).sort(compareIds);
}

/** Khoảng cách theo số cạnh từ `from` tới mọi địa điểm đến được. */
export function hopDistances(locations: Record<EntityId, Location>, from: EntityId): Map<EntityId, number> {
  const dist = new Map<EntityId, number>([[from, 0]]);
  const queue: EntityId[] = [from];
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;
    const loc = locations[current];
    if (!loc) continue;
    for (const next of neighborIds(loc)) {
      if (!dist.has(next)) {
        dist.set(next, dist.get(current)! + 1);
        queue.push(next);
      }
    }
  }
  return dist;
}

/** Đường đi ít cạnh nhất (gồm hai đầu); null nếu không tới được. */
export function shortestPath(locations: Record<EntityId, Location>, from: EntityId, to: EntityId): EntityId[] | null {
  const prev = new Map<EntityId, EntityId | null>([[from, null]]);
  const queue: EntityId[] = [from];
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;
    if (current === to) break;
    const loc = locations[current];
    if (!loc) continue;
    for (const next of neighborIds(loc)) {
      if (!prev.has(next)) {
        prev.set(next, current);
        queue.push(next);
      }
    }
  }
  if (!prev.has(to)) return null;
  const path: EntityId[] = [];
  for (let node: EntityId | null = to; node !== null; node = prev.get(node) ?? null) path.push(node);
  return path.reverse();
}

export function isConnected(locations: Record<EntityId, Location>): boolean {
  const ids = sortedKeys(locations);
  if (ids.length === 0) return true;
  return hopDistances(locations, ids[0]!).size === ids.length;
}
