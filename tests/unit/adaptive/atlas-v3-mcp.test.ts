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
