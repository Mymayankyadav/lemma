import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {MemoryRouter} from 'react-router';
import {describe,expect,it} from 'vitest';
import {ILLUSTRATIONS,Illustration} from '../../../src/ui/v7/Illustration';
import {EmptyMoment} from '../../../src/ui/v7/EmptyMoment';

// A2 · the eight empty-state illustrations (IL-01 … IL-08) in the Owner's chosen style (D6 = A · Notebook line art).
describe('A2 illustrations',()=>{
 it('has all eight, each small, decorative and drawn only in theme colours',()=>{
  expect(ILLUSTRATIONS).toEqual(['paths','calendar','review','inbox','cards','atlas','progress','tasks']);
  for(const name of ILLUSTRATIONS){
   const svg=renderToStaticMarkup(<Illustration name={name}/>);
   expect(svg.length).toBeLessThan(12*1024);
   expect(svg).toContain('aria-hidden="true"');
   expect(svg).toContain('data-illustration="'+name+'"');
   expect(svg).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|stroke="|fill="/i);
   const classes=[...svg.matchAll(/class="([^"]+)"/g)].flatMap(match=>match[1].split(' '));
   for(const cls of classes)expect(['v7-il','bg','i','m','a','f','w','page','thick']).toContain(cls);
   expect(classes.filter(cls=>cls==='a'||cls==='f').length).toBeGreaterThan(0);
  }
 });
 it('styles every class from theme roles, and keeps the single accent',()=>{
  const css=readFileSync('src/ui/v7/illustration.css','utf8');
  expect(css).toContain('--v7-il-accent:var(--v7-subject,var(--v7-role-selection-fg))');
  expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
 });
 it('an empty moment with art shows the illustration in place of the round mark',async()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  try{
   await act(async()=>root.render(<MemoryRouter><EmptyMoment art="paths" title="Every proof starts somewhere">Start a path.</EmptyMoment>
    <EmptyMoment title="No tasks yet">Use Capture.</EmptyMoment></MemoryRouter>));
   const moments=host.querySelectorAll('.v7-empty-moment');
   expect(moments[0].querySelector('[data-illustration="paths"]')).not.toBeNull();
   expect(moments[0].querySelector('.v7-empty-mark')).toBeNull();
   expect(moments[1].querySelector('.v7-empty-mark')).not.toBeNull();
   expect(moments[1].querySelector('[data-illustration]')).toBeNull();
  }finally{await act(async()=>root.unmount());host.remove();}
 });
 it('each empty state uses its illustration',()=>{
  const uses:[string,string][]=[['src/features/projects/v7/PathsV7.tsx','art="paths"'],['src/features/calendar/v7/V7CalendarDay.tsx','name="calendar"'],
   ['src/features/review/v7/ReviewHubV7.tsx','name="review"'],['src/features/proposals/v7/InboxV7.tsx','name="inbox"'],['src/features/cards/v7/CardsV7.tsx','art="cards"'],
   ['src/features/atlas/v7/AtlasV7.tsx','name="atlas"'],['src/features/insights/v7/ProgressV7.tsx','name="progress"'],['src/features/tasks/v7/TasksV7.tsx',"'tasks'"]];
  for(const [file,use] of uses)expect(readFileSync(file,'utf8')).toContain(use);
 });
});
