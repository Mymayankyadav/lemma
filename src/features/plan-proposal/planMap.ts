import type {ReviewNode} from "./nodes";

/**
 * Checkpoint map for plan review: a tree spanning out from left to right. Each
 * column is one prerequisite depth; columns are centred on one line and ordered
 * so each checkpoint sits level with what it builds on, which keeps the lines short
 * and uncrossed. Every prerequisite is drawn, as before.
 */
export const R = 18;
const PAD = 30, COL = 66, ROW = 50;

export interface MapNode {code: string; x: number; y: number}
export interface MapEdge {from: string; to: string}
export interface PlanMapLayout {nodes: MapNode[]; edges: MapEdge[]; width: number; height: number}

export function layoutPlanMap(nodes: readonly ReviewNode[]): PlanMapLayout {
  const byCode = new Map(nodes.map((n) => [n.code, n]));
  const order = new Map(nodes.map((n, i) => [n.code, i]));
  const depth = new Map<string, number>();
  const depthOf = (code: string, path: Set<string>): number => {
    if (depth.has(code)) return depth.get(code)!;
    if (path.has(code)) return 0;
    path.add(code);
    const parents = (byCode.get(code)?.prereqs ?? []).filter((p) => byCode.has(p) && p !== code);
    const d = parents.length ? 1 + Math.max(...parents.map((p) => depthOf(p, path))) : 0;
    path.delete(code);
    depth.set(code, d);
    return d;
  };
  const columns: string[][] = [];
  for (const n of nodes) {
    const d = depthOf(n.code, new Set());
    (columns[d] ??= []).push(n.code);
  }
  // Order each column by where its prerequisites sit (plan order breaks ties).
  const slot = new Map<string, number>();
  columns.forEach((column, d) => {
    if (!column) return;
    const key = (code: string) => {
      const parents = (byCode.get(code)?.prereqs ?? []).filter((p) => slot.has(p));
      return parents.length ? parents.reduce((s, p) => s + slot.get(p)!, 0) / parents.length : (order.get(code) ?? 0);
    };
    column.sort((a, b) => (d ? key(a) - key(b) : 0) || (order.get(a)! - order.get(b)!));
    column.forEach((code, i) => slot.set(code, i - (column.length - 1) / 2));
  });
  const tallest = Math.max(1, ...columns.map((c) => c?.length ?? 0));
  const mid = PAD + ((tallest - 1) * ROW) / 2;
  const placed: MapNode[] = [];
  columns.forEach((column, d) => column?.forEach((code) => placed.push({code, x: PAD + d * COL, y: mid + slot.get(code)! * ROW})));
  const edges: MapEdge[] = [];
  for (const n of nodes)
    for (const p of new Set(n.prereqs)) if (byCode.has(p) && p !== n.code) edges.push({from: p, to: n.code});
  return {nodes: placed, edges, width: PAD * 2 + Math.max(0, columns.length - 1) * COL, height: PAD * 2 + (tallest - 1) * ROW};
}
