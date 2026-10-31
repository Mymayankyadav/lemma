import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router';
import type {CheckpointView} from '../../../src/data/types';
import {Route} from '../../../src/ui/timeline/Route';

const checkpoints=(n:number,staged=true):CheckpointView[]=>
 Array.from({length:n},(_,i)=>({
  id:'cp-'+i,code:'CP'+(i+1),title:'Checkpoint '+(i+1),
  position:i,ui:i===3?'now':i<3?'done':'next',
  currentStep:0,stepsTotal:1,recheckDue:null,dueCards:0,
  stage:staged?'Stage '+(Math.floor(i/8)+1):null,
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
 it('makes Today a single link to the current checkpoint, with no station buttons',()=>{
  const html=render(36,'today',false);
  expect(html).toContain('data-route-mode="today"');
  expect(html).toContain('href="/p/algebra-1/cp/CP4"');
  expect(html).not.toContain('Previous checkpoint');
  expect(html).not.toContain('data-stage-rail');
 });
});
