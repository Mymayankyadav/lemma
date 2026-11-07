import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createLiveOverlapApi} from '../../../src/data/overlap-acknowledgements/live';
import {liveClient} from '../../../src/data/live/client';
import {getMode} from '../../../src/data/mode';
import {getOverlapApi,setOverlapApiForTests} from '../../../src/data/overlap-acknowledgements';
vi.mock('../../../src/data/live/client',()=>({liveClient:vi.fn()}));
vi.mock('../../../src/data/mode',()=>({getMode:vi.fn(()=> 'live')}));

type Row=Record<string,unknown>;
type R={data:Row[]|Row|null;error:{code?:string;message?:string}|null};
type Read={table:string;columns:string;filters:Array<[string,string,unknown]>};
const at='2026-11-07T10:00:00.000Z';
const uuid=(n:number)=>'11111111-1111-4111-8111-'+n.toString(16).padStart(12,'0');
const owner='owner-guarded-by-RLS';
const participant=(id:string,kind:'entry'|'block',version=1)=>({kind,id,version});
const row=(n:number,extra:Row={}):Row=>({
 id:uuid(n),user_id:owner,
 participants:[participant(uuid(100),'block'),participant(uuid(200),'entry')],
 starts_at:new Date(Date.parse(at)+n*60_000).toISOString(),
 ends_at:new Date(Date.parse(at)+(n+30)*60_000).toISOString(),
 reason:'Overlapping study commitments',disposition:'keep_both',
 attributed_to:null,version:1,source:'app',
 created_at:at,updated_at:at,...extra,
});
class Query implements PromiseLike<R>{
 private fields:Array<[string,string,unknown]>=[];
 private single=false;
 private columns='*';
 constructor(private readonly table:string,
   private readonly state:{data:Record<string,Row[]>;reads:Read[]}){}
 select(columns:string){this.columns=columns;return this}
 eq(k:string,v:unknown){this.fields.push(['eq',k,v]);return this}
 gt(k:string,v:string){this.fields.push(['gt',k,v]);return this}
 lt(k:string,v:string){this.fields.push(['lt',k,v]);return this}
 in(k:string,v:string[]){this.fields.push(['in',k,v]);return this}
 order(k:string,v:unknown){this.fields.push(['order',k,v]);return this}
 range(a:number,b:number){this.fields.push(['range','',[a,b]]);return this}
 maybeSingle(){this.single=true;return this}
 then<TResult1=R,TResult2=never>(
  onfulfilled?:((value:R)=>TResult1|PromiseLike<TResult1>)|null,
  onrejected?:((reason:unknown)=>TResult2|PromiseLike<TResult2>)|null
 ):Promise<TResult1|TResult2>{
  this.state.reads.push({table:this.table,columns:this.columns,filters:this.fields});
  const kept=(this.state.data[this.table]||[]).filter(r=>
    this.fields.every(([op,k,v])=>{
      if(op==='eq')return r[k]===v;
      if(op==='gt')return String(r[k])>String(v);
      if(op==='lt')return String(r[k])<String(v);
      if(op==='in')return (v as string[]).includes(String(r[k]));
      return true;
    }));
  kept.sort((a,b)=>String(a.starts_at||a.id).localeCompare(String(b.starts_at||b.id))||
    String(a.id).localeCompare(String(b.id)));
  const range=this.fields.find(f=>f[0]==='range');
  const result=range?kept.slice((range[2] as number[])[0],
    (range[2] as number[])[1]+1):kept;
  const data=this.single?(result[0]??null):result;
  return Promise.resolve({data,error:null} as R).then(onfulfilled,onrejected);
 }
}
function harness(){
 const data={
  overlap_acknowledgements:[row(1),row(2),row(3)] as Row[],
  calendar_blocks:[{id:uuid(100),version:1,user_id:owner}] as Row[],
  study_entries:[{id:uuid(200),version:1,user_id:owner}] as Row[],
 };
 const state={data,reads:[] as Read[]};
 const client={from:vi.fn((table:string)=>new Query(table,state)),
  rpc:vi.fn(),insert:vi.fn(),update:vi.fn(),delete:vi.fn()};
 return {...state,client};
}
let fake:ReturnType<typeof harness>;
beforeEach(()=>{fake=harness();vi.mocked(liveClient).mockReturnValue(fake.client as never)});

describe('N61.2.2.1 read-only owner-RLS overlap adapter',()=>{
 it('maps owner-only rows, dynamic participant versions and gets by UUID',async()=>{
  const api=createLiveOverlapApi();
  expect(api.mode).toBe('live');
  const result=await api.listAcknowledgements();
  expect(result).toMatchObject({total:3,nextCursor:null});
  expect(result.items.map(x=>x.id)).toEqual([uuid(1),uuid(2),uuid(3)]);
  expect(result.items[0]).toMatchObject({source:'app',version:1,stale:false,
    participants:[{kind:'block',id:uuid(100),version:1},
      {kind:'entry',id:uuid(200),version:1}]});
  expect(result.items[0]).not.toHaveProperty('user_id');
  expect((await api.getAcknowledgement(uuid(2)))?.stale).toBe(false);
  expect(await api.getAcknowledgement(uuid(88))).toBeNull();
  await expect(api.getAcknowledgement('not-a-uuid'))
    .rejects.toMatchObject({code:'invalid'});
  expect(fake.reads.some(x=>x.table==='calendar_blocks'&&
    x.filters.some(f=>f[0]==='in'&&f[1]==='id'))).toBe(true);
  expect(fake.reads.some(x=>x.table==='study_entries'&&
    x.filters.some(f=>f[0]==='in'&&f[1]==='id'))).toBe(true);
  expect(fake.reads.every(x=>x.filters.every(f=>f[1]!=='user_id'))).toBe(true);
  expect(fake.client.rpc).not.toHaveBeenCalled();
 });
 it('reports stale missing/changed participants without hiding other records',async()=>{
  const api=createLiveOverlapApi();
  fake.data.calendar_blocks[0].version=2;
  expect((await api.listAcknowledgements({stale:true})).total).toBe(3);
  expect((await api.getAcknowledgement(uuid(1)))?.stale).toBe(true);
  fake.data.overlap_acknowledgements[1]=row(2,{participants:[
    participant(uuid(101),'block'),participant(uuid(200),'entry')]});
  expect((await api.listAcknowledgements({stale:true})).total).toBe(3);
  fake.data.calendar_blocks.push({id:uuid(101),version:1});
  expect((await api.listAcknowledgements({stale:false})).items.map(r=>r.id))
    .toEqual([uuid(2)]);
  fake.data.study_entries=[];
  expect((await api.listAcknowledgements({stale:true})).total).toBe(3);
 });
 it('fetches owner rows in bounded batches for exact totals and keyset pages',async()=>{
  const api=createLiveOverlapApi();
  fake.data.overlap_acknowledgements=Array.from({length:57},(_,i)=>row(i+1));
  const allIds:string[]=[];
  let cursor:string|null=null;
  for(let i=0;i<15;i++){
    const result=await api.listAcknowledgements({limit:7,cursor});
    expect(result.total).toBe(57);
    allIds.push(...result.items.map(r=>r.id));
    cursor=result.nextCursor;
    if(cursor===null)break;
  }
  expect(allIds).toHaveLength(57);
  expect(new Set(allIds).size).toBe(57);
  const pages=fake.reads.filter(x=>x.table==='overlap_acknowledgements');
  expect(pages.every(x=>x.filters.filter(f=>f[0]==='range').every(f=>
    (f[2] as number[])[1]-(f[2] as number[])[0]+1<=50))).toBe(true);
  expect(pages.some(x=>x.filters.some(f=>f[0]==='range'&&
    (f[2] as number[])[0]===50))).toBe(true);
  expect(fake.reads.every(x=>x.filters.every(f=>f[0]!=='in'||
    (f[2] as string[]).length<=50))).toBe(true);
  const firstPage=await api.listAcknowledgements({limit:1});
  await expect(api.listAcknowledgements({limit:1,stale:true,
    cursor:firstPage.nextCursor})).rejects.toMatchObject({code:'invalid'});
  await expect(api.listAcknowledgements({cursor:'bad/cursor'}))
    .rejects.toMatchObject({code:'invalid'});
 });
 it('chunks owner-visible participant version reads past fifty distinct IDs',async()=>{
  const api=createLiveOverlapApi();
  const make=(kind:'block'|'entry',n:number)=>participant(uuid(n),kind);
  fake.data.overlap_acknowledgements=Array.from({length:60},(_,i)=>row(i+1,{
    participants:[make('block',300+i),make('entry',400+i)],
  }));
  fake.data.calendar_blocks=Array.from({length:60},(_,i)=>({
    id:uuid(300+i),version:1,user_id:owner,
  }));
  fake.data.study_entries=Array.from({length:60},(_,i)=>({
    id:uuid(400+i),version:1,user_id:owner,
  }));
  const all=await api.listAcknowledgements({limit:50});
  expect(all).toMatchObject({total:60});
  expect(all.items).toHaveLength(50);
  expect(all.nextCursor).not.toBeNull();
  expect(all.items.every(r=>r.stale===false)).toBe(true);
  const currentReads=fake.reads.filter(r=>r.table==='calendar_blocks'||
    r.table==='study_entries');
  expect(currentReads).toHaveLength(4);
  expect(currentReads.every(r=>r.filters.find(f=>f[0]==='in')!==undefined)).toBe(true);
  expect(currentReads.every(r=>(r.filters.find(f=>f[0]==='in')?.[2] as string[]).length<=50))
    .toBe(true);
  // More than fifty distinct participants across kinds still require
  // separate owner-visible RLS queries, never a global service-role lookup.
  fake.data.study_entries=fake.data.study_entries.slice(0,59);
  const stale=await api.listAcknowledgements({stale:true});
  expect(stale.items.map(r=>r.id)).toEqual([uuid(60)]);
 });

 it('pushes time-window filters to RLS reads and uses half-open overlap',async()=>{
  const api=createLiveOverlapApi();
  const end=new Date(Date.parse(at)+2*60_000).toISOString();
  const start=new Date(Date.parse(at)+31*60_000).toISOString();
  expect((await api.listAcknowledgements({to:end})).total).toBe(1);
  expect((await api.listAcknowledgements({from:start})).total).toBe(2);
  const ranges=fake.reads.filter(x=>x.table==='overlap_acknowledgements');
  expect(ranges.some(x=>x.filters.some(f=>f[0]==='lt'&&f[1]==='starts_at')))
    .toBe(true);
  expect(ranges.some(x=>x.filters.some(f=>f[0]==='gt'&&f[1]==='ends_at')))
    .toBe(true);
  await expect(api.listAcknowledgements({from:end,to:end}))
    .rejects.toMatchObject({code:'invalid'});
  await expect(api.listAcknowledgements({limit:51}))
    .rejects.toMatchObject({code:'invalid'});
  await expect(api.listAcknowledgements({userId:owner} as never))
    .rejects.toMatchObject({code:'invalid'});
 });
 it('fails closed on malformed records and never synthesizes successful writes',async()=>{
  const api=createLiveOverlapApi();
  await expect(api.createAcknowledgement({} as never)).rejects
    .toThrow(/require N61\.2\.2\.2/);
  await expect(api.updateAcknowledgement(uuid(1),1,{reason:'Changed'}))
    .rejects.toThrow(/require N61\.2\.2\.2/);
  await expect(api.deleteAcknowledgement(uuid(1),1))
    .rejects.toThrow(/require N61\.2\.2\.2/);
  expect(fake.client.rpc).not.toHaveBeenCalled();
  expect(fake.client.insert).not.toHaveBeenCalled();
  expect(fake.client.update).not.toHaveBeenCalled();
  expect(fake.client.delete).not.toHaveBeenCalled();
  fake.data.overlap_acknowledgements[0]=row(1,{disposition:'attribute_to',
    attributed_to:{kind:'block',id:uuid(999)}});
  await expect(api.listAcknowledgements()).rejects.toMatchObject({code:'invalid'});
  fake.data.overlap_acknowledgements=[row(1,{starts_at:'2026-11-07T10:00:00'})];
  await expect(api.listAcknowledgements()).rejects.toThrow(/timezone-naive/);
 });
});


describe('N61.2.2.2 owner-RLS command writes and durable retries',()=>{
 const full={participants:[participant(uuid(100),'block'),
   participant(uuid(200),'entry')],
  startsAt:'2026-11-07T10:10:00.000Z',
  endsAt:'2026-11-07T10:30:00.000Z',
  reason:'Preserve both commitments',
  disposition:'keep_both' as const,attributedTo:null};
 type Cmd={operationId:string;resource:string;operation:string;
   target?:{id:string};expectedVersion?:number;patch:Row};
 const sent:Cmd[]=[];
 beforeEach(()=>{
  sent.length=0;
  vi.mocked(getMode).mockReturnValue('live');
  setOverlapApiForTests(null);
 });
 it('creates a record through one owner-scoped RPC, then reads authoritative source',async()=>{
  fake.client.rpc.mockImplementation(async(name:string,options:unknown)=>{
   expect(name).toBe('overlap_acknowledgements_command');
   const p=(options as {p:Cmd}).p;sent.push(p);
   fake.data.overlap_acknowledgements.push(row(4,{
    participants:p.patch.participants,
    starts_at:p.patch.starts_at,ends_at:p.patch.ends_at,
    reason:p.patch.reason,disposition:p.patch.disposition,
    attributed_to:p.patch.attributed_to,source:'mcp',
   }));
   return {data:{status:'ok',operationId:p.operationId,
     actionNo:77,changed:[{id:uuid(4),version:1}]},error:null};
  });
  const api=createLiveOverlapApi(true);
  const result=await api.createAcknowledgement(full);
  expect(result.actionNo).toBe(77);
  expect(result.record).toMatchObject({id:uuid(4),source:'mcp',stale:false});
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({schemaVersion:1,
   resource:'overlap_acknowledgements',operation:'create',
   patch:{starts_at:full.startsAt,ends_at:full.endsAt,
    disposition:'keep_both',attributed_to:null}});
  expect(sent[0].operationId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(JSON.stringify(sent[0])).not.toContain('user_id');
  expect(JSON.stringify(sent[0])).not.toContain('userId');
  expect(fake.client.insert).not.toHaveBeenCalled();
  expect(fake.client.update).not.toHaveBeenCalled();
  expect(fake.client.delete).not.toHaveBeenCalled();
 });
 it('updates a fully validated patch and deletes with optimistic versions',async()=>{
  fake.client.rpc.mockImplementation(async(_name:string,options:unknown)=>{
   const p=(options as {p:Cmd}).p;sent.push(p);
   const target=p.target?.id??'';
   if(p.operation==='update'){
    fake.data.overlap_acknowledgements[0]=row(1,{
      ...p.patch,reason:p.patch.reason,version:2});
   }else if(p.operation==='delete'){
    fake.data.overlap_acknowledgements=fake.data.overlap_acknowledgements
      .filter(x=>x.id!==target);
   }
   return {data:{status:'ok',operationId:p.operationId,
    actionNo:p.operation==='update'?91:92,
    changed:[{id:target,version:p.operation==='update'?2:1}]},error:null};
  });
  const api=createLiveOverlapApi(true);
  const update=await api.updateAcknowledgement(uuid(1),1,{reason:'Changed'});
  expect(update).toMatchObject({actionNo:91,record:{version:2,reason:'Changed'}});
  expect(sent[0]).toMatchObject({operation:'update',
    expectedVersion:1,target:{id:uuid(1)},patch:{reason:'Changed'}});
  await expect(api.updateAcknowledgement(uuid(1),1,{reason:'Stale'}))
   .rejects.toMatchObject({code:'conflict'});
  await expect(api.updateAcknowledgement(uuid(1),2,{
    disposition:'attribute_to',attributedTo:{kind:'block',id:uuid(999)},
  })).rejects.toMatchObject({code:'invalid'});
  expect(sent).toHaveLength(1);
  const deletion=await api.deleteAcknowledgement(uuid(2),1);
  expect(deletion).toEqual({record:{id:uuid(2)},actionNo:92});
  expect(sent[1]).toMatchObject({operation:'delete',expectedVersion:1,
    target:{id:uuid(2)},patch:{}});
  expect(sent[1].operationId).not.toBe(sent[0].operationId);
  expect(fake.client.from).toHaveBeenCalledWith('overlap_acknowledgements');
  expect(fake.client.insert).not.toHaveBeenCalled();
 });
 it('retries an unknown outcome byte-identically, including operationId',async()=>{
  fake.client.rpc.mockResolvedValueOnce({data:null,
   error:{message:'Network dropped after write'}}).mockImplementationOnce(
   async(_name:string,options:unknown)=>{
    const p=(options as {p:Cmd}).p;
    fake.data.overlap_acknowledgements.push(row(4,{
     participants:p.patch.participants,
     starts_at:p.patch.starts_at,ends_at:p.patch.ends_at,
     reason:p.patch.reason,disposition:p.patch.disposition,
     attributed_to:p.patch.attributed_to,
    }));
    return {data:{status:'ok',operationId:p.operationId,actionNo:44,
     changed:[{id:uuid(4),version:1}]},error:null};
   });
  const result=await createLiveOverlapApi(true).createAcknowledgement(full);
  expect(result.actionNo).toBe(44);
  const calls=fake.client.rpc.mock.calls;
  expect(calls).toHaveLength(2);
  expect(calls[0]).toEqual(calls[1]);
  expect((calls[0][1] as {p:Cmd}).p.operationId).toBeTruthy();
 });
 it('maps changed-payload/version conflicts and refuses an undeployed RPC',async()=>{
  const api=createLiveOverlapApi(true);
  fake.client.rpc.mockResolvedValueOnce({data:{status:'conflict',
    operationId:'placeholder',actionNo:null,
    conflict:{currentVersion:9}},error:null});
  // The command refuses to accept an unrelated receipt's operationId.
  await expect(api.createAcknowledgement(full)).rejects.toThrow(/mismatched operationId/);
  fake.client.rpc.mockImplementationOnce(async(_name:string,options:unknown)=>{
    const p=(options as {p:Cmd}).p;
    return {data:{status:'conflict',operationId:p.operationId,actionNo:null,
      conflict:{currentVersion:9}},error:null};
  });
  await expect(api.createAcknowledgement(full)).rejects
    .toMatchObject({code:'conflict'});
  fake.client.rpc.mockResolvedValueOnce({data:null,error:{
    code:'PGRST202',message:'Could not find the function'}});
  await expect(api.createAcknowledgement(full)).rejects
    .toThrow(/not deployed/);
 });
 it('switches injected facades by mode without altering the old read-only constructor',()=>{
  const fakeDemo={...createLiveOverlapApi(),mode:'demo' as const};
  setOverlapApiForTests(fakeDemo);
  vi.mocked(getMode).mockReturnValue('demo');
  expect(getOverlapApi()).toBe(fakeDemo);
  vi.mocked(getMode).mockReturnValue('live');
  expect(getOverlapApi()).not.toBe(fakeDemo);
  expect(getOverlapApi().mode).toBe('live');
  setOverlapApiForTests(null);
 });
});
