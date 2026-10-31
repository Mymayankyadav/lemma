import { describe, expect, it } from "vitest";
import type { Proposal, SessionEvent } from "../../../src/data/types";
import { groupProposals, pageProposals } from "../../../src/features/proposals/groups";
import { reasoningRuns } from "../../../src/features/session/runs";

function proposal(index: number, project = "algebra", session = 7, checkpoint = "CP4"): Proposal {
  return {
    id: String(index), kind: "card", projectSlug: project, projectGlyph: "∫",
    sessionNumber: session, origin: "claude", reason: null, createdAt: "2026-10-01T00:00:00Z",
    card: { front: "Front "+index, back: "Answer", type: "basic", kind: "concept", checkpoint },
    cardEdit: null, plan: null, planChange: null,
  } as Proposal;
}
function event(index: number, kind: SessionEvent["kind"]): SessionEvent {
  return { id: index, kind, body: "Event "+index, outcome: null, hintLevel: null, checkpointCode: "CP4", createdAt: "2026-10-01T00:00:00Z" };
}
describe("ST-6 bounded lists", () => {
  it("pages 600 proposals and keeps projects and sessions distinct", () => {
    const rows = Array.from({length:600},(_,i)=>proposal(i));
    expect(pageProposals(rows,20)).toHaveLength(20);
    expect(pageProposals(rows,40)).toHaveLength(40);
    expect(groupProposals([...pageProposals(rows,20),proposal(601,"analysis"),proposal(602,"algebra",8)])
      .map(g=>g.proposals.length)).toEqual([20,1,1]);
    expect(groupProposals([proposal(1),proposal(2),proposal(3,"algebra",7,"CP5")])
      .map(g=>g.label)).toEqual(["S7 / CP4","S7 / CP5"]);
  });
  it("folds 400 events but not attempts, evidence or rechecks", () => {
    const events = [
      ...Array.from({length:150},(_,i)=>event(i,"hint")),
      event(150,"attempt"),
      ...Array.from({length:150},(_,i)=>event(i+151,"explanation")),
      event(301,"evidence"),event(302,"recheck"),
      ...Array.from({length:97},(_,i)=>event(i+303,"note")),
    ];
    expect(events).toHaveLength(400);
    const runs=reasoningRuns(events);
    expect(runs.map(r=>r.events.length)).toEqual([150,1,150,1,1,97]);
    expect(runs.filter(r=>["attempt","evidence","recheck"].includes(r.kind))).toHaveLength(3);
    expect(runs.at(-1)?.start).toBe(303);
  });
});
