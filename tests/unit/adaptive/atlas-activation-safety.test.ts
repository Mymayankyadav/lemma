import {describe,expect,it,vi,beforeAll,afterAll} from 'vitest';
vi.mock('../../../supabase/functions/mcp/deps.ts',()=>({createClient:()=>({}),McpServer:class{},createMcpHandler:()=>({}),z:{}}));
import {applyScheduler,resumeBlocks} from '../../../supabase/functions/mcp/adaptive';
import {assemble} from '../../../supabase/functions/_shared/adaptive/facts';
import {assembleAtlas,declaredBlocks} from '../../../supabase/functions/_shared/adaptive/atlas';
import {fakeContext,tablesFrom} from './fakedb';
import {rowsFor,NOW,type P} from './rows';

// N185: what the production cutover found before activation (docs/current/N185.md).
beforeAll(()=>{vi.useFakeTimers();vi.setSystemTime(NOW)});
afterAll(()=>vi.useRealTimers());
const one:P[]=[{slug:'topology-1',cps:39,done:3,stages:6,target:'2026-11-20'}];
const migrated=(rows:any)=>{rows.settings.atlas_migrated_at='2026-11-01T00:00:00Z';rows.scheduler_runs=[];rows.frozen=[];return rows;};
const ctx=(rows:any)=>({...fakeContext(tablesFrom(rows),[]),batch:[] as any[]});
const deferred=(c:any)=>c.batch.filter((op:any)=>op.table==='checkpoints'&&op.op==='update').map((op:any)=>op.where.id);

describe('10 §5: v3 pruning defers standard material only where the project allows it',()=>{
 it('without auto_prune_standard only venture checkpoints are deferred; core never',async()=>{
  const rows=migrated(rowsFor(one));rows.projects[0].auto_prune_standard=false;
  const tiers=new Set(rows.checkpoints.filter((x:any)=>x.status==='not_started').map((x:any)=>x.tier));expect(tiers.has('standard')&&tiers.has('venture')).toBe(true);
  const c=ctx(rows);await applyScheduler(c,NOW);
  const ids=deferred(c),tierOf=new Map(rows.checkpoints.map((x:any)=>[x.id,x.tier]));
  expect(ids.length).toBeGreaterThan(0);for(const id of ids)expect(tierOf.get(id)).toBe('venture');
 });
 it('a project of standard material: deferred only with auto_prune_standard, otherwise left for the Owner',async()=>{
  const std:P[]=[{slug:'topology-1',cps:39,done:3,stages:6,target:'2026-11-20',tiers:'nocore'}];
  const on=migrated(rowsFor(std));on.projects[0].auto_prune_standard=true;const c1=ctx(on);await applyScheduler(c1,NOW);
  expect(deferred(c1).length).toBeGreaterThan(0);for(const id of deferred(c1))expect(on.checkpoints.find((x:any)=>x.id===id).tier).toBe('standard');
  const off=migrated(rowsFor(std));off.projects[0].auto_prune_standard=false;const c2=ctx(off);await applyScheduler(c2,NOW);
  expect(deferred(c2)).toEqual([]);
 });
});

describe('10 §4: supply from the declared weekday capacity when no block is planned',()=>{
 const now=new Date('2026-11-18T06:00:00Z');
 it('one block per study day up to last_study_on, shared by the projects still running that day',()=>{
  const projects=[{last_study_on:'2026-11-20'},{last_study_on:'2026-11-19'}];
  const b=declaredBlocks(300,now,'2026-11-20',projects);
  expect(b.map(x=>x.minutes)).toEqual([150,150,300]);                  // 18th and 19th shared by two projects, the 20th by one
  expect(declaredBlocks([0,0,0,120,0,0,0],now,'2026-11-20',[{last_study_on:'2026-11-20'}]).map(x=>x.minutes)).toEqual([120]);   // only Wednesday has minutes
  expect(declaredBlocks(300,now,null,projects)).toEqual([]);
 });
 it('feasibility uses it: positive supply with capacity, zero without, and planned blocks win when they exist',()=>{
  const rows:any=rowsFor([{slug:'topology-1',cps:10,done:2,target:'2026-11-24',lastStudy:'2026-11-24'}]);
  rows.settings.capacity={weekday_minutes:120};
  const id=rows.projects[0].id,withCap=assembleAtlas(rows,now).fits[id].supply;
  expect(withCap).toBeGreaterThan(0);
  rows.settings.capacity={};expect(assembleAtlas(rows,now).fits[id].supply).toBe(0);
  rows.settings.capacity={weekday_minutes:120};rows.busy=[{id:'b',kind:'study',status:'planned',starts_at:'2026-11-19T10:00:00Z',ends_at:'2026-11-19T11:00:00Z'}];
  const planned=assembleAtlas(rows,now).fits[id].supply;expect(planned).toBeGreaterThan(0);expect(planned).toBeLessThan(withCap);   // one planned hour, not 7 days of capacity
 });
});

describe('04 §resume: the v3 resume keeps its context and the tutor rules',()=>{
 it('BRIEF keeps NOW, LAST, FIX, ADAPT, CARDS and SRC with Atlas cards; RULES keep the tutor rules and add the Atlas lines',()=>{
  const rows=migrated(rowsFor(one)),s=assemble(rows,NOW);
  const brief={now:'NOW CP4 step 1/4',last:'LAST S8 17 Nov',fix:'FIX swaps injective/surjective (1x)',adapt:'ADAPT D3 gap Selftest (2x, open)',cards:'CARDS 0 due',src:'SRC munkres pp 1-70',nodes:['Compactness [result] Rc .80']};
  const t=resumeBlocks(s,rows,'topology-1','- Work QUEUE top-down.',brief);
  expect(t.startsWith('RULES\n- Work QUEUE top-down.\nLog stages, cues and errors.')).toBe(true);
  for(const line of Object.values(brief).flat())expect(t).toContain(line as string);
  expect(t.indexOf('\nBRIEF\n')).toBeGreaterThan(t.indexOf('\nQUEUE'));expect(t).toMatch(/\nTIME today=\S+ .*fit=/);
  expect(resumeBlocks(s,rows,'topology-1','(rules as in the last resume)',brief)).toMatch(/^RULES\n\(rules as in the last resume\)\nTIME/);   // brief mode stays brief
 });
});
