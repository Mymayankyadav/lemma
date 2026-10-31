import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import type {CheckpointView,ProjectDetail} from '../../src/data/types';
import {Stages} from '../../src/features/project/PathsView';

vi.mock('../../src/data/hooks',()=>({
 useInsightData:()=>({data:{checkpointEvents:[]},isPending:false}),
}));

describe('project stage jump navigation',()=>{
 it('typesets mathematical tutor stage names in the jump chips',()=>{
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
  container.innerHTML=renderToStaticMarkup(<Stages detail={detail}/>);
  const navigation=container.querySelector('nav[aria-label="Jump to stage"]');
  const firstChip=navigation?.querySelector('[data-stage-chip="0"]');
  expect(navigation?.querySelectorAll('[data-stage-chip]')).toHaveLength(6);
  expect(firstChip?.querySelector('.katex')).not.toBeNull();
  expect(firstChip?.textContent).toContain('Topology of');
  expect(firstChip?.textContent).not.toContain('\\mathbb');
  expect(firstChip?.textContent).not.toContain('$');
 });
});
