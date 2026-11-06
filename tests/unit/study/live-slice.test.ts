import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createLiveStudyApi} from '../../../src/data/study/live';
import {liveClient} from '../../../src/data/live/client';
import {focusFromEntry,loggedToday} from '../../../src/features/focus/TodayFocus';
import {calendarRange,dayCapacity} from '../../../src/features/calendar/model';
import {periodFor,effortSummary} from '../../../src/features/progress-v6/model';
import type {StudyEntryRecord} from '../../../src/data/study/contract';

vi.mock('../../../src/data/live/client',()=>({liveClient:vi.fn()}));

const ok=(id:string,version:number,actionNo:number)=>({
  data:{status:'ok',changed:[{id,version}],actionNo},error:null
});
const conflict=(version:number)=>({
  data:{status:'conflict',changed:[],actionNo:null,conflict:{currentVersion:version}},error:null
});
const dbError=(message:string)=>({data:null,error:{code:'P0001',message}});

type RpcResponse=ReturnType<typeof ok>|ReturnType<typeof conflict>|ReturnType<typeof dbError>;
const targetId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
let rpc:ReturnType<typeof vi.fn>;
function configure(responses:RpcResponse[]){
  const queue=[...responses];
  rpc=vi.fn(async()=>queue.shift()??dbError('unexpected extra command'));
  vi.mocked(liveClient).mockReturnValue({rpc} as never);
}
beforeEach(()=>vi.clearAllMocks());

describe('N35.1 live study start is reversible across the two RPCs',()=>{
  it('removes only its own draft when starting races with an active session',async()=>{
    configure([ok(targetId,1,12),conflict(7),ok(targetId,2,13)]);
    const api=createLiveStudyApi();
    await expect(api.startStudyEntry({source:'timer',intent:'Proof'})).rejects.toMatchObject({
      code:'conflict'
    });
    expect(rpc).toHaveBeenCalledTimes(3);
    const envelopes=rpc.mock.calls.map(([,args])=>args.p);
    expect(envelopes.map((p:{operation:string})=>p.operation)).toEqual(['create','start','delete']);
    expect(envelopes[2]).toMatchObject({
      schemaVersion:1,resource:'study_entries',operation:'delete',
      target:{id:targetId},expectedVersion:1,patch:{}
    });
    expect(envelopes[2]).not.toHaveProperty('user_id');
    expect(envelopes[2]).not.toHaveProperty('userId');
    expect(new Set(envelopes.map((p:{operationId:string})=>p.operationId)).size).toBe(3);
  });
  it('retains the start failure when cleanup itself conflicts or fails',async()=>{
    configure([ok(targetId,1,12),dbError('Invalid start transition'),conflict(2)]);
    await expect(createLiveStudyApi().startStudyEntry({
      source:'timer',intent:'Proof'
    })).rejects.toMatchObject({code:'invalid',message:'Invalid start transition'});
    expect(rpc.mock.calls.map(([,args])=>args.p.operation)).toEqual(['create','start','delete']);
  });
  it('does not modify a terminal or unrelated record; cleanup is version-guarded',async()=>{
    configure([ok(targetId,1,12),dbError('already active'),dbError('Study version changed elsewhere')]);
    await expect(createLiveStudyApi().startStudyEntry({
      source:'timer',intent:'Proof'
    })).rejects.toMatchObject({code:'conflict'});
    const cleanup=rpc.mock.calls[2][1].p;
    expect(cleanup.target).toEqual({id:targetId});
    expect(cleanup.expectedVersion).toBe(1);
    expect(cleanup.patch).toEqual({});
  });
});


// Server-authoritative snapshots: SQL returns status=paused for an open break;
// the Focus UI must recover the break state after a new browser session.
const timer=(status:StudyEntryRecord['status'],intervals:StudyEntryRecord['intervals']):StudyEntryRecord=>({
 id:'timer-1',intent:'Prove a lemma',source:'timer',status,reflection:'Completed proof',
 rating:null,version:8,createdAt:'2026-11-06T09:00:00.000Z',
 updatedAt:'2026-11-06T10:00:00.000Z',savedAt:status==='saved'?'2026-11-06T10:00:00.000Z':null,
 intervals,
});
const focusIntervals:StudyEntryRecord['intervals']=[
 {id:'i1',kind:'focus',start:'2026-11-06T09:00:00Z',end:'2026-11-06T09:10:00Z'},
 {id:'i2',kind:'focus',start:'2026-11-06T09:15:00Z',end:'2026-11-06T09:30:00Z'},
 {id:'i3',kind:'break',start:'2026-11-06T09:30:00Z',end:'2026-11-06T09:40:00Z'},
 {id:'i4',kind:'focus',start:'2026-11-06T09:40:00Z',end:'2026-11-06T09:50:00Z'},
];
function totals(entries:StudyEntryRecord[]){
 const range=calendarRange('2026-11-06','UTC');
 const now='2026-11-06T23:00:00Z';
 return {
  today:loggedToday(entries,range,'UTC',now),
  calendar:dayCapacity('2026-11-06','UTC',entries,[]).logged,
  progress:effortSummary(entries,periodFor('day',new Date('2026-11-06T12:00:00Z'),'UTC'),'UTC',now).displayMinutes,
 };
}
describe('N35.2 persisted live Focus snapshots agree in every screen',()=>{
 it('restores the open break from SQL paused status and recovers server intervals after reload',()=>{
  const onBreak=timer('paused',[
   focusIntervals[0],{id:'open-break',kind:'break',start:'2026-11-06T09:10:00Z',end:null},
  ]);
  expect(focusFromEntry(onBreak)).toMatchObject({
   phase:'break',session:{id:'timer-1',intent:'Prove a lemma',focusMinutes:25},
  });
  const paused=timer('paused',[focusIntervals[0]]);
  expect(focusFromEntry(paused).phase).toBe('paused');
  const running=timer('running',[
   focusIntervals[0],{id:'next',kind:'focus',start:'2026-11-06T09:15:00Z',end:null},
  ]);
  const reloaded=focusFromEntry(structuredClone(running));
  expect(reloaded.phase).toBe('running');
  expect(reloaded.session?.intervals).toEqual(running.intervals.map(i=>({
   kind:i.kind,start:i.start,end:i.end,
  })));
 });

 it('counts only persisted focus minutes after pause, break, resume, finish and save',()=>{
  const active=timer('paused',focusIntervals);
  const saved=timer('saved',focusIntervals);
  expect(totals([active])).toEqual({today:0,calendar:0,progress:0});
  expect(totals([saved])).toEqual({today:35,calendar:35,progress:35});
  expect(saved.intervals.filter(i=>i.kind==='break')).toHaveLength(1);
 });

 it('discard saves nothing; a saved MCP study entry appears on every fresh owner read',()=>{
  const discarded=timer('discarded',focusIntervals);
  expect(totals([discarded])).toEqual({today:0,calendar:0,progress:0});
  const connector=timer('saved',[{
   id:'mcp-interval',kind:'focus',start:'2026-11-06T11:00:00Z',end:'2026-11-06T11:20:00Z',
  }]);
  connector.id='mcp-1';connector.source='manual';connector.intent='Tutor proof';
  const first=structuredClone([discarded]);
  expect(totals(first)).toEqual({today:0,calendar:0,progress:0});
  const refreshed=structuredClone([...first,connector]);
  expect(totals(refreshed)).toEqual({today:20,calendar:20,progress:20});
  expect(refreshed[1]).toMatchObject({id:'mcp-1',source:'manual',status:'saved'});
 });
});
