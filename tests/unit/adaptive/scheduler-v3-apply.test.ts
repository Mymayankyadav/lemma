import {describe,expect,it,vi,beforeAll,afterAll} from 'vitest';
vi.mock('../../../supabase/functions/mcp/deps.ts',()=>({createClient:()=>({}),McpServer:class{},createMcpHandler:()=>({}),z:{}}));
import {applyScheduler} from '../../../supabase/functions/mcp/adaptive';
import {fakeContext,tablesFrom} from './fakedb';
import {rowsFor,NOW,type P} from './rows';
import {planPrune} from '../../../supabase/functions/_shared/adaptive/scheduler';

beforeAll(()=>{vi.useFakeTimers();vi.setSystemTime(NOW)});
afterAll(()=>vi.useRealTimers());
const one:P[]=[{slug:'topology-1',cps:39,done:3,stages:6,target:'2026-11-20'}];
const ctx=(rows:any,writes:any[]=[])=>({...fakeContext(tablesFrom(rows),writes),batch:[] as any[]});
const patches=(c:any)=>c.batch.filter((op:any)=>op.table==='checkpoints'&&op.op==='update');
const migrated=(rows:any,frozen:any[]=[])=>{rows.settings.atlas_migrated_at='2026-11-01T00:00:00Z';rows.scheduler_runs=frozen;rows.frozen=frozen;return rows;};

describe('10 §4 write-through for a migrated owner',()=>{
 it('freezes P_all once and defers non-core material below 0.80, journalled in the batch (undo reverses it)',async()=>{
  const rows=migrated(rowsFor(one)),writes:any[]=[],c=ctx(rows,writes),line=await applyScheduler(c,NOW);
  expect(line).toMatch(/^SCHEDULER deferred \d+/);expect(line).toContain('undo reverses it');
  const byId=new Map(rows.checkpoints.map((x:any)=>[x.id,x]));
  expect(patches(c).length).toBeGreaterThan(0);
  for(const op of patches(c)){const row:any=byId.get(op.where.id);expect(row.tier).not.toBe('core');expect(row.status).toBe('not_started');expect(op.values.plan_state).toBe('deferred');expect(op.values.deferred_reason).toMatch(/^prune:v3 /);}
  expect(c.batch.every((op:any)=>op.op==='update'&&op.table==='checkpoints')).toBe(true);        // nothing is deleted
  const frozen=writes.filter(w=>w.table==='scheduler_runs');expect(frozen).toHaveLength(1);expect(frozen[0].values.p_all).toBeLessThan(.8);expect(frozen[0].values.p_core).toBeGreaterThanOrEqual(0);
 });
 it('a second run on the same day changes nothing: the first run of the day is the frozen one',async()=>{
  const rows=migrated(rowsFor(one)),c1=ctx(rows);await applyScheduler(c1,NOW);
  for(const op of patches(c1)){const r:any=rows.checkpoints.find((x:any)=>x.id===op.where.id);Object.assign(r,op.values);}
  const today=new Date(NOW).toISOString().slice(0,10);rows.frozen=[{project_id:rows.projects[0].id,study_day:today,p_all:.1,slack_ratio:0}];
  const c2=ctx(rows);await applyScheduler(c2,NOW);expect(patches(c2)).toEqual([]);   // already pruned, still below the restore bar
 });
 it('restores what v3 deferred only after two consecutive days above 0.95, and nothing the owner or v2 deferred',async()=>{
  const rows=migrated(rowsFor(one)),proj=rows.projects[0].id,v3=rows.checkpoints.filter((x:any)=>x.status==='not_started'&&x.tier!=='core').slice(0,2),other=rows.checkpoints.filter((x:any)=>x.status==='not_started'&&x.tier!=='core')[2];
  for(const x of v3)Object.assign(x,{plan_state:'deferred',deferred_reason:'prune:v3 P_all 0.60',deferred_at:'2026-11-10T00:00:00Z'});
  Object.assign(other,{plan_state:'deferred',deferred_reason:'owner deferred',deferred_at:'2026-11-10T00:00:00Z'});
  const day=(n:number)=>new Date(NOW.getTime()-n*86400000).toISOString().slice(0,10);
  const hold=await applyScheduler(ctx(migrated(rows,[{project_id:proj,study_day:day(1),p_all:.97,slack_ratio:0},{project_id:proj,study_day:day(0),p_all:.9,slack_ratio:0}])),NOW);
  expect(hold).not.toMatch(/restored/);
  const c=ctx(migrated(rows,[{project_id:proj,study_day:day(1),p_all:.97,slack_ratio:0},{project_id:proj,study_day:day(0),p_all:.97,slack_ratio:0}]));
  const line=await applyScheduler(c,NOW);expect(line).toMatch(/restored 2/);
  expect(patches(c).map((op:any)=>op.where.id).sort()).toEqual(v3.map((x:any)=>x.id).sort());
  for(const op of patches(c))expect(op.values).toMatchObject({plan_state:'active',deferred_at:null,deferred_reason:null});
 });
 it('planPrune takes just enough off the required minutes, skips test-outs for deferral, and never returns an unreachable plan as success',()=>{
  const f={required:600,supply:400,requiredVariance:900,supplyVariance:400};
  const out=planPrune(f,[{id:'a',minutes:60,testOut:true},{id:'b',minutes:120},{id:'c',minutes:120},{id:'d',minutes:120},{id:'e',minutes:120}]);
  expect(out.testOut).toEqual(['a']);expect(out.defer.length).toBeGreaterThan(0);expect(out.defer).not.toContain('a');expect(out.pAfter).toBeGreaterThanOrEqual(.8);
  const none=planPrune({required:100,supply:500,requiredVariance:100,supplyVariance:100},[{id:'a',minutes:60}]);expect(none.defer).toEqual([]);
  const short=planPrune({required:2000,supply:100,requiredVariance:100,supplyVariance:100},[{id:'a',minutes:60}]);expect(short.pAfter).toBeLessThan(.8);
 });
});
