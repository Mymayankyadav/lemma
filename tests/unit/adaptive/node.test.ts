import {describe,expect,it,vi,beforeAll,afterAll} from 'vitest';
vi.mock('../../../supabase/functions/mcp/deps.ts',()=>({createClient:()=>({}),McpServer:class{},createMcpHandler:()=>({}),z:{}}));
import {packet} from '../../../supabase/functions/mcp/packet';
import {get} from '../../../supabase/functions/mcp/tools/read';
import {assemble} from '../../../supabase/functions/_shared/adaptive/facts';
import {renderNode,findConcept} from '../../../supabase/functions/_shared/adaptive/node';
import {fakeContext,tablesFrom} from './fakedb';
import {rowsFor,NOW,type P} from './rows';

beforeAll(()=>{vi.useFakeTimers();vi.setSystemTime(NOW)});
afterAll(()=>vi.useRealTimers());
const one:P[]=[{slug:'topology-1',cps:12,done:3,stages:3,target:'2026-11-20'}];
const tok=(t:string)=>Math.ceil(t.length/3);
let id=0;
const ev=(over:any={})=>({id:++id,occurred_at:'2026-11-16T10:0'+(id%10)+':00Z',session_id:'s-topology-1-0',concept_id:'c-topology-1-1',level:'use',role:'primary',outcome:'pass',hint_level:0,novelty:'novel',kind:'attempt',origin:'tutor',confidence:1,ctx:{},voided_at:null,...over});
const rowsWith=(flags:any,evs:any[]=[])=>{const r:any=rowsFor(one,{flags:{time_block:true,recheck_v2:true,...flags}});r.evidence=evs;r.sessions.forEach((s:any,i:number)=>Object.assign(s,{number:i+1}));return r};
const run=(r:any,a:any)=>{const s=assemble(r,NOW);return renderNode(s,r,a)};

describe('get(what=node) budgets and provenance (§11)',()=>{
  const evs=Array.from({length:200},(_,i)=>ev({outcome:i%3?'pass':'fail',hint_level:i%4,level:['use','understand','recall'][i%3],session_id:'s-topology-1-'+(i%3)}));
  const r=rowsWith({atlas_memory:true},evs);
  it('card ≤ 100 tokens, digest ≤ 300, raw ≤ 1500, trail ≤ 600',()=>{
    r.conceptLinks=[{from_id:'c-topology-1-2',to_id:'c-topology-1-1',kind:'prereq'},{from_id:'c-topology-1-1',to_id:'c-topology-1-3',kind:'prereq'}];
    const card=run(r,{id:'c-topology-1-1'});expect(card.split('\n')).toHaveLength(1);expect(tok(card.replace(/^NODE /,''))).toBeLessThanOrEqual(100);
    const digest=run(r,{id:'c-topology-1-1',depth:'digest'});expect(tok(digest.slice(digest.indexOf('DIGEST')))).toBeLessThanOrEqual(305);
    const raw=run(r,{id:'c-topology-1-1',depth:'raw'});expect(tok(raw.slice(raw.indexOf('RAW')))).toBeLessThanOrEqual(1500);expect(raw).toMatch(/more: cursor=\d+/);
    const trail=run(r,{id:'c-topology-1-1',trail:true});expect(tok(trail.slice(trail.indexOf('\n')+1))).toBeLessThanOrEqual(600);expect(trail).toMatch(/PRE .*\n.*NEXT /s);
  });
  it('raw is paged, newest first, with no gap or repeat across pages',()=>{
    const p1=run(r,{id:'c-topology-1-1',depth:'raw'});const n=Number(/cursor=(\d+)/.exec(p1)![1]);
    const p2=run(r,{id:'c-topology-1-1',depth:'raw',cursor:String(n)});
    const ids=(t:string)=>[...t.matchAll(/ev:(\d+) /g)].map(m=>Number(m[1]));
    const a=ids(p1),b=ids(p2);expect(new Set([...a,...b]).size).toBe(a.length+b.length);expect(Math.max(...b)).toBeLessThan(Math.min(...a));
    expect(a.length+b.length).toBeLessThanOrEqual(200);
  });
  it('every digest line names the evidence it came from (I9) and is rebuilt from evidence only (I10)',()=>{
    const d=run(r,{id:'c-topology-1-1',depth:'digest'}).split('\n').filter(l=>/ \[ev:/.test(l));
    expect(d.length).toBeGreaterThan(0);for(const l of d)expect(l).toMatch(/\[ev:\d+(,\d+)*\]$/);
    const voided=rowsWith({atlas_memory:true},evs.map((e,i)=>i>=100?{...e,voided_at:'2026-11-17T00:00:00Z'}:e));   // the newest 100 are voided
    const ids=(t:string)=>new Set([...t.matchAll(/\[ev:([\d,]+)\]/g)].flatMap(m=>m[1].split(',').map(Number)));
    const live=ids(run(voided,{id:'c-topology-1-1',depth:'digest'}));
    expect(live.size).toBeGreaterThan(0);for(const e of evs.slice(100))expect(live.has(e.id)).toBe(false);
    expect(run(voided,{id:'c-topology-1-1',depth:'raw'})).toContain('(voided)');          // raw is the audit trail: it still shows them, marked
  });
  it('a concept is found by id, slug or name; ambiguity and misses are explained, never guessed',()=>{
    r.concepts.push({id:'x1',name:'Dup',slug:'dup',parent_id:null},{id:'x2',name:'Dup',slug:'dup',parent_id:null});
    expect(findConcept(r,'c-topology-1-1')).toHaveProperty('concept');
    expect((findConcept(r,'dup') as any).error).toMatch(/Several concepts/);expect((findConcept(r,'nope') as any).error).toMatch(/No concept/);expect((findConcept(r,undefined) as any).error).toMatch(/Provide id/);
  });
  it('a system carries a roll-up of its planets, weakest first',()=>{
    const rr=rowsWith({},[ev({concept_id:'c-topology-1-2',level:'understand',outcome:'fail'}),ev({concept_id:'c-topology-1-3',level:'understand'}),ev({concept_id:'c-topology-1-3',level:'understand'})]);
    rr.concepts[0].parent_id=null;rr.concepts[1].parent_id='c-topology-1-1';rr.concepts[2].parent_id='c-topology-1-1';
    const t=run(rr,{id:'c-topology-1-1'});expect(t).toMatch(/PLANETS 2; weakest: Concept topology-1 2 /);
  });
});
describe('classes pooled across subjects',()=>{
  it('evidence on one member of an alias class shows on the other, and one recheck is made under the nearer deadline',()=>{
    const rr:any=rowsWith({},[ev({outcome:'fail'}),ev({outcome:'pass',hint_level:0})]);
    rr.aliases=[{concept_a:'c-topology-1-1',concept_b:'c-topology-1-2'}];
    const s=assemble(rr,new Date('2026-11-18T06:00:00Z'));
    expect(s.classOf('c-topology-1-2')).toBe('c-topology-1-1');
    expect(renderNode(s,rr,{id:'c-topology-1-2'})).toMatch(/ Us1\/2[~ ]/);
    expect(s.rechecks.rechecks.filter(x=>x.state==='open')).toHaveLength(1);
  });
  it('without aliases each concept is its own class (identity)',()=>{
    const s=assemble(rowsWith({}),NOW);expect(s.classOf('c-topology-1-2')).toBe('c-topology-1-2');
  });
});
describe('assumptions (§9.5)',()=>{
  const mk=(over:any={})=>({id:'a1',concept_id:'c-topology-1-1',level:'understand',mean_at:0.7,revoked_at:null,created_at:'2026-11-15T10:00:00Z',...over});
  it('a later fail on the assumed class and level withdraws it: a T5 recheck at that level',()=>{
    const rr:any=rowsWith({},[ev({level:'understand',outcome:'fail',occurred_at:'2026-11-16T10:00:00Z'})]);rr.assumptions=[mk()];
    const s=assemble(rr,NOW);const t5=s.rechecks.rechecks.filter(x=>x.origin_codes.includes('T5'));
    expect(t5).toHaveLength(1);expect(t5[0].level).toBe('understand');expect(t5[0].prompt).not.toMatch(/^Recheck CP/);
  });
  it('an explicit revoke also triggers T5; a standing assumption triggers nothing and shows on the card',()=>{
    const rr:any=rowsWith({});rr.assumptions=[mk({revoked_at:'2026-11-16T09:00:00Z'})];
    expect(assemble(rr,NOW).rechecks.rechecks.some(x=>x.origin_codes.includes('T5'))).toBe(true);
    const live:any=rowsWith({});live.assumptions=[mk()];
    const s=assemble(live,NOW);expect(s.rechecks.rechecks).toEqual([]);expect(renderNode(s,live,{id:'c-topology-1-1'})).toMatch(/assume:\[un~\.7\]/);
  });
  it('undoing the failing evidence undoes the withdrawal exactly (I7)',()=>{
    const bad=ev({level:'understand',outcome:'fail',occurred_at:'2026-11-16T10:00:00Z'});
    const a:any=rowsWith({},[bad]);a.assumptions=[mk()];const b:any=rowsWith({},[{...bad,voided_at:'2026-11-17T00:00:00Z'}]);b.assumptions=[mk()];
    expect(assemble(a,NOW).rechecks.rechecks.length).toBe(1);expect(assemble(b,NOW).rechecks.rechecks).toEqual([]);
  });
});
describe('resume brief and flags (flag-gated)',()=>{
  const ctx=(flags:any,evs:any[]=[])=>fakeContext(tablesFrom(rowsWith(flags,evs)));
  it('node cards appear in BRIEF only with atlas_memory, within the resume budget',async()=>{
    const evs=[ev({level:'understand'}),ev({level:'use'})];
    const on=await packet(ctx({atlas_memory:true},evs),{project:'topology-1'});const off=await packet(ctx({},evs),{project:'topology-1'});
    expect(on).toMatch(/\nNODE Concept topology-1 \d+ R/);expect(off).not.toMatch(/\nNODE /);expect(tok(on)).toBeLessThanOrEqual(1500);
  });
  it('the Beta LBU flag is gone with the Beta model, even with the old proficiency flag on',async()=>{
    const used=Array.from({length:5},()=>ev({role:'used'}));
    expect(await packet(ctx({proficiency:true},used),{project:'topology-1'})).not.toMatch(/LBU/);
    expect(await packet(ctx({},used),{project:'topology-1'})).not.toMatch(/LBU/);
  });
  it('get(what=node) and get(what=calibration) answer through the real get()',async()=>{
    const evs=Array.from({length:8},(_,i)=>ev({outcome:i%4?'pass':'fail'}));
    const c=ctx({atlas_memory:true},evs);
    expect(await get(c,{what:'node',id:'c-topology-1-1',depth:'digest'})).toMatch(/^NODE .*\nDIGEST\n/s);
    expect(await get(c,{what:'calibration'})).toMatch(/^CALIBRATION .*\npredictions 0\n.*predictions start with Atlas v3/s);
    expect(await get(c,{what:'node',id:'nope'})).toMatch(/No concept/);
  });
});
