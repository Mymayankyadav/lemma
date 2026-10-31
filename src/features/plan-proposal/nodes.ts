import type {CheckpointView, PlanChangePayload, PlanPayload} from "../../data/types";

/** The preview never mutates a proposal or guesses a persisted checkpoint code. */
export interface ReviewNode {
  code: string; title: string; criterion: string; stage?: string;
  steps: string[]; pages?: string; source?: string; prereqs: string[];
  objective?: string; dueOn?: string | null; concepts?: string[];
  sources?: {source: string; pages?: string}[]; recheck?: string;
  /** In a plan change: what this proposal does to the checkpoint. */
  change?: "added" | "updated";
}

export function planReviewNodes(
  plan: PlanPayload | null,
  change: PlanChangePayload | null,
  existing: readonly CheckpointView[] = [],
): ReviewNode[] {
  if (plan) return plan.checkpoints.map((cp, index) => ({
    code: cp.code || `CP${index + 1}`, title: cp.title || "Untitled checkpoint",
    criterion: cp.criterion || "", stage: cp.stage ?? undefined,
    steps: Array.isArray(cp.steps) ? cp.steps : [], pages: cp.pages, source: cp.source,
    prereqs: Array.isArray(cp.prereqs) ? cp.prereqs : [],
    objective: cp.objective, dueOn: cp.due_on ?? null, concepts: cp.concepts ?? [],
    sources: cp.sources ?? [], recheck: cp.recheck_prompt,
  }));
  if (!change) return [];
  // The base is the approved plan: checkpoints still shown as "proposed" are this
  // (or another pending) proposal's preview and would otherwise appear twice.
  const nodes: ReviewNode[] = existing.filter(cp => cp.ui !== "proposed").map(cp => ({
    code: cp.code, title: cp.title, criterion: "", stage: cp.stage ?? undefined,
    steps: [], prereqs: [], dueOn: cp.dueOn ?? null,
  }));
  const used = new Set(nodes.map(n => n.code.toLowerCase()));
  const reserve = (code: string) => { used.add(code.toLowerCase()); return code; };
  const provisional = (after?: string) => {
    if (after) {
      for (let i = 0; i < 26; i++) {
        const candidate = after + String.fromCharCode(97 + i);
        if (!used.has(candidate.toLowerCase())) return reserve(candidate);
      }
    }
    for (let n = 1; ; n++) {
      const candidate = `CP${n}`;
      if (!used.has(candidate.toLowerCase())) return reserve(candidate);
    }
  };
  // Explicit codes in later add operations must also be reserved before
  // assigning codes to code-less additions. This avoids order-dependent collisions.
  for (const op of change.ops) if (op.op === "add" && op.code)
    reserve(op.code);
  for (const op of change.ops) {
    if (op.op === "add") {
      const code = op.code || provisional(op.after);
      const at0 = op.after ? nodes.findIndex(n => n.code === op.after) : -1;
      const node: ReviewNode = {
        code, title: op.title || "Untitled checkpoint", criterion: op.criterion || "",
        // An inserted checkpoint without a stage belongs to the stage it is inserted into.
        stage: op.stage ?? (at0 >= 0 ? nodes[at0].stage : undefined), steps: Array.isArray(op.steps) ? op.steps : [],
        source: op.source, pages: op.pages,
        prereqs: Array.isArray(op.prereqs) ? op.prereqs : [],
        objective: op.objective, dueOn: op.due_on ?? null, concepts: op.concepts ?? [],
        sources: op.sources ?? [], recheck: op.recheck_prompt, change: "added",
      };
      const same = nodes.findIndex(n => n.code === code);
      if (same >= 0) nodes.splice(same, 1);
      const at = op.after ? nodes.findIndex(n => n.code === op.after) : -1;
      nodes.splice(at >= 0 ? at + 1 : nodes.length, 0, node);
    } else if (op.op === "update") {
      const node = nodes.find(n => n.code === op.code);
      if (node) {
        if (op.title !== undefined) node.title = op.title;
        if (op.criterion !== undefined) node.criterion = op.criterion;
        if (op.stage !== undefined) node.stage = op.stage ?? undefined;
        if (op.steps !== undefined) node.steps = Array.isArray(op.steps) ? op.steps : [];
        if (op.pages !== undefined) node.pages = op.pages;
        if (op.objective !== undefined) node.objective = op.objective;
        if (op.recheck_prompt !== undefined) node.recheck = op.recheck_prompt;
        if (!node.change) node.change = "updated";
      }
    } else if (op.op === "remove") {
      const i = nodes.findIndex(n => n.code === op.code);
      if (i >= 0) nodes.splice(i, 1);
    } else if (op.op === "move") {
      const i = nodes.findIndex(n => n.code === op.code);
      if (i >= 0) {
        const [node] = nodes.splice(i, 1);
        // A move changes the plan even if the checkpoint's text is untouched.
        // Keep that visible in the map, list and drawer.
        if (!node.change) node.change = "updated";
        const at = nodes.findIndex(n => n.code === op.after);
        nodes.splice(at < 0 ? nodes.length : at + 1, 0, node);
      }
    } else {
      const node = nodes.find(n => n.code === op.code);
      if (!node) continue;
      if (op.op === "prereq_add" && !node.prereqs.includes(op.prereq)) node.prereqs.push(op.prereq);
      if (op.op === "prereq_remove") node.prereqs = node.prereqs.filter(p => p !== op.prereq);
      if (!node.change) node.change = "updated";
    }
  }
  return nodes;
}
