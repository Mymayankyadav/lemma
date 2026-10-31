import {describe,it,expect} from 'vitest';
import {requireStageStructure,projectedPlanCheckpoints,requireIdeaHierarchy,requireLearningGoal,longCardAdvice} from '../../../supabase/functions/mcp/stress-guards.ts';

describe('MCP-5 connector scale guards',()=>{
  const cps=(n:number,stage?:string)=>Array.from({length:n},(_,i)=>({code:'CP'+(i+1),stage}));
  it('accepts small stage-free plans and rejects large stage-free plans with guidance',()=>{
    expect(()=>requireStageStructure(cps(8))).not.toThrow();
    expect(()=>requireStageStructure(cps(9))).toThrow(/3–7 named stages/);
    expect(()=>requireStageStructure(cps(36))).toThrow();
    expect(()=>requireStageStructure(cps(100,'Foundations'))).not.toThrow();
  });
  it('checks the resulting plan when a change adds, removes or assigns stages',()=>{
    const original=cps(8);
    expect(()=>requireStageStructure(projectedPlanCheckpoints(original,[{op:'add',code:'CP9'}]))).toThrow();
    expect(()=>requireStageStructure(projectedPlanCheckpoints(original,[{op:'add',code:'CP9',stage:'Foundations'}]))).not.toThrow();
    const large=cps(36);
    expect(()=>requireStageStructure(projectedPlanCheckpoints(large,[{op:'update',code:'CP1',stage:'Foundations'}]))).not.toThrow();
    expect(()=>requireStageStructure(projectedPlanCheckpoints(cps(9),[{op:'remove',code:'CP9'}]))).not.toThrow();
    expect(()=>requireStageStructure(projectedPlanCheckpoints(cps(9,'Foundations'),[{op:'update',code:'CP1',stage:null}]))).not.toThrow();
  });
  it('requires hierarchical idea metadata only for large proposals',()=>{
    const flat=Array.from({length:21},(_,i)=>({name:'Idea '+i}));
    expect(()=>requireIdeaHierarchy(flat.slice(0,20))).not.toThrow();
    expect(()=>requireIdeaHierarchy(flat)).toThrow(/levels and parent links/);
    const nested=[{name:'Root',level:'cluster'},...Array.from({length:20},(_,i)=>({name:'Child '+i,level:'planet',parent:'Root'}))];
    expect(()=>requireIdeaHierarchy(nested)).not.toThrow();
    expect(()=>requireIdeaHierarchy(nested.map(x=>({...x,parent:undefined})))).toThrow();
  });
  it('asks for an actual goal and never invents one',()=>{
    for(const goal of [undefined,null,'','   '])expect(()=>requireLearningGoal(goal)).toThrow(/Ask the student/);
    expect(()=>requireLearningGoal('Prove the spectral theorem')).not.toThrow();
  });
  it('advises splitting long cards without truncating or rejecting their contents',()=>{
    expect(longCardAdvice([{front:'a'.repeat(300),back:'b'.repeat(1200)}])).toBe('');
    expect(longCardAdvice([{front:'a'.repeat(301)},{front:'ok',back:'b'.repeat(1201)}])).toMatch(/2 long cards/);
  });
});
