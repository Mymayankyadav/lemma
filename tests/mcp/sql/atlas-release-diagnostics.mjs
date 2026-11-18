process.on('uncaughtException',error=>{console.error(error.message);if(error.where)console.error(error.where);process.exit(1);});
// N183: activation accepts a diagnostics stream in `action` only with its D1-D5 results and the serving change (07 Acceptance 3, I13).
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const owner='11111111-1111-1111-1111-111111111111';
const tests=(over={})=>({D1:true,D2:true,D3:true,D4:true,D5:null,...over});
// The production report of 2026-11-18: the attempt stream fails D2 only, so serving recalibrates (the Platt layer).
const report=(attempt)=>({gates:{kf_kl_w1:.037457,kf_kl_w2:.045318,kf_reduction_vs_v2:.561186,attempt_calibration_slope_lo:.900648,attempt_calibration_slope_hi:1.040587,attempt_calibration_abs_intercept:.157026,
 fatigue_abs_z:1.573236,card_kl_vs_default:-.004402,duration_log_density:-.655,duration_coverage_lo:.83,duration_coverage_hi:.83,attendance_log_loss:.56,e2e_p2c_minus_p0:.011401,e2e_se_ratio:3.620425,
 card_tokens_max:30,resume_tokens_max:872},parity_ok:true,no_beta_imports:true,
 diagnostics:[{stream:'attempt',n:149,...attempt},{stream:'card',n:0,status:'insufficient data'},{stream:'duration',n:5,status:'insufficient data'},{stream:'attendance',n:0,status:'insufficient data'}]});
const check=r=>q('select public.atlas_check_release_report($1,$2::jsonb)',[owner,JSON.stringify(r)]);
try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema extensions;create table auth.users(id uuid primary key)');
 await db.exec("create function auth.uid() returns uuid language sql as $$select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,nullif(current_setting('test.uid',true),'')::uuid)$$");
 await db.exec("create function extensions.gen_random_bytes(n int) returns bytea language sql as $$select decode(repeat('00',n),'hex')$$;grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated");
 const dir=new URL('../../../supabase/migrations/',import.meta.url),names=(await readdir(dir)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort();
 assert(names.includes('20261218000800_n183_atlas_release_diagnostics.sql'));
 for(const n of names){try{await db.exec(await readFile(new URL(n,dir),'utf8'));}catch(e){throw Error(n+': '+e.message);}}
 await q('insert into auth.users values($1)',[owner]);
 // still locked down: only the activation function calls it
 for(const role of ['anon','authenticated'])assert.equal((await q(`select has_function_privilege('${role}','public.atlas_check_release_report(uuid,jsonb)','execute') x`))[0].x,false,role);

 // accepted: a failing test with its serving change (the production case), and a plain pass
 await check(report({status:'action',tests:tests({D2:false}),actions:['recalibrating']}));
 await check(report({status:'ok',tests:tests()}));
 await check(report({status:'ok'}));                                      // the earlier report shape (no tests) still passes when ok
 // refused: `action` without the D1-D5 results or without the serving change
 await assert.rejects(check(report({status:'action'})),/diagnostics for stream attempt are action without D1-D5 results/,'bare action');
 await assert.rejects(check(report({status:'action',tests:tests({D2:false})})),/without D1-D5 results and the serving change/,'no actions');
 await assert.rejects(check(report({status:'action',tests:tests({D2:false}),actions:[]})),/serving change/,'empty actions');
 await assert.rejects(check(report({status:'action',tests:tests({D2:false}),actions:['']})),/serving change/,'blank action');
 await assert.rejects(check(report({status:'action',tests:tests(),actions:['recalibrating']})),/serving change/,'action with every test passing');
 {const t=tests({D2:false});delete t.D3;await assert.rejects(check(report({status:'action',tests:t,actions:['recalibrating']})),/D1-D5 results/,'a missing test');}
 await assert.rejects(check(report({status:'action',tests:tests({D2:'no'}),actions:['recalibrating']})),/D1-D5 results/,'a test that is not a boolean');
 // refused: claiming ok with a failed test, or any other status
 await assert.rejects(check(report({status:'ok',tests:tests({D2:false})})),/say ok with a failed test/);
 await assert.rejects(check(report({status:'insufficient data',tests:tests()})),/diagnostics for stream attempt are insufficient data/,'149 events are not thin data');
 // unchanged: thin data must say so, and the gates still bind
 await assert.rejects(check({...report({status:'ok'}),diagnostics:report({status:'ok'}).diagnostics.map((d,i)=>i===2?{...d,status:'action',tests:tests({D1:false}),actions:['x']}:d)}),/must show insufficient data/);
 {const r=report({status:'action',tests:tests({D2:false}),actions:['recalibrating']});r.gates.attempt_calibration_abs_intercept=.25;await assert.rejects(check(r),/attempt_calibration_abs_intercept/);}
 console.log('PASS N183 release diagnostics: action accepted only with D1-D5 and the serving change');
}finally{await db.close();}
