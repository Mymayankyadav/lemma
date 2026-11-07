import {act,type ReactNode} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import {MemoryRouter,Routes,Route} from 'react-router';
import CalendarPage from '../../../src/features/calendar/Page';
import {WeekView} from '../../../src/features/calendar/views/WeekView';
import {MonthView} from '../../../src/features/calendar/views/MonthView';
import {overlapWindows,matchingAcknowledgement} from
 '../../../src/features/calendar/overlaps/model';
import {setOverlapApiForTests} from '../../../src/data/overlap-acknowledgements';
import type {OverlapAcknowledgement,OverlapApi} from
 '../../../src/data/overlap-acknowledgements/contract';
import {setStudyApiForTests} from '../../../src/data/study';
import {emptyStudyApi,type CalendarBlockRecord,type StudyEntryRecord} from
 '../../../src/data/study/contract';
import {setDeadlineApiForTests} from '../../../src/data/deadlines';
import {emptyDeadlineApi} from '../../../src/data/deadlines/contract';
import {setPracticeTopicApiForTests} from '../../../src/data/practice-topics';
import {emptyPracticeTopicApi} from '../../../src/data/practice-topics/contract';

const flags=vi.hoisted(()=>({on:true}));
vi.mock('../../../src/flags',()=>({isFlagOn:()=>flags.on}));
vi.mock('../../../src/data/mode',()=>({getMode:()=> 'demo'}));
const uid=(n:number)=>'11111111-1111-4111-8111-'+n.toString(16).padStart(12,'0');
const time=(h:string)=>'2026-11-06T'+h+':00Z';
const block=(n:number,name:string,start:string,end:string):CalendarBlockRecord=>({
 id:uid(n),title:name,kind:'busy',status:'planned',version:1,
 startsAt:time(start),endsAt:time(end),timeZone:'UTC',
});
const first=block(1,'Seminar','09:00','10:00');
const second=block(2,'Doctor','09:15','09:45');
const entry:StudyEntryRecord={
 id:uid(3),intent:'Saved proof study',status:'saved',source:'timer',version:1,
 reflection:null,rating:null,createdAt:time('09:00'),updatedAt:time('10:30'),
 savedAt:time('10:30'),intervals:[
  {id:uid(33),kind:'focus',start:time('09:30'),end:time('10:30')},
  {id:uid(34),kind:'break',start:time('10:30'),end:time('10:45')},
 ],
};
const range={start:'2026-11-02T00:00:00Z',end:'2026-11-09T00:00:00Z'};
function acknowledgement(row:ReturnType<typeof overlapWindows>[number],
 stale=false):OverlapAcknowledgement{
 return {
  id:uid(90+Number(stale)),participants:row.participants,
  startsAt:row.startsAt,endsAt:row.endsAt,reason:null,
  disposition:'keep_both',attributedTo:null,stale,
  version:1,source:'app',createdAt:time('09:00'),updatedAt:time('09:00'),
 };
}
function fakeAcks(initial:OverlapAcknowledgement[]=[]){
 let rows=initial;
 const list=vi.fn(async({cursor=null,limit=50}:{
  from?:string;to?:string;cursor?:string|null;limit?:number
 }={})=>{
  const offset=Number(cursor??'0'),items=rows.slice(offset,offset+limit);
  return {items,total:rows.length,nextCursor:offset+items.length<rows.length?
   String(offset+items.length):null};
 });
 const create=vi.fn(async(input:Parameters<OverlapApi['createAcknowledgement']>[0])=>{
  const at=acknowledgement({key:'',startsAt:input.startsAt,endsAt:input.endsAt,
   participants:input.participants,names:['A','B']});
  const created={...at,id:uid(99+rows.length),disposition:input.disposition,
   attributedTo:input.attributedTo??null};
  rows=[...rows,created];
  return {record:created,actionNo:71};
 });
 const api:OverlapApi={mode:'demo',listAcknowledgements:list,
  getAcknowledgement:vi.fn(async id=>rows.find(r=>r.id===id)??null),
  createAcknowledgement:create,
  updateAcknowledgement:vi.fn(async()=>{throw Error('Unexpected update')}),
  deleteAcknowledgement:vi.fn(async()=>{throw Error('Unexpected delete')}),
 };
 setOverlapApiForTests(api);
 return {list,create,rows:()=>rows};
}
let root:Root,host:HTMLDivElement;
async function render(element:ReactNode,ready=true){
 await act(async()=>root.render(element));
 await vi.waitFor(()=>expect(host.querySelector('[aria-label="Calendar overlap conflicts"]'))
  .not.toBeNull());
 if(ready)await vi.waitFor(()=>expect(
  host.querySelector<HTMLButtonElement>('button[aria-label^="Keep both for"]')?.disabled
 ).toBe(false));
}
const weeks=()=> <WeekView date="2026-11-06" zone="UTC"
 entries={[entry]} blocks={[first,second]} onDay={()=>{}}/>;
const months=()=> <MonthView date="2026-11-06" zone="UTC"
 entries={[entry]} blocks={[first,second]} onDay={()=>{}}/>;
async function press(label:string){
 const button=[...host.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===label
  ||b.textContent?.trim()===label);
 expect(button,'Missing '+label).toBeDefined();
 await act(async()=>button!.click());
}
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 flags.on=true;
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{
 await act(async()=>root.unmount());
 setOverlapApiForTests(null);setStudyApiForTests(null);
 setDeadlineApiForTests(null);setPracticeTopicApiForTests(null);
 host.remove();vi.clearAllMocks();
});
describe('N75 exact half-open owner Calendar overlap model',()=>{
 it('detects all three pairwise conflicts with exact windows and versions',()=>{
  const rows=overlapWindows([entry],[first,second],range);
  expect(rows).toHaveLength(3);
  expect(rows.map(r=>[r.startsAt,r.endsAt])).toEqual([
   [time('09:15'),time('09:45')],
   [time('09:30'),time('10:00')],
   [time('09:30'),time('09:45')],
  ]);
  expect(rows.every(r=>r.participants.length===2&&
   r.participants.every(p=>p.version===1))).toBe(true);
 });
 it('excludes cancelled blocks, unsaved entries, break-only time and adjacent boundaries',()=>{
  const adjacent=block(4,'After','10:30','11:00');
  const cancelled={...second,status:'cancelled' as const};
  const draft={...entry,id:uid(5),status:'draft' as const};
  const rows=overlapWindows([entry,draft],[first,cancelled,adjacent],range);
  expect(rows).toHaveLength(1);
  expect(rows[0].names).toContain('Saved proof study');
  expect(rows[0].names).not.toContain('After');
 });
 it('preserves full conflicts when week begins or ends inside an overlap',()=>{
  const narrow={start:time('09:40'),end:time('09:50')};
  const visible=overlapWindows([], [first,second],narrow);
  expect(visible).toHaveLength(1);
  expect(visible[0]).toMatchObject({
   startsAt:time('09:15'),endsAt:time('09:45'),
  });
 });
 it('matches exact participant identities, versions, non-stale status and window',()=>{
  const row=overlapWindows([],[first,second],range)[0];
  expect(matchingAcknowledgement(row,[acknowledgement(row)])?.id).toBe(uid(90));
  expect(matchingAcknowledgement(row,[acknowledgement(row,true)])).toBeNull();
  expect(matchingAcknowledgement(row,[{...acknowledgement(row),
   participants:row.participants.map((p,i)=>i===0?{...p,version:2}:p)])).toBeNull();
  expect(matchingAcknowledgement(row,[{...acknowledgement(row),
   endsAt:time('09:46')}])).toBeNull();
 });
});
describe('N75 Week and Month overlap markers and audited acknowledgment writes',()=>{
 it('keeps both overlapping blocks visible, shows window and records exact keep-both once',async()=>{
  const api=fakeAcks();
  await render(weeks());
  const friday=host.querySelector('[data-week-day="2026-11-06"]');
  expect(friday?.textContent).toContain('Seminar');
  expect(friday?.textContent).toContain('Doctor');
  expect(friday?.textContent).toContain('Saved proof study');
  expect(friday?.querySelectorAll('[data-overlap]')).toHaveLength(3);
  expect(friday?.textContent).toContain('Overlap conflict');
  const row=overlapWindows([entry],[first,second],range)[0];
  await press('Keep both for '+row.names.join(' and '));
  await vi.waitFor(()=>expect(api.create).toHaveBeenCalledTimes(1));
  expect(api.create.mock.calls[0][0]).toMatchObject({
   participants:row.participants,startsAt:row.startsAt,
   endsAt:row.endsAt,disposition:'keep_both',attributedTo:null,
  });
  await vi.waitFor(()=>expect(friday?.textContent).toContain('Overlap acknowledged'));
  expect(friday?.textContent).toContain('Doctor');
 });
 it('attributes a conflict to an actual participant, never inventing an owner or a new window',async()=>{
  const api=fakeAcks();
  await render(weeks());
  const row=overlapWindows([entry],[first,second],range)[0];
  await press('Attribute overlap to '+row.names[1]);
  await vi.waitFor(()=>expect(api.create).toHaveBeenCalledTimes(1));
  expect(api.create.mock.calls[0][0]).toMatchObject({
   participants:row.participants,startsAt:row.startsAt,
   endsAt:row.endsAt,disposition:'attribute_to',
   attributedTo:{kind:row.participants[1].kind,id:row.participants[1].id},
  });
  expect(api.create.mock.calls[0][0]).not.toHaveProperty('user_id');
 });
 it('shows stale acknowledgements as actionable conflicts and never hides overlaps',async()=>{
  const windows=overlapWindows([entry],[first,second],range);
  const api=fakeAcks([acknowledgement(windows[0],true)]);
  await render(weeks());
  expect(host.textContent).toContain('Overlap conflict');
  expect(host.textContent).not.toContain('Overlap acknowledged');
  expect(host.querySelectorAll('[data-overlap]')).toHaveLength(3);
  expect(api.list).toHaveBeenCalled();
 });
 it('renders Month conflict counts and a direct action panel without altering saved time',async()=>{
  const api=fakeAcks();
  await render(months());
  const friday=host.querySelector('[data-month-day="2026-11-06"]');
  expect(friday?.textContent).toContain('3 conflicts');
  expect(friday?.textContent).toContain('60m');
  expect(host.querySelector('[aria-label="Month overlap acknowledgements"]'))
   .not.toBeNull();
  expect(host.querySelectorAll('[data-overlap]')).toHaveLength(3);
  const row=overlapWindows([entry],[first,second],range)[0];
  await press('Keep both for '+row.names.join(' and '));
  await vi.waitFor(()=>expect(api.create).toHaveBeenCalledTimes(1));
  expect(api.create.mock.calls[0][0].startsAt).toBe(row.startsAt);
 });
 it('does not silently treat a failed owner read as an acknowledged conflict',async()=>{
  const api=fakeAcks();
  api.list.mockRejectedValueOnce(new Error('Owner data unavailable'));
  await render(weeks(),false);
  await vi.waitFor(()=>expect(host.querySelector('[role="alert"]')?.textContent)
   .toContain('Owner data unavailable'));
  expect(host.textContent).toContain('Overlap conflict');
  expect(api.create).not.toHaveBeenCalled();
 });
 it('does not read acknowledgement or study data if v6Shell is disabled',async()=>{
  flags.on=false;
  const api=fakeAcks();
  const studyReads=vi.fn(async()=>[]);
  setStudyApiForTests({...emptyStudyApi('demo'),
   listStudyEntries:studyReads,listCalendarBlocks:studyReads});
  setDeadlineApiForTests(emptyDeadlineApi('demo'));
  setPracticeTopicApiForTests(emptyPracticeTopicApi('demo'));
  await act(async()=>root.render(<MemoryRouter initialEntries={['/calendar?view=week']}>
   <Routes>
    <Route path="/calendar" element={<CalendarPage/>}/>
    <Route path="/" element={<p data-home>Original app</p>}/>
   </Routes>
  </MemoryRouter>));
  expect(host.querySelector('[data-home]')?.textContent).toBe('Original app');
  expect(api.list).not.toHaveBeenCalled();
  expect(studyReads).not.toHaveBeenCalled();
 });
});
