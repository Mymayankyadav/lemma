import {afterEach,describe,expect,it,vi} from 'vitest';
import {captureTaskDraft,defaultStart,parseCapture,type CaptureContext} from '../../../src/app/v7/captureModel';
import {readCapturedTaskDraft,taskInput} from '../../../src/features/tasks/taskDraft';
import {createDemoTaskApi} from '../../../src/data/tasks/demo';
import {localWallParts} from '../../../src/features/time-log/local-time';

const ctx:CaptureContext={now:new Date('2026-11-09T20:30:00Z'),zone:'Asia/Kolkata',session:false,
 paths:[{id:'fixture-real',slug:'real',title:'Real Analysis'}]};
function draft(text:string,context=ctx){
 const parsed=parseCapture(text,context,new Set(),'task');
 const start=defaultStart(parsed.date,parsed.time,context);
 return captureTaskDraft(parsed,start.date,context.zone,parsed.path?'fixture-subject':null);
}
afterEach(()=>vi.unstubAllGlobals());
describe('N189: quick and expanded tasks share the civil-time draft',()=>{
 it('saves the same linked, timed task after expansion; reopens and undoes exactly its receipt',async()=>{
  // Tab storage is a fixture, never a user account. New adapter instances re-read the saved snapshot.
  const tab=new Map<string,string>();
  vi.stubGlobal('sessionStorage',{getItem:(key:string)=>tab.get(key)??null,setItem:(key:string,value:string)=>tab.set(key,value)});
  const typed=draft('Prove lemma tomorrow 4:17pm 45m #real');
  const expanded=readCapturedTaskDraft(structuredClone({captureTaskDraft:typed}))!;
  expect(readCapturedTaskDraft({captureTaskDraft:{zone:'Bad/Zone',values:typed.values}})).toBeUndefined();
  const quick=taskInput(typed.values,typed.zone),full=taskInput(expanded.values,expanded.zone);
  expect(full).toEqual(quick);
  expect(full).toMatchObject({title:'Prove lemma',estimateMinutes:45,projectId:'fixture-real',subjectId:'fixture-subject',
   due:{kind:'instant',at:'2026-11-11T10:47:00.000Z'}});
  const created=await createDemoTaskApi().createTask(full);
  const reopened=await createDemoTaskApi().getTask(created.record.id);
  expect(reopened).toMatchObject({...quick,id:created.record.id,version:created.record.version});
  expect(localWallParts(quick.due.kind==='instant'?quick.due.at:'',typed.zone)).toEqual({day:'2026-11-11',clock:'16:17'});
  await createDemoTaskApi().deleteTask(created.record.id,created.record.version);
  expect(await createDemoTaskApi().getTask(created.record.id)).toBeNull();
 });
 it.each([
  ['Prove lemma at 4pm',{kind:'instant',at:'2026-11-10T10:30:00.000Z'}],
  ['Prove lemma tomorrow',{kind:'date',date:'2026-11-11'}],['Prove lemma',{kind:'none'}],
 ])('does not conflate time-only, date-only and unplanned: %s',(text,expected)=>{
  const d=draft(String(text));expect(taskInput(d.values,d.zone).due).toEqual(expected);
 });
 it('rejects a nonexistent local time rather than silently adjusting the clock or stripping it',()=>{
  const d=draft('Call tomorrow at 02:30',{...ctx,zone:'America/New_York',now:new Date('2026-03-07T17:00:00Z')});
  expect(()=>taskInput(d.values,d.zone)).toThrow('Choose a valid local date and time');
 });
 it('uses the earlier fold for new tasks but preserves an existing second-fold instant on an unrelated edit',()=>{
  const d=draft('Call tomorrow at 01:30',{...ctx,zone:'America/New_York',now:new Date('2026-10-31T17:00:00Z')});
  expect(taskInput(d.values,d.zone).due).toEqual({kind:'instant',at:'2026-11-01T05:30:00.000Z'});
  expect(taskInput({...d.values,title:'Call back'},d.zone,'2026-11-01T06:30:00.000Z').due)
   .toEqual({kind:'instant',at:'2026-11-01T06:30:00.000Z'});
 });
});
