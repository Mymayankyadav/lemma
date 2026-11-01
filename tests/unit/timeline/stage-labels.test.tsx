import {describe,expect,it} from 'vitest';
import {renderAllReady} from '../../helpers/renderAllReady';
import {MemoryRouter} from 'react-router';
import {ProjectTimeline} from '../../../src/ui/timeline/ProjectTimeline';
import type {CheckpointView} from '../../../src/data/types';

const checkpoints:CheckpointView[]=Array.from({length:20},(_,index)=>({
 id:'cp-'+(index+1),code:'CP'+(index+1),title:'Checkpoint '+(index+1),
 position:index,ui:index===0?'now':'next',currentStep:0,stepsTotal:1,
 recheckDue:null,dueCards:0,dueOn:null,demonstratedAt:null,
 stage:index<10?'$L^p$':'$'+String.fromCharCode(92)+'mathbb{R}^n$',
}));

describe('ST-1 stage Metro mathematical labels',()=>{
 it('renders the original stage names as maths, not raw or Stage N placeholders',async()=>{
  const html=await renderAllReady(
   <MemoryRouter>
    <ProjectTimeline project={{title:'Math',slug:'math',done:0,total:20}} checkpoints={checkpoints}/>
   </MemoryRouter>
  );
  expect(html).toContain('data-route-layout="folded"');
  expect(html).toContain('data-route-stage-count="2"');
  expect(html).toContain('data-route-stage-disclosure');
  expect(html).toContain('class="katex"');
  expect(html).not.toContain('>$L^p$<');
  expect(html).not.toContain('>Stage 2<');
  // A short stage identifier is permitted on the 80px line, but its
  // full mathematical name must remain typeset and horizontally accessible.
  expect(html).toContain('Show full stage name');
  expect(html).toContain('overflow-x-auto');
  expect(html).not.toContain('data-stage-rail');
 });
});
