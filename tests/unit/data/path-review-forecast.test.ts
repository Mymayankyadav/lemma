// @vitest-environment node
import {describe,expect,it,vi} from 'vitest';
vi.mock('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url',()=>({default:'unused-worker'}));
import {DemoAdapter} from '../../../src/data/demo/adapter';
import fixtureText from '../../../src/data/demo/fixture.json?raw';
import type {DemoStore} from '../../../src/data/demo/model';
import {pathForecast} from '../../../src/data/path-review-forecast';
import {subjectForecast} from '../../../src/features/review/v7/reviewModel';

const settings={timeZone:'UTC',rolloverHour:4},now=Date.parse('2026-11-09T12:00:00Z');
describe('KC4: Review-only fourteen-day forecast',()=>{
 it('counts siblings, overdue and the fourteenth day; excludes new, invalid and out-of-range cards',()=>{
  const f=pathForecast(settings,now),path={slug:'real',subject:'Analysis'};
  for(const due of ['2026-11-01T04:00Z','2026-11-09T04:00Z','2026-11-22T04:00Z','2026-11-23T04:00Z','invalid'])f.add({state:2,due},path);
  f.add({state:0,due:'2026-11-09T04:00Z'},path);
  const days=f.result();
  expect(days).toHaveLength(14);
  expect(days[0]).toEqual({day:'2026-11-09',due:2,paths:[{...path,due:2}]});
  expect(days[13].due).toBe(1);
  expect(days.reduce((sum,day)=>sum+day.due,0)).toBe(3);
  expect(f.end).toBe('2026-11-23T04:00:00.000Z');
 });
 it('uses the owner rollover on a DST day rather than adding fourteen 24-hour durations',()=>{
  const f=pathForecast({timeZone:'America/New_York',rolloverHour:4},Date.parse('2026-11-01T09:30:00Z'));
  f.add({state:2,due:'2026-11-02T08:59:00Z'},{slug:'a',subject:'Analysis'});
  f.add({state:2,due:'2026-11-02T09:00:00Z'},{slug:'a',subject:'Analysis'});
  expect(f.result().slice(0,2).map(day=>day.due)).toEqual([1,1]);
  expect(f.end).toBe('2026-11-15T09:00:00.000Z');
 });
 it('keeps Today at seven days and excludes suspended/deleted/archived/system paths in demo',async()=>{
  const fixture=JSON.parse(fixtureText) as DemoStore,template=structuredClone(fixture.notes[0]);
  fixture.reviews=[];
  const project=fixture.projects[0];
  fixture.projects.push({...project,id:'archived',slug:'archived',status:'archived'},{...project,id:'system',slug:'system',system:true});
  fixture.notes=Array.from({length:137},(_,i)=>({
   ...structuredClone(template),projectId:i===135?'archived':i===136?'system':project.id,
   note:{...template.note,noteId:'n'+i,noteNo:i+1,status:i===133?'suspended':i===134?'deleted':'active'},
   cards:[1,2].map(ord=>({...template.cards[0],id:'c'+i+'-'+ord,ord,state:{...template.cards[0].state,state:2 as const,due:'@due:13'}})),
  }));
  const api=new DemoAdapter({fixture,now:()=>now,timeZone:'UTC'});
  expect(await api.getReviewForecast()).toHaveLength(7);
  const days=await api.getPathReviewForecast();
  expect(days).toHaveLength(14);
  expect(days[13].due).toBe(266);
  expect(days[13].paths[0].slug).toBe(project.slug);
  expect(days[13].paths[0].due).toBe(266);
  const chart=subjectForecast(days);
  expect(chart.data[13].values.reduce((a,b)=>a+b,0)).toBe(266);
 });
 it('combines paths sharing a subject and retains unassigned cards neutrally',()=>{
  const f=pathForecast(settings,now);
  for(const path of [{slug:'real',subject:'Real Analysis'},{slug:'complex',subject:'Complex Analysis'},{slug:'other',subject:'Custom studies'}])f.add({state:2,due:'2026-11-09T04:00Z'},path);
  const chart=subjectForecast(f.result());
  expect(chart.series).toEqual([{label:'Analysis',subject:'Analysis'},{label:'Other',subject:'Other'}]);
  expect(chart.data[0].values).toEqual([2,1]);
  expect(chart.data).toHaveLength(14);
 });
});
