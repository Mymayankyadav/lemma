import {describe,expect,it} from "vitest";
import type {ReviewNode} from "../../../src/features/plan-proposal/nodes";
import {layoutPlanMap} from "../../../src/features/plan-proposal/planMap";

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
