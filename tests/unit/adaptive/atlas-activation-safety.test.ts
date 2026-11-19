import {describe,expect,it,vi,beforeAll,afterAll} from 'vitest';
vi.mock('../../../supabase/functions/mcp/deps.ts',()=>({createClient:()=>({}),McpServer:class{},createMcpHandler:()=>({}),z:{}}));
import {applyScheduler,resumeBlocks,renderAtlasQueue} from '../../../supabase/functions/mcp/adaptive';
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

describe('N186: the v3 resume queue names the project of every item that is not the resumed one',()=>{
 const three:P[]=[{slug:'topology-1',cps:12,done:2,stages:3,target:'2026-11-24'},{slug:'algebra-1',cps:12,done:2,stages:3,target:'2026-11-24'},{slug:'analysis-1',cps:12,done:2,stages:3,target:'2026-11-24'}];
 const lines=(text:string)=>text.slice(text.indexOf('QUEUE\n')+6).split('\nBRIEF')[0].split('\n').filter(l=>/^\d+\. /.test(l));
 it('a project resume lists its own items first, untagged, then the others tagged with their project',()=>{
  const rows=migrated(rowsFor(three)),s=assemble(rows,NOW),t=resumeBlocks(s,rows,'algebra-1','',{}),q=lines(t);
  expect(q.length).toBeGreaterThan(0);
  const tagged=q.map(l=>/^\d+\. \w+ \[([\w-]+)\] /.exec(l)?.[1]??null);
  expect(tagged.every(x=>x!=='algebra-1')).toBe(true);                    // the resumed project is never tagged
  const firstTagged=tagged.findIndex(x=>x!==null);
  if(firstTagged>=0)expect(tagged.slice(firstTagged).every(x=>x!==null)).toBe(true);   // untagged (own) items come before every tagged one
  expect(tagged.filter(x=>x!==null).every(x=>['topology-1','analysis-1'].includes(x as string))).toBe(true);
 });
 it('without a project every item is tagged; with one project nothing is',()=>{
  const rows=migrated(rowsFor(three)),all=lines(resumeBlocks(assemble(rows,NOW),rows,undefined,'',{}));
  expect(all.length).toBeGreaterThan(0);for(const l of all)expect(l).toMatch(/^\d+\. \w+ \[(topology-1|algebra-1|analysis-1)\] /);
  const solo=migrated(rowsFor(one)),q=lines(resumeBlocks(assemble(solo,NOW),solo,'topology-1','',{}));
  expect(q.length).toBeGreaterThan(0);for(const l of q)expect(l).not.toMatch(/\[[\w-]+\] /);
 });
});

describe('N186: card reviews belong to a project too',()=>{
 const three:P[]=[{slug:'topology-1',cps:12,done:2,stages:3,target:'2026-11-24'},{slug:'algebra-1',cps:12,done:2,stages:3,target:'2026-11-24'},{slug:'analysis-1',cps:12,done:2,stages:3,target:'2026-11-24'}];
 // a due card for the first concept of every project, written through a note of that project (a card has no project of its own)
 const withCards=()=>{
  const rows:any=migrated(rowsFor(three));rows.notes=[];rows.cards=[];rows.instructionEvents=[];
  for(const p of rows.projects){const cp=rows.checkpoints.find((c:any)=>c.project_id===p.id),k=rows.cpConcepts.find((x:any)=>x.checkpoint_id===cp.id).concept_id;
   rows.notes.push({id:'n-'+p.slug,project_id:p.id,concept_id:k,created_at:'2026-10-01T00:00:00Z'});rows.cards.push({id:'cd-'+p.slug,note_id:'n-'+p.slug});
   rows.instructionEvents.push({id:rows.instructionEvents.length+1,concept_id:k,occurred_at:'2026-10-01T10:00:00Z'});}
  return rows;
 };
 it('a card review carries the project of its note as `home`, and no project_id, so no minute cap applies to it',()=>{
  const rows=withCards(),v=assembleAtlas(rows,NOW),reviews=v.queue.items.filter(a=>a.kind==='review');
  expect(new Set(reviews.map(r=>r.home)).size).toBe(3);
  for(const r of reviews){expect(r.project_id).toBeUndefined();expect(rows.projects.find((p:any)=>p.id===r.home)?.slug).toBe(String(r.card_id).replace('cd-',''));}
 });
 it('in the resume, reviews are tagged like every other item: untagged when they are the resumed project\'s, tagged otherwise, and listed after the resumed project\'s own',()=>{
  const rows=withCards(),v=assembleAtlas(rows,NOW),items=v.queue.items;
  const q=(id?:string)=>renderAtlasQueue(items,rows,id,50).split('\n').slice(1);
  const forAlgebra=q(rows.projects.find((p:any)=>p.slug==='algebra-1').id),review=(l:string)=>/^\d+\. review /.test(l);
  const reviewLines=forAlgebra.filter(review);expect(reviewLines.length).toBeGreaterThan(0);
  for(const l of reviewLines)expect(l.includes('[algebra-1]')).toBe(false);
  const tags=new Set(reviewLines.map(l=>/\[([\w-]+)\] /.exec(l)?.[1]??'(own)'));
  expect([...tags].sort()).toEqual(['(own)','analysis-1','topology-1']);                    // all three projects' reviews are in the queue, each named by its own project
  const own=forAlgebra.map(l=>/\[[\w -]+\] /.test(l));const firstTagged=own.indexOf(true);if(firstTagged>=0)expect(own.slice(firstTagged).every(Boolean)).toBe(true);
  const none=q(undefined).filter(review);for(const l of none)expect(l).toMatch(/\[(topology-1|algebra-1|analysis-1)\] /);
 });
 it('an item with no project at all is tagged [no project] rather than left bare',()=>{
  const rows=withCards(),text=renderAtlasQueue([{id:'x',kind:'review',concept_id:rows.concepts[0].id,reason:'due',minutes:.5,p:.5}],rows,undefined);
  expect(text).toMatch(/^QUEUE\n1\. review \[no project\] /);
  expect(renderAtlasQueue([{id:'x',kind:'review',concept_id:rows.concepts[0].id,reason:'due',minutes:.5,p:.5}],rowsFor(one) as any,undefined)).not.toMatch(/\[/);   // one project: nothing is tagged
 });
});
