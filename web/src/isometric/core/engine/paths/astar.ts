import type { WorldCoord, WorldRect } from "../../types";

/**
 * Cost of stepping from column `(fromX, fromY)` to its edge neighbour `(toX, toY)`: a positive
 * number, or `Infinity` when the step is not allowed (water, a cliff, a building).
 */
export type StepCost = (fromX: number, fromY: number, toX: number, toY: number) => number;

/** One search of {@link findPath}. */
export type PathSearch = {
  /** Columns the search may visit; nothing outside it is ever stepped on. */
  readonly area: WorldRect;
  /** Where the path may start (all at cost `0`); the ones outside `area` are ignored. */
  readonly starts: readonly WorldCoord[];
  /** Whether a column ends the path. */
  readonly isGoal: (x: number, y: number) => boolean;
  /** Cost of each step. */
  readonly cost: StepCost;
  /**
   * Estimate of the cost left from a column to the nearest goal. It must never be more than the
   * real cost for the path to be the cheapest. Defaults to `0` (Dijkstra's search).
   */
  readonly heuristic?: (x: number, y: number) => number;
};

/** The four edge neighbours, in the fixed order every search tries them: `+x`, `+y`, `−x`, `−y`. */
export const PATH_STEPS: readonly WorldCoord[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

const NO_HEURISTIC = () => 0;

/**
 * The cheapest path (A*) from one of `starts` to a goal column, stepping between edge neighbours
 * inside `area`: the columns in order, from the start to the goal (both included), or `undefined`
 * when no goal can be reached. A start that is a goal is a path of one column.
 *
 * Deterministic: ties are broken by the order columns were reached, and neighbours are tried in
 * {@link PATH_STEPS} order, so the same search always gives the same path. The open set is a binary
 * heap and the costs live in typed arrays over `area`, so a search allocates once, not per column.
 */
export function findPath({
  area,
  starts,
  isGoal,
  cost,
  heuristic = NO_HEURISTIC,
}: PathSearch): WorldCoord[] | undefined {
  const width = area.maxX - area.minX + 1;
  const height = area.maxY - area.minY + 1;
  const size = width * height;
  const best = new Float64Array(size).fill(Infinity);
  const parent = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const heap = new MinHeap();
  const indexOf = (x: number, y: number) => (x - area.minX) * height + (y - area.minY);
  const inside = (x: number, y: number) => x >= area.minX && x <= area.maxX && y >= area.minY && y <= area.maxY;

  for (const { x, y } of starts) {
    if (!inside(x, y)) continue;
    const index = indexOf(x, y);
    if (best[index] === 0) continue;
    best[index] = 0;
    heap.push(index, heuristic(x, y));
  }

  while (heap.size > 0) {
    const index = heap.pop();
    if (closed[index] === 1) continue;
    closed[index] = 1;
    const x = area.minX + Math.floor(index / height);
    const y = area.minY + (index % height);
    if (isGoal(x, y)) return trace(index, parent, area.minX, area.minY, height);
    for (const step of PATH_STEPS) {
      const nx = x + step.x;
      const ny = y + step.y;
      if (!inside(nx, ny)) continue;
      const next = indexOf(nx, ny);
      if (closed[next] === 1) continue;
      const total = best[index] + cost(x, y, nx, ny);
      if (!(total < best[next])) continue;
      best[next] = total;
      parent[next] = index;
      heap.push(next, total + heuristic(nx, ny));
    }
  }
  return undefined;
}

/** The columns from the start to `index`, following `parent`. */
function trace(index: number, parent: Int32Array, minX: number, minY: number, height: number): WorldCoord[] {
  const path: WorldCoord[] = [];
  for (let at = index; at >= 0; at = parent[at]) {
    path.push({ x: minX + Math.floor(at / height), y: minY + (at % height) });
  }
  return path.reverse();
}

/** A binary min-heap of column indices by priority; equal priorities come out in insertion order. */
class MinHeap {
  private readonly items: number[] = [];
  private readonly priorities: number[] = [];
  private readonly orders: number[] = [];
  private counter = 0;

  get size(): number {
    return this.items.length;
  }

  push(item: number, priority: number): void {
    this.items.push(item);
    this.priorities.push(priority);
    this.orders.push(this.counter++);
    this.up(this.items.length - 1);
  }

  pop(): number {
    const top = this.items[0];
    const last = this.items.length - 1;
    this.move(last, 0);
    this.items.pop();
    this.priorities.pop();
    this.orders.pop();
    this.down(0);
    return top;
  }

  private before(a: number, b: number): boolean {
    const pa = this.priorities[a];
    const pb = this.priorities[b];
    return pa < pb || (pa === pb && this.orders[a] < this.orders[b]);
  }

  private move(from: number, to: number): void {
    this.items[to] = this.items[from];
    this.priorities[to] = this.priorities[from];
    this.orders[to] = this.orders[from];
  }

  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.priorities[a], this.priorities[b]] = [this.priorities[b], this.priorities[a]];
    [this.orders[a], this.orders[b]] = [this.orders[b], this.orders[a]];
  }

  private up(index: number): void {
    let at = index;
    while (at > 0) {
      const above = (at - 1) >> 1;
      if (!this.before(at, above)) return;
      this.swap(at, above);
      at = above;
    }
  }

  private down(index: number): void {
    let at = index;
    for (;;) {
      const left = at * 2 + 1;
      const right = left + 1;
      let first = at;
      if (left < this.items.length && this.before(left, first)) first = left;
      if (right < this.items.length && this.before(right, first)) first = right;
      if (first === at) return;
      this.swap(at, first);
      at = first;
    }
  }
}
