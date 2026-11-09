import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {MemoryRouter} from 'react-router';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import PracticePage,{loadAllPracticeTopics,loadAllPracticeEvents,
 parsePracticeRating,parsePracticeCadence} from '../../../src/features/practice/Page';
import {getPracticeTopicApi} from '../../../src/data/practice-topics';
import type {PracticeTopicApi,PracticeTopicRecord,PracticeEventRecord} from
 '../../../src/data/practice-topics/contract';
vi.mock('../../../src/data/practice-topics',()=>({getPracticeTopicApi:vi.fn()}));
vi.mock('../../../src/ui/Screen',async()=>{
 const React=await import('react');
 return {Screen:({children}:{children:React.ReactNode})=>React.createElement('main',{},children)};
});
const now='2026-11-07T09:00:00Z';
const topic=(i:number,due:string|null=null,archived=false):PracticeTopicRecord=>({
 id:'practice-'+i,title:'Topic '+i,subjectId:null,conceptId:null,checkpointId:null,
 nextDueDate:due,cadence:{kind:'fixed_days',days:7},lastPracticedAt:null,
 archivedAt:archived?'2026-11-07T00:00:00Z':null,version:1,
 createdAt:now,updatedAt:now,
});
const event=(i:number,topicId='practice-1'):PracticeEventRecord=>({
 id:'event-'+i,topicId,occurredAt:'2026-11-07T10:00:00Z',
 rating:3,response:'A proof',minutes:15,voidedAt:null,version:1,
 createdAt:now,updatedAt:now,
});
let items:PracticeTopicRecord[],events:PracticeEventRecord[],api:PracticeTopicApi;
let host:HTMLDivElement,root:Root;
const receipt=<T,>(record:T)=>({record,actionNo:null});
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 items=[topic(1,'2026-11-01'),topic(2,'2026-12-01'),topic(3,null,true)];
 events=[event(1)];
 api={
  mode:'demo',
  listTopics:vi.fn(async({archived='all',limit=50,cursor=null}={})=>{
   const all=items.filter(x=>archived==='all'||
    (archived==='active'?x.archivedAt===null:x.archivedAt!==null))
    .sort((a,b)=>(a.nextDueDate??'9999').localeCompare(b.nextDueDate??'9999'));
   const index=cursor?Number(cursor):0;
   return {items:all.slice(index,index+limit),total:all.length,
    nextCursor:index+limit<all.length?String(index+limit):null};
  }),
  listEvents:vi.fn(async({topicId,limit=50,cursor=null}={})=>{
   const all=events.filter(e=>e.topicId===topicId),index=cursor?Number(cursor):0;
   return {items:all.slice(index,index+limit),total:all.length,
    nextCursor:index+limit<all.length?String(index+limit):null};
  }),
  recordPractice:vi.fn(async(id,version,input)=>{
   const row=items.find(t=>t.id===id)!;
   expect(version).toBe(row.version);
   row.version++;
   const e={...event(events.length+1,id),rating:input.rating,
    response:input.response??null,minutes:input.minutes??null};
   events.push(e);
   return receipt({topic:{...row},event:e});
  }),
  updateTopic:vi.fn(async(id,version,patch)=>{
   const row=items.find(t=>t.id===id)!;
   expect(version).toBe(row.version);
   Object.assign(row,patch,{version:row.version+1});
   return receipt({...row});
  }),
  archiveTopic:vi.fn(async(id,version)=>{
   const row=items.find(t=>t.id===id)!;
   expect(version).toBe(row.version);
   row.archivedAt=now;row.version++;
   return receipt({...row});
  }),
  restoreTopic:vi.fn(async(id,version)=>{
   const row=items.find(t=>t.id===id)!;
   expect(version).toBe(row.version);
   row.archivedAt=null;row.version++;
   return receipt({...row});
  }),
  voidPracticeEvent:vi.fn(async(id,version)=>{
   const e=events.find(x=>x.id===id)!;
   expect(version).toBe(e.version);
   e.voidedAt=now;e.version++;
   return receipt({topic:items[0],event:e});
  }),
 } as PracticeTopicApi;
 vi.mocked(getPracticeTopicApi).mockReturnValue(api);
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.clearAllMocks()});
async function render(){
 await act(async()=>{root.render(<MemoryRouter><PracticePage/></MemoryRouter>);
  await Promise.resolve()});
}
async function click(label:string){
 const node=[...host.querySelectorAll<HTMLButtonElement>('button')].find(
  x=>x.getAttribute('aria-label')===label||x.textContent?.trim()===label);
 expect(node,'Missing button '+label).toBeTruthy();
 await act(async()=>{node!.click();await Promise.resolve()});
}
async function change(label:string,value:string){
 const node=host.querySelector<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>(
  '[aria-label="'+label+'"]');
 expect(node,'Missing '+label).toBeTruthy();
 await act(async()=>{
  const p=node instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:
   node instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(p,'value')!.set!.call(node,value);
  node!.dispatchEvent(new Event('input',{bubbles:true}));
  node!.dispatchEvent(new Event('change',{bubbles:true}));
 });
}
describe('N78 v6 practice, never card review',()=>{
 it('displays due-first active topics, archived separately, and is accessible',async()=>{
  await render();
  const texts=[...host.querySelectorAll('h2')].map(x=>x.textContent);
  expect(texts).toEqual(['Topic 1','Topic 2']);
  // N121 F11: overdue and future dates are named; card review is linked from the description.
  expect(host.textContent).toContain('Overdue · ');
  expect(host.textContent).toContain('Cards are reviewed separately in Review');
  await click('Show archived topics (1)');
  expect(host.querySelector('[aria-label="Archived practice topics"]')?.textContent)
   .toContain('Topic 3');
  expect(api.listTopics).toHaveBeenCalledWith({archived:'all',limit:50,cursor:null});
 });
 it('records rating, response and optional whole minutes via practice API only',async()=>{
  await render();await click('Practice Topic 1');
  await change('Practice rating','4');
  await change('Practice response','  The proof worked  ');
  await change('Practice minutes','35');
  await click('Record practice');
  expect(api.recordPractice).toHaveBeenCalledWith('practice-1',1,{
   rating:4,response:'The proof worked',minutes:35,
  });
  expect(host.textContent).toContain('Practice recorded');
  expect(host.textContent).toContain('Practice history');
 });
 it('edits cadence, archives and restores with optimistic versions',async()=>{
  await render();await click('Practice Topic 1');
  await change('Cadence days','10');
  await click('Save cadence');
  expect(api.updateTopic).toHaveBeenCalledWith('practice-1',1,{
   cadence:{kind:'fixed_days',days:10},
  });
  await click('Archive Topic 1');
  expect(api.archiveTopic).toHaveBeenCalledWith('practice-1',2);
  await click('Show archived topics (2)');
  await click('Restore Topic 1');
  expect(api.restoreTopic).toHaveBeenCalledWith('practice-1',3);
 });
 it('voids a specific owner practice event with event version',async()=>{
  await render();await click('Practice Topic 1');
  // N121 A4: the void action is named by its date, never by an internal event id.
  const find=()=>[...host.querySelectorAll<HTMLButtonElement>('button')].find(x=>x.getAttribute('aria-label')?.startsWith('Void practice from'));
  await vi.waitFor(()=>expect(find()).toBeTruthy());
  const voidButton=find();
  await act(async()=>{voidButton!.click();await Promise.resolve()});
  expect(api.voidPracticeEvent).toHaveBeenCalledWith('event-1',1);
  expect(host.textContent).toContain('Voided');
 });
 it('validates invalid numbers before any record or cadence mutation',async()=>{
  expect(()=>parsePracticeRating('0')).toThrow(/Rating/);
  expect(()=>parsePracticeRating('2.5')).toThrow(/whole/);
  expect(parsePracticeCadence('after_rating',['1','3','7','14']))
   .toEqual({kind:'after_rating',daysByRating:[1,3,7,14]});
  expect(()=>parsePracticeCadence('fixed_days',['4000'])).toThrow(/Cadence/);
  await render();await click('Practice Topic 1');
  await change('Practice minutes','-1');
  await click('Record practice');
  expect(api.recordPractice).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Minutes');
 });
 it('enumerates all owner pages and rejects a repeated cursor for both resources',async()=>{
  items=Array.from({length:102},(_,i)=>topic(i+1,'2026-11-02'));
  expect(await loadAllPracticeTopics()).toHaveLength(102);
  expect(api.listTopics).toHaveBeenCalledTimes(3);
  events=Array.from({length:103},(_,i)=>event(i+1));
  expect(await loadAllPracticeEvents('practice-1')).toHaveLength(103);
  vi.mocked(api.listTopics).mockResolvedValue({
   items:[topic(1)],total:2,nextCursor:'repeat',
  });
  await expect(loadAllPracticeTopics()).rejects.toThrow(/Repeated/);
 });
 it('registers /practice lazily only behind the v6 shell flag',()=>{
  const source=readFileSync('src/app/App.tsx','utf8');
  expect(source).toContain("isFlagOn('v6Shell')");
  expect(source).toContain("path:'/practice'");
  expect(source).toContain("lazy(()=>import('../features/practice/Page'))");
  expect(source).not.toContain('recordReview(');
 });
});
