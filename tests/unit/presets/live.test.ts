import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createLivePresetApi} from '../../../src/data/presets/live';
import {liveClient} from '../../../src/data/live/client';

vi.mock('../../../src/data/live/client',()=>({liveClient:vi.fn()}));
type Row=Record<string,unknown>;
type DbError={code?:string;message?:string};
type Result={data:unknown;error:DbError|null;count?:number|null};
type Read={table:string;columns:string;filters:Array<[string,string,unknown]>;opts:unknown};
const at='2026-11-06T10:00:00Z';
const uuid=(n:number)=>'11111111-1111-4111-8111-'+n.toString(16).padStart(12,'0');
const preset=(n:number,changes:Row={}):Row=>({
  id:uuid(n),user_id:'owner-from-database-rls',label:'Preset '+n,
  subject_id:null,project_id:null,checkpoint_id:null,mode:'pomodoro',
  focus_minutes:25,break_minutes:5,long_break_minutes:15,cycles:4,
  position:n,archived_at:null,version:1,created_at:at,updated_at:at,...changes,
});
class Query implements PromiseLike<Result> {
  private filters:Array<[string,string,unknown]>=[];
  private columns='';
  private opts:unknown;
  private single=false;
  constructor(private readonly table:string,private readonly state:{
    rows:Row[];reads:Read[];pageBatches:Row[][];readError:DbError|null;
  }){}
  select(columns:string,opts?:unknown){this.columns=columns;this.opts=opts;return this;}
  eq(field:string,value:unknown){this.filters.push(['eq',field,value]);return this;}
  is(field:string,value:null){this.filters.push(['is',field,value]);return this;}
  not(field:string,op:string,value:null){this.filters.push(['not',field,op+':'+String(value)]);return this;}
  or(expression:string){this.filters.push(['or','',expression]);return this;}
  order(field:string,opts:unknown){this.filters.push(['order',field,opts]);return this;}
  limit(n:number){this.filters.push(['limit','',n]);return this;}
  maybeSingle(){this.single=true;return this;}
  then<TResult1=Result,TResult2=never>(
    resolve?:((value:Result)=>TResult1|PromiseLike<TResult1>)|null,
    reject?:((reason:unknown)=>TResult2|PromiseLike<TResult2>)|null,
  ):Promise<TResult1|TResult2>{
    this.state.reads.push({table:this.table,columns:this.columns,opts:this.opts,filters:this.filters});
    let rows=this.state.rows.filter(row=>this.filters.every(([op,field,value])=>
      op==='eq'?row[field]===value:
      op==='is'?row[field]==null:
      op==='not'?row[field]!=null:true));
    const count=rows.length;
    if(!this.single&&this.columns==='*'&&this.state.pageBatches.length)
      rows=this.state.pageBatches.shift()!;
    const lim=this.filters.find(([op])=>op==='limit');
    if(lim)rows=rows.slice(0,Number(lim[2]));
    const out:Result=this.state.readError?{data:null,error:this.state.readError}:
      this.single?{data:rows[0]??null,error:null}:
      {data:(this.opts as {head?:boolean}|undefined)?.head?null:rows,error:null,count};
    return Promise.resolve(out).then(resolve,reject);
  }
}
function harness(){
  const state={
    rows:[preset(1)] as Row[],
    reads:[] as Read[],
    pageBatches:[] as Row[][],
    readError:null as DbError|null,
    rpcResults:[] as Array<Result|Error>,
    calls:[] as Array<{fn:string;envelope:Record<string,unknown>}>,
  };
  const client={
    from:vi.fn((table:string)=>new Query(table,state)),
    rpc:vi.fn(async(fn:string,args:{p:Record<string,unknown>}):Promise<Result>=>{
      state.calls.push({fn,envelope:args.p});
      const result=state.rpcResults.shift();
      if(result instanceof Error)throw result;
      return result??{data:{status:'ok',changed:[{id:uuid(1),version:2}],actionNo:33},error:null};
    }),
  };
  return Object.assign(state,{client});
}
let fake:ReturnType<typeof harness>;
beforeEach(()=>{
  fake=harness();
  vi.mocked(liveClient).mockReturnValue(fake.client as never);
});
function expected(i:number,operation:string):Record<string,unknown>{
  const {fn,envelope}=fake.calls[i];
  expect(fn).toBe('presets_command');
  expect(envelope).toMatchObject({schemaVersion:1,resource:'presets',operation});
  expect(envelope.operationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  expect(JSON.stringify(envelope)).not.toMatch(/user_id|userId|p_user|ownerId/);
  return envelope;
}
describe('N55 live owner-RLS preset envelopes',()=>{
  it('reads bounded keyset pages with exact totals, stable order and active/archived filters',async()=>{
    fake.rows=[preset(1),preset(2),preset(3,{archived_at:'2026-11-05T10:00:00Z'})];
    fake.pageBatches=[[preset(1),preset(2)],[preset(2)]];
    const api=createLivePresetApi();
    const first=await api.listPresets({limit:1});
    expect(first).toMatchObject({total:2,items:[{id:uuid(1)}]});
    expect(first.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
    const second=await api.listPresets({limit:1,cursor:first.nextCursor});
    expect(second).toMatchObject({total:2,nextCursor:null,items:[{id:uuid(2)}]});
    const reads=fake.reads.filter(r=>r.columns==='*');
    expect(reads[0].filters).toContainEqual(['limit','',2]);
    expect(reads[0].filters.filter(([op])=>op==='order').map(x=>x[1]))
      .toEqual(['position','created_at','id']);
    expect(reads[1].filters.some(([op,,val])=>op==='or'&&String(val).includes('id.gt.'+uuid(1))))
      .toBe(true);
    expect(fake.reads.every(read=>read.table==='presets'&&
      read.filters.every(([,column])=>column!=='user_id'))).toBe(true);
    const archived=await api.listPresets({archived:'archived'});
    expect(archived).toMatchObject({total:1,items:[{id:uuid(3)}]});
    expect(fake.reads.some(read=>read.filters.some(([op])=>op==='not'))).toBe(true);
  });

  it('refuses mismatched cursors, oversized pages and invalid UUIDs before any SDK call',async()=>{
    const api=createLivePresetApi();
    await expect(api.listPresets({limit:0})).rejects.toMatchObject({code:'invalid'});
    await expect(api.listPresets({limit:51})).rejects.toMatchObject({code:'invalid'});
    await expect(api.listPresets({cursor:'%%'})).rejects.toMatchObject({code:'invalid'});
    await expect(api.getPreset('other-user')).rejects.toMatchObject({code:'invalid'});
    await expect(api.archivePreset('bad',1)).rejects.toMatchObject({code:'invalid'});
    expect(fake.client.from).not.toHaveBeenCalled();
    expect(fake.client.rpc).not.toHaveBeenCalled();
    fake.pageBatches=[[preset(1),preset(2)]];
    const page=await api.listPresets({limit:1});
    await expect(api.listPresets({archived:'all',cursor:page.nextCursor}))
      .rejects.toMatchObject({code:'invalid'});
  });

  it('reads only owner-visible records and maps archival, links and timestamps',async()=>{
    const api=createLivePresetApi();
    fake.rows=[preset(1,{subject_id:uuid(2),project_id:uuid(3),
      checkpoint_id:uuid(4),archived_at:'2026-11-05T09:00:00Z'})];
    expect(await api.getPreset(uuid(1))).toMatchObject({
      subjectId:uuid(2),projectId:uuid(3),checkpointId:uuid(4),
      archivedAt:'2026-11-05T09:00:00Z',focusMinutes:25,version:1});
    expect(await api.getPreset(uuid(1))).not.toHaveProperty('userId');
    fake.rows=[];
    expect(await api.getPreset(uuid(1))).toBeNull();
    expect(fake.reads.every(read=>read.table==='presets')).toBe(true);
  });

  it('creates with complete typed columns and no owner data, returns action journal ID',async()=>{
    const api=createLivePresetApi();
    const out=await api.createPreset({label:'  Timed proofs ',mode:'flowtime',
      subjectId:uuid(2),projectId:null,checkpointId:null,focusMinutes:45,
      breakMinutes:7,longBreakMinutes:18,cycles:3,position:9});
    expect(out).toMatchObject({actionNo:33,record:{id:uuid(1),label:'Preset 1'}});
    const envelope=expected(0,'create');
    expect(envelope).not.toHaveProperty('expectedVersion');
    expect(envelope).toMatchObject({patch:{label:'Timed proofs',mode:'flowtime',
      subject_id:uuid(2),project_id:null,checkpoint_id:null,
      focus_minutes:45,break_minutes:7,long_break_minutes:18,cycles:3,position:9}});
    await api.createPreset({label:'Again'});
    expect(expected(1,'create').operationId).not.toBe(envelope.operationId);
  });

  it('sends update, reorder, archive, restore, and delete to the same versioned RPC',async()=>{
    const api=createLivePresetApi();
    await api.updatePreset(uuid(1),1,{label:'New title',subjectId:null,focusMinutes:40});
    expect(expected(0,'update')).toMatchObject({
      target:{id:uuid(1)},expectedVersion:1,
      patch:{label:'New title',subject_id:null,focus_minutes:40},
    });
    await api.reorderPreset(uuid(1),2,5);
    expect(expected(1,'reorder')).toMatchObject({
      target:{id:uuid(1)},expectedVersion:2,patch:{position:5},
    });
    await api.archivePreset(uuid(1),3);
    expect(expected(2,'archive')).toMatchObject({target:{id:uuid(1)},expectedVersion:3,patch:{}});
    await api.restorePreset(uuid(1),4);
    expect(expected(3,'restore')).toMatchObject({target:{id:uuid(1)},expectedVersion:4,patch:{}});
    expect(await api.deletePreset(uuid(1),5)).toEqual({record:{id:uuid(1)},actionNo:33});
    expect(expected(4,'delete')).toMatchObject({target:{id:uuid(1)},expectedVersion:5,patch:{}});
  });

  it('maps stale versions and constraints to typed errors with no false successful receipt',async()=>{
    const api=createLivePresetApi();
    fake.rpcResults=[{data:{status:'conflict',changed:[],conflict:{currentVersion:12}},error:null}];
    await expect(api.updatePreset(uuid(1),1,{label:'Stale'})).rejects.toMatchObject({code:'conflict'});
    expect(expected(0,'update').expectedVersion).toBe(1);
    await expect(api.updatePreset(uuid(1),0,{label:'Bad'})).rejects.toMatchObject({code:'invalid'});
    await expect(api.updatePreset(uuid(1),1,{})).rejects.toMatchObject({code:'invalid'});
    await expect(api.createPreset({label:' ',mode:'pomodoro'})).rejects.toMatchObject({code:'invalid'});
    await expect(api.createPreset({label:'Wrong',user_id:'owner'} as never)).rejects.toMatchObject({code:'invalid'});
    await expect(api.reorderPreset(uuid(1),1,-2)).rejects.toMatchObject({code:'invalid'});
    fake.rpcResults=[{data:null,error:{code:'23514',message:'violates check constraint'}}];
    await expect(api.createPreset({label:'Bad settings'})).rejects.toMatchObject({code:'invalid'});
    expect(fake.calls).toHaveLength(2);
  });

  it('reuses the same operationId when the transport fails before the receipt',async()=>{
    const api=createLivePresetApi();
    fake.rpcResults=[new Error('network disconnected')];
    await expect(api.createPreset({label:'One write'})).rejects.toThrow('network disconnected');
    const first=expected(0,'create');
    await api.createPreset({label:'One write'});
    expect(expected(1,'create').operationId).toBe(first.operationId);
    await api.createPreset({label:'One write'});
    expect(expected(2,'create').operationId).not.toBe(first.operationId);
  });

  it('keeps the original id after RPC success if the owner read fails, then retries safely',async()=>{
    const api=createLivePresetApi();
    fake.readError={code:'500',message:'read timeout'};
    await expect(api.archivePreset(uuid(1),1)).rejects.toMatchObject({code:'server'});
    const previous=expected(0,'archive');
    fake.readError=null;
    await api.archivePreset(uuid(1),1);
    expect(expected(1,'archive').operationId).toBe(previous.operationId);
    expect(fake.client.rpc).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid server receipts and owner-read failure without fabricating records',async()=>{
    const api=createLivePresetApi();
    fake.rpcResults=[{data:{status:'ok',changed:[],actionNo:1},error:null}];
    await expect(api.archivePreset(uuid(1),1)).rejects.toMatchObject({code:'server'});
    expect(expected(0,'archive').target).toEqual({id:uuid(1)});
    fake.rows=[];
    await expect(api.updatePreset(uuid(1),1,{label:'Lost record'}))
      .rejects.toMatchObject({code:'not_found'});
  });
});
