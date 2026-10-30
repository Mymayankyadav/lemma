import type {ReviewNode} from "./nodes";

/**
 * Checkpoint map for plan review: one band per stage, checkpoints in plan order,
 * wrapping in a snake (left to right, then right to left) so consecutive
 * checkpoints always sit next to each other. Only direct prerequisites are drawn:
 * a link already implied through another prerequisite is left out.
 */
export const R = 17;
const PAD = 26, MIN_GAP = 56, MAX_GAP = 72, LINE = 52, LABEL = 18;

export interface MapNode {code: string; x: number; y: number}
export interface MapEdge {from: string; to: string; d: string}
export interface MapLabel {text: string; x: number; y: number}
export interface PlanMapLayout {nodes: MapNode[]; edges: MapEdge[]; labels: MapLabel[]; width: number; height: number; hidden: number}

/** Drop u → v when u already reaches another prerequisite of v. */
export function directPrereqs(nodes: readonly Pick<ReviewNode, "code" | "prereqs">[]): Map<string, string[]> {
  const known = new Set(nodes.map((n) => n.code));
  const needs = new Map(nodes.map((n) => [n.code, [...new Set(n.prereqs)].filter((p) => known.has(p) && p !== n.code)]));
  const memo = new Map<string, Set<string>>();
  const ancestors = (code: string, path = new Set<string>()): Set<string> => {
    if (memo.has(code)) return memo.get(code)!;
    if (path.has(code)) return new Set();
    path.add(code);
    const out = new Set<string>();
    for (const p of needs.get(code) ?? []) {
      out.add(p);
      for (const a of ancestors(p, path)) out.add(a);
    }
    path.delete(code);
    memo.set(code, out);
    return out;
  };
  const direct = new Map<string, string[]>();
  for (const [code, list] of needs)
    direct.set(code, list.filter((u) => !list.some((w) => w !== u && ancestors(w).has(u))));
  return direct;
}

export function layoutPlanMap(nodes: readonly ReviewNode[], width: number): PlanMapLayout {
  const usable = Math.max(MIN_GAP * 2, width - 2 * PAD);
  const perLine = Math.max(3, Math.floor(usable / MIN_GAP) + 1);
  const gap = Math.min(MAX_GAP, usable / (perLine - 1));
  const stages: {name: string; codes: string[]}[] = [];
  for (const n of nodes) {
    const name = n.stage?.trim() || "";
    const last = stages[stages.length - 1];
    if (last && last.name === name) last.codes.push(n.code);
    else stages.push({name, codes: [n.code]});
  }
  const placed: MapNode[] = [], labels: MapLabel[] = [];
  let y = 0, lastX: number | null = null;
  const middle = PAD + ((perLine - 1) * gap) / 2;
  for (const stage of stages) {
    if (stage.name) { labels.push({text: stage.name, x: PAD - R + 2, y: y + 12}); y += LABEL; }
    // Start each stage on the side where the previous one ended, then snake.
    let forward = lastX === null || lastX <= middle;
    for (let i = 0; i < stage.codes.length; i += perLine) {
      const row = stage.codes.slice(i, i + perLine);
      const cy = y + R + 6;
      row.forEach((code, j) => {
        const x = PAD + (forward ? j : perLine - 1 - j) * gap;
        placed.push({code, x, y: cy});
        lastX = x;
      });
      y = cy + R + (LINE - 2 * R - 6);
      forward = !forward;
    }
    y += 4;
  }
  const at = new Map(placed.map((n) => [n.code, n]));
  const direct = directPrereqs(nodes);
  const edges: MapEdge[] = [];
  let hidden = 0;
  for (const n of nodes) {
    hidden += new Set(n.prereqs.filter((p) => at.has(p) && p !== n.code)).size - (direct.get(n.code)?.length ?? 0);
    for (const p of direct.get(n.code) ?? []) {
      const a = at.get(p)!, b = at.get(n.code)!;
      edges.push({from: p, to: n.code, d: edgePath(a, b, gap)});
    }
  }
  return {nodes: placed, edges, labels, width: Math.round(PAD * 2 + (perLine - 1) * gap), height: Math.max(60, Math.round(y)), hidden};
}

function edgePath(a: MapNode, b: MapNode, gap: number): string {
  const f = (v: number) => v.toFixed(1);
  if (Math.abs(a.y - b.y) < 1) {
    const dir = Math.sign(b.x - a.x) || 1;
    if (Math.abs(b.x - a.x) <= gap + 1)
      return `M${f(a.x + dir * R)} ${f(a.y)}L${f(b.x - dir * (R + 3))} ${f(b.y)}`;
    const lift = 12 + Math.min(18, Math.abs(b.x - a.x) / 10);
    return `M${f(a.x)} ${f(a.y - R)}C${f(a.x)} ${f(a.y - R - lift)} ${f(b.x)} ${f(b.y - R - lift)} ${f(b.x)} ${f(b.y - R - 3)}`;
  }
  const down = b.y > a.y, s = down ? 1 : -1, dy = Math.abs(b.y - a.y) - 2 * R;
  const y1 = a.y + s * R, y2 = b.y - s * (R + 3);
  return `M${f(a.x)} ${f(y1)}C${f(a.x)} ${f(y1 + s * dy * 0.55)} ${f(b.x)} ${f(y2 - s * dy * 0.55)} ${f(b.x)} ${f(y2)}`;
}
