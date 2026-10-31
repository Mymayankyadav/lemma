import {readFileSync} from "node:fs";
import type {DemoStore} from "../../../src/data/demo/model";
import {makeStressStore} from "../../../src/data/demo/stress";
import {describe,expect,it} from "vitest";
import type {ReviewNode} from "../../../src/features/plan-proposal/nodes";
import {groupPlanStages,layoutPlanMap,layoutStagePlanMap} from "../../../src/features/plan-proposal/planMap";

const cp=(i:number,prereqs:number[]):ReviewNode=>({code:`CP${i}`,title:`T${i}`,criterion:"",steps:[],prereqs:prereqs.map(p=>`CP${p}`)});

describe("plan checkpoint map as a tree",()=>{
  // CP1 → CP2, CP3 ; CP2 → CP4 ; CP3 → CP5 ; CP4, CP5 → CP6
  const plan=[cp(1,[]),cp(2,[1]),cp(3,[1]),cp(4,[2]),cp(5,[3]),cp(6,[4,5,1])];
  const layout=layoutPlanMap(plan),at=new Map(layout.nodes.map(n=>[n.code,n]));
  it("puts each prerequisite depth in its own column, left to right",()=>{
    expect(at.get("CP1")!.x).toBeLessThan(at.get("CP2")!.x);
    expect(at.get("CP2")!.x).toBe(at.get("CP3")!.x);
    expect(at.get("CP6")!.x).toBeGreaterThan(at.get("CP4")!.x);
  });
  it("centres columns so the tree spans out from its root",()=>{
    expect(at.get("CP1")!.y).toBeCloseTo((at.get("CP2")!.y+at.get("CP3")!.y)/2);
  });
  it("keeps each branch level with what it builds on",()=>{
    expect(Math.sign(at.get("CP4")!.y-at.get("CP5")!.y)).toBe(Math.sign(at.get("CP2")!.y-at.get("CP3")!.y));
  });
  it("draws every prerequisite",()=>{
    expect(layout.edges).toHaveLength(7);
  });
});

describe("ST-2 stage graph at scale",()=>{
  const forty = Array.from({length:40},(_,i)=>({
    ...cp(i+1,i?[i]:[]), stage:`Stage ${Math.floor(i/6)+1}`,
  }));
  it("keeps 40 checkpoints in seven bounded stage nodes",()=>{
    const graph=layoutStagePlanMap(forty);
    expect(graph.stages).toHaveLength(7);
    expect(graph.stages.map(s=>s.count)).toEqual([6,6,6,6,6,6,4]);
    expect(graph.width).toBe(320);
    expect(graph.height).toBeLessThan(500);
    expect(graph.edges).toHaveLength(6);
    expect(graph.edges.every(e=>e.count===1)).toBe(true);
  });
  it("expands only one stage in place, shifting later rows",()=>{
    const folded=layoutStagePlanMap(forty);
    const expanded=layoutStagePlanMap(forty,"stage-2");
    expect(expanded.stages).toHaveLength(7);
    expect(expanded.stages[2].y).toBe(folded.stages[2].y);
    expect(expanded.stages[4].y).toBeGreaterThan(folded.stages[4].y);
    expect(expanded.expandedY).not.toBeNull();
  });
  it("bundles every cross-stage prerequisite, not merely the first",()=>{
    const spread=Array.from({length:12},(_,i)=>({
      ...cp(i+1,i?[i]:[]),
      prereqs:i>=6?[...(i?[ `CP${i}` ]:[]),"CP1"]:i?[`CP${i}`]:[],
      stage:i<6?"Basics":"Applications",
    }));
    const graph=layoutStagePlanMap(spread);
    expect(graph.edges).toEqual([{from:"stage-0",to:"stage-1",count:7}]);
  });
  it("groups unstaged plans into neutral blocks of eight",()=>{
    const groups=groupPlanStages(Array.from({length:36},(_,i)=>cp(i+1,i?[i]:[])));
    expect(groups.map(s=>s.nodes.length)).toEqual([8,8,8,8,4]);
    expect(groups.map(s=>s.name)).toEqual(["CP1–CP8","CP9–CP16","CP17–CP24","CP25–CP32","CP33–CP36"]);
  });
});

describe("ST-2 stage layouts on deterministic ST-0 profiles",()=>{
  const original = JSON.parse(readFileSync("src/data/demo/fixture.json","utf8")) as DemoStore;
  for (const profile of ["stress","extreme"] as const) {
    it(`${profile} preserves the full plan and bounds the stage overview`,()=>{
      const data=makeStressStore(original,profile);
      const flatProject=data.projects[0];
      const flat=data.checkpoints.filter(c=>c.projectId===flatProject.id)
        .map(c=>({code:c.code,title:c.title,criterion:c.criterion,steps:c.steps,
          prereqs:c.prereqs,stage:c.stage}));
      expect(flat).toHaveLength(36);
      expect(groupPlanStages(flat)).toHaveLength(5);
      expect(layoutStagePlanMap(flat).width).toBe(320);
      const staged=data.checkpoints.filter(c=>c.projectId===data.projects[3].id)
        .map(c=>({code:c.code,title:c.title,criterion:c.criterion,steps:c.steps,
          prereqs:c.prereqs,stage:c.stage}));
      const overview=layoutStagePlanMap(staged);
      expect(staged.length).toBe(profile==="stress"?40:100);
      expect(overview.stages).toHaveLength(15);
      expect(overview.edges.length).toBeGreaterThan(0);
      expect(overview.width).toBe(320);
      expect(overview.stages.every(s=>s.x>=65&&s.x<=255)).toBe(true);
    });
  }
});
