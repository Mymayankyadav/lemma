import {describe,it,expect,vi} from 'vitest';
vi.mock('../../../supabase/functions/mcp/deps.ts',()=>({createClient:()=>({}),McpServer:class{},createMcpHandler:()=>({}),z:{}}));
import {validateAttempt,renderAtlasRead} from '../../../supabase/functions/mcp/atlas';
import {saveProgress} from '../../../supabase/functions/mcp/tools/write';
import {assembleAtlas} from '../../../supabase/functions/_shared/adaptive/atlas';
import {validateStageSuggestions} from '../../../supabase/functions/_shared/adaptive/workers';
import {certificationChecks} from '../../../supabase/functions/_shared/adaptive/recheck';
import {replay} from '../../../supabase/functions/_shared/adaptive/measure';
import {fakeContext,tablesFrom} from './fakedb';
import {rowsFor,NOW} from './rows';
const attempt=()=>({kind:'practice',cued:[],confidence_before:.6,stages:[{stage:'E',result:'ok',hint:0,tags:[{concept:'compactness',facet:'use',role:'target'}]}]});
describe('Atlas MCP and app contract',()=>{
 it('validates ordered stages and all numeric fields before writes',()=>{expect(validateAttempt(attempt())).toEqual([]);expect(validateAttempt({...attempt(),minutes:Infinity})).toContain('Invalid minutes');expect(validateAttempt({...attempt(),stages:[...attempt().stages,...attempt().stages]}).join(' ')).toContain('without repeats');});
 it('rejects a structured attempt before cutover with the documented message',async()=>{const r=rowsFor([{slug:'topology',cps:2,done:1,target:'2026-11-24'}]),tables=tablesFrom(r),c=fakeContext(tables),p=tables.projects[0],s=tables.sessions[0];await expect(saveProgress(c,{project:p.slug,session:'S'+s.number,attempt:attempt()})).rejects.toThrow('Atlas v2 not migrated');});
 it('app and MCP produce identical profile values',()=>{const r=rowsFor([{slug:'topology',cps:2,done:1,target:'2026-11-24'}]),c=r.concepts[0],view=assembleAtlas(r,NOW),profile=JSON.parse(renderAtlasRead(r,{what:'profile',id:c.id},NOW));expect(profile.find((p:any)=>p.id===c.id).facets).toEqual(view.facets[c.id]);expect(Math.ceil(renderAtlasRead(r,{what:'plan_template'},NOW).length/3)).toBeLessThanOrEqual(800);});
 it('I14 workers cannot supply results, hints, errors or cues',()=>{const rows=validateStageSuggestions([{concept_id:'k',facet:'execute',role:'target',stage:'E',confidence:1,result:'ok',hint:0,error:'slip',cued:[]}],new Set(['k']));expect(rows).toEqual([{concept_id:'k',facet:'execute',role:'target',stage:'E',confidence:.9}]);});
 it('I18 certification checks dedupe and never fall on their creation day',()=>{const s=replay({concepts:[],attempts:[]}),target={concept_id:'k',facet:'execute' as const,teachDay:'2026-11-18',lastStudyOn:'2026-12-01'},checks=certificationChecks(s,[target,target],'2026-11-18');expect(checks).toHaveLength(1);expect(checks[0].due>'2026-11-18').toBe(true);expect(certificationChecks(s,[target],'2026-11-18',checks)).toEqual(checks);});
});

import {ATLAS_READS} from '../../../supabase/functions/mcp/atlas';
describe('Atlas MCP reads: every registered read renders (N173 contract coverage)',()=>{
 const r=rowsFor([{slug:'topology',cps:3,done:1,target:'2026-11-24'},{slug:'algebra',cps:3,done:0,target:'2026-11-30'}]);
 for(const what of ATLAS_READS)it(what+' returns a non-empty answer for a project and for no id',()=>{
  const slug=r.projects[0].slug,withId=renderAtlasRead(r,{what,id:slug},NOW);
  expect(typeof withId).toBe('string');expect(withId.length).toBeGreaterThan(1);
  if(what!=='plan_template'&&what!=='conversion_input'){const none=renderAtlasRead(r,{what},NOW);expect(typeof none).toBe('string');expect(none.length).toBeGreaterThan(1);}
  if(['atlas_settings','atlas_concepts','model_health','card_budget','probes','bridges','themes','theme','profile','conversion_input'].includes(what))expect(()=>JSON.parse(withId)).not.toThrow();
 });
 it('conversion_input needs a project and says so, never throwing something else',()=>{expect(()=>renderAtlasRead(r,{what:'conversion_input'},NOW)).toThrow('Project id or slug required');});
 it('model_health reports all four streams to the tutor',()=>{
  const h=JSON.parse(renderAtlasRead(r,{what:'model_health'},NOW)).health.map((x:any)=>x.stream);expect(h).toEqual(['attempt','card','duration','attendance']);
 });
});

describe('review fix 1: nothing a tutor sends before cutover loses the save',()=>{
 const setup=()=>{const r=rowsFor([{slug:'topology',cps:2,done:1,target:'2026-11-24'}]),tables=tablesFrom(r),c=fakeContext(tables);return {c,p:tables.projects[0],s:tables.sessions[0]};};
 it('an explanation carrying concepts[] passes the connector guard before cutover (the database ignores the key)',async()=>{
  const {c,p,s}=setup();let message='';
  try{await saveProgress(c,{project:p.slug,session:'S'+s.number,events:[{kind:'explanation',text:'Compactness explained',concepts:['compactness']}]});}catch(e){message=String(e);}
  expect(message).not.toContain('Atlas v2 not migrated');
 });
 it('a structured attempt, alone or inside an event, is still refused before cutover',async()=>{
  const {c,p,s}=setup();
  await expect(saveProgress(c,{project:p.slug,session:'S'+s.number,events:[{kind:'attempt',text:'tried',attempt:attempt()}]})).rejects.toThrow('Atlas v2 not migrated');
 });
 it('the static server instructions never tell a tutor to send structured attempts or concepts[]; the migrated resume rules do',async()=>{
  const {INSTRUCTIONS}=await import('../../../supabase/functions/mcp/rules');
  expect(INSTRUCTIONS).not.toMatch(/concepts\[\]|ordered stages/);
  const {resumeBlocks}=await import('../../../supabase/functions/mcp/adaptive');expect(typeof resumeBlocks).toBe('function');
 });
});

import {allPaged} from '../../../supabase/functions/mcp/atlas';
import {proposePlan} from '../../../supabase/functions/mcp/tools/write';
import {loadRows} from '../../../supabase/functions/mcp/adaptive';
describe('review fixes 11 and 15: plans after cutover, and what is loaded before it',()=>{
 it('after cutover propose_plan asks for the template, and validates it',async()=>{
  const r=rowsFor([{slug:'topology',cps:2,done:0,target:'2026-11-24'}]);r.settings.atlas_migrated_at='2026-11-01T00:00:00Z';
  const tables=tablesFrom(r),c=fakeContext(tables),p=tables.projects[0];
  await expect(proposePlan(c,{project:p.slug,checkpoints:[]})).rejects.toThrow('send a plan_template_v1 template');
  await expect(proposePlan(c,{project:p.slug,checkpoints:[],template:{schema:'plan_template_v1',checkpoints:[{id:'x'}]}})).rejects.toThrow('Plan validation:');
 });
 it('the Atlas tables are not read for an owner who has not migrated, though settings.atlas always has its default',async()=>{
  const r=rowsFor([{slug:'topology',cps:2,done:1,target:'2026-11-24'}]);expect(r.settings.atlas_migrated_at??null).toBeNull();
  const c=fakeContext(tablesFrom({...r,attempts:[{id:1,user_id:'u',occurred_at:'2026-11-01T00:00:00Z'}]}));
  const loaded=await loadRows(c,NOW);expect((loaded as any).attempts).toBeUndefined();
  r.settings.atlas_migrated_at='2026-11-01T00:00:00Z';
  const c2=fakeContext(tablesFrom({...r,attempts:[{id:1,user_id:r.settings.user_id??'u',occurred_at:'2026-11-01T00:00:00Z'}]}));
  expect(Array.isArray((await loadRows(c2,NOW) as any).attempts)).toBe(true);
 });
 it('reads a table larger than one page whole, in order',async()=>{
  const c0=fakeContext(tablesFrom(rowsFor([{slug:'topology',cps:2,done:1,target:'2026-11-24'}])));const rows=Array.from({length:2500},(_,i)=>({id:i+1,user_id:c0.userId,attempt_id:i}));
  const r=rowsFor([{slug:'topology',cps:2,done:1,target:'2026-11-24'}]),tables=tablesFrom(r,{attempt_tags:rows}),c=fakeContext(tables);
  const out=await allPaged(c,'attempt_tags');expect(out.length).toBe(2500);expect(out.map(x=>x.id)).toEqual(rows.map(x=>x.id));
 });
});
