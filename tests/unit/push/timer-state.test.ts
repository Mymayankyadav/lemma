import {describe,expect,it} from 'vitest';
import {nativeTimerState as serverState,timerPush,type EntryRow,type IntervalRow} from '../../../supabase/functions/_shared/timerState';
import {nativeTimerState as appState} from '../../../src/platform/timer';
import type {StudyEntryRecord} from '../../../src/data/study/contract';

// N163: the server builds the phone's timer state for a closed app; it must equal what the app builds from the same entry.
const T0=Date.UTC(2026,10,14,10,0,0);
const at=(minutes:number)=>new Date(T0+minutes*60_000).toISOString();
type Spec={row:Partial<EntryRow>;intervals:IntervalRow[]};
const interval=(kind:'focus'|'break',from:number,to:number|null):IntervalRow=>({kind,started_at:at(from),ended_at:to===null?null:at(to)});
const full=(row:Partial<EntryRow>):EntryRow=>({id:'e1',version:7,status:'running',intent:'  Algebra 1 CP2  ',mode:'pomodoro',phase:'focus',cycle:2,
 config:{focus_minutes:25,break_minutes:5,cycles:4},phase_ends_at:at(25),project_id:'p1',...row});
const record=(spec:Spec):StudyEntryRecord=>({id:'e1',intent:spec.row.intent??'',source:'timer',status:(spec.row.status??'running') as StudyEntryRecord['status'],reflection:null,rating:null,
 version:spec.row.version??7,createdAt:at(0),updatedAt:at(0),savedAt:null,mode:(spec.row.mode??undefined) as StudyEntryRecord['mode'],phase:(spec.row.phase??undefined) as StudyEntryRecord['phase'],
 cycle:spec.row.cycle??undefined,config:(spec.row.config??undefined) as StudyEntryRecord['config'],phaseEndsAt:spec.row.phase_ends_at??null,projectId:spec.row.project_id??null,
 intervals:spec.intervals.map((x,i)=>({id:'i'+i,kind:x.kind,start:x.started_at,end:x.ended_at})) } as StudyEntryRecord);
const cases:Record<string,Spec>={
 'running pomodoro':{row:{},intervals:[interval('focus',0,null)]},
 'paused pomodoro':{row:{status:'paused'},intervals:[interval('focus',0,4)]},
 'resumed after a pause':{row:{},intervals:[interval('focus',0,4),interval('focus',34,null)]},
 'paused twice':{row:{status:'paused'},intervals:[interval('focus',0,4),interval('focus',34,40)]},
 'break phase':{row:{phase:'break',status:'paused',phase_ends_at:at(30)},intervals:[interval('focus',0,25),interval('break',25,null)]},
 'open session':{row:{mode:'open',phase_ends_at:null,config:{}},intervals:[interval('focus',0,null)]},
 'flowtime':{row:{mode:'flowtime',phase_ends_at:null},intervals:[interval('focus',0,null)]},
 'no intent':{row:{intent:'   '},intervals:[interval('focus',0,null)]},
 'legacy row':{row:{mode:null,phase:null,cycle:null,config:null,phase_ends_at:null},intervals:[interval('focus',0,null)]},
};
describe('N163 server timer state',()=>{
 // A resumed timed phase is the one case the server must get right on its own: the stored end never moves, so both
 // sides add the pauses (the app's side is N162, `src/data/study/phase.ts`; compare them once that has landed).
 const gaps=new Set(['resumed after a pause']);
 for(const [name,spec] of Object.entries(cases).filter(([name])=>!gaps.has(name)))
  it('matches the app for: '+name,()=>{
   for(const now of [T0+9*60_000,T0+40*60_000,T0+500*60_000]){
    const row=full(spec.row),theirs=appState(record({row,intervals:spec.intervals}),now,'Algebra 1',true);
    expect(serverState(row,spec.intervals,now,'Algebra 1',true)).toEqual(theirs);
   }
  });
 it('counts the time a timed phase was paused: the stored end moves out by each gap',()=>{
  // 25 min phase from 10:00, focused 0–4 min, paused 4–34, running again from 34: it ends at 10:55.
  const spec=cases['resumed after a pause'],row=full(spec.row);
  for(const now of [T0+9*60_000,T0+40*60_000]){
   const state=serverState(row,spec.intervals,now,'Algebra 1',true)!;
   expect(state.phaseEndsAt).toBe(T0+55*60_000);
   expect(state.status).toBe('running');
  }
  // Paused again at 40, the phone shows no end time (it is stopped), however late the message is built.
  const again=full({status:'paused'}),gap:IntervalRow[]=[interval('focus',0,4),interval('focus',34,40)];
  expect(serverState(again,gap,T0+900*60_000,'',true)).toMatchObject({status:'paused',phaseEndsAt:0,phaseMs:0});
 });
 it('shows a running or paused entry and clears any other',()=>{
  expect(timerPush(full({}),[interval('focus',0,null)],T0+60_000).op).toBe('show');
  expect(timerPush(full({status:'paused'}),[interval('focus',0,4)],T0+60_000).op).toBe('show');
  for(const status of ['saved','discarded','draft'])
   expect(timerPush(full({status,version:9}),[interval('focus',0,4)],T0)).toEqual({op:'clear',entryId:'e1',version:9});
 });
});
