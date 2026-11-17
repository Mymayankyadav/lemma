// Regression tests for the five defects reproduced in the PR #1493 review (chat-61724#v8q2).
import {describe,expect,it,vi,beforeAll,afterAll} from 'vitest';
vi.mock('../../../supabase/functions/mcp/deps.ts',()=>({createClient:()=>({}),McpServer:class{},createMcpHandler:()=>({}),z:{}}));
import {get} from '../../../supabase/functions/mcp/tools/read';
import {assemble} from '../../../supabase/functions/_shared/adaptive/facts';
import {renderNode} from '../../../supabase/functions/_shared/adaptive/node';
import {runJob,type JobState} from '../../../supabase/functions/_shared/adaptive/workers';
import {fakeContext,tablesFrom} from './fakedb';
import {rowsFor,PRODUCTION,NOW,type P} from './rows';

beforeAll(()=>{vi.useFakeTimers();vi.setSystemTime(NOW)});
afterAll(()=>vi.useRealTimers());
const one:P[]=[{slug:'topology-1',cps:12,done:3,stages:3,target:'2026-11-20'}];
let id=0;
const ev=(over:any={})=>({id:++id,occurred_at:'2026-11-15T04:00:00Z',session_id:'s-topology-1-0',concept_id:'c-topology-1-1',level:'use',role:'primary',outcome:'pass',
  hint_level:0,novelty:'novel',kind:'attempt',origin:'tutor',confidence:1,ctx:{},voided_at:null,...over});
const on={time_block:true,recheck_v2:true};

describe('1. mandatory prerequisites survive alias pooling',()=>{
  it('a prerequisite edge from a non-canonical alias member still makes its pooled recheck mandatory_prereq',()=>{
    const rows:any=rowsFor(PRODUCTION,{flags:on});
    // c-topology-1-1 is canonical (lowest id); the edge and the evidence use the other member, c-topology-1-2.
    rows.aliases=[{concept_a:'c-topology-1-2',concept_b:'c-topology-1-1'}];
    rows.conceptLinks=[{from_id:'c-topology-1-2',to_id:'c-topology-1-4',kind:'prereq'}];
    rows.evidence=[ev({concept_id:'c-topology-1-2',outcome:'fail'}),ev({concept_id:'c-topology-1-2',occurred_at:'2026-11-15T04:30:00Z'})];
    const s=assemble(rows,NOW);
    expect(s.classOf('c-topology-1-2')).toBe('c-topology-1-1');
    const item=s.queue.items.find(x=>x.type==='recheck');
    expect(item?.reason_code).toBe('mandatory_prereq');
  });
});
describe('2 and 3. get(what=node) through the real loader, with column projection',()=>{
  const ctx=(evs:any[])=>{
    const rows:any=rowsFor(one,{flags:{...on,atlas_memory:true}});
    rows.concepts[0]={...rows.concepts[0],slug:'compactness-slug',name:'Compactness theorem'};
    rows.evidence=evs;
    return fakeContext(tablesFrom(rows),[],{project:true});
  };
  it('finds a concept by slug',async()=>{
    const out=await get(ctx([ev()]),{what:'node',id:'compactness-slug'});
    expect(out).toMatch(/^NODE /);expect(out).not.toMatch(/No concept/);
  });
  it('raw history keeps voided rows, marked, while the digest excludes them',async()=>{
    const evs=[ev({id:9001}),ev({id:9002,outcome:'fail',voided_at:'2026-11-16T00:00:00Z'})];
    const raw=await get(ctx(evs),{what:'node',id:'compactness-slug',depth:'raw'});
    expect(raw).toMatch(/ev:9002 .*\(voided\)/);
    const digest=await get(ctx(evs),{what:'node',id:'compactness-slug',depth:'digest'});
    expect(digest).not.toMatch(/9002/);
  });
});
describe('4. node cards use the derived T5 withdrawal',()=>{
  const assumption={id:'a1',concept_id:'c-topology-1-1',level:'understand',mean_at:0.9,revoked_at:null,created_at:'2026-11-14T10:00:00Z'};
  it('a later failed understand probe removes the assumption from the card; undoing that evidence restores it',()=>{
    const rows:any=rowsFor(one,{flags:on});rows.assumptions=[assumption];
    rows.evidence=[ev({level:'understand',outcome:'fail',occurred_at:'2026-11-16T10:00:00Z'})];
    let s=assemble(rows,NOW);
    expect(s.withdrawn).toEqual(['a1']);
    expect(renderNode(s,rows,{id:'c-topology-1-1'})).toMatch(/assume:\[\]/);
    rows.evidence=[];                                         // undo removes the evidence row
    s=assemble(rows,NOW);
    expect(s.withdrawn).toEqual([]);
    expect(renderNode(s,rows,{id:'c-topology-1-1'})).toMatch(/assume:\[un~\.9\]/);
  });
});
describe('5. the worker token cap holds across retries',()=>{
  it('a 100-token success with a rolled-back write does not buy a second call past the cap, and the spend is reported',async()=>{
    const s:JobState={enabled:true,tokensToday:0,tokenCap:100,done:new Set()};
    let calls=0;const model=async()=>{calls++;return {json:[],input_tokens:90,output_tokens:10}};
    const r=await runJob(s,'scribe','S1',10,model,'p',()=>{throw new Error('rolled back')});
    expect(calls).toBe(1);expect(s.tokensToday).toBe(100);
    expect(r.telemetry).toMatchObject({status:'failed',attempts:1,input_tokens:90,output_tokens:10});
    expect(r.telemetry.error).toMatch(/token cap/);
  });
  it('a failed write followed by a successful retry reports the cumulative tokens',async()=>{
    const s:JobState={enabled:true,tokensToday:0,tokenCap:1000,done:new Set()};let n=0;
    const r=await runJob(s,'scribe','S2',10,async()=>({json:[],input_tokens:50,output_tokens:5}),'p',()=>{if(++n<2)throw new Error('x');return 1});
    expect(r.telemetry).toMatchObject({status:'ok',attempts:2,input_tokens:100,output_tokens:10});expect(s.tokensToday).toBe(110);
  });
});
