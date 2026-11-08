import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createDemoStudyApi} from '../../../src/data/study/demo';
import {createLiveStudyApi} from '../../../src/data/study/live';
import {liveClient} from '../../../src/data/live/client';

vi.mock('../../../src/data/live/client',()=>({liveClient:vi.fn()}));
vi.mock('../../../src/data/presets',()=>({getPresetApi:()=>({
 getPreset:async()=>({
   mode:'pomodoro',focusMinutes:18,breakMinutes:7,longBreakMinutes:15,
   cycles:2,archivedAt:null,
 }),
})}));
const beginning='2026-11-08T10:00:00.000Z';
beforeEach(()=>{
 sessionStorage.clear();
 vi.useFakeTimers();
 vi.setSystemTime(new Date(beginning));
});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers()});

describe('N66 demo timer modes and exclusion ledger',()=>{
 it('captures a selected preset once and derives Pomodoro phase deadlines',async()=>{
  const api=createDemoStudyApi();
  const started=await api.startStudyEntry({intent:'Proofs',source:'timer',presetId:'preset-1'});
  expect(started.record).toMatchObject({presetId:'preset-1',mode:'pomodoro',
   phase:'focus',cycle:1,config:{focus_minutes:18,break_minutes:7,cycles:2}});
  expect(started.record.phaseEndsAt).toBe('2026-11-08T10:18:00.000Z');
  const leased=await api.takeLease(started.record.id,started.record.version);
  vi.advanceTimersByTime(60_000);
  const first=await api.nextPhase(started.record.id,leased.record.version,'steady');
  expect(first.record).toMatchObject({phase:'break',status:'paused',cycle:1,energy:'steady'});
  expect(first.record.phaseEndsAt).toBe('2026-11-08T10:08:00.000Z');
  vi.advanceTimersByTime(30_000);
  const second=await api.nextPhase(started.record.id,first.record.version);
  expect(second.record).toMatchObject({phase:'focus',status:'running',cycle:2});
  const renewed=await api.takeLease(started.record.id,second.record.version);
  vi.advanceTimersByTime(30_000);
  const longBreak=await api.nextPhase(started.record.id,renewed.record.version);
  expect(longBreak.record.phase).toBe('long_break');
  expect(longBreak.record.phaseEndsAt).toBe('2026-11-08T10:17:00.000Z');
 });
 it('subtracts distinct whole focus minutes without overdraw or stale versions',async()=>{
  const api=createDemoStudyApi();
  const entry=await api.startStudyEntry({intent:'Read',source:'timer'});
  expect(entry.record).toMatchObject({mode:'open',phase:'focus',leaseVersion:0,
   excludedIntervals:[]});
  vi.advanceTimersByTime(25*60_000);
  const leased=await api.takeLease(entry.record.id,entry.record.version);
  const first=await api.excludeMinutes(entry.record.id,leased.record.version,10,'Distracted');
  const second=await api.excludeMinutes(entry.record.id,first.record.version,10,'Interrupted');
  expect(second.record.excludedIntervals).toHaveLength(2);
  const seconds=(second.record.excludedIntervals??[]).reduce((sum,span)=>
    sum+(Date.parse(span.to)-Date.parse(span.from))/1000,0);
  expect(seconds).toBe(1200);
  expect(Date.parse(second.record.excludedIntervals![0].from))
    .toBeGreaterThanOrEqual(Date.parse(second.record.excludedIntervals![1].to));
  await expect(api.excludeMinutes(entry.record.id,second.record.version,20,'Too much'))
    .rejects.toMatchObject({code:'conflict'});
  await expect(api.nextPhase(entry.record.id,entry.record.version))
    .rejects.toMatchObject({code:'conflict'});
  expect((await api.activeStudyEntry())?.excludedIntervals).toHaveLength(2);
 });
});

describe('N66 live owner-bound timer envelope',()=>{
 it('maps N52 metadata, renews a tab lease and sends no owner id or browser timestamps',async()=>{
  const row:Record<string,unknown>={
   id:'entry-1',intent:'Read',source:'timer',status:'running',version:2,
   reflection:null,rating:null,created_at:beginning,updated_at:beginning,
   saved_at:null,study_intervals:[],mode:'flowtime',preset_id:'preset-1',
   config:{mode:'flowtime',flowtime_break_ratio:0.25},
   phase:'focus',cycle:1,phase_ends_at:null,energy:null,
   lease_device:null,lease_version:0,lease_expires_at:null,excluded_intervals:[],
  };
  const envelopes:Array<Record<string,unknown>>=[];
  const query={
   select:(_fields:string)=>query,eq:(_key:string,_value:unknown)=>query,
   maybeSingle:async()=>({data:row,error:null}),
  };
  const fake={
   from:vi.fn(()=>query),
   rpc:vi.fn(async(_name:string,{p}:{p:Record<string,unknown>})=>{
    envelopes.push(p);
    row.version=Number(row.version)+1;
    if(p.operation==='take_lease'){
      const patch=p.patch as Record<string,unknown>;
      row.lease_device=patch.device;
      row.lease_version=Number(row.lease_version)+1;
      row.lease_expires_at='2026-11-08T10:02:00.000Z';
    }else if(p.operation==='next_phase'){
      row.phase='break';row.status='paused';
    }
    return {data:{status:'ok',changed:[{id:'entry-1',version:row.version}],actionNo:42},error:null};
   }),
  };
  vi.mocked(liveClient).mockReturnValue(fake as never);
  const api=createLiveStudyApi();
  const leased=await api.takeLease('entry-1',2);
  expect(leased.record).toMatchObject({
   mode:'flowtime',presetId:'preset-1',phase:'focus',leaseVersion:1});
  const transitioned=await api.nextPhase('entry-1',3,'high');
  expect(transitioned.record.phase).toBe('break');
  await api.excludeMinutes('entry-1',4,2,'Distraction');
  expect(envelopes.map(x=>x.operation)).toEqual(['take_lease','next_phase','exclude_minutes']);
  expect(envelopes[0]).toMatchObject({resource:'study_entries',expectedVersion:2,
   patch:{device:expect.any(String),lease_minutes:2}});
  expect(envelopes[1]).toMatchObject({expectedVersion:3,
   patch:{device:(envelopes[0].patch as Record<string,unknown>).device,
    lease_version:1,energy:'high'}});
  expect(envelopes[2]).toMatchObject({patch:{
   device:(envelopes[0].patch as Record<string,unknown>).device,
   lease_version:1,minutes:2,reason:'Distraction'}});
  expect(envelopes.every(x=>!JSON.stringify(x).includes('user_id'))).toBe(true);
  await expect(api.nextPhase('entry-1',2)).rejects.toMatchObject({code:'conflict'});
 });
});
