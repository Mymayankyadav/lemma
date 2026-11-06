import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createLiveStudyGoalApi} from '../../../src/data/study-goals/live';
import {liveClient} from '../../../src/data/live/client';
vi.mock('../../../src/data/live/client',()=>({liveClient:vi.fn()}));
const id='11111111-1111-4111-8111-000000000001';
const now='2026-11-06T12:00:00Z';
const row=(changes:Record<string,unknown>={})=>({
 id,period:'week',start_date:'2026-11-02',end_date:'2026-11-08',
 time_zone:'UTC',target_minutes:400,subject_id:null,project_id:null,
 archived_at:null,source:'app',version:1,created_at:now,updated_at:now,...changes,
});
function harness(){
 const state={rows:[row()] as Record<string,unknown>[],
  calls:[] as Array<{fn:string;p:Record<string,unknown>}>,
  replies:[] as Array<{data:unknown;error:{message:string}|null}>};
 const rpc=vi.fn(async(fn:string,args:{p:Record<string,unknown>})=>{
  state.calls.push({fn,p:args.p});
  return state.replies.shift()??{data:{status:'ok',changed:[{id,version:2}],actionNo:49},error:null};
 });
 const from=vi.fn((_table:string)=>{
  let single=false,head=false;
  const q={
   select(_fields:string,options?:{head?:boolean}){head=!!options?.head;return q;},
   eq(_field:string,_id:unknown){return q;},
   is(_field:string,_value:unknown){return q;},
   not(_field:string,_op:string,_value:unknown){return q;},
   or(_expr:string){return q;},
   order(_field:string){return q;},
   limit(_limit:number){return q;},
   maybeSingle(){single=true;return q;},
   then(resolve:(result:unknown)=>unknown){
    const rows=state.rows;
    return Promise.resolve({data:head?null:single?rows[0]??null:rows,error:null,count:rows.length}).then(resolve);
   },
  };
  return q;
 });

 return Object.assign(state,{client:{from,rpc}});
}

let fake:ReturnType<typeof harness>;
beforeEach(()=>{fake=harness();vi.mocked(liveClient).mockReturnValue(fake.client as never);});

const input={period:'custom' as const,startDate:'2026-12-01',endDate:'2026-12-12',timeZone:'UTC',
 targetMinutes:540,subjectId:id};
describe('N59 owner-scoped live study goals',()=>{
 it('maps owner rows and uses the bounded cursor read without owner query fields',async()=>{
  const api=createLiveStudyGoalApi();
  expect(await api.getStudyGoal(id)).toMatchObject({startDate:'2026-11-02',
   endDate:'2026-11-08',targetMinutes:400,source:'app',archivedAt:null});
  const page=await api.listStudyGoals({limit:1,archived:'active'});
  expect(page.total).toBe(1);
  expect(page.items).toHaveLength(1);
  await expect(api.listStudyGoals({limit:51})).rejects.toMatchObject({code:'invalid'});
  await expect(api.listStudyGoals({cursor:'invalid!'})).rejects.toMatchObject({code:'invalid'});
 });
 it('sends all five versioned lifecycle envelopes and preserves action numbers',async()=>{
  const api=createLiveStudyGoalApi();
  const created=await api.createStudyGoal(input);
  expect(created.actionNo).toBe(49);
  expect(fake.calls[0].fn).toBe('study_goals_command');
  expect(fake.calls[0].p).toMatchObject({resource:'study_goals',operation:'create',schemaVersion:1,
   patch:{period:'custom',start_date:'2026-12-01',end_date:'2026-12-12',
    target_minutes:540,subject_id:id}});
  await api.updateStudyGoal(id,2,{targetMinutes:180});
  await api.archiveStudyGoal(id,3);
  await api.restoreStudyGoal(id,4);
  const deleted=await api.deleteStudyGoal(id,5);
  expect(fake.calls.map(c=>c.p.operation)).toEqual(['create','update','archive','restore','delete']);
  expect(fake.calls.slice(1).map(c=>c.p.expectedVersion)).toEqual([2,3,4,5]);
  expect(deleted).toEqual({record:{id},actionNo:49});
  expect(fake.calls.every(c=>!JSON.stringify(c.p).includes('user_id'))).toBe(true);
 });

 it('maps stale conflicts and validates dates, zones and versions before RPC',async()=>{
  const api=createLiveStudyGoalApi();
  fake.replies.push({data:{status:'conflict',changed:[],conflict:{currentVersion:8}},error:null});
  await expect(api.updateStudyGoal(id,1,{targetMinutes:100})).rejects.toMatchObject({code:'conflict'});
  await expect(api.updateStudyGoal(id,0,{targetMinutes:100})).rejects.toMatchObject({code:'invalid'});
  await expect(api.createStudyGoal({...input,startDate:'2026-02-30'}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.createStudyGoal({...input,endDate:'2026-11-30'}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.createStudyGoal({...input,timeZone:'Invalid/Zone'}))
   .rejects.toMatchObject({code:'invalid'});
  expect(fake.calls).toHaveLength(1);
 });
 it('retries uncertain writes under the same operationId but allocates a new one after success',async()=>{
  const api=createLiveStudyGoalApi();
  fake.replies.push({data:null,error:{message:'temporary outage'}},
    {data:{status:'ok',changed:[{id,version:1}],actionNo:77},error:null});
  await expect(api.createStudyGoal(input)).rejects.toMatchObject({code:'server'});
  const first=fake.calls[0].p.operationId;
  expect((await api.createStudyGoal(input)).actionNo).toBe(77);
  expect(fake.calls[1].p.operationId).toBe(first);
  await api.createStudyGoal(input);
  expect(fake.calls[2].p.operationId).not.toBe(first);
 });
});
