import {describe,expect,it,vi,beforeAll,afterAll} from 'vitest';
// db.ts imports the Deno-only npm: specifier for its Supabase client; these tests use a fake client instead.
vi.mock('../../../supabase/functions/mcp/deps.ts',()=>({createClient:()=>({}),McpServer:class{},createMcpHandler:()=>({}),z:{}}));
import {packet} from '../../../supabase/functions/mcp/packet';
import {get} from '../../../supabase/functions/mcp/tools/read';
import {tokens} from '../../../supabase/functions/mcp/adaptive';
import {fakeContext,tablesFrom} from './fakedb';
import {rowsFor,PRODUCTION,NOW} from './rows';

beforeAll(()=>{vi.useFakeTimers();vi.setSystemTime(NOW)});
afterAll(()=>vi.useRealTimers());
const on={time_block:true,recheck_v2:true};
const owner=(text:string)=>text.split('\n').filter(l=>!/^OWNER/.test(l));

describe('resume v2 (spec §13.1)',()=>{
  for(const p of PRODUCTION){
    it(p.slug+': fixed order, within 1500 tokens, TIME from facts, no pace or forecast number',async()=>{
      const rows=rowsFor(PRODUCTION,{flags:on});
      const text=await packet(fakeContext(tablesFrom(rows)),{project:p.slug});
      const at=(re:RegExp)=>text.search(re);
      const heads=[at(/^RULES$/m),at(/^TIME today/m),at(/^QUEUE /m),at(/^BRIEF$/m),at(/^FLAGS$/m)].filter(i=>i>=0);
      expect(heads.length).toBeGreaterThanOrEqual(4);expect(heads).toEqual([...heads].sort((a,b)=>a-b));
      expect(at(/^RULES$/m)).toBeLessThan(at(/^TIME today/m));
      expect(tokens(text)).toBeLessThanOrEqual(1500);
      expect(text).toContain('deadline=2026-11-20 last_study=2026-11-20 study_days_left=4 (incl. today)');
      expect(text).not.toMatch(/WARM|finish ≈|pace|forecast|days behind/i);
      const dates=new Set(text.match(/\d{4}-\d{2}-\d{2}/g)??[]);
      for(const d of dates)expect(['2026-11-16','2026-11-17','2026-11-20'].concat(rows.sessions.map((s:any)=>String(s.started_at).slice(0,10)),rows.checkpoints.map((c:any)=>String(c.due_on))).includes(d)).toBe(true);
    });
  }
  it('rules are at most 10 lines',async()=>{
    const text=await packet(fakeContext(tablesFrom(rowsFor(PRODUCTION,{flags:on}))),{project:'topology-1'});
    const block=text.slice(text.search(/^RULES$/m)+6,text.search(/^TIME today/m)).trim().split('\n');
    expect(block.length).toBeLessThanOrEqual(10);
  });
  it('the old loop is gone: demonstrated checkpoints with a pending recheck_due add no WARM line',async()=>{
    const rows=rowsFor(PRODUCTION,{flags:on});
    for(const c of rows.checkpoints.filter((c:any)=>c.status==='demonstrated'))Object.assign(c,{recheck_due:'2026-11-17',recheck_prompt:'Recheck CP2: Equivalence relations',needs_revisit:false});
    const text=await packet(fakeContext(tablesFrom(rows)),{project:'topology-1'});
    expect(text).not.toMatch(/WARM|Recheck CP/);
  });
  it('with every flag off the legacy resume (WARM and all) is unchanged',async()=>{
    const rows=rowsFor(PRODUCTION);
    for(const c of rows.checkpoints.filter((c:any)=>c.status==='demonstrated'&&c.project_id==='proj-topology-1'))Object.assign(c,{recheck_due:'2026-11-17',recheck_prompt:'Recheck CP2: Equivalence relations'});
    const text=await packet(fakeContext(tablesFrom(rows)),{project:'topology-1'});
    expect(text).toContain('WARM CP');expect(text).toContain('Ask WARM questions first');expect(text).not.toContain('TIME today');
  });
  it('a recheck due today appears in QUEUE, not as WARM, and is mandatory when it feeds today\'s checkpoint',async()=>{
    const rows=rowsFor(PRODUCTION,{flags:on});
    rows.conceptLinks=[{from_id:'c-topology-1-1',to_id:'c-topology-1-4',kind:'prereq'}];
    rows.evidence=[{id:1,occurred_at:'2026-11-15T04:00:00Z',session_id:'s-topology-1-0',concept_id:'c-topology-1-1',level:'use',role:'primary',outcome:'fail',hint_level:0,novelty:'novel',kind:'attempt',voided_at:null},
      {id:2,occurred_at:'2026-11-15T04:30:00Z',session_id:'s-topology-1-0',concept_id:'c-topology-1-1',level:'use',role:'primary',outcome:'pass',hint_level:0,novelty:'novel',kind:'attempt',voided_at:null}];
    const text=await packet(fakeContext(tablesFrom(rows)),{project:'topology-1'});
    expect(text).toMatch(/recheck Concept topology-1 1\/use ~3m mandatory_prereq/);
    expect(text).toMatch(/RECHECK Concept topology-1 1\/use: Apply "Concept topology-1 1"/);
  });
  it('writes only the derived rechecks cache (never a fact) while reading',async()=>{
    const writes:any[]=[];
    const rows=rowsFor(PRODUCTION,{flags:on});
    rows.evidence=[{id:1,occurred_at:'2026-11-15T04:00:00Z',session_id:'s-topology-1-0',concept_id:'c-topology-1-1',level:'use',role:'primary',outcome:'pass',hint_level:3,novelty:'novel',kind:'attempt',voided_at:null}];
    await packet(fakeContext(tablesFrom(rows),writes),{project:'topology-1'});
    expect(new Set(writes.map(w=>w.table))).toEqual(new Set(['rechecks']));
    expect(writes.find(w=>w.op==='insert')?.values[0].prompt).not.toMatch(/^Recheck CP/);
  });
});
describe('get(what=time|queue|feasibility|forecast)',()=>{
  const ctx=()=>fakeContext(tablesFrom(rowsFor(PRODUCTION,{flags:on})));
  it('time returns the per-project blocks; queue and feasibility are server-computed',async()=>{
    expect(await get(ctx(),{what:'time',project:'topology-1'})).toContain('study_days_left=4 (incl. today)');
    expect(await get(ctx(),{what:'queue'})).toMatch(/^QUEUE \d+m review, \d+m learning of 240m/);
    const f=await get(ctx(),{what:'feasibility',project:'topology-1'});
    expect(f).toMatch(/topology-1: supply \d+m .* slack -\d+m/);expect(f).toContain('PRUNE');
  });
  it('forecast is labelled an estimate and is the only place a projection appears',async()=>{
    const f=await get(ctx(),{what:'forecast',project:'topology-1'});
    expect(f).toContain('FORECAST (estimate');
    expect(await packet(ctx(),{project:'topology-1'})).not.toMatch(/study days at the current capacity/);
  });
});
