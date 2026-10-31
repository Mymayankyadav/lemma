import {describe,expect,it} from "vitest";
import type {CheckpointView,PlanChangePayload} from "../../../src/data/types";
import {planReviewNodes} from "../../../src/features/plan-proposal/nodes";
import type {ReviewNode} from "../../../src/features/plan-proposal/nodes";
import {planChangeMapNodes,layoutPlanMap} from "../../../src/features/plan-proposal/planMap";

const cp=(i:number,prereqs:string[]=[]):ReviewNode=>({
 code:`CP${i}`,title:`Checkpoint ${i}`,criterion:"",steps:[],prereqs,
});
const original=Array.from({length:12},(_,i)=>cp(i+1));
const change=(ops:PlanChangePayload["ops"]):PlanChangePayload=>({ops});
const codes=(nodes:readonly ReviewNode[])=>nodes.map(n=>n.code);

describe("LOOK-8b plan-change checkpoint map context",()=>{
 it("preserves the full map for a new plan",()=>{
  expect(codes(planChangeMapNodes(original,null))).toEqual(codes(original));
 });
 it("shows a changed checkpoint and its immediate list neighbours, not twelve unrelated nodes",()=>{
  const nodes=original.map(n=>n.code==="CP6"?{...n,change:"updated" as const}:n);
  const map=planChangeMapNodes(nodes,change([{op:"update",code:"CP6",title:"Updated"}]));
  expect(codes(map)).toEqual(["CP5","CP6","CP7"]);
  expect(map[1].change).toBe("updated");
 });
 it("includes both ends of relevant prerequisite links without inventing edges",()=>{
  const nodes=original.map(n=>n.code==="CP6"?{...n,change:"updated" as const,prereqs:["CP1"]}:
   n.code==="CP10"?{...n,prereqs:["CP6","CP2"]}:n);
  const map=planChangeMapNodes(nodes,change([{op:"prereq_add",code:"CP6",prereq:"CP1"}]));
  expect(codes(map)).toEqual(["CP1","CP5","CP6","CP7","CP10"]);
  expect(map.find(n=>n.code==="CP10")?.prereqs).toEqual(["CP6"]);
  expect(layoutPlanMap(map).edges.map(e=>e.from+">"+e.to).sort()).toEqual(["CP1>CP6","CP6>CP10"]);
 });
 it("retains a nonadjacent removed-prerequisite endpoint without drawing the deleted edge",()=>{
  const nodes=original.map(n=>n.code==="CP6"?{...n,change:"updated" as const}:n);
  const map=planChangeMapNodes(nodes,change([{op:"prereq_remove",code:"CP6",prereq:"CP1"}]));
  expect(codes(map)).toEqual(["CP1","CP5","CP6","CP7"]);
  expect(layoutPlanMap(map).edges).toEqual([]);
 });
 it("retains a removed edge's remote endpoint in the actual plan-change preview",()=>{
  const base:CheckpointView[]=original.map((node,i)=>({
   id:node.code,code:node.code,title:node.title,position:i+1,ui:"next",
   currentStep:0,stepsTotal:0,recheckDue:null,dueCards:0,
  }));
  const delta=change([{op:"prereq_remove",code:"CP6",prereq:"CP1"}]);
  const preview=planReviewNodes(null,delta,base);
  expect(preview.find(node=>node.code==="CP6")?.change).toBe("updated");
  const focused=planChangeMapNodes(preview,delta,base);
  expect(codes(focused)).toEqual(["CP1","CP5","CP6","CP7"]);
  expect(layoutPlanMap(focused).edges).toEqual([]);
 });

 it("keeps moved checkpoints and the insertion neighbour in view",()=>{
  const moved=[...original.filter(n=>n.code!=="CP6")];
  moved.splice(moved.findIndex(n=>n.code==="CP10")+1,0,cp(6));
  const map=planChangeMapNodes(moved,change([{op:"move",code:"CP6",after:"CP10"}]));
  expect(codes(map)).toContain("CP6");
  expect(codes(map)).toContain("CP10");
  expect(codes(map)).toContain("CP11");
  expect(map.length).toBeLessThan(original.length);
 });
 it("a move-only preview is marked changed, including its drawer badge",()=>{
  const base:CheckpointView[]=original.map((node,i)=>({
   id:node.code,code:node.code,title:node.title,position:i+1,ui:"next",
   currentStep:0,stepsTotal:0,recheckDue:null,dueCards:0,
  }));
  const delta=change([{op:"move",code:"CP6",after:"CP10"}]);
  const preview=planReviewNodes(null,delta,base);
  expect(preview.find(node=>node.code==="CP6")?.change).toBe("updated");
  const map=planChangeMapNodes(preview,delta,base);
  expect(codes(map)).toContain("CP6");
  expect(codes(map)).toContain("CP10");
 });
 it("a removal-only change shows the surviving neighbours rather than the entire old plan",()=>{
  const nodes=original.filter(n=>n.code!=="CP6");
  const map=planChangeMapNodes(nodes,change([{op:"remove",code:"CP6"}]),original);
  expect(codes(map)).toEqual(["CP5","CP7"]);
 });
 it("a concept-only change does not render an unrelated checkpoint map",()=>{
  expect(planChangeMapNodes(original,change([]))).toEqual([]);
 });
});
