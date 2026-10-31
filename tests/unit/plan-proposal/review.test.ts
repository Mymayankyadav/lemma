import {describe, expect, it} from "vitest";
import type {CheckpointView, PlanChangePayload} from "../../../src/data/types";
import {planReviewNodes} from "../../../src/features/plan-proposal/nodes";

const current: CheckpointView[] = [
  {id:"cp1", code:"CP1", title:"Current proof", stage:"Original", position:1, ui:"now",
    currentStep:2, stepsTotal:2, recheckDue:null, dueCards:0},
];

describe("plan-review live payload regression (#354)", () => {
  it("renders existing checkpoints and an add without code with a noncolliding provisional code", () => {
    // Production P131 contains an update to CP1 followed by an add with no code.
    const planChange: PlanChangePayload = {ops:[
      {op:"update", code:"CP1", stage:"Revised"},
      {op:"add", stage:"Bridge", steps:["Think"], title:"Bridge", criterion:"Proves it", objective:"Learn"},
    ]};
    const nodes = planReviewNodes(null, planChange, current);
    expect(nodes.map(n => n.code)).toEqual(["CP1","CP2"]);
    expect(nodes[0].stage).toBe("Revised");
    expect(nodes[1]).toMatchObject({title:"Bridge", criterion:"Proves it", steps:["Think"]});
    expect(new Set(nodes.map(n => n.code)).size).toBe(nodes.length);
  });
  it("allocates a suffix after an existing checkpoint and skips later explicit additions", () => {
    const nodes = planReviewNodes(null,{ops:[
      {op:"add",after:"CP1", title:"Bridge", criterion:"Evidence", objective:"Learn", steps:[]},
      {op:"add",code:"CP1a",title:"Named", criterion:"Evidence", objective:"Learn",steps:[]},
    ]},current);
    expect(nodes.map(n => n.code)).toEqual(["CP1", "CP1b", "CP1a"]);
    expect(nodes.map(n => n.title)).toEqual(["Current proof","Bridge","Named"]);
  });
  it("applies updates, moves, deletes and prerequisite links in the preview only", () => {
    const nodes=planReviewNodes(null,{ops:[
      {op:"add",code:"CP2",title:"Next",objective:"Learn",criterion:"Verify",steps:[]},
      {op:"prereq_add",code:"CP2",prereq:"CP1"},
      {op:"move",code:"CP2",after:"CP1"},
      {op:"remove",code:"CP1"},
    ]},current);
    expect(nodes.map(n=>n.code)).toEqual(["CP2"]);
    expect(nodes[0].prereqs).toEqual(["CP1"]);
    expect(current[0].stage).toBe("Original");
  });
});

describe("plan change preview never shows a checkpoint twice", () => {
  it("drops checkpoints that are only proposed and gives an insert the stage it lands in", () => {
    const base: CheckpointView[] = [
      {id:"a", code:"CP4", title:"Compactness", stage:"Compactness", position:4, ui:"now", currentStep:1, stepsTotal:3, recheckDue:null, dueCards:0},
      {id:"b", code:"CP4a", title:"Lemma", stage:null, position:4.5, ui:"proposed", currentStep:0, stepsTotal:3, recheckDue:null, dueCards:0},
      {id:"c", code:"CP5", title:"Continuity", stage:"Compactness", position:5, ui:"locked", currentStep:0, stepsTotal:3, recheckDue:null, dueCards:0},
    ];
    const nodes = planReviewNodes(null, {ops:[{op:"add", after:"CP4", code:"CP4a", title:"Lemma", objective:"o", criterion:"c", steps:["s"], prereqs:["CP4"]}]}, base);
    expect(nodes.map(n => n.code)).toEqual(["CP4", "CP4a", "CP5"]);
    expect(nodes[1]).toMatchObject({stage:"Compactness", change:"added", prereqs:["CP4"]});
  });
});
