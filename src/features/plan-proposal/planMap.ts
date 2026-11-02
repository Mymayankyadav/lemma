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

/** Keep the owner's named stages; create neutral eight-checkpoint stages for legacy flat plans. */
export interface PlanStage {id: string; name: string; nodes: ReviewNode[]}
// Review nodes are immutable derivations of a proposal snapshot. Share the
// grouped stages across the list and stage graph instead of repeating an
// O(n²) flat-plan reduce during each StrictMode render replay.
const groupedStageCache=new WeakMap<readonly ReviewNode[],PlanStage[]>();
export function groupPlanStages(nodes: readonly ReviewNode[]): PlanStage[] {
  const cached=groupedStageCache.get(nodes);
  if(cached)return cached;
  const hasNames = nodes.some(n => !!n.stage?.trim());
  const stages: PlanStage[] = [];
  let processed=0;
  for (const node of nodes) {
    const name = node.stage?.trim() || (hasNames ? "Unstaged" : `CP${Math.floor(processed / 8) * 8 + 1}`);
    processed++;
    const last = stages[stages.length - 1];
    if (last && last.name === name && (hasNames || last.nodes.length < 8)) {
      last.nodes.push(node);
    } else {
      stages.push({id: `stage-${stages.length}`, name, nodes: [node]});
    }
  }
  if (!hasNames) for (const s of stages) {
    s.name = `${s.nodes[0].code}–${s.nodes[s.nodes.length - 1].code}`;
  }
  groupedStageCache.set(nodes,stages);
  return stages;
}

export interface StageMapNode {id: string; name: string; count: number; x: number; y: number}
export interface StageMapEdge {from: string; to: string; count: number}
export interface StageMapLayout {
  stages: StageMapNode[];
  edges: StageMapEdge[];
  width: number;
  height: number;
  /** The expanded checkpoint tree occupies this gap between stage rows. */
  expandedY: number | null;
}
const STAGE_WIDTH = 320, STAGE_COLS = [82, 238], STAGE_ROW = 112, STAGE_DETAIL = 216;
/** Bundles every cross-stage prerequisite, including fan-out and skipped-stage links. */
export function layoutStagePlanMap(nodes: readonly ReviewNode[], expandedId: string | null = null): StageMapLayout {
  const groups = groupPlanStages(nodes);
  const byCheckpoint = new Map(groups.flatMap(g => g.nodes.map(n => [n.code, g.id] as const)));
  const counts = new Map<string, StageMapEdge>();
  for (const group of groups) for (const node of group.nodes) {
    for (const prereq of new Set(node.prereqs)) {
      const from = byCheckpoint.get(prereq);
      if (!from || from === group.id || prereq === node.code) continue;
      const key = from + ">" + group.id;
      const edge = counts.get(key);
      if (edge) edge.count++;
      else counts.set(key, {from, to: group.id, count: 1});
    }
  }
  const expandedIndex = groups.findIndex(g => g.id === expandedId);
  const expandedRow = expandedIndex < 0 ? -1 : Math.floor(expandedIndex / 2);
  const stages = groups.map((g, i) => {
    const row = Math.floor(i / 2);
    return {id:g.id, name:g.name, count:g.nodes.length, x:STAGE_COLS[i%2],
      y:48 + row * STAGE_ROW + (expandedRow >= 0 && row > expandedRow ? STAGE_DETAIL : 0)};
  });
  return {stages, edges:[...counts.values()], width:STAGE_WIDTH,
    height:Math.ceil(groups.length/2)*STAGE_ROW + (expandedRow >= 0 ? STAGE_DETAIL : 0) + 8,
    expandedY:expandedRow < 0 ? null : 48 + expandedRow * STAGE_ROW + 52};
}

/**
 * A plan-change map is a local explanation, not a second copy of the whole
 * approved plan. Keep the changed checkpoints, their immediate list neighbours
 * and both endpoints of directly affected prerequisite links. The full list and
 * drawer still receive the unfiltered nodes.
 *
 * Remove-only changes have no surviving changed node, so show the closest
 * surviving checkpoints on either side of each removed code in the old plan.
 * A concept-only proposal has no checkpoint map at all.
 */
export function planChangeMapNodes(
  nodes: readonly ReviewNode[],
  change: import("../../data/types").PlanChangePayload | null,
  existing: readonly Pick<import("../../data/types").CheckpointView,"code">[] = [],
): ReviewNode[] {
  if (!change) return [...nodes];
  const index=new Map(nodes.map((node,i)=>[node.code,i]));
  const changed=new Set(nodes.filter(node=>node.change).map(node=>node.code));
  const context=new Set<string>();
  const add=(code:string)=>{if(index.has(code))context.add(code)};
  for(const op of change.ops){
    if(op.op==="move"){
      if(index.has(op.code))changed.add(op.code);
      add(op.after);
    }else if(op.op==="prereq_remove"||op.op==="prereq_add"){
      // A removed edge is absent from the post-change node.prereqs. Retain
      // its other endpoint as context without re-adding the deleted edge.
      add(op.prereq);
    }else if(op.op==="remove"){
      const removed=existing.findIndex(cp=>cp.code===op.code);
      if(removed<0)continue;
      for(let i=removed-1;i>=0;i--)if(index.has(existing[i].code)){add(existing[i].code);break}
      for(let i=removed+1;i<existing.length;i++)if(index.has(existing[i].code)){add(existing[i].code);break}
    }
  }
  for(const code of changed){
    const i=index.get(code);
    if(i===undefined)continue;
    add(code);
    if(i>0)add(nodes[i-1].code);
    if(i+1<nodes.length)add(nodes[i+1].code);
    for(const prerequisite of nodes[i].prereqs)add(prerequisite);
  }
  // A checkpoint that depends on a changed checkpoint is also a direct
  // neighbour, even when it is far away in the ordered list.
  for(const node of nodes)if(node.prereqs.some(prereq=>changed.has(prereq)))add(node.code);
  if(context.size===0)return [];
  return nodes.filter(node=>context.has(node.code)).map(node=>({
    ...node,prereqs:node.prereqs.filter(code=>context.has(code)),
  }));
}
