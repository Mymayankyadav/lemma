import {describe, expect, it, vi} from 'vitest';
import {parseTaskRead, readTaskRecords} from '../../../supabase/functions/mcp/tools/task-read';
import type {Context} from '../../../supabase/functions/mcp/db';
import {readFileSync} from 'node:fs';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '99999999-9999-4999-8999-999999999999';
type Row = Record<string, any>;
const tasks: Row[] = [
  {id:'a',user_id:owner,title:'Proof of lemma',status:'backlog',position:1,version:1,created_at:'2026-11-06T00:00:00Z',due_kind:'date',due_date:'2026-11-12',due_at:null},
  {id:'b',user_id:owner,title:'Proof of theorem',status:'backlog',position:2,version:3,created_at:'2026-11-06T00:00:00Z',due_kind:'instant',due_date:null,due_at:'2026-11-12T12:00:00Z'},
  {id:'c',user_id:owner,title:'Review lemma',status:'completed',position:0,version:2,created_at:'2026-11-06T00:00:00Z'},
  {id:'d',user_id:other,title:'Secret lemma',status:'backlog',position:0,version:9,created_at:'2026-11-06T00:00:00Z'},
  {id:'e',user_id:owner,title:'100%_ literal',status:'in_progress',position:0,version:1,created_at:'2026-11-06T00:00:00Z'},
];
function fixture(rows: Row[] = tasks) {
  const calls: {table:string, filters:string[], range?:[number,number], count?:string}[] = [];
  const from = vi.fn((table:string) => {
    const filters:string[] = [];
    const tests: Array<(r:Row)=>boolean> = [];
    const sorting: Array<{key:string,asc:boolean}> = [];
    const trace = {table,filters,range:undefined as [number,number]|undefined,count:undefined as string|undefined};
    calls.push(trace);
    let first=0, last=Number.MAX_SAFE_INTEGER;
    const query = {
      select: (_columns:string, options?:{count:string}) => {trace.count=options?.count;return query},
      eq: (key:string,value:unknown) => {filters.push(key+':'+value);tests.push(r=>r[key]===value);return query},
      ilike: (key:string,pattern:string) => {
        filters.push('ilike:'+key);
        const literal=pattern.slice(1,-1).replace(/\\([%_\\])/g,'$1').toLowerCase();
        tests.push(r=>String(r[key]??'').toLowerCase().includes(literal));
        return query;
      },
      order: (key:string,opts?:{ascending:boolean}) => {sorting.push({key,asc:opts?.ascending!==false});return query},
      range: (lo:number,hi:number) => {trace.range=[lo,hi];first=lo;last=hi;return query},
      then: (resolve:(data:any)=>unknown,reject?:(e:any)=>unknown) => {
        const matching=rows.filter(r=>tests.every(f=>f(r))).sort((a,b)=>{
          for(const {key,asc} of sorting) {
            const cmp=String(a[key]??'').localeCompare(String(b[key]??''));
            if(cmp)return asc?cmp:-cmp;
          }
          return 0;
        });
        return Promise.resolve({data:matching.slice(first,last+1),count:matching.length,error:null}).then(resolve,reject);
      }
    };
    return query;
  });
  return {context:{userId:owner,db:{from}} as unknown as Context,from,calls};
}
describe('N34 MCP task read contract',()=>{
  it('returns a bounded owner-only page, independent total and stable cursor',async()=>{
    const {context,calls}=fixture();
    const one=JSON.parse(await readTaskRecords(context,{what:'tasks',status:'backlog',limit:1},'get'));
    expect(one).toMatchObject({resource:'tasks',total:2,nextCursor:'v1:1'});
    expect(one.items).toHaveLength(1);
    expect(one.items[0]).toMatchObject({id:'a',version:1,due_kind:'date'});
    expect(one.items[0]).not.toHaveProperty('user_id');
    const two=JSON.parse(await readTaskRecords(context,{what:'tasks',status:'backlog',limit:1,cursor:one.nextCursor},'get'));
    expect(two.items.map((r:Row)=>r.id)).toEqual(['b']);
    expect(two.nextCursor).toBeNull();
    expect(calls.map(c=>c.range)).toEqual([[0,0],[1,1]]);
    expect(calls.every(c=>c.count==='exact'&&c.filters.includes('user_id:'+owner)&&c.filters.includes('status:backlog'))).toBe(true);
  });
  it('filters by status and a literal title query; another owner stays invisible',async()=>{
    const {context,calls}=fixture();
    const found=JSON.parse(await readTaskRecords(context,{resource:'tasks',query:'lemma',limit:8},'search'));
    expect(found.total).toBe(2);
    expect(found.items.map((r:Row)=>r.id)).toEqual(['a','c']);
    const escaped=JSON.parse(await readTaskRecords(context,{resource:'tasks',query:'%_',status:'in_progress'},'search'));
    expect(escaped.items.map((r:Row)=>r.id)).toEqual(['e']);
    expect(calls.every(c=>c.filters.includes('user_id:'+owner))).toBe(true);
  });
  it('rejects bad inputs rather than widening the database query',()=>{
    for(const limit of [0,51,-1,1.5,Infinity])expect(()=>parseTaskRead({what:'tasks',limit},'get')).toThrow(/limit/);
    for(const limit of [0,9])expect(()=>parseTaskRead({resource:'tasks',query:'proof',limit},'search')).toThrow(/limit/);
    for(const cursor of ['v1:-1','v1:01','v2:1','v1:1000001'])expect(()=>parseTaskRead({what:'tasks',cursor},'get')).toThrow(/cursor/);
    expect(()=>parseTaskRead({what:'tasks',status:'waiting'},'get')).toThrow(/status/);
    expect(()=>parseTaskRead({resource:'tasks',query:' '},'search')).toThrow(/query/);
    expect(()=>parseTaskRead({what:'tasks',user_id:other} as any,'get')).toThrow(/owner/);
  });
  it('refuses missing connector owner without a database call',async()=>{
    const {context,from}=fixture();context.userId='';
    await expect(readTaskRecords(context,{what:'tasks'},'get')).rejects.toThrow(/Authenticated owner/);
    expect(from).not.toHaveBeenCalled();
  });
  it('registers tasks in the existing get/search schemas and handlers, not a new tool',()=>{
    const server=readFileSync('supabase/functions/mcp/server.ts','utf8');
    const handler=readFileSync('supabase/functions/mcp/tools/read.ts','utf8');
    expect(server).toContain("'calendar_blocks','tasks']");
    expect(server).toContain("status:S().optional()");
    expect(handler).toContain("if(a.what==='tasks')return readTaskRecords(c,a,'get')");
    expect(handler).toContain("if(a.resource==='tasks')return readTaskRecords(c,a,'search')");
    expect(server.match(/registerTool\('/g)?.length).toBe(1);
    expect(server.match(/'study'/g)?.length).toBeGreaterThan(0);
  });
});