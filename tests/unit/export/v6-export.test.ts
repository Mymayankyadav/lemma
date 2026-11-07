import {beforeEach,describe,expect,it,vi} from 'vitest';
import {LiveAdapter} from '../../../src/data/live/adapter';
import {liveClient} from '../../../src/data/live/client';

vi.mock('../../../src/data/live/client',()=>({liveClient:vi.fn()}));
type Row=Record<string,unknown>;
const owner='11111111-1111-4111-8111-111111111111';
function harness(registered:string[],data:Record<string,Row[]>,error:string|null=null){
 const reads:Array<{table:string;fields:string[];start:number;end:number}>=[];
 const from=vi.fn((table:string)=>{
  const filters:Array<[string,unknown]>=[];
  const api={
   select:(_fields:string)=>api,
   order:(_key:string,_opts:unknown)=>api,
   eq:(column:string,value:unknown)=>{filters.push([column,value]);return api},
   range:async(start:number,end:number)=>{
    reads.push({table,fields:filters.map(f=>f[0]+':'+f[1]),start,end});
    if(table==='lemma_undo_tables'){
     if(error)return {data:null,error:{message:error}};
     return {data:registered.map(table_name=>({table_name})).slice(start,end+1),error:null};
    }
    const rows=(data[table]??[]).filter(row=>filters.every(([field,value])=>row[field]===value));
    return {data:rows.slice(start,end+1),error:null};
   }
  };
  return api;
 });
 vi.mocked(liveClient).mockReturnValue({
  auth:{getUser:async()=>({data:{user:{id:owner}},error:null})},from,
 } as never);
 return {from,reads};
}
async function exportData(){
 const blob=await new LiveAdapter().exportAll();
 return JSON.parse(await blob.text()) as {format:string;schemaVersion:number;
  manifest:{registry:string;tables:Array<{table:string;count:number}>};
  tables:Record<string,Row[]>};
}
beforeEach(()=>{vi.clearAllMocks()});

describe('N95 owner registry-driven account export',()=>{
 it('includes new registry tables automatically and exact owner counts',async()=>{
  const h=harness(['settings','tasks','study_entries','parked_thoughts'],{
   settings:[{user_id:owner,connector_secret:'DO-NOT-SHARE',desired_retention:.9}],
   tasks:[{user_id:owner,id:'t',title:'Task'},{user_id:owner,id:'t2',title:'Task 2'}],
   study_entries:[{user_id:owner,id:'s',status:'saved'}],
   parked_thoughts:[{user_id:owner,id:'p',text:'A thought'}],
  });
  const out=await exportData();
  expect(out.format).toBe('lemma-backup-v2');
  expect(out.schemaVersion).toBe(2);
  expect(out.manifest.registry).toBe('lemma_undo_tables');
  expect(out.manifest.tables).toEqual([{table:'settings',count:1},{table:'tasks',count:2},
   {table:'study_entries',count:1},{table:'parked_thoughts',count:1}]);
  expect(Object.keys(out.tables)).toEqual(['settings','tasks','study_entries','parked_thoughts']);
  expect(JSON.stringify(out)).not.toContain('DO-NOT-SHARE');
  expect(h.reads.filter(r=>r.table!=='lemma_undo_tables').every(r=>
   r.fields.includes('user_id:'+owner))).toBe(true);
 });
 it('continues owner-scoped reads after server page limits rather than losing rows',async()=>{
  const h=harness(['tasks'],{tasks:Array.from({length:1204},(_,i)=>({
   id:'task-'+i,user_id:owner,version:i+1}))});
  const out=await exportData();
  expect(out.manifest.tables[0].count).toBe(1204);
  expect(out.tables.tasks).toHaveLength(1204);
  expect(h.reads.filter(r=>r.table==='tasks').map(r=>[r.start,r.end]))
   .toEqual([[0,999],[1000,1999]]);
 });
 it('includes archived projects instead of filtering incomplete account history',async()=>{
  const h=harness(['projects'],{projects:[
   {id:'a',user_id:owner,status:'archived'},{id:'b',user_id:owner,status:'active'}]});
  const out=await exportData();
  expect(out.tables.projects).toHaveLength(2);
  expect(h.reads.some(r=>r.table==='projects'&&r.fields.some(f=>f.startsWith('status:'))))
   .toBe(false);
 });
 it('fails closed on absent registry permissions rather than exporting a partial static list',async()=>{
  harness(['tasks'],{},'permission denied for table lemma_undo_tables');
  await expect(new LiveAdapter().exportAll()).rejects
   .toThrow(/authenticated registry read is not enabled/);
 });
 it('refuses duplicate, malformed or foreign-owner data',async()=>{
  harness(['tasks','tasks'],{});
  await expect(new LiveAdapter().exportAll()).rejects.toThrow(/duplicate table/);
  harness(['tasks;DROP TABLE'],{});
  await expect(new LiveAdapter().exportAll()).rejects.toThrow(/invalid or duplicate/);
  harness(['tasks'],{tasks:[{id:'foreign',user_id:'someone-else'}]});
  await expect(new LiveAdapter().exportAll()).rejects.toThrow(/foreign owner/);
 });
});
