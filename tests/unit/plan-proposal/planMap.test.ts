import {describe,expect,it} from "vitest";
import type {ReviewNode} from "../../../src/features/plan-proposal/nodes";
import {directPrereqs,layoutPlanMap} from "../../../src/features/plan-proposal/planMap";

const cp=(i:number,stage:string,prereqs:number[]):ReviewNode=>({code:`CP${i}`,title:`T${i}`,criterion:"",stage,steps:[],prereqs:prereqs.map(p=>`CP${p}`)});
/** The owner's case: 36 checkpoints in stages, each needing the previous one and some earlier ones. */
const plan=Array.from({length:36},(_,k)=>{
  const i=k+1,stage=`${Math.floor(k/5)} Stage`;
  return cp(i,stage,i===1?[]:i%4===0?[i-1,i-3,1]:[i-1]);
});

describe("plan checkpoint map",()=>{
  it("draws only direct prerequisites",()=>{
    const direct=directPrereqs(plan);
    expect(direct.get("CP8")).toEqual(["CP7"]);
    expect(direct.get("CP2")).toEqual(["CP1"]);
  });
  it("fits a phone width, keeps stages as bands and stays compact",()=>{
    const layout=layoutPlanMap(plan,342);
    expect(layout.width).toBeLessThanOrEqual(342);
    expect(Math.max(...layout.nodes.map(n=>n.x))).toBeLessThanOrEqual(342-17);
    expect(layout.labels).toHaveLength(8);
    expect(layout.edges).toHaveLength(35);
    expect(layout.hidden).toBe(17);
    expect(layout.height).toBeLessThan(36*40);
  });
  it("keeps consecutive checkpoints next to each other, snaking at line ends",()=>{
    const layout=layoutPlanMap(plan,342),at=new Map(layout.nodes.map(n=>[n.code,n]));
    for(let i=1;i<5;i++){
      const a=at.get(`CP${i}`)!,b=at.get(`CP${i+1}`)!;
      expect(a.y).toBe(b.y);
      expect(Math.abs(a.x-b.x)).toBeLessThan(80);
    }
    // The next stage starts on the side where the previous one ended.
    expect(Math.abs(at.get("CP6")!.x-at.get("CP5")!.x)).toBeLessThanOrEqual(58.1);
    expect(at.get("CP6")!.y).toBeGreaterThan(at.get("CP5")!.y);
  });
});
