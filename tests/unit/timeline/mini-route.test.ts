import {describe,expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {ProjectSummary} from '../../../src/data/types';
import {MiniStageBar,miniRouteNotch,currentMiniRouteOrdinal} from '../../../src/ui/timeline/MiniStageBar';
import {layoutMiniRoute} from '../../../src/ui/timeline/miniRoute';

const stages=(count:number)=>Array.from({length:count},(_,i)=>({
 label:'Stage '+(i+1),total:i%3+1,done:i%2,schedule:i%5===0?'behind' as const:'unscheduled' as const,
}));

describe('LOOK-3a mini Route geometry',()=>{
 it.each([48,120,200,360,390])('keeps every segment at least 8px at %ipx',width=>{
  for(const count of [1,9,15,36,100]){
   const input=stages(count),layout=layoutMiniRoute(input,width);
   expect(layout.length).toBeLessThanOrEqual(Math.floor(width/8));
   expect(layout.reduce((sum,s)=>sum+s.total,0)).toBe(input.reduce((sum,s)=>sum+s.total,0));
   expect(layout.reduce((sum,s)=>sum+s.done,0)).toBe(input.reduce((sum,s)=>sum+s.done,0));
   expect(layout.reduce((sum,s)=>sum+s.widthPercent,0)).toBeCloseTo(100,5);
   for(const s of layout)expect(width*s.widthPercent/100).toBeGreaterThanOrEqual(7.999);
  }
 });
 it('preserves stage order and folds excess stages into contiguous groups',()=>{
  const result=layoutMiniRoute(stages(100),120);
  expect(result.length).toBeLessThanOrEqual(15);
  expect(result[0].label).toMatch(/^Stage 1/);
  expect(result.at(-1)?.label).toMatch(/Stage 100$/);
  expect(result.some(s=>s.groupedCount>1)).toBe(true);
  expect(result.some(s=>s.schedule==='behind')).toBe(true);
 });
 it('folds future stages first without hiding the current stage',()=>{
  const input=Array.from({length:100},(_,i)=>({
   label:'S'+i,total:1,done:i<4?1:0,schedule:'unscheduled' as const,
  }));
  const result=layoutMiniRoute(input,48);
  expect(result.map(s=>s.label)).toEqual(['S0','S1','S2','S3','S4','S5–S99']);
  expect(result.at(-1)?.groupedCount).toBe(95);
  expect(result.reduce((sum,s)=>sum+s.total,0)).toBe(100);
  const nearEnd=input.map((s,i)=>({...s,done:i<95?1:0}));
  const endResult=layoutMiniRoute(nearEnd,48);
  expect(endResult.some(s=>s.label==='S95'&&s.groupedCount===1)).toBe(true);
  expect(endResult.reduce((sum,s)=>sum+s.total,0)).toBe(100);
  // A skipped earlier stage must not hide the actual current stage CP91.
  const skipped=input.map(s=>({...s,done:0}));
  const selected=layoutMiniRoute(skipped,48,90);
  expect(selected.some(s=>s.label==='S90'&&s.groupedCount===1)).toBe(true);
 });
 it('renders a single progress bar without checkpoint ticks or danger-red lateness',()=>{
  const html=renderToStaticMarkup(createElement(MiniStageBar,{project:{
   total:36,done:3,stageProgress:stages(15),scheduleHeadline:'6 days behind',
  } as ProjectSummary}));
  expect(html).toContain('data-mini-route=');
  expect(html.match(/data-stage-bar=/g)).toHaveLength(1);
  expect(html).not.toContain('data-mini-tick');
  expect(html).not.toContain('var(--bad)');
  expect(html.match(/data-route-notch=/g)).toHaveLength(1);
  expect(html).toContain('var(--accent)');
  expect(html).toContain('var(--late)');
 });
 it('positions exactly one 2px notch at an end or 8px clear of both ends',()=>{
  for(const width of [48,120,200,360,390]){
   expect(miniRouteNotch(0,36,width)).toMatchObject({x:0,edge:'start'});
   expect(miniRouteNotch(36,36,width)).toMatchObject({x:width,edge:'end'});
   for(const done of [1,3,18,35]){
    const notch=miniRouteNotch(done,36,width)!;
    expect(notch.edge).toBe('middle');
    expect(notch.x-1).toBeGreaterThanOrEqual(8);
    expect(width-(notch.x+1)).toBeGreaterThanOrEqual(8);
   }
  }
  expect(miniRouteNotch(0,0,360)).toBeNull();
 });
 it('places the notch at the actual current checkpoint across nonuniform stages and rechecks',()=>{
  const uneven=[
   {label:'S1',firstCode:'CP1',lastCode:'CP2',total:2,done:2,overdue:0,schedule:'complete' as const},
   {label:'S2',firstCode:'CP3',lastCode:'CP10',total:8,done:1,overdue:0,schedule:'dated' as const},
   {label:'S3',firstCode:'CP11',lastCode:'CP36',total:26,done:0,overdue:0,schedule:'unscheduled' as const},
  ];
  const layout=layoutMiniRoute(uneven,200);
  const current=currentMiniRouteOrdinal('CP9',uneven,3);
  expect(current).toBeCloseTo(8.5);
  const currentNotch=miniRouteNotch(current,36,200,layout)!;
  const completionNotch=miniRouteNotch(3.5,36,200,layout)!;
  expect(currentNotch.x).toBeGreaterThan(completionNotch.x+20);
  expect(currentNotch.x).not.toBeCloseTo(200*current/36,0);
  expect(miniRouteNotch(currentMiniRouteOrdinal('CP9',uneven,36),36,200,layout)?.x)
   .toBeCloseTo(currentNotch.x);
  expect(currentMiniRouteOrdinal('unknown',uneven,3)).toBe(3.5);
  expect(currentMiniRouteOrdinal('CP1',uneven,3)).toBe(.5);
  expect(currentMiniRouteOrdinal('CP36',uneven,3)).toBe(35.5);
 });
 it('never allocates a tick or extra mark for a zero-checkpoint plan',()=>{
  expect(layoutMiniRoute([],360)).toEqual([]);
 });
});
