import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createLiveGoalApi} from '../../../src/data/study-goals/live';
import {liveClient} from '../../../src/data/live/client';
import type {NewGoal} from '../../../src/data/study-goals/contract';

vi.mock('../../../src/data/live/client',()=>({liveClient:vi.fn()}));
type Row=Record<string,any>;
const owner='11111111-1111-4111-8111-111111111111';
const foreign='22222222-2222-4222-8222-222222222222';
const other='33333333-3333-4333-8333-333333333333';
const input:NewGoal={
 period:'week',startDate:'2026-11-16',endDate:'2026-11-22',
 timeZone:'Asia/Kolkata',targetMinutes:300,subjectId:owner,projectId:null,
};
const moment='2026-11-08T02:00:00Z';
const make=(i:number,ownerId=owner):Row=>({
 id:'aaaaaaaa-aaaa-4aaa-8aaa-'+i.toString(16).padStart(12,'0'),
 user_id:ownerId,period:'week',start_date:'2026-11-16',end_date:'2026-11-22',
 time_zone:'Asia/Kolkata',target_minutes:180,subject_id:owner,project_id:null,
 archived_at:null,version:1,created_at:moment,updated_at:moment,
});
function harness(rows:Row[]=[]){
 let serial=1200,action=1;
 const receipts=new Map<string,{body:string;reply:Row}>();
 const calls:Row[]=[];
 const rpc=vi.fn(async(name:string,args:Row)=>{
  if(name!=='study_goals_command')throw Error('unexpected RPC');
  const p=args.p as Row;calls.push(structuredClone(p));
  const old=receipts.get(p.operationId);
  if(old)return {data:old.body===JSON.stringify(p)?old.reply:
   {status:'conflict',conflict:{reason:'operationId changed payload'}},error:null};
  const targetId=p.target?.id as string|undefined;
  let current=rows.find(row=>row.id===targetId&&row.user_id===owner);
  if(p.operation!=='create'&&!current)return {data:null,error:{message:'Study goal not found for owner'}};
  if(p.operation!=='create'&&current!.version!==p.expectedVersion)
   return {data:{status:'conflict',conflict:{currentVersion:current!.version}},error:null};
  if(p.operation==='create'){
   current={...make(++serial),...p.patch,version:1};rows.push(current);
  }else if(p.operation==='update'){
   Object.assign(current!,p.patch,{version:current!.version+1});
  }else if(p.operation==='archive'){
   Object.assign(current!,{archived_at:moment,version:current!.version+1});
  }else if(p.operation==='restore'){
   Object.assign(current!,{archived_at:null,version:current!.version+1});
  }else if(p.operation==='delete'){
   rows.splice(rows.indexOf(current!),1);
  }
  const reply={status:'ok',actionNo:action++,changed:[{
   id:current!.id,version:current!.version}],goal:{...current}};
  receipts.set(p.operationId,{body:JSON.stringify(p),reply});
  return {data:reply,error:null};
 });
 const builderCalls:Array<{kind:string;filters:Row;or:string|null;limit:number|null}>=[];
 function builder(){
  let projection='*',head=false,limit:number|null=null,or:string|null=null;
  const filters:Row={},orders:string[]=[];
  const b={
   select(name:string,opts?:{head?:boolean;count?:string}){projection=name;head=opts?.head===true;return b},
   eq(name:string,value:string){filters[name]=value;return b},
   is(name:string,value:null){filters[name]=value;return b},
   or(value:string){or=value;return b},
   order(name:string){orders.push(name);return b},
   limit(value:number){limit=value;return b},
   maybeSingle:async()=>{
    const output=resolve();
    return {data:(output.data as Row[])[0]??null,error:null};
   },
   then(onfulfilled:(value:Row)=>unknown,onrejected?:(err:unknown)=>unknown){
    return Promise.resolve(resolve()).then(onfulfilled,onrejected);
   },
  };
  function resolve(){
   builderCalls.push({kind:projection,filters:{...filters},or,limit});
   let available=rows.filter(r=>r.user_id===owner);
   for(const [name,value] of Object.entries(filters))
    available=available.filter(r=>(r[name]??null)===value);
   available.sort((a,b)=>String(a.start_date).localeCompare(b.start_date)||
    String(a.end_date).localeCompare(b.end_date)||String(a.id).localeCompare(b.id));
   const total=available.length;
   if(or){
    const match=or.match(/id\.gt\.([0-9a-f-]{36})/i);
    if(!match)throw Error('Expected bounded three-column keyset');
    const cursor=available.find(row=>row.id===match[1]);
    if(!cursor)available=[];
    else available=available.filter(r=>String(r.start_date)>String(cursor.start_date)||
      (r.start_date===cursor.start_date&&(String(r.end_date)>String(cursor.end_date)||
        (r.end_date===cursor.end_date&&String(r.id)>String(cursor.id)))));
   }
   if(limit!==null)available=available.slice(0,limit);
   return {data:head?null:available.map(r=>({...r})),count:head?total:null,error:null};
  }
  return b;
 }
 const from=vi.fn((name:string)=>{
  if(name!=='study_goals')throw Error('unexpected table '+name);
  return builder();
 });
 vi.mocked(liveClient).mockReturnValue({from,rpc} as never);
 return {rpc,from,calls,builderCalls,rows,receipts};
}
beforeEach(()=>{vi.clearAllMocks()});
describe('N59.2 owner study-goals live adapter',()=>{
 it('writes the exact v1 command envelope without user IDs and returns journal receipts',async()=>{
  const h=harness(),api=createLiveGoalApi();
  const created=await api.createGoal(input);
  expect(created).toMatchObject({record:{...input,version:1,archivedAt:null},actionNo:1});
  expect(h.calls[0]).toMatchObject({
   schemaVersion:1,resource:'study_goals',operation:'create',
   patch:{period:'week',start_date:'2026-11-16',end_date:'2026-11-22',
    time_zone:'Asia/Kolkata',target_minutes:300,subject_id:owner,project_id:null},
  });
  expect(h.calls[0].operationId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(JSON.stringify(h.calls[0])).not.toContain('user_id');
  expect(JSON.stringify(h.calls[0])).not.toContain('userId');
  const id=created.record.id;
  const updated=await api.updateGoal(id,1,{targetMinutes:330});
  expect(updated.record).toMatchObject({targetMinutes:330,version:2});
  expect(h.calls[1]).toMatchObject({operation:'update',target:{id},
   expectedVersion:1,patch:{target_minutes:330}});
  const archived=await api.archiveGoal(id,2);
  expect(archived.record.archivedAt).not.toBeNull();
  const restored=await api.restoreGoal(id,3);
  expect(restored.record).toMatchObject({archivedAt:null,version:4});
  expect((await api.deleteGoal(id,4))).toEqual({record:{id},actionNo:5});
  expect(h.calls.slice(2).map(x=>x.operation)).toEqual(['archive','restore','delete']);
  expect(h.calls.slice(2).map(x=>x.expectedVersion)).toEqual([2,3,4]);
 });
 it('replays the same operationId after a transport loss and maps changed-payload conflicts',async()=>{
  const h=harness();
  const original=h.rpc.getMockImplementation()!;
  let first=true;
  h.rpc.mockImplementation(async(name,args)=>{
   const answer=await original(name,args);
   if(first){first=false;throw Error('connection lost after commit')}
   return answer;
  });
  const api=createLiveGoalApi();
  const created=await api.createGoal(input);
  expect(created.actionNo).toBe(1);
  expect(h.calls).toHaveLength(2);
  expect(h.calls[0].operationId).toBe(h.calls[1].operationId);
  expect(h.rows).toHaveLength(1);
  h.rpc.mockImplementation(async()=>({data:{
   status:'conflict',conflict:{reason:'operationId changed payload'}},error:null}));
  await expect(api.updateGoal(created.record.id,1,{targetMinutes:400}))
   .rejects.toMatchObject({code:'conflict'});
 });
 it('uses exact RLS read pages, bound cursors and null-scoped filters',async()=>{
  const rows=Array.from({length:115},(_,i)=>make(i+1));
  rows.push(make(500,foreign));
  const h=harness(rows),api=createLiveGoalApi(),seen:string[]=[];
  let cursor:string|null=null;
  for(let page=0;page<10;page++){
   const result=await api.listGoals({limit:25,cursor});
   expect(result.total).toBe(115);
   expect(result.items.length).toBeLessThanOrEqual(25);
   seen.push(...result.items.map(row=>row.id));
   cursor=result.nextCursor;
   if(!cursor)break;
   expect(cursor).not.toContain(result.items.at(-1)!.id);
  }
  expect(seen).toHaveLength(115);
  expect(new Set(seen).size).toBe(115);
  expect(h.builderCalls.filter(x=>x.kind==='*').every(x=>x.limit===26)).toBe(true);
  const page=await api.listGoals({limit:1});
  await expect(api.listGoals({limit:1,cursor:page.nextCursor,includeArchived:true}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.listGoals({limit:1,cursor:page.nextCursor,subjectId:owner}))
   .rejects.toMatchObject({code:'invalid'});
  const none=await api.listGoals({subjectId:null,projectId:null});
  expect(none.total).toBe(0);
  const row=await api.getGoal(make(1).id);
  expect(row?.id).toBe(make(1).id);
  expect(await api.getGoal(other)).toBeNull();
  expect(h.from).toHaveBeenCalledWith('study_goals');
 });
 it('maps optimistic conflicts, overlap errors and missing owner rows',async()=>{
  const h=harness([make(1)]),api=createLiveGoalApi();
  await expect(api.updateGoal(make(1).id,99,{targetMinutes:500}))
   .rejects.toMatchObject({code:'conflict'});
  await expect(api.archiveGoal(other,1)).rejects.toMatchObject({code:'not_found'});
  h.rpc.mockResolvedValue({data:null,error:{code:'23514',
   message:'Overlapping active goal for this owner, scope and period'}});
  await expect(api.restoreGoal(make(1).id,1)).rejects.toMatchObject({code:'conflict'});
  expect(h.calls.every(p=>p.resource==='study_goals')).toBe(true);
 });
 it('validates civil date, IANA zone, stable UUID scope and whole-minute bounds before writes',async()=>{
  const h=harness(),api=createLiveGoalApi();
  for(const invalid of [
   {...input,startDate:'2026-02-30'}, {...input,endDate:'2026-11-14'},
   {...input,timeZone:'Mars/Olympus'}, {...input,targetMinutes:1.5},
   {...input,targetMinutes:100001},{...input,subjectId:'subject-name'},
   {...input,period:'day' as never},
  ])await expect(api.createGoal(invalid)).rejects.toMatchObject({code:'invalid'});
  for(const size of [0,51,1.5])await expect(api.listGoals({limit:size}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.getGoal('not-a-uuid')).rejects.toMatchObject({code:'invalid'});
  await expect(api.updateGoal(other,0,{targetMinutes:12}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.updateGoal(other,1,{})).rejects.toMatchObject({code:'invalid'});
  expect(h.rpc).not.toHaveBeenCalled();
  expect(h.from).not.toHaveBeenCalled();
 });
});
