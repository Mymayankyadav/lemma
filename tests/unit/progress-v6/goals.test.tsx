import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {MemoryRouter} from 'react-router';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {GoalRecord,GoalApi} from '../../../src/data/study-goals/contract';
import {setGoalApiForTests} from '../../../src/data/study-goals';
import {setStudyApiForTests} from '../../../src/data/study';
import {emptyStudyApi,type StudyEntryRecord} from '../../../src/data/study/contract';
import ProgressV6 from '../../../src/features/progress-v6/Page';
import {goalSavedMinutes,goalWindow,encompassingRange} from '../../../src/features/progress-v6/goal-model';
import {effortSummary,periodFor,formatExactMinutes} from '../../../src/features/progress-v6/model';

vi.mock('../../../src/data/mode',()=>({getMode:()=> 'demo'}));
vi.mock('../../../src/data',()=>({getApi:()=>({
 listSubjects:async()=>[{id:'math',name:'Mathematics',glyph:'sum',hue:'amber',position:0}],
 listProjects:async()=>[{id:'proof',title:'Proofs',subject:{id:'math',name:'Mathematics'},system:false}],
})}));
const base:GoalRecord={id:'g1',period:'week',startDate:'2026-11-02',endDate:'2026-11-08',
 timeZone:'UTC',targetMinutes:120,subjectId:'math',projectId:'proof',archivedAt:null,
 version:1,createdAt:'2026-11-02T00:00:00Z',updatedAt:'2026-11-02T00:00:00Z'};
const saved=(id:string,subjectId:string|null,projectId:string|null,start:string,end:string,
 status:StudyEntryRecord['status']='saved'):StudyEntryRecord=>({
 id,subjectId,projectId,source:'timer',intent:id,status,version:1,reflection:null,rating:null,
 createdAt:start,updatedAt:end,savedAt:end,intervals:[
 {id:id+'-a',kind:'focus',start,end},
 ]});
const entries=[
 saved('math','math','proof','2026-11-06T12:00:00Z','2026-11-06T13:00:00Z'),
 saved('other','other','other','2026-11-06T12:00:00Z','2026-11-06T14:00:00Z'),
 saved('draft','math','proof','2026-11-06T15:00:00Z','2026-11-06T16:00:00Z','draft'),
];
let host:HTMLDivElement,root:Root;
let goals:GoalRecord[],calls:{create:any;update:any;archive:any},api:GoalApi;
function mockGoalApi(){
 goals=[base];const create=vi.fn(async(input:any)=>{
  const created={...base,...input,id:'g2',version:1};
  goals=[...goals,created];return {record:created,actionNo:9};
 });
 const update=vi.fn(async(id:string,expected:number,patch:any)=>{
  const old=goals.find(g=>g.id===id)!;
  if(expected!==old.version)throw Error('Version conflict');
  const newRecord={...old,...patch,version:old.version+1};
  goals=goals.map(x=>x.id===id?newRecord:x);
  return {record:newRecord,actionNo:10};
 });
 const archive=vi.fn(async(id:string,expected:number)=>{
  const old=goals.find(g=>g.id===id)!;
  if(expected!==old.version)throw Error('Version conflict');
  const archived={...old,archivedAt:'2026-11-07T12:00:00Z',version:old.version+1};
  goals=goals.filter(g=>g.id!==id);
  return {record:archived,actionNo:11};
 });
 api={mode:'demo',listGoals:vi.fn(async()=>({items:goals,total:goals.length,nextCursor:null})),
  getGoal:vi.fn(async id=>goals.find(g=>g.id===id)??null),createGoal:create,
  updateGoal:update,archiveGoal:archive,restoreGoal:vi.fn(),deleteGoal:vi.fn()};
 calls={create,update,archive};
 setGoalApiForTests(api);
}
async function render(path='/insights?range=7'){
 await act(async()=>root.render(<MemoryRouter initialEntries={[path]}><ProgressV6/></MemoryRouter>));
 await vi.waitFor(()=>expect(host.querySelector('[aria-label="Study goals"]')).not.toBeNull());
}
async function click(text:string){
 const b=[...host.querySelectorAll('button')].find(x=>x.textContent?.trim()===text);
 expect(b,'Missing '+text).toBeDefined();
 await act(async()=>b!.click());
}
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-07T12:00:00Z'));
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 mockGoalApi();
 setStudyApiForTests({...emptyStudyApi('demo'),listStudyEntries:vi.fn(async()=>entries)});
});
afterEach(async()=>{await act(async()=>root.unmount());setStudyApiForTests(null);
 setGoalApiForTests(null);host.remove();vi.useRealTimers()});
describe('N76 range-correct Progress goals',()=>{
 it('counts exactly the goal civil dates, subject, project and saved status',()=>{
  expect(goalWindow(base)).toEqual({start:'2026-11-02T00:00:00.000Z',end:'2026-11-09T00:00:00.000Z'});
  expect(goalSavedMinutes(entries,base,'2026-11-07T12:00:00Z')).toBe(60);
  expect(goalSavedMinutes(entries,{...base,subjectId:null,projectId:null},'2026-11-07T12:00:00Z')).toBe(120);
  expect(goalSavedMinutes(entries,{...base,subjectId:null,projectId:'proof'},'2026-11-07T12:00:00Z')).toBe(60);
  expect(goalSavedMinutes(entries,{...base,startDate:'2026-11-07',endDate:'2026-11-08'},'2026-11-07T12:00:00Z')).toBe(0);
  expect(encompassingRange({start:'2026-11-07T00:00:00Z',end:'2026-11-08T00:00:00Z'},[base]))
   .toEqual({start:'2026-11-02T00:00:00.000Z',end:'2026-11-09T00:00:00.000Z'});
 });
 it('uses true 7/30/90 rolling civil dates and DST-safe spans, not 28 days',()=>{
  const at=new Date('2026-11-07T12:00:00Z');
  for(const n of [7,30,90] as const){
   const period=periodFor(String(n) as '7'|'30'|'90',at,'UTC');
   expect(period.days).toHaveLength(n);
   expect(period.days[0]).toBe(new Date(Date.UTC(2026,10,8-n)).toISOString().slice(0,10));
   expect(period.days.at(-1)).toBe('2026-11-07');
   expect(period.span.end).toBe('2026-11-08T00:00:00.000Z');
  }
  const london=periodFor('7',new Date('2026-03-30T12:00:00Z'),'Europe/London');
  expect(london.days).toHaveLength(7);
  expect((Date.parse(london.span.end)-Date.parse(london.span.start))/3600000).toBe(167);
 });
 it('shows exact chart values and subject parts that sum to the displayed total',()=>{
  const rec=saved('seconds','math','proof','2026-11-06T09:00:00Z','2026-11-06T09:01:30Z');
  const out=effortSummary([rec],periodFor('7',new Date('2026-11-07T12:00:00Z'),'UTC'),
   'UTC','2026-11-07T12:00:00Z');
  expect(out.minutes).toBe(1.5);
  expect(out.exactParts.reduce((s,p)=>s+p.minutes,0)).toBe(1.5);
  expect(formatExactMinutes(out.daily.find(d=>d.day==='2026-11-06')!.minutes)).toBe('1.5');
 });
 it('renders goals, all rolling ranges and their real chart values',async()=>{
  await render();
  await vi.waitFor(()=>expect(host.textContent).toContain('60 of 120 min saved'));
  expect(host.querySelectorAll('[aria-label="Daily logged minutes"] time')).toHaveLength(7);
  expect(host.textContent).toContain('Mathematics');
  await click('30 days');
  await vi.waitFor(()=>expect(host.querySelectorAll('[aria-label="Daily logged minutes"] time')).toHaveLength(30));
  await click('90 days');
  await vi.waitFor(()=>expect(host.querySelectorAll('[aria-label="Daily logged minutes"] time')).toHaveLength(90));
  expect(host.textContent).toContain('Subject totals: 120 min');
 });
 it('creates, edits with expectedVersion and archives using the goal API',async()=>{
  await render();
  await vi.waitFor(()=>expect(host.textContent).toContain('60 of 120 min saved'));
  await click('New goal');
  await click('Create goal');
  await vi.waitFor(()=>expect(calls.create).toHaveBeenCalledTimes(1));
  expect(calls.create.mock.calls[0][0]).toMatchObject({period:'week',timeZone:expect.any(String),
   targetMinutes:240,subjectId:null,projectId:null});
  await vi.waitFor(()=>expect(host.querySelectorAll('[data-goal-id]')).toHaveLength(2));
  await click('Edit goal');
  await click('Save changes');
  await vi.waitFor(()=>expect(calls.update).toHaveBeenCalledTimes(1));
  expect(calls.update.mock.calls[0][0]).toBe('g1');
  expect(calls.update.mock.calls[0][1]).toBe(1);
  await click('Archive goal');
  await vi.waitFor(()=>expect(calls.archive).toHaveBeenCalledTimes(1));
  expect(calls.archive.mock.calls[0][0]).toBe('g1');
 });
});
