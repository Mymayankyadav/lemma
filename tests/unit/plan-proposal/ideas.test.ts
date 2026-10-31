import {describe,expect,it} from "vitest";
import type {PlanPayload,ProposedIdea} from "../../../src/data/types";
import {planIdeasGraph} from "../../../src/features/plan-proposal/ideas";
import {planReviewNodes} from "../../../src/features/plan-proposal/nodes";
import {arcsFor,buildAtlasTree,expandedToDepth,visibleRows} from "../../../src/features/atlas/tree";

/** A plan the size the owner described: 79 ideas in fields, areas and topics. */
function bigPlan():PlanPayload{
  const concepts:ProposedIdea[]=[];
  for(const f of [0,1]){
    concepts.push({name:`Field ${f}`,level:"cluster"});
    for(let a=0;a<3;a++){
      concepts.push({name:`Area ${f}.${a}`,level:"galaxy",parent:`Field ${f}`});
      for(let t=0;t<2;t++){
        concepts.push({name:`Topic ${f}.${a}.${t}`,level:"system",parent:`Area ${f}.${a}`});
        for(let i=0;i<4;i++)concepts.push({name:`Idea ${f}.${a}.${t}.${i}`,level:"planet",parent:`Topic ${f}.${a}.${t}`,
          prereqs:i?[`Idea ${f}.${a}.${t}.${i-1}`]:a?[`Idea ${f}.${a-1}.${t}.3`]:[]});
      }
    }
  }
  concepts.push({name:"Bridge",level:"planet",parent:"Topic 1.0.0",prereqs:["Idea 0.2.1.3"],related:["Idea 0.0.0.0"]});
  return {concepts,checkpoints:[{code:"CP1",title:"Start",objective:"o",criterion:"c",steps:["s"],concepts:["Idea 0.0.0.0","Bridge"]}]};
}

describe("plan ideas as a collapsible graph",()=>{
  const plan=bigPlan();
  const graph=planIdeasGraph(plan,null,planReviewNodes(plan,null),"real-analysis",{name:"Analysis",glyph:"∫"})!;
  const tree=buildAtlasTree(graph);
  it("keeps the tutor's nesting and every field as a root",()=>{
    expect(graph.concepts).toHaveLength(69);
    expect(tree.roots).toEqual(["idea:field 0","idea:field 1"]);
    expect(tree.nodes.get("idea:topic 0.0.0")!.children).toHaveLength(4);
  });
  it("folds 69 ideas to a handful of rows that still show how areas depend on each other",()=>{
    const rows=visibleRows(tree,expandedToDepth(tree,2));
    expect(rows).toHaveLength(8);
    const arcs=arcsFor(tree,rows,new Set(["prereq"]));
    expect(arcs.length).toBeGreaterThan(0);
    expect(arcs.reduce((n,a)=>n+a.count,0)).toBeGreaterThan(arcs.length);
  });
  it("ties ideas to the checkpoints that teach them",()=>{
    expect(tree.nodes.get("idea:bridge")!.checkpointRefs).toEqual([{projectSlug:"real-analysis",code:"CP1"}]);
  });
  it("returns nothing when a proposal names no ideas",()=>{
    expect(planIdeasGraph({checkpoints:[]},null,[],"x",{name:"x",glyph:"x"})).toBeNull();
  });
});

describe("ST-2 flat ideas open as checkpoint groups",()=>{
 it("groups 80 unlevelled ideas under at most 40 taught-in branches",()=>{
   const plan:PlanPayload={
     checkpoints:Array.from({length:40},(_,i)=>({
       code:`CP${i+1}`,title:`Checkpoint ${i+1}`,objective:"",criterion:"",steps:[],
       concepts:[`Idea ${2*i+1}`,`Idea ${2*i+2}`],
     })),
     concepts:Array.from({length:80},(_,i)=>({name:`Idea ${i+1}`,prereqs:i?[`Idea ${i}`]:[]})),
   };
   const graph=planIdeasGraph(plan,null,planReviewNodes(plan,null),"test",{name:"Algebra",glyph:"∑"})!;
   const tree=buildAtlasTree(graph);
   const groups=[...tree.nodes.values()].filter(n=>n.synthetic&&n.name.startsWith("Taught in "));
   expect(groups).toHaveLength(40);
   expect(groups.every(g=>g.children.length===2)).toBe(true);
   expect([...tree.nodes.values()].filter(n=>!n.synthetic)).toHaveLength(80);
   const collapsed=visibleRows(tree,expandedToDepth(tree,2));
   expect(collapsed).toHaveLength(41); // one subject root and 40 folded checkpoint groups
   expect(collapsed.every(r=>!r.id.startsWith("idea:idea "))).toBe(true);
   expect(graph.links).toHaveLength(79);
   expect(tree.nodes.get("idea:idea 1")!.checkpointRefs).toEqual([{projectSlug:"test",code:"CP1"}]);
 });
 it("does not group a tutor-authored hierarchy under checkpoint headings",()=>{
   const graph=planIdeasGraph(bigPlan(),null,planReviewNodes(bigPlan(),null),"analysis",{name:"Analysis",glyph:"∫"})!;
   expect(graph.concepts.every(c=>!c.topic?.startsWith("Taught in "))).toBe(true);
 });
});
