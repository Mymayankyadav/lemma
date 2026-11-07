import {describe,expect,it,vi} from 'vitest';
import {readRegisteredResource} from '../../../supabase/functions/mcp/tools/registry';
import type {Context} from '../../../supabase/functions/mcp/db';
import {readFileSync} from 'node:fs';

const owner='11111111-1111-4111-8111-111111111111';
const other='99999999-9999-4999-8999-999999999999';
const metadata={resource:'future_widget',mcp_ok:true,
 schema:{operations:['create','archive'],fields:['title','status','description','api_key']}};
type Row=Record<string,unknown>;
const rows:Array<Row>=Array.from({length:53},(_,i)=>({
 id:'aaaaaaaa-aaaa-4aaa-8aaa-'+String(i+1).padStart(12,'0'),
 user_id:i===0?other:owner,version:1,title:'Widget '+i,
 status:i%2?'active':'archived',description:'A useful widget '+i,
 api_key:'never-return-this-secret',
}));
function fixture(){
 const calls:Array<{table:string;filters:string[];select:string;range?:[number,number]}>=[];
 const from=vi.fn((table:string)=>{
  const filters:string[]=[],pred:Array<(row:Row)=>boolean>=[];
  const item={table,filters,select:'',range:undefined as [number,number]|undefined};
  calls.push(item);
  const q={
   select:(fields:string,_opts?:unknown)=>{item.select=fields;return q},
   eq:(field:string,value:unknown)=>{filters.push(field+':'+String(value));
    pred.push(row=>row[field]===value);return q},
   ilike:(field:string,term:string)=>{filters.push('ilike:'+field);
    const needle=term.slice(1,-1).replace(/\\([%_\\])/g,'$1').toLowerCase();
    pred.push(row=>String(row[field]??'').toLowerCase().includes(needle));return q},
   order:(_field:string,_opts?:unknown)=>q,
   range:(first:number,last:number)=>{item.range=[first,last];return Promise.resolve({
    data:rows.filter(row=>pred.every(fn=>fn(row))).sort((a,b)=>
      String(a.id).localeCompare(String(b.id))).slice(first,last+1),
    count:rows.filter(row=>pred.every(fn=>fn(row))).length,error:null,
   })},
   maybeSingle:()=>Promise.resolve({data:table==='lemma_command_resources'?
    metadata:null,error:null}),
  };
  return q;
 });
 return {c:{userId:owner,db:{from}} as unknown as Context,from,calls};
}
describe('N37 generic owner-scoped registry page',()=>{
 it('returns exact 52-owner total, bounded 50 + 2 pages and opaque filter-locked cursor',async()=>{
  const {c,calls}=fixture();
  const first=JSON.parse(await readRegisteredResource(c,{what:'future_widget',limit:50},'get'));
  expect(first.total).toBe(52);
  expect(first.items).toHaveLength(50);
  expect(first.items.every((x:Row)=>!('user_id'in x)&&!('api_key'in x))).toBe(true);
  expect(first.nextCursor).toMatch(/^rg1:/);
  const second=JSON.parse(await readRegisteredResource(c,{
   what:'future_widget',limit:50,cursor:first.nextCursor},'get'));
  expect(second.items).toHaveLength(2);
  expect(second.total).toBe(52);
  expect(second.nextCursor).toBeNull();
  expect(new Set([...first.items,...second.items].map((x:Row)=>x.id)).size).toBe(52);
  expect(calls.filter(x=>x.table==='future_widget').map(x=>x.range)).toEqual([[0,49],[50,99]]);
  expect(calls.filter(x=>x.table==='future_widget').every(x=>
   x.filters.includes('user_id:'+owner))).toBe(true);
  await expect(readRegisteredResource(c,{what:'future_widget',limit:51},'get'))
   .rejects.toThrow(/limit/);
  await expect(readRegisteredResource(c,{
   what:'future_widget',status:'active',cursor:first.nextCursor},'get'))
   .rejects.toThrow(/cursor/);
 });
 it('searches only a registered text field, returning exact filtered totals',async()=>{
  const {c,calls}=fixture();
  const r=JSON.parse(await readRegisteredResource(c,{
   resource:'future_widget',query:'Widget 2',limit:5,status:'active',
  },'search'));
  expect(r.items.every((x:Row)=>String(x.title).includes('Widget 2'))).toBe(true);
  expect(r.items.every((x:Row)=>x.status==='active')).toBe(true);
  expect(calls.filter(x=>x.table==='future_widget').every(x=>x.range![1]-x.range![0]<8))
   .toBe(true);
  await expect(readRegisteredResource(c,{
   resource:'future_widget',query:'a',limit:5},'search'))
   .rejects.toThrow(/2..120/);
  await expect(readRegisteredResource(c,{
   resource:'future_widget',query:'sample',limit:9},'search'))
   .rejects.toThrow(/limit/);
 });
 it('rejects unregistered resources, forged owner inputs, and unsupported filters',async()=>{
  const {c,from}=fixture();
  await expect(readRegisteredResource(c,{
   what:'not_a_registry',ownerId:other} as never,'get')).rejects.toThrow(/owner/);
  await expect(readRegisteredResource(c,{what:'future_widget',project:'other'},'get'))
   .rejects.toThrow(/project/);
  await expect(readRegisteredResource(c,{what:'future_widget',cursor:'rg1:!'},'get'))
   .rejects.toThrow(/cursor/);
  c.userId='';
  await expect(readRegisteredResource(c,{what:'future_widget'},'get'))
   .rejects.toThrow(/Authenticated owner/);
  expect(from.mock.calls.every(call=>call[0]==='lemma_command_resources'||call[0]==='future_widget'))
   .toBe(true);
 });
 it('uses existing get/search dispatch routes, leaving PDF and legacy study paths intact',()=>{
  const read=readFileSync('supabase/functions/mcp/tools/read.ts','utf8');
  const server=readFileSync('supabase/functions/mcp/server.ts','utf8');
  expect(read).toContain("readRegisteredResource(c,a,'get')");
  expect(read).toContain("readRegisteredResource(c,a,'search')");
  expect(read).toContain("if(a.resource==='tasks')return readTaskRecords");
  expect(server).toContain("register('search'");
  expect(server).toContain("register('get'");
  expect(server).not.toContain("registerTool('resources'");
 });
});
