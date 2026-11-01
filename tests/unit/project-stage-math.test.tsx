import {renderAllReady} from '../helpers/renderAllReady';
import {MemoryRouter} from 'react-router';
import {describe,expect,it,vi} from 'vitest';
import type {CheckpointView,ProjectDetail} from '../../src/data/types';
import {Stages} from '../../src/features/project/PathsView';

vi.mock('../../src/data/hooks',()=>({
 useInsightData:()=>({data:{checkpointEvents:[]},isPending:false}),
}));
// The Project's deferred query retains the same insight data contract.
// This SSR-only stage math test mocks the hook, not React Query transport.
vi.mock('../../src/features/project/useProjectInsight',()=>({
 useProjectInsight:()=>({data:{checkpointEvents:[]},isPending:false}),
}));

describe('project stage jump navigation',()=>{
 it('typesets mathematical tutor stage names in the jump chips',async()=>{
  const checkpoints:CheckpointView[]=Array.from({length:6},(_,index)=>({
   id:'cp-'+index,code:'CP'+(index+1),title:'Checkpoint '+(index+1),position:index,
   stage:index===0?'Topology of $\\mathbb{R}^n$':'Stage '+(index+1),
   ui:index===0?'now':'next',currentStep:1,stepsTotal:1,
   recheckDue:null,dueCards:0,
  }));
  const detail={
   project:{id:'test-project',targetDate:null},
   checkpoints,done:0,total:checkpoints.length,sources:[],sessions:[],
   pendingProposals:0,
  } as unknown as ProjectDetail;
  const container=document.createElement('div');
  container.innerHTML=await renderAllReady(<MemoryRouter><Stages detail={detail}/></MemoryRouter>);
  const navigation=container.querySelector('nav[aria-label="Jump to stage"]');
  const firstChip=navigation?.querySelector('[data-stage-chip="0"]');
  expect(navigation?.querySelectorAll('[data-stage-chip]')).toHaveLength(6);
  expect(firstChip?.querySelector('.katex')).not.toBeNull();
  expect(firstChip?.textContent).toContain('Topology of');
  // KaTeX keeps the original TeX in an invisible MathML annotation.
  // Inspect the visible HTML rendering rather than that accessibility metadata.
  const visibleMath=firstChip?.querySelector('.katex-html')?.textContent;
  expect(visibleMath).toContain('R');
  expect(visibleMath).not.toContain('\\mathbb');
 });

 it('bounds an 80-character mathematical stage name in a recoverable chip frame',async()=>{
  const longStage='\\operatorname{'+'verylongmathematicalstage'.repeat(5)+'}';
  const checkpoints:CheckpointView[]=Array.from({length:6},(_,i)=>({
   id:'long-cp-'+i,code:'CP'+(i+1),title:'Checkpoint '+i,position:i,
   stage:i===0?'\\('+longStage+'\\)':'Stage '+i,
   ui:i===0?'now':'next',currentStep:1,stepsTotal:1,recheckDue:null,dueCards:0,
  }));
  const detail={project:{id:'long-stage',slug:'long-stage',targetDate:null},
   checkpoints,done:0,total:6,sources:[],sessions:[],pendingProposals:0} as unknown as ProjectDetail;
  const container=document.createElement('div');
  container.innerHTML=await renderAllReady(<MemoryRouter><Stages detail={detail}/></MemoryRouter>);
  const chip=container.querySelector('[data-stage-chip="0"]');
  const label=chip?.querySelector('[data-stage-chip-label]') as HTMLElement|null;
  expect(label).not.toBeNull();
  expect(label?.style.overflowX).toBe('auto');
  expect(label?.style.whiteSpace).toBe('nowrap');
  expect(label?.style.maskImage).toContain('linear-gradient');
  expect(label?.style.fontSize).toBe('16px');
  expect(label?.querySelector('.katex'),`Completed stage chip HTML: ${label?.innerHTML??'missing'}`).not.toBeNull();
 });
});
