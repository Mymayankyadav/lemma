import {describe,expect,it,vi,beforeAll,afterAll} from 'vitest';
vi.mock('../../../supabase/functions/mcp/deps.ts',()=>({createClient:()=>({}),McpServer:class{},createMcpHandler:()=>({}),z:{}}));
import {applyScheduler} from '../../../supabase/functions/mcp/adaptive';
import {fakeContext,tablesFrom} from './fakedb';
import {rowsFor,NOW,type P} from './rows';

beforeAll(()=>{vi.useFakeTimers();vi.setSystemTime(NOW)});
afterAll(()=>vi.useRealTimers());
const one:P[]=[{slug:'topology-1',cps:39,done:3,stages:6,target:'2026-11-20'}];
const ctx=(rows:any,writes:any[]=[])=>({...fakeContext(tablesFrom(rows),writes),batch:[] as any[]});
const patches=(c:any)=>c.batch.filter((op:any)=>op.table==='checkpoints'&&op.op==='update');

describe('scheduler_v2 (spec §8)',()=>{
  it('is off by default: nothing is deferred and nothing is frozen',async()=>{
    const writes:any[]=[];const c=ctx(rowsFor(one),writes);
    expect(await applyScheduler(c,NOW)).toBe('');expect(c.batch).toEqual([]);expect(writes).toEqual([]);
  });
  it('defers what pruning allows, journalled in the caller\'s batch; protected items are never in it (I4, I6)',async()=>{
    const rows=rowsFor(one,{flags:{scheduler_v2:true}});
    const writes:any[]=[];const c=ctx(rows,writes);
    const line=await applyScheduler(c,NOW);
    expect(line).toMatch(/^SCHEDULER deferred \d+ \(/);expect(line).toContain('undo reverses it');
    const byId=new Map(rows.checkpoints.map((x:any)=>[x.id,x]));
    for(const op of patches(c)){
      const row:any=byId.get(op.where.id);
      expect(row.status).not.toBe('demonstrated');
      if(op.values.plan_state==='deferred'){expect(row.tier).not.toBe('core');expect(row.pinned).toBe(false);expect(op.values.deferred_reason).toMatch(/^prune:/);expect(op.values.deferred_at).toBeTruthy()}
      if(op.values.step_meta)expect(op.values.step_meta.some((m:any)=>m.state==='deferred'&&m.deferred_reason.startsWith('prune:'))).toBe(true);
    }
    expect(c.batch.every((op:any)=>op.op==='update'&&op.table==='checkpoints')).toBe(true);   // nothing is deleted
    expect(writes.filter(w=>w.table==='scheduler_runs')).toHaveLength(1);                      // today's slack is frozen once
  });
  it('a second run on the same facts changes nothing (idempotent)',async()=>{
    const rows=rowsFor(one,{flags:{scheduler_v2:true}});
    const c1=ctx(rows);await applyScheduler(c1,NOW);
    // apply the batch to the rows as the database would
    for(const op of patches(c1)){const r:any=rows.checkpoints.find((x:any)=>x.id===op.where.id);Object.assign(r,op.values)}
    const c2=ctx(rows);expect(await applyScheduler(c2,NOW)).toBe('');expect(c2.batch).toEqual([]);
  });
  it('standard material is only proposed unless the project allows auto-prune',async()=>{
    const rows=rowsFor(one,{flags:{scheduler_v2:true}});rows.projects[0].auto_prune_standard=false;
    const c=ctx(rows);await applyScheduler(c,NOW);
    expect(patches(c).every((op:any)=>/venture|stage_empty/.test(op.values.deferred_reason??'venture'))).toBe(true);
  });
  it('restores only after two consecutive study days above +10%, newest first',async()=>{
    const rows=rowsFor(one,{flags:{scheduler_v2:true},capacity:{weekday_minutes:1200}});          // plenty of room now
    rows.sessions=[];                                                                              // no history, so pace 1.0
    const defer=rows.checkpoints.filter((c:any)=>c.status==='not_started').slice(-3);
    defer.forEach((c:any,i:number)=>Object.assign(c,{plan_state:'deferred',deferred_reason:'prune:venture_cp',deferred_at:'2026-11-16T0'+i+':00:00Z'}));
    const first=ctx(rows);expect(await applyScheduler(first,NOW)).toBe('');                       // no history yet: hysteresis holds
    const frozen=(day:string,ratio:number)=>({study_day:day,project_id:'proj-topology-1',slack_ratio:ratio});
    rows.frozen=[frozen('2026-11-17',0.4)];
    const one1=ctx(rows);expect(await applyScheduler(one1,NOW)).toBe('');                         // only today: still holds
    rows.frozen=[frozen('2026-11-16',0.05),frozen('2026-11-17',0.4)];
    const weak=ctx(rows);expect(await applyScheduler(weak,NOW)).toBe('');                         // yesterday below the threshold
    rows.frozen=[frozen('2026-11-16',0.3),frozen('2026-11-17',0.4)];
    const go=ctx(rows);const line=await applyScheduler(go,NOW);
    expect(line).toMatch(/restored 3/);
    expect(patches(go).map((op:any)=>op.where.id)).toEqual(defer.map((c:any)=>c.id).reverse());    // exact reverse order
    expect(patches(go).every((op:any)=>op.values.plan_state==='active'&&op.values.deferred_reason===null)).toBe(true);
  });
});
