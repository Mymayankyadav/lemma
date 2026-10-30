import type {AtlasGraph, ConceptLevel, Glyph, PlanChangePayload, PlanPayload, ProposedIdea} from "../../data/types";
import type {ReviewNode} from "./nodes";

const LEVELS: ConceptLevel[] = ["cluster", "galaxy", "system", "planet", "moon"];
const key = (name: string) => name.trim().toLocaleLowerCase();

/**
 * The ideas a proposal would add, as the same graph the Atlas draws: nested by the
 * tutor's levels and parents, linked by prerequisite and related names, and tied to
 * the checkpoints that teach them. Returns null when the proposal names no ideas.
 */
export function planIdeasGraph(
  plan: PlanPayload | null,
  change: PlanChangePayload | null,
  nodes: readonly ReviewNode[],
  projectSlug: string,
  subject: {name: string; glyph: Glyph},
): AtlasGraph | null {
  const raw: ProposedIdea[] = [...(plan?.concepts ?? []), ...(change?.concepts ?? [])].filter((c) => c?.name?.trim());
  const byKey = new Map<string, ProposedIdea>();
  for (const idea of raw) if (!byKey.has(key(idea.name))) byKey.set(key(idea.name), idea);
  for (const node of nodes)
    for (const name of node.concepts ?? [])
      if (name.trim() && !byKey.has(key(name))) byKey.set(key(name), {name});
  if (!byKey.size) return null;
  const id = (name: string) => "idea:" + key(name);
  const refs = new Map<string, {projectSlug: string; code: string}[]>();
  for (const node of nodes)
    for (const name of node.concepts ?? []) {
      const list = refs.get(key(name)) ?? [];
      if (!list.some((r) => r.code === node.code)) list.push({projectSlug, code: node.code});
      refs.set(key(name), list);
    }
  const concepts: AtlasGraph["concepts"] = [...byKey.entries()].map(([k, idea]) => ({
    id: "idea:" + k, slug: k.replace(/[^a-z0-9]+/g, "-"), name: idea.name.trim(),
    level: LEVELS.includes(idea.level as ConceptLevel) ? idea.level : "planet",
    parentId: idea.parent && byKey.has(key(idea.parent)) && key(idea.parent) !== k ? id(idea.parent) : null,
    isStar: !!idea.star, topic: idea.topic ?? null, blurb: idea.blurb ?? null, subjectId: "plan",
    status: "not_started", pinX: null, pinY: null, checkpointRefs: refs.get(k) ?? [], dueCards: 0,
  }));
  const links: AtlasGraph["links"] = [], seen = new Set<string>();
  const link = (from: string, to: string, kind: "prereq" | "related") => {
    if (!byKey.has(key(from)) || !byKey.has(key(to)) || key(from) === key(to)) return;
    const k = kind + ":" + (kind === "related" ? [key(from), key(to)].sort().join("|") : key(from) + ">" + key(to));
    if (seen.has(k)) return;
    seen.add(k);
    links.push({fromId: id(from), toId: id(to), kind});
  };
  for (const idea of byKey.values()) {
    for (const p of idea.prereqs ?? []) link(p, idea.name, "prereq");
    for (const r of idea.related ?? []) link(idea.name, r, "related");
  }
  return {subjects: [{id: "plan", name: subject.name, glyph: subject.glyph, hue: "amber", position: 0}], concepts, links};
}
