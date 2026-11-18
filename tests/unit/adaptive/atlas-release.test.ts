import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {modelFit,fitSql,diagnostics,releaseReport,betaImports} from '../../../scripts/atlas/release-core';

const T=Date.UTC(2026,10,1,10);
const rows=():any=>({settings:{capacity:{weekday_minutes:120}},projects:[{id:'p',last_study_on:'2026-12-01'}],checkpoints:[{id:'c',project_id:'p',position:1,status:'not_started',tier:'core'}],cpConcepts:[{checkpoint_id:'c',concept_id:'k'}],
 concepts:[{id:'s',name:'Sets',kind:'topic',level:'system'},{id:'k',name:'Compactness',kind:'result',parent_id:'s'}],sessions:[],
 attempts:Array.from({length:80},(_,i)=>({id:i+1,occurred_at:new Date(T+i*3600e3*5).toISOString(),session_id:'s'+(i%9),item_kind:'practice',tags:[{concept_id:'k',facet:'use',role:'target',stage:'E',result:i%4?'ok':'fail',hint_level:0}]})),
 instructionEvents:[{id:1,concept_id:'k',occurred_at:new Date(T-3600e3).toISOString()}]});

describe('N180 cutover release step',()=>{
 it('fits the v3 model deterministically, as version 3, and stores it with one parameter-safe insert',()=>{
  const a=modelFit(rows()),b=modelFit(rows());expect(a).toEqual(b);expect(a.params.version).toBe(3);
  const sql=fitSql('11111111-1111-4111-8111-111111111111',a);
  expect(sql).toMatch(/^insert into public\.model_fits\(user_id,input_hash,params,scores\) values\('11111111-1111-4111-8111-111111111111'::uuid,'[0-9a-f]+','\{.*\}'::jsonb,'\{.*\}'::jsonb\) on conflict \(user_id,input_hash\) do nothing;$/);
  expect(()=>fitSql("x'); drop table public.settings; --",a)).toThrow('uuid');
  expect(JSON.parse(sql.slice(sql.indexOf(",'{")+2,sql.indexOf("'::jsonb")))).toEqual(a.params);
 });
 it('reports exactly the four streams with integer counts, and the card token maximum',()=>{
  const fit=modelFit(rows()),d=diagnostics(rows(),fit,new Date(T+30*86400e3));
  expect(d.diagnostics.map(x=>x.stream)).toEqual(['attempt','card','duration','attendance']);
  for(const x of d.diagnostics){expect(Number.isInteger(x.n)).toBe(true);expect(x.n>=50?['ok','action']:['insufficient data']).toContain(x.status);}
  expect(d.diagnostics[0].n).toBe(80);expect(d.card_tokens_max).toBeGreaterThan(0);expect(d.card_tokens_max).toBeLessThanOrEqual(100);
 });
 it('builds the report atlas_v2_activate takes, with the production numbers next to the measured gates',()=>{
  const r=releaseReport({gates:{kf_kl_w1:.0375},diagnostics:[{stream:'attempt',n:3,status:'insufficient data'}],card_tokens_max:90,resume_tokens_max:1200,parity_ok:true,no_beta_imports:false});
  expect(r).toEqual({gates:{kf_kl_w1:.0375,card_tokens_max:90,resume_tokens_max:1200},diagnostics:[{stream:'attempt',n:3,status:'insufficient data'}],parity_ok:true,no_beta_imports:false});
 });
 it('finds every module that still imports the Beta proficiency model',()=>{
  expect(betaImports({'a.ts':"import {x} from './proficiency.ts';",'b.ts':"import type {Y} from '../_shared/adaptive/proficiency'",'c.ts':"import {z} from './measure.ts'",'proficiency.ts':'export const q=1'})).toEqual(['a.ts','b.ts']);
 });
 it('never exports a credential column (every exported table is checked against the capability registry)',()=>{
  const sql=readFileSync('scripts/atlas/export.sql','utf8'),tables=[...sql.matchAll(/from public\.([a-z_]+)/g)].map(m=>m[1]);
  expect(tables.length).toBeGreaterThan(15);
  for(const t of new Set(tables)){
   const doc=JSON.parse(readFileSync('docs/v6/capability-registry/'+t+'.json','utf8'));
   for(const [column,meta] of Object.entries<any>(doc.columns))if(meta.classification==='credential')expect(sql,t+'.'+column).toContain("-'"+column+"'");
  }
 });
});
