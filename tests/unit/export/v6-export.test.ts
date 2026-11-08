import {beforeEach,describe,expect,it,vi} from 'vitest';
import {LiveAdapter} from '../../../src/data/live/adapter';
import {liveClient} from '../../../src/data/live/client';

vi.mock('../../../src/data/live/client',()=>({liveClient:vi.fn()}));
type Row=Record<string,unknown>;
const owner='11111111-1111-4111-8111-111111111111';
function harness(registered:string[],data:Record<string,Row[]>,error:string|null=null,foreign=false){
 const calls:Array<{table:string|null;cursor:string|null;limit:number}>=[];
 const from=vi.fn();
 const rpc=vi.fn(async(name:string,args:{p_table:string|null;p_cursor:string|null;p_limit:number})=>{
  if(name!=='lemma_export_page')throw Error('Unexpected RPC: '+name);
  const {p_table,p_cursor,p_limit}=args;
  calls.push({table:p_table,cursor:p_cursor,limit:p_limit});
  if(error)return {data:null,error:{message:error}};
  const all=p_table===null
   ?[...registered].sort().map(table_name=>({table_name}))
   :(data[p_table]??[]).filter(row=>foreign||row.user_id===owner);
  const start=p_cursor===null?0:Number(p_cursor)+1;
  const rows=all.slice(start,start+p_limit).map(row=>{
   const {connector_secret:_secret,...safe}=row;void _secret;
   return safe;
  });
  return {data:{rows,nextCursor:rows.length?String(start+rows.length-1):null},error:null};
 });
 vi.mocked(liveClient).mockReturnValue({
  auth:{getUser:async()=>({data:{user:{id:owner}},error:null})},rpc,from
 } as never);
 return {rpc,from,calls};
}
async function exportData(){
 const blob=await new LiveAdapter().exportAll();
 return JSON.parse(await blob.text()) as {
  format:string;schemaVersion:number;
  manifest:{registry:string;tables:Array<{table:string;count:number}>};
  tables:Record<string,Row[]>
 };
}
beforeEach(()=>{vi.clearAllMocks()});
describe('N95 owner-only export RPC and stable keyset pages',()=>{
 it('exports every registered table, exact counts, and no connector secrets',async()=>{
  const h=harness(['settings','tasks','study_entries','parked_thoughts'],{
   settings:[{user_id:owner,connector_secret:'DO-NOT-SHARE',desired_retention:.9}],
   tasks:[{user_id:owner,id:'t'},{user_id:owner,id:'t2'}],
   study_entries:[{user_id:owner,id:'s'}],
   parked_thoughts:[{user_id:owner,id:'p'}]
  });
  const result=await exportData();
  expect(result.format).toBe('lemma-backup-v2');
  expect(result.schemaVersion).toBe(2);
  expect(result.manifest.registry).toBe('lemma_undo_tables');
  expect(result.manifest.tables).toEqual([
   {table:'parked_thoughts',count:1},{table:'settings',count:1},
   {table:'study_entries',count:1},{table:'tasks',count:2}
  ]);
  expect(JSON.stringify(result)).not.toContain('DO-NOT-SHARE');
  expect(h.from).not.toHaveBeenCalled();
  expect(h.calls.every(c=>c.limit===100)).toBe(true);
 });
 it('keyset-paginates more than 1200 rows instead of truncating',async()=>{
  const h=harness(['tasks'],{tasks:Array.from({length:1204},(_,i)=>({
   id:'task-'+i,user_id:owner,version:i+1
  }))});
  const output=await exportData();
  expect(output.tables.tasks).toHaveLength(1204);
  expect(output.manifest.tables[0].count).toBe(1204);
  const pages=h.calls.filter(c=>c.table==='tasks');
  expect(pages).toHaveLength(13);
  expect(pages[0].cursor).toBeNull();
  expect(pages[1].cursor).toBe('99');
  expect(pages[12].cursor).toBe('1199');
  expect(h.from).not.toHaveBeenCalled();
 });
 it('preserves archived rows and pages more than 100 registry names',async()=>{
  const names=['projects',...Array.from({length:101},(_,i)=>'resource_'+i)];
  const h=harness(names,{projects:[
   {user_id:owner,id:'a',status:'archived'},
   {user_id:owner,id:'b',status:'active'}]});
  const output=await exportData();
  expect(output.tables.projects).toHaveLength(2);
  expect(output.manifest.tables).toHaveLength(102);
  expect(h.calls.filter(c=>c.table===null)).toHaveLength(2);
 });
 it('fails closed when RPC denied or rows, names or owners are malformed',async()=>{
  harness([],{},'permission denied for function lemma_export_page');
  await expect(new LiveAdapter().exportAll()).rejects.toThrow();
  harness([],{});
  await expect(new LiveAdapter().exportAll()).rejects.toThrow(/Export registry is empty/);
  harness(['tasks','tasks'],{});
  await expect(new LiveAdapter().exportAll()).rejects.toThrow(/duplicate table/);
  harness(['tasks;DROP TABLE'],{});
  await expect(new LiveAdapter().exportAll()).rejects.toThrow(/invalid or duplicate/);
  harness(['tasks'],{tasks:[{user_id:'foreign-owner',id:'x'}]},null,true);
  await expect(new LiveAdapter().exportAll()).rejects.toThrow(/foreign owner/);
 });
 it('refuses a stalled cursor instead of hanging or truncating',async()=>{
  const h=harness(['tasks'],{});
  h.rpc.mockImplementation(async(_name,args)=>{
   if(args.p_table===null)
    return {data:{rows:[{table_name:'tasks'}],nextCursor:'tasks'},error:null};
   return {data:{
    rows:Array.from({length:100},()=>({user_id:owner,id:1})),
    nextCursor:'stalled'
   },error:null};
  });
  await expect(new LiveAdapter().exportAll()).rejects.toThrow(/cursor did not advance/);
 });
});
