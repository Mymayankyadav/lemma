import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createLiveTaskApi} from '../../../src/data/tasks/live';
import {liveClient} from '../../../src/data/live/client';

vi.mock('../../../src/data/live/client',()=>({liveClient:vi.fn()}));
type Row=Record<string,unknown>;
type ErrorData={code?:string;message?:string};
type Result={data:unknown;error:ErrorData|null;count?:number|null};
type Read={table:string;columns:string;filters:Array<[string,string,unknown]>;opts:unknown};
const at='2026-11-06T10:00:00Z';
const uuid=(n:number)=>'11111111-1111-4111-8111-'+n.toString(16).padStart(12,'0');
const task=(n:number,changes:Row={}):Row=>({
  id:uuid(n),user_id:'owner-from-RLS',title:'Task '+n,body:'',subject_id:null,
  project_id:null,checkpoint_id:null,estimate_minutes:null,priority:'normal',
  due_kind:'none',due_date:null,due_at:null,position:0,status:'backlog',
  completed_at:null,version:1,created_at:at,updated_at:at,...changes,
});
class Query implements PromiseLike<Result> {
  private filters:Array<[string,string,unknown]>=[];
  private columns='';
  private opts:unknown;
  private single=false;
  constructor(private table:string,private state:{
    rows:Row[];reads:Read[];pageBatches:Row[][];readError:ErrorData|null;
  }) {}
  select(columns:string,opts?:unknown) {this.columns=columns;this.opts=opts;return this;}
  in(field:string,value:unknown) {this.filters.push(['in',field,value]);return this;}
  eq(field:string,value:unknown) {this.filters.push(['eq',field,value]);return this;}
  or(expr:string) {this.filters.push(['or','',expr]);return this;}
  order(field:string,opts:unknown) {this.filters.push(['order',field,opts]);return this;}
  limit(n:number) {this.filters.push(['limit','',n]);return this;}
  maybeSingle() {this.single=true;return this;}
  then<TResult1=Result,TResult2=never>(
    onfulfilled?:((value:Result)=>TResult1|PromiseLike<TResult1>)|null,
    onrejected?:((reason:unknown)=>TResult2|PromiseLike<TResult2>)|null,
  ):Promise<TResult1|TResult2> {
    this.state.reads.push({table:this.table,columns:this.columns,opts:this.opts,filters:this.filters});
    let rows=this.state.rows.filter(row=>this.filters.every(([op,field,value])=>
      op==='in'?(value as unknown[]).includes(row[field]):op==='eq'?row[field]===value:true));
    const count=rows.length;
    if(!this.single&&this.columns==='*'&&this.state.pageBatches.length)
      rows=this.state.pageBatches.shift()!;
    const lim=this.filters.find(([op])=>op==='limit');
    if(lim) rows=rows.slice(0,Number(lim[2]));
    const result:Result=this.state.readError?{data:null,error:this.state.readError}:this.single?
      {data:rows[0]??null,error:null}:{data:this.opts&&
        (this.opts as {head?:boolean}).head?null:rows,error:null,count};
    return Promise.resolve(result).then(onfulfilled,onrejected);
  }
}
function harness(){
  const state={
    rows:[task(1)] as Row[],
    reads:[] as Read[],
    pageBatches:[] as Row[][],
    readError:null as ErrorData|null,
    rpcResults:[] as Array<Result|Error>,
    calls:[] as Array<{fn:string;envelope:Record<string,unknown>}>,
  };
  const client={
    from:vi.fn((name:string)=>new Query(name,state)),
    rpc:vi.fn(async (fn:string,args:{p:Record<string,unknown>}):Promise<Result>=>{
      state.calls.push({fn,envelope:args.p});
      const r=state.rpcResults.shift();
      if(r instanceof Error) throw r;
      return r??{data:{status:'ok',changed:[{id:uuid(1),version:2}],actionNo:41},error:null};
    }),
  };
  // Keep one mutable state shared by the test and the mocked query/RPC closures.
  return Object.assign(state,{client});
}
let fake:ReturnType<typeof harness>;
beforeEach(()=>{
  fake=harness();
  vi.mocked(liveClient).mockReturnValue(fake.client as never);
});
const expectOperation=(i:number,operation:string)=>{
  const {fn,envelope}=fake.calls[i];
  expect(fn).toBe('task_command');
  expect(envelope).toMatchObject({schemaVersion:1,resource:'tasks',operation});
  expect(envelope.operationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  expect(JSON.stringify(envelope)).not.toMatch(/user_id|userId|p_user/);
  return envelope;
};
describe('N24 live TaskApi with owner RLS Supabase client',()=>{
  it('uses bounded stable keyset pages with exact separate totals, and defaults to active statuses',async()=>{
    fake.rows=[task(1),task(2),task(3),task(4,{status:'completed'})];
    fake.pageBatches=[[task(1),task(2),task(3)],[task(3)]];
    const api=createLiveTaskApi();
    const first=await api.listTasks({limit:2});
    expect(first.total).toBe(3);
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
    const second=await api.listTasks({limit:2,cursor:first.nextCursor});
    expect(second).toMatchObject({total:3,nextCursor:null});
    expect(second.items.map(x=>x.id)).toEqual([uuid(3)]);
    const countReads=fake.reads.filter(r=>(r.opts as {head?:boolean}|undefined)?.head);
    expect(countReads).toHaveLength(2);
    expect(countReads.every(r=>r.columns==='id'&&
      r.filters.some(([op,field,val])=>op==='in'&&field==='status'&&
        JSON.stringify(val)==='["backlog","in_progress"]'))).toBe(true);
    const dataReads=fake.reads.filter(r=>r.columns==='*');
    expect(dataReads[0].filters).toContainEqual(['limit','',3]);
    expect(dataReads[0].filters.filter(([op])=>op==='order').map(x=>x[1]))
      .toEqual(['status','position','created_at','id']);
    const successor=dataReads[1].filters.find(([op])=>op==='or')?.[2];
    expect(successor).toContain('position.eq.0,created_at.eq.'+at+',id.gt.'+uuid(2));
    expect(fake.reads.every(r=>r.table==='tasks')).toBe(true);
  });
  it('validates limits, status filters, malformed cursor and a cursor for different statuses before reads',async()=>{
    const api=createLiveTaskApi();
    await expect(api.listTasks({limit:0})).rejects.toMatchObject({code:'invalid'});
    await expect(api.listTasks({limit:51})).rejects.toMatchObject({code:'invalid'});
    await expect(api.listTasks({status:['other' as never]})).rejects.toMatchObject({code:'invalid'});
    await expect(api.listTasks({cursor:'%%%'})).rejects.toMatchObject({code:'invalid'});
    expect(fake.client.from).not.toHaveBeenCalled();
    fake.pageBatches=[[task(1),task(2)]];
    const first=await api.listTasks({limit:1,status:['backlog']});
    await expect(api.listTasks({limit:1,cursor:first.nextCursor,status:['completed']}))
      .rejects.toMatchObject({code:'invalid'});
    expect(await api.listTasks({status:[]})).toEqual({items:[],total:0,nextCursor:null});
  });
  it('returns an RLS-visible record or null, preserving due date versus due instant',async()=>{
    const api=createLiveTaskApi();
    fake.rows=[task(1,{due_kind:'date',due_date:'2026-11-09'})];
    expect(await api.getTask(uuid(1))).toMatchObject({due:{kind:'date',date:'2026-11-09'}});
    fake.rows=[task(1,{due_kind:'instant',due_at:'2026-11-09T09:15:00+05:30'})];
    expect(await api.getTask(uuid(1))).toMatchObject({due:{kind:'instant',at:'2026-11-09T09:15:00+05:30'}});
    fake.rows=[];
    expect(await api.getTask(uuid(1))).toBeNull();
    expect(fake.reads.every(r=>r.filters.every(x=>x[1]!=='user_id'))).toBe(true);
  });
  it('creates through task_command only with a fresh UUID, maps links and all due fields, passes actionNo',async()=>{
    const api=createLiveTaskApi();
    const output=await api.createTask({title:' Revise proofs ',body:'Practice',
      due:{kind:'date',date:'2026-11-09'},priority:'high',estimateMinutes:35,
      subjectId:uuid(4),projectId:null,checkpointId:null,position:2});
    expect(output).toMatchObject({actionNo:41,record:{id:uuid(1)}});
    const envelope=expectOperation(0,'create');
    expect(envelope).not.toHaveProperty('expectedVersion');
    expect(envelope).toMatchObject({patch:{
      title:'Revise proofs',body:'Practice',priority:'high',estimate_minutes:35,
      subject_id:uuid(4),project_id:null,checkpoint_id:null,position:2,
      due_kind:'date',due_date:'2026-11-09',due_at:null,
    }});
    await api.createTask({title:'Plan',due:{kind:'instant',at:'2026-11-09T09:15:00+05:30'}});
    expectOperation(1,'create');
    expect(fake.calls[1].envelope).toMatchObject({patch:{
      due_kind:'instant',due_date:null,due_at:'2026-11-09T09:15:00+05:30',
    }});
    expect(fake.calls[1].envelope.operationId).not.toEqual(envelope.operationId);
    expect(fake.client.from).toHaveBeenCalledWith('tasks');
  });
  it('updates and deletes by id/version, keeping completedAt database-owned',async()=>{
    fake.rows=[task(1,{status:'completed',completed_at:'2026-11-06T11:00:00Z',version:2})];
    const api=createLiveTaskApi();
    const done=await api.updateTask(uuid(1),1,{status:'completed',due:{kind:'none'},estimateMinutes:null,checkpointId:null});
    expect(done).toMatchObject({actionNo:41,record:{status:'completed',completedAt:'2026-11-06T11:00:00Z'}});
    expect(expectOperation(0,'update')).toMatchObject({target:{id:uuid(1)},expectedVersion:1,patch:{
      status:'completed',due_kind:'none',due_date:null,due_at:null,
      estimate_minutes:null,checkpoint_id:null,
    }});
    fake.rows=[task(1,{status:'backlog',completed_at:null})];
    await api.updateTask(uuid(1),2,{status:'backlog'});
    expect(fake.calls[1].envelope).toMatchObject({patch:{status:'backlog'}});
    expect(JSON.stringify(fake.calls[1].envelope)).not.toContain('completed_at');
    const deleted=await api.deleteTask(uuid(1),3);
    expect(deleted).toEqual({record:{id:uuid(1)},actionNo:41});
    expect(expectOperation(2,'delete')).toMatchObject({target:{id:uuid(1)},expectedVersion:3,patch:{}});
  });
  it('maps server conflict receipts to typed conflict and rejects stale/invalid values before RPC',async()=>{
    fake.rpcResults=[{data:{status:'conflict',changed:[],conflict:{currentVersion:8}},error:null}];
    const api=createLiveTaskApi();
    await expect(api.updateTask(uuid(1),1,{title:'Stale'})).rejects.toMatchObject({code:'conflict'});
    expectOperation(0,'update');
    await expect(api.updateTask(uuid(1),0,{title:'bad'})).rejects.toMatchObject({code:'invalid'});
    await expect(api.createTask({title:' ',due:{kind:'none'}})).rejects.toMatchObject({code:'invalid'});
    await expect(api.createTask({title:'Bad',due:{kind:'date',date:'2026-02-30'}})).rejects.toMatchObject({code:'invalid'});
    await expect(api.createTask({title:'Bad',due:{kind:'instant',at:'2026-11-09T09:00:00'}}))
      .rejects.toMatchObject({code:'invalid'});
    expect(fake.calls).toHaveLength(1);
  });
  it('reuses operationId after ambiguous network failure, clears after success, changes it for a new action',async()=>{
    fake.rpcResults=[{data:null,error:{message:'fetch failed'}},
      {data:{status:'ok',changed:[{id:uuid(1),version:1}],actionNo:15},error:null}];
    const api=createLiveTaskApi();
    await expect(api.createTask({title:'Retry safe'})).rejects.toMatchObject({code:'server'});
    const once=expectOperation(0,'create');
    expect((await api.createTask({title:'Retry safe'})).actionNo).toBe(15);
    expect(expectOperation(1,'create').operationId).toBe(once.operationId);
    await api.createTask({title:'Retry safe'});
    expect(expectOperation(2,'create').operationId).not.toBe(once.operationId);
  });
  it('keeps the same command operationId when DB committed but record read temporarily fails',async()=>{
    const api=createLiveTaskApi();
    fake.readError={message:'connection temporarily unavailable'};
    await expect(api.createTask({title:'Read failure'})).rejects.toMatchObject({code:'server'});
    const id=expectOperation(0,'create').operationId;
    fake.readError=null;
    await api.createTask({title:'Read failure'});
    expect(expectOperation(1,'create').operationId).toBe(id);
  });
  it('counts and pages a full fifty records without unbounded queries or owner parameters',async()=>{
    const api=createLiveTaskApi();
    fake.rows=Array.from({length:50},(_,i)=>task(i+1));
    fake.pageBatches=[fake.rows.slice(0,21),fake.rows.slice(20,41),fake.rows.slice(40)];
    let cursor:string|null=null;
    let seen:string[]=[];
    do {
      const page=await api.listTasks({limit:20,cursor});
      expect(page.total).toBe(50);
      seen=[...seen,...page.items.map(t=>t.id)];
      cursor=page.nextCursor;
    }while(cursor);
    expect(new Set(seen).size).toBe(50);
    expect(fake.reads.filter(r=>r.columns==='*').every(r=>
      r.filters.some(([op,,value])=>op==='limit'&&value===21))).toBe(true);
    expect(fake.client.rpc).not.toHaveBeenCalled();
  });
});
