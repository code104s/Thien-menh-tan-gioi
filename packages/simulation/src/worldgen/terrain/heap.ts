/** Hàng đợi ưu tiên dùng chung cho priority-flood (hydrology) và Dijkstra đa nguồn (regions). */

/** Min-heap theo (key, cell); hòa key thì ô có chỉ số nhỏ ra trước → tất định. */
export class CellHeap {
  private readonly keys: number[] = [];
  private readonly cells: number[] = [];

  get size(): number {
    return this.cells.length;
  }

  private less(ka: number, ca: number, kb: number, cb: number): boolean {
    return ka < kb || (ka === kb && ca < cb);
  }

  push(key: number, cell: number): void {
    const { keys, cells } = this;
    let i = cells.length;
    keys.push(key);
    cells.push(cell);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(key, cell, keys[p]!, cells[p]!)) break;
      keys[i] = keys[p]!;
      cells[i] = cells[p]!;
      i = p;
    }
    keys[i] = key;
    cells[i] = cell;
  }

  pop(): number {
    const { keys, cells } = this;
    const top = cells[0]!;
    const lastKey = keys.pop()!;
    const lastCell = cells.pop()!;
    const n = cells.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && this.less(keys[c + 1]!, cells[c + 1]!, keys[c]!, cells[c]!)) c++;
        if (!this.less(keys[c]!, cells[c]!, lastKey, lastCell)) break;
        keys[i] = keys[c]!;
        cells[i] = cells[c]!;
        i = c;
      }
      keys[i] = lastKey;
      cells[i] = lastCell;
    }
    return top;
  }
}
