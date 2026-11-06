import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createLiveDeadlineApi} from '../../../src/data/deadlines/live';
import {liveClient} from '../../../src/data/live/client';
vi.mock('../../../src/data/live/client',()=>({liveClient:vi.fn()}));
const id='11111111-1111-4111-8111-000000000001';
const at='2026-11-06T12:00:00Z';
const row=(patch:Record<string,unknown>={})=>({
 id,user_id:'owner-private',title:'Exam',kind:'exam',due_date:'2026-12-12',due_at:null,
 subject_id:null,project_id:null,checkpoint_id:null,remaining_minutes:60,
 estimate_source:'owner',status:'open',source:'app',version:1,created_at:at,updated_at:at,...patch,
});
const input={title:' Thesis ',kind:'seminar' as const,
 due:{kind:'date' as const,date:'2026-12-15'},remainingMinutes:90,
 estimateSource:'derived' as const};
function harness(){
 const state={rows:[row()],reads:[] as Array<{table:string;cols:string;where:string[];limit:number}>,
  calls:[] as Array<{name:string;p:Record<string,unknown>}>,
  replies:[] as Array<{data:unknown;error:{message:string}|null}>,
  failRead:false};
 const from=vi.fn((table:string)=>{
  const spec={table,cols:'',where:[] as string[],limit:0};
  const q={
   select(cols:string,_opts?:unknown){spec.cols=cols;return q;},
   in(k:string,vals:unknown){spec.where.push(k+':'+String(vals));return q;},
   eq(k:string,val:unknown){spec.where.push(k+':'+String(val));return q;},
   or(v:string){spec.where.push('or:'+v);return q;},
   order(){return q;},
   limit(n:number){spec.limit=n;return q;},
   maybeSingle(){spec.where.push('single');return q;},
   then(resolve:(v:unknown)=>unknown){
    state.reads.push(spec);
    const rows=state.rows.filter(x=>!spec.where.some(w=>w.startsWith('id:')&&w!=='id:'+x.id));
    return Promise.resolve(state.failRead?{data:null,error:{message:'server unavailable'}}:
     spec.where.includes('single')?{data:rows[0]??null,error:null}:
     {data:spec.cols==='id'?null:rows.slice(0,spec.limit||50),error:null,count:rows.length})
     .then(resolve);
   },
  };
  return q;
 });
 const rpc=vi.fn(async(name:string,args:{p:Record<string,unknown>})=>{
  state.calls.push({name,p:args.p});
  return state.replies.shift()??{data:{status:'ok',changed:[{id,version:2}],actionNo:19},error:null};
 });
 return Object.assign(state,{client:{from,rpc}});
}
let fake:ReturnType<typeof harness>;
beforeEach(()=>{fake=harness();vi.mocked(liveClient).mockReturnValue(fake.client as never);});
const expectOp=(index:number,operation:string)=>{
 const {name,p}=fake.calls[index];
 expect(name).toBe('deadlines_command');
 expect(p).toMatchObject({schemaVersion:1,resource:'deadlines',operation});
 expect(JSON.stringify(p)).not.toMatch(/user_id|userId|ownerId|p_user/);
 return p;
};
describe('N56 live deadline command parity',()=>{
 it('distinguishes a due instant from a civil date; uses only owner-RLS reads',async()=>{
  const api=createLiveDeadlineApi();
  expect(await api.getDeadline(id)).toMatchObject({due:{kind:'date',date:'2026-12-12'},
   status:'open',origin:'deadline',estimateSource:'owner'});
  fake.rows=[row({due_date:null,due_at:'2026-12-12T09:00:00+05:30',source:'mcp'})];
  expect(await api.getDeadline(id)).toMatchObject({due:{kind:'instant',at:'2026-12-12T09:00:00+05:30'},source:'mcp'});
  expect(fake.reads.every(x=>x.table==='deadlines'&&!x.where.some(w=>/user_id/.test(w)))).toBe(true);
 });
 it('sends create, update, complete, reopen, cancel, restore and delete with exact versions',async()=>{
  const api=createLiveDeadlineApi();
  const created=await api.createDeadline(input);
  expect(created.actionNo).toBe(19);
  expect(expectOp(0,'create')).toMatchObject({patch:{title:'Thesis',kind:'seminar',
   due_date:'2026-12-15',due_at:null,remaining_minutes:90,estimate_source:'derived'}});
  expect(fake.calls[0].p).not.toHaveProperty('expectedVersion');
  await api.updateDeadline(id,2,{title:' Updated ',due:{kind:'instant',at:'2026-12-16T10:00:00Z'}});
  expect(expectOp(1,'update')).toMatchObject({target:{id},expectedVersion:2,
   patch:{title:'Updated',due_date:null,due_at:'2026-12-16T10:00:00Z'}});
  await api.completeDeadline(id,3);await api.reopenDeadline(id,4);
  await api.cancelDeadline(id,5);await api.restoreDeadline(id,6);
  for(const [i,op] of ['complete','reopen','cancel','restore'].entries())
   expect(expectOp(i+2,op)).toMatchObject({target:{id},expectedVersion:i+3,patch:{}});
  const removed=await api.deleteDeadline(id,7);
  expect(expectOp(6,'delete')).toMatchObject({target:{id},expectedVersion:7,patch:{}});
  expect(removed).toEqual({record:{id},actionNo:19});
 });
 it('bounds read pages, preserves exact totals and checks filters before reads',async()=>{
  const api=createLiveDeadlineApi();
  const page=await api.listDeadlines({limit:1,status:['open']});
  expect(page).toMatchObject({total:1});
  expect(page.nextCursor).toBeNull();
  expect(fake.reads.some(x=>x.cols==='id'&&x.where.some(w=>w.startsWith('status:')))).toBe(true);
  expect(fake.reads.some(x=>x.cols==='*'&&x.limit===2)).toBe(true);
  await expect(api.listDeadlines({limit:51})).rejects.toMatchObject({code:'invalid'});
  await expect(api.listDeadlines({cursor:'%'})).rejects.toMatchObject({code:'invalid'});
 });
 it('maps conflict receipts and rejects invalid due values without calling the server',async()=>{
  const api=createLiveDeadlineApi();
  fake.replies.push({data:{status:'conflict',changed:[],conflict:{currentVersion:8}},error:null});
  await expect(api.updateDeadline(id,1,{title:'Stale'})).rejects.toMatchObject({code:'conflict'});
  await expect(api.updateDeadline(id,0,{title:'Bad'})).rejects.toMatchObject({code:'invalid'});
  await expect(api.createDeadline({...input,due:{kind:'date',date:'2026-02-30'}}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.createDeadline({...input,due:{kind:'instant',at:'2026-11-06T10:00'}}))
   .rejects.toMatchObject({code:'invalid'});
  expect(fake.calls).toHaveLength(1);
 });
 it('reuses a failed operationId after an uncertain outcome and resets after success',async()=>{
  const api=createLiveDeadlineApi();
  fake.replies.push({data:null,error:{message:'network failed'}},
   {data:{status:'ok',changed:[{id,version:1}],actionNo:31},error:null});
  await expect(api.createDeadline(input)).rejects.toMatchObject({code:'server'});
  const first=expectOp(0,'create').operationId;
  await api.createDeadline(input);
  expect(expectOp(1,'create').operationId).toBe(first);
  await api.createDeadline(input);
  expect(expectOp(2,'create').operationId).not.toBe(first);
 });
});
