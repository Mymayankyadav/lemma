import {describe,expect,it} from 'vitest';
import {findOverlaps,parseOverlapRange,readCalendarOverlaps} from '../../../supabase/functions/mcp/tools/calendar-read';
import type {Context} from '../../../supabase/functions/mcp/db';

const OWNER='11111111-1111-1111-1111-111111111111';
const OTHER='99999999-9999-9999-9999-999999999999';
const START='2026-11-16T00:00:00Z',END='2026-11-17T00:00:00Z';
type Row=Record<string,any>;
function fake(tables:Record<string,Row[]>){
 const calls:string[]=[];
 const db={from:(table:string)=>{
  const tests:Array<(r:Row)=>boolean>=[];
  const q:any={
   select:()=>q,
   eq:(c:string,v:unknown)=>{calls.push(table+':eq:'+c);tests.push(r=>r[c]===v);return q},
   neq:(c:string,v:unknown)=>{tests.push(r=>r[c]!==v);return q},
   lt:(c:string,v:string)=>{tests.push(r=>r[c]<v);return q},
   gt:(c:string,v:string)=>{tests.push(r=>r[c]>v);return q},
   order:()=>q,
   limit:()=>Promise.resolve({data:(tables[table]||[]).filter(r=>tests.every(t=>t(r))),error:null}),
  };
  return q;
 },rpc:()=>Promise.resolve({data:null,error:null})};
 return {ctx:{db,userId:OWNER} as unknown as Context,calls};
}
const block=(id:string,s:string,e:string,extra:Row={})=>({id,user_id:OWNER,title:id,kind:'study',status:'planned',
 starts_at:'2026-11-16T'+s+':00Z',ends_at:'2026-11-16T'+e+':00Z',version:1,...extra});
describe('N160.2 calendar overlaps',()=>{
 it('requires a bounded range and rejects owner arguments',()=>{
  expect(()=>parseOverlapRange({start:'2026-11-16',end:END})).toThrow(/ISO instants/);
  expect(()=>parseOverlapRange({start:END,end:START})).toThrow(/positive/);
  expect(()=>parseOverlapRange({start:START,end:'2028-01-01T00:00:00Z'})).toThrow(/366 days/);
  expect(()=>parseOverlapRange({start:START,end:END,user_id:OTHER} as any)).toThrow(/omit owner/);
  expect(parseOverlapRange({start:START,end:END})).toEqual({start:'2026-11-16T00:00:00.000Z',end:'2026-11-17T00:00:00.000Z'});
 });
 it('finds the shared minutes of every overlapping pair, and nothing for touching blocks',()=>{
  const spans=[
   {kind:'block' as const,id:'a',title:'a',starts_at:'2026-11-16T09:00:00Z',ends_at:'2026-11-16T10:00:00Z'},
   {kind:'block' as const,id:'b',title:'b',starts_at:'2026-11-16T09:30:00Z',ends_at:'2026-11-16T10:30:00Z'},
   {kind:'block' as const,id:'c',title:'c',starts_at:'2026-11-16T10:30:00Z',ends_at:'2026-11-16T11:00:00Z'}];
  const out=findOverlaps(spans);
  expect(out).toHaveLength(1);
  expect(out[0].minutes).toBe(30);
  expect(out[0].starts_at).toBe('2026-11-16T09:30:00.000Z');
 });
 it('reports blocks against saved focus, skips cancelled blocks and other owners, and marks acknowledged overlaps',async()=>{
  const {ctx,calls}=fake({
   calendar_blocks:[block('b1','09:00','10:00'),block('b2','09:30','10:30',{status:'cancelled'}),
    block('b3','13:00','14:00'),block('b4','13:30','14:30'),block('x','09:00','10:00',{user_id:OTHER})],
   study_intervals:[{id:'i1',user_id:OWNER,entry_id:'e1',kind:'focus',started_at:'2026-11-16T09:45:00Z',ended_at:'2026-11-16T10:15:00Z'}],
   overlap_acknowledgements:[{id:'k1',user_id:OWNER,starts_at:'2026-11-16T13:30:00Z',ends_at:'2026-11-16T14:00:00Z',
    disposition:'keep_both',version:1,participants:[{kind:'block',id:'b3',version:1},{kind:'block',id:'b4',version:1}]}]});
  const result=JSON.parse(await readCalendarOverlaps(ctx,{start:START,end:END}));
  expect(result.blocks.map((x:any)=>x.id)).toEqual(['b1','b3','b4']);
  expect(result.overlaps).toHaveLength(2);
  const pair=(a:string,b:string)=>result.overlaps.find((o:any)=>o.between.map((x:any)=>x.id).sort().join()===[a,b].sort().join());
  expect(pair('b1','i1').minutes).toBe(15);
  expect(pair('b1','i1').acknowledged).toBe(false);
  expect(pair('b3','b4').minutes).toBe(30);
  expect(pair('b3','b4').acknowledged).toBe(true);
  expect(result.unacknowledged).toBe(1);
  for(const t of ['calendar_blocks','study_intervals','overlap_acknowledgements'])expect(calls).toContain(t+':eq:user_id');
  expect(JSON.stringify(result)).not.toContain(OTHER);
 });
});
