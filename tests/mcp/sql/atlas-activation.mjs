process.on('uncaughtException',error=>{console.error(error.message);if(error.where)console.error(error.where);process.exit(1);});
// N175: activation needs an approved dry-run diff, a v3 fit, a complete release report and an approved conversion for every active project.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const owner='11111111-1111-1111-1111-111111111111';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const good=()=>({gates:{kf_kl_w1:.031,kf_kl_w2:.044,kf_reduction_vs_v2:.52,attempt_calibration_slope_lo:.91,attempt_calibration_slope_hi:1.08,attempt_calibration_abs_intercept:.07,fatigue_abs_z:1.4,card_kl_vs_default:-.002,
 duration_log_density:-.61,duration_coverage_lo:.78,duration_coverage_hi:.83,attendance_log_loss:.55,e2e_p2c_minus_p0:.021,e2e_se_ratio:3.4,resume_tokens_max:1312,card_tokens_max:96},
 parity_ok:true,no_beta_imports:true,diagnostics:[{stream:'attempt',n:140,status:'ok'},{stream:'card',n:12,status:'insufficient data'},{stream:'duration',n:7,status:'insufficient data'},{stream:'attendance',n:60,status:'ok'}]});
try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema extensions;create table auth.users(id uuid primary key)');
 await db.exec("create function auth.uid() returns uuid language sql as $$select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,nullif(current_setting('test.uid',true),'')::uuid)$$");
 await db.exec("create function extensions.gen_random_bytes(n int) returns bytea language sql as $$select decode(repeat('00',n),'hex')$$;grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated");
 const dir=new URL('../../../supabase/migrations/',import.meta.url),names=(await readdir(dir)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort();
 for(const n of names){try{await db.exec(await readFile(new URL(n,dir),'utf8'));}catch(e){throw Error(n+': '+e.message);}}
 await q('insert into auth.users values($1)',[owner]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[owner,'a'.repeat(48)]);
 await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Math','M','cyan')",[id(1),owner]);
 await q("insert into public.projects(id,user_id,subject_id,slug,title,goal) values($1,$2,$3,'topology-a','A','Understand'),($4,$2,$3,'topology-b','B','Understand')",[id(2),owner,id(1),id(3)]);
 await q("insert into public.concepts(id,user_id,subject_id,slug,name) values($1,$2,$3,'compactness','Compactness')",[id(4),owner,id(1)]);
 await q("insert into public.sessions(id,user_id,project_id,number,goal,style) values($1,$2,$3,1,'Learn','socratic')",[id(5),owner,id(2)]);
 for(let i=0;i<5;i++)await q("insert into public.evidence(user_id,occurred_at,session_id,project_id,concept_id,level,outcome,kind,origin) values($1,$2,$3,$4,$5,'use','pass','attempt','migration')",[owner,new Date(Date.UTC(2026,10,1,10,0,i)).toISOString(),id(5),id(2),id(4)]);
 await q("select set_config('test.uid',$1,false)",[owner]);await q("select set_config('role','service_role',false)");
 const dry=(await q('select public.atlas_v2_migrate($1::jsonb) r',[JSON.stringify({owner})]))[0].r;
 await q('select public.atlas_v2_migrate($1::jsonb)',[JSON.stringify({owner,dry_run:false})]);
 // The Owner approves the hash of a dry run taken after the conversions (they add KCs, which the diff covers), so every call re-runs it.
 const currentHash=async()=>(await q('select public.atlas_v2_migrate($1::jsonb) r',[JSON.stringify({owner})]))[0].r.diff_hash;
 const activate=async report=>q('select public.atlas_v2_activate($1::jsonb)',[JSON.stringify({owner,approved_diff_hash:await currentHash(),release_report:report})]);
 const migrated=async()=>(await q('select atlas_migrated_at from public.settings'))[0].atlas_migrated_at;
 await assert.rejects(activate(good()),/Model fit/,'a v3 fit is required first');
 await q("insert into public.model_fits(user_id,input_hash,params,scores) values($1,'h','{\"version\":\"3\"}','{}')",[owner]);
 // the old self-asserted flag and an empty report are refused
 await assert.rejects(q('select public.atlas_v2_activate($1::jsonb)',[JSON.stringify({owner,approved_diff_hash:dry.diff_hash,release_gates_passed:true})]),/Release gate report required/,'a bare boolean is no longer evidence');
 await assert.rejects(activate({}),/Release gate report required/);
 // each gate: missing and failing
 for(const name of Object.keys(good().gates)){
  const missing=good();delete missing.gates[name];await assert.rejects(activate(missing),new RegExp('Release gate missing: '+name),name+' missing');
 }
 for(const [name,bad] of [['kf_kl_w1',.05],['kf_kl_w2',.06],['kf_reduction_vs_v2',.3],['attempt_calibration_slope_lo',.7],['attempt_calibration_slope_hi',1.3],['attempt_calibration_abs_intercept',.3],['fatigue_abs_z',3.5],['card_kl_vs_default',.01],['duration_log_density',-.9],['duration_coverage_lo',.6],['duration_coverage_hi',.95],['attendance_log_loss',.7],['e2e_p2c_minus_p0',0],['e2e_se_ratio',1.5],['resume_tokens_max',1600],['card_tokens_max',120]]){
  const r=good();r.gates[name]=bad;await assert.rejects(activate(r),new RegExp('Release gate failed: '+name),name+' failing');
 }
 const parity=good();parity.parity_ok=false;await assert.rejects(activate(parity),/parity/);
 const beta=good();beta.no_beta_imports=false;await assert.rejects(activate(beta),/Beta/);
 const noDiag=good();delete noDiag.diagnostics;await assert.rejects(activate(noDiag),/diagnostics/);
 const inAction=good();inAction.diagnostics[0].status='action';await assert.rejects(activate(inAction),/diagnostics for stream attempt/);
 const fakePass=good();fakePass.diagnostics[1].status='ok';await assert.rejects(activate(fakePass),/insufficient data/,'a stream with few events cannot claim a pass');
 // review: report values that are not measurements
 for(const bad of ['-Infinity','NaN','Infinity','0.01'])for(const name of ['kf_kl_w1','attendance_log_loss']){const r=good();r.gates[name]=bad;await assert.rejects(activate(r),/Release gate missing/,name+' as the string '+bad);}
 {const r=good();r.diagnostics=[];await assert.rejects(activate(r),/diagnostics for the four streams/,'no diagnostics');}
 {const r=good();r.diagnostics=r.diagnostics.slice(0,3);await assert.rejects(activate(r),/four streams/,'three streams');}
 {const r=good();r.diagnostics[2].stream='attempt';await assert.rejects(activate(r),/four streams/,'a repeated stream');}
 {const r=good();delete r.diagnostics[0].n;await assert.rejects(activate(r),/integer event count/,'no n');}
 {const r=good();r.diagnostics[0].n=60.5;await assert.rejects(activate(r),/integer event count/,'fractional n');}
 {const r=good();r.diagnostics[0].n='140';await assert.rejects(activate(r),/integer event count/,'n as a string');}
 {const r=good();r.diagnostics[0].n=3;r.diagnostics[0].status='action';await assert.rejects(activate(r),/must show insufficient data/,'thin data cannot be action either');}
 assert.equal(await migrated(),null,'nothing above activated the cutover');
 // the database's own check: every active project needs an approved conversion
 await assert.rejects(activate(good()),/2 project\(s\) without an approved conversion/);
 // a proposal merely marked approved (or approved with an empty conversion) is not an applied conversion
 await q("select set_config('role','postgres',false)").catch(()=>{});await db.exec('reset role');
 for(const p of [id(2),id(3)])await q("insert into public.proposals(user_id,project_id,kind,payload,origin,status) values($1,$2,'plan_change','{\"ops\":[],\"atlas_conversion\":{}}','other','approved')",[owner,p]);
 await q("select set_config('role','service_role',false)");
 await assert.rejects(activate(good()),/2 project\(s\) without an approved conversion/,'forged approvals do not count');
 await db.exec('reset role');await q("delete from public.proposals where user_id=$1",[owner]);
 // review recheck 2: even a row with every field filled in, inserted directly, is not an approval that was journalled
 await db.exec('reset role');
 for(const p of [id(2),id(3)])await q("insert into public.proposals(user_id,project_id,kind,payload,origin,status,decided_at,result) values($1,$2,'plan_change',$3::jsonb,'other','approved',now(),'{}'::jsonb)",[owner,p,JSON.stringify({ops:[],atlas_conversion:{schema:'plan_template_v1',checkpoints:[],map:{},kcs:[],cards:[]}})]);
 await q("select set_config('role','service_role',false)");
 await assert.rejects(activate(good()),/2 project\(s\) without an approved conversion/,'a fully formed forged row is not a journalled approval');
 await db.exec('reset role');await q('delete from public.proposals where user_id=$1',[owner]);
 // real conversions: drafted by the connector, approved by the owner
 const cp={id:'t1',title:'Unit',objective:'Understand',criterion:{text:'Prove',concept_id:'k',facet:'use',kind:'holdout',novel:true,cued:[]},kind:'learn',tier:'core',estimate:60,kcs:[{id:'k',kind:'definition',home:'x'}],steps:['a'],prereqs:[],teach:['t'],practice:[1,2,3].map(i=>({text:'p'+i})),close:{questions:['a','b','c'],minutes:8},card_plan:[]};
 const conversion={schema:'plan_template_v1',checkpoints:[cp],map:{},kcs:[{id:'k',name:'Convert KC',kind:'definition'}],cards:[]},op=()=>crypto.randomUUID();
 const approvals={};
 for(const p of [id(2),id(3)]){
  await q("select set_config('role','service_role',false)");
  const made=(await q('select public.atlas_conversion_command($1::jsonb) r',[JSON.stringify({schemaVersion:1,operationId:op(),resource:'plan_conversions',operation:'create',patch:{project_id:p,conversion}})]))[0].r;
  const pid=made.changed[0].id,version=(await q('select version from public.proposals where id=$1',[pid]))[0].version;
  await db.exec('reset role');await q("select set_config('test.uid',$1,false)",[owner]);await db.exec('set role authenticated');
  const receipt=(await q('select public.atlas_conversion_command($1::jsonb) r',[JSON.stringify({schemaVersion:1,operationId:op(),resource:'plan_conversions',operation:'approve',target:{id:pid},expectedVersion:Number(version),patch:{}})]))[0].r;
  approvals[p]={pid,actionNo:receipt.actionNo};
 }
 // an approval that was undone no longer counts; approving again does
 await db.exec('reset role');await q("select set_config('test.uid',$1,false)",[owner]);await db.exec('set role authenticated');
 await q('select public.undo_action($1,$2,false)',[owner,approvals[id(3)].actionNo]);
 await db.exec('reset role');await q("select set_config('role','service_role',false)");
 await assert.rejects(activate(good()),/1 project\(s\) without an approved conversion/,'an undone approval does not count');
 {const version=(await q('select version from public.proposals where id=$1',[approvals[id(3)].pid]))[0].version;
  await db.exec('reset role');await q("select set_config('test.uid',$1,false)",[owner]);await db.exec('set role authenticated');
  await q('select public.atlas_conversion_command($1::jsonb) r',[JSON.stringify({schemaVersion:1,operationId:op(),resource:'plan_conversions',operation:'approve',target:{id:approvals[id(3)].pid},expectedVersion:Number(version),patch:{}})]);}
 await db.exec('reset role');await q("select set_config('role','service_role',false)");

 const done=(await activate(good()))[0].atlas_v2_activate;
 assert.equal(done.activated,true);assert.ok(await migrated(),'activation sets atlas_migrated_at');
 // the owner export covers every Atlas fact table (it is registry-based, so a registered table cannot be forgotten)
 for(const table of ['attempts','attempt_tags','instruction_events','atlas_links']){
  const page=(await q('select public.lemma_export_page_for($1,$2,null,100) r',[owner,table]))[0].r;
  assert.ok(page&&Array.isArray(page.rows),table+' is exportable');
  if(table==='attempts')assert.ok(page.rows.length>0,'migrated attempts are exported');
 }
 console.log('PASS N175 activation: structured release report, every gate, per-stream diagnostics and approved conversions');
}finally{await db.close();}
