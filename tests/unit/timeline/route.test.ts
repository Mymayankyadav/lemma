import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {renderAllReady} from '../../helpers/renderAllReady';
import {MemoryRouter} from 'react-router';
import type {CheckpointView} from '../../../src/data/types';
import type {ScheduledCheckpoint} from '../../../src/lib/schedule';
import {Route} from '../../../src/ui/timeline/Route';

const checkpoints=(n:number,staged=true):CheckpointView[]=>
 Array.from({length:n},(_,i)=>({
  id:'cp-'+i,code:'CP'+(i+1),title:'Checkpoint '+(i+1),
  position:i,ui:i===3?'now':i<3?'done':'next',
  currentStep:0,stepsTotal:1,recheckDue:null,dueCards:0,
  stage:staged?'Stage '+(Math.floor(i/(n===9?3:8))+1):null,
 }));
const project=(n:number)=>({title:'Algebra 1',slug:'algebra-1',done:3,total:n});
const render=(n:number,mode:'today'|'project',staged=true)=>
 renderToStaticMarkup(createElement(MemoryRouter,null,
  createElement(Route,{project:project(n),checkpoints:checkpoints(n,staged),mode})));
describe('LOOK-3b accessible Route component',()=>{
 it('renders one plain line for nine checkpoints, no stage/station rails',()=>{
  const html=render(9,'project');
  expect(html).toContain('data-route-layout="plain"');
  expect(html).toContain('data-route-track');
  expect(html).not.toContain('data-stage-rail');
  expect(html).not.toContain('data-expanded-stations');
  expect((html.match(/data-route-mark="station"/g)||[])).toHaveLength(9);
  expect((html.match(/data-route-stage-boundary/g)||[])).toHaveLength(2);
  for(const label of ['Previous checkpoint','Next checkpoint','Open checkpoint'])
   expect(html).toContain('aria-label="'+label+'"');
 });
 it('folds 36 unstaged checkpoints and keeps current code and stage group',()=>{
  const html=render(36,'project',false);
  expect(html).toContain('data-route-layout="folded"');
  expect(html).toContain('CP1');
  expect(html).toContain('CP4');
  expect(html).toContain('data-route-mark="stage"');
  expect(html).not.toContain('data-stage-rail');
 });
 it('uses ochre dashed track for late checkpoints, never accent red',()=>{
  const cps=checkpoints(9);
  const rows:ScheduledCheckpoint[]=cps.map((checkpoint,i)=>({
   checkpoint,dueOn:null,inferred:false,state:i===4?'late':'on_time',
   deltaDays:null,actualOn:null,projected:false,
  }));
  const html=renderToStaticMarkup(createElement(MemoryRouter,null,
   createElement(Route,{project:project(9),checkpoints:cps,mode:'project',scheduleRows:rows})));
  expect(html).toContain('data-track-state="late"');
  expect(html).toContain('stroke="var(--late)"');
  expect(html).toContain('stroke-dasharray="5 4"');
 });
 it('labels the merged far-future capsule on a long plan',()=>{
  const html=render(600,'project');
  expect(html).toContain('data-route-folded-label');
  expect(html).toMatch(/\+\d+ stages/);
 });
 it('recovers long and mathematical stage names without clipped SVG labels',async()=>{
  const cps=checkpoints(600);
  const longName='A very long tutor-authored stage about compactness and completeness of metric spaces, with proofs';
  cps.forEach((cp,i)=>{if(i<8)cp.stage=longName+' $\\mathbb{R}^n$';});
  const html=await renderAllReady(createElement(MemoryRouter,null,
   createElement(Route,{project:project(600),checkpoints:cps,mode:'project',initialWidth:296})));
  expect(html).toContain('data-route-stage-disclosure');
  expect(html).toContain('Show full stage name');
  expect(html).toContain('data-route-folded-stage-label');
  expect(html).not.toContain('<text x="12" y="68" fill="var(--ink)" font-size="12" font-weight="600">'+longName);
  expect(html).toContain('mathbb');
 });
 it('keeps proposed checkpoints navigable without inflating planned counts or losing schedule text',()=>{
  const cps=checkpoints(12);
  cps[3].dueOn='2026-11-12';
  cps.splice(4,0,{...cps[4],id:'cp-proposed',code:'CP4a',ui:'proposed',title:'Proposed bridge'});
  const html=renderToStaticMarkup(createElement(MemoryRouter,null,
   createElement(Route,{project:{...project(12),targetDate:'2026-12-01'},
    checkpoints:cps,mode:'project'})));
  expect(html).toContain('3 of 12 checkpoints, CP4');
  expect(html).toContain('4 of 12');
  expect(html).toContain('data-schedule-detail');
  expect(html).toContain('Planned 12 Nov');
 });
 it('makes Today a single link to the current checkpoint, with no station buttons',()=>{
  const html=render(36,'today',false);
  expect(html).toContain('data-route-mode="today"');
  expect(html).toContain('href="/p/algebra-1/cp/CP4"');
  expect(html).not.toContain('Previous checkpoint');
  expect(html).not.toContain('data-stage-rail');
 });
});
