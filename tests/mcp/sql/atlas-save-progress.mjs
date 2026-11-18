process.on('uncaughtException',error=>{console.error(error.message);if(error.where)console.error(error.where);process.exit(1);});
// Differential test of the claim "Replaces function: save_progress ... same behaviour": until settings.atlas_migrated_at is set, the Atlas
// version must behave exactly like the previous one. Two disposable databases, one with every migration before Atlas v3 and one with all of them,
// receive the same legacy payloads under every flag combination; each result, error text and written row is compared.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const owner='11111111-1111-1111-1111-111111111111',U=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const [subject,project,cp,sess,cA,cB,otherSubject,cOther]=[1,2,3,4,5,6,7,8].map(U);
const dir=new URL('../../../supabase/migrations/',import.meta.url),all=(await readdir(dir)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort();
async function build(names){
 const db=new PGlite(),q=async(s,a=[])=>(await db.query(s,a)).rows;
 await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create schema extensions; create table auth.users(id uuid primary key)");
 await db.exec("create function auth.uid() returns uuid language sql as $a$ select nullif(current_setting('test.uid',true),'')::uuid $a$");
 await db.exec("create function extensions.gen_random_bytes(n int) returns bytea language sql as $b$select decode(repeat('00',n),'hex')$b$;grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated");
 for(const n of names)try{await db.exec(await readFile(new URL(n,dir),'utf8'));}catch(e){throw Error(n+': '+e.message);}
 await q('insert into auth.users(id) values($1)',[owner]);
 await q("insert into public.settings(user_id,connector_secret) values($1,$2)",[owner,'a'.repeat(48)]);
 await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Math','M','cyan'),($3,$2,'Other','O','cyan')",[subject,owner,otherSubject]);
 await q("insert into public.projects(id,user_id,subject_id,slug,title,goal) values($1,$2,$3,'topo','T','G')",[project,owner,subject]);
 // 'shared' exists in two subjects: the project's own subject must win
 await q("insert into public.concepts(id,user_id,subject_id,slug,name) values($1,$2,$3,'compactness','Compactness'),($4,$2,$3,'shared','Shared'),($5,$2,$6,'shared','Shared elsewhere')",[cA,owner,subject,cB,cOther,otherSubject]);
 await q("insert into public.checkpoints(id,user_id,project_id,code,position,title,objective,criterion,steps) values($1,$2,$3,'CP1',1,'T','O','C','[\"a\",\"b\",\"c\"]')",[cp,owner,project]);
 await q('insert into public.checkpoint_concepts(user_id,checkpoint_id,concept_id) values($1,$2,$3)',[owner,cp,cA]);
 await q("insert into public.sessions(id,user_id,project_id,number,goal,style,checkpoint_id) values($1,$2,$3,1,'g','s',$4)",[sess,owner,project,cp]);
 return {db,q};
}
const before=all.filter(n=>n<'20261218'),A=await build(before),B=await build(all);
const call=async({q},payload)=>{await q('begin');try{const r=(await q('select public.save_progress($1,$2,$3,$4::jsonb) r',[owner,project,sess,JSON.stringify(payload)]))[0].r;
 const state={r,events:await q("select kind,body,outcome,hint_level from public.session_events order by id"),
  evidence:await q("select e.level,e.role,e.outcome,e.hint_level,e.novelty,e.kind,e.origin,e.confidence,c.slug,c.subject_id=$1 own_subject from public.evidence e left join public.concepts c on c.id=e.concept_id order by e.id",[subject]),
  items:await q('select count(*)::int n from public.items'),cps:await q('select status,current_step,recheck_level,needs_revisit from public.checkpoints'),
  misc:await q('select label,times,resolved_at is not null resolved from public.misconceptions order by label'),session:await q('select resume_step,resume_question from public.sessions')};
 return {ok:state};}catch(e){return {error:e.message};}finally{await q('rollback');}};
const setFlags=async(flags)=>{for(const {q} of [A,B])await q('update public.settings set flags=$1::jsonb',[JSON.stringify(flags)]);};
const ev=(over={})=>({kind:'attempt',text:'tried it',outcome:'demonstrated',...over});
const events=[];
for(const kind of ['pretest','attempt','hint','explanation','evidence','recheck','note'])
 for(const outcome of [undefined,'demonstrated','partial','failed'])
  for(const extra of [{},{recall:true},{level:'transfer'},{concept:'compactness'},{concept:'shared'},{concept:'nonexistent'},{hint_level:2},{role:'secondary'},{novelty:'familiar'},{item:'Prove [0,1] is compact',fp:'1f-abc123'},{recall:true,concept:'compactness',hint_level:3},{checkpoint:'CP1'},{checkpoint:'CP9'},{concepts:['compactness']}])
   events.push(ev({kind,...(outcome?{outcome}:{outcome:undefined}),...extra}));
const shapes=[{},{step:2},{step:9},{step:'2'},{events:'x'},{events:{}},{events:['attempt']},{events:[null]},{events:[1]},{events:[]},{nope:1},{misconception:'sign error'},{misconception:''},{resolved:'sign error'},{next_question:'what next?'},{next_question:'x'.repeat(301)},
 {events:Array.from({length:11},()=>ev())},{events:[ev({text:''})]},{events:[ev({kind:'bogus'})]},{events:[ev({level:'bogus'})]},{events:[ev({role:'bogus'})]},{events:[ev({recall:'yes'})]},{events:[ev({concept:''})]},{step:2,events:[ev(),ev({kind:'evidence'})],misconception:'m',next_question:'q'},
 {events:[ev({kind:'evidence',outcome:'demonstrated'}),ev({kind:'recheck',outcome:'partial'})]}];
const cases=[...shapes,...events.map(e=>({events:[e]})),...[0,7,13,41,97,150,200].map(i=>({events:[events[i],events[(i*7+3)%events.length],events[(i*11+5)%events.length]],step:1+i%3}))];
let compared=0;const differences=[];
for(const flags of [{},{recheck_v2:true},{recheck_v2:true,items:true},{items:true}]){
 await setFlags(flags);
 for(const payload of cases){
  const a=await call(A,payload),b=await call(B,payload);compared++;
  try{assert.deepEqual(b,a);}catch{differences.push({flags,payload:JSON.stringify(payload).slice(0,160),main:JSON.stringify(a).slice(0,200),atlas:JSON.stringify(b).slice(0,200)});}
 }
}
console.log('compared',compared,'legacy cases;',differences.length,'differ');
assert.deepEqual(differences,[],'the Atlas save_progress must equal the previous one before cutover: '+JSON.stringify(differences.slice(0,3),null,1));
// The one intended difference before cutover: a structured attempt is refused, never silently dropped.
await setFlags({});
const structured={events:[ev({attempt:{kind:'practice',stages:[{stage:'E',result:'ok',tags:[{concept:'compactness',facet:'use',role:'target'}]}]}})]};
assert.deepEqual(await call(B,structured),{error:'Atlas v2 not migrated'});
assert.equal(Object.keys((await call(A,structured)).ok??{}).length>0,true,'the previous function ignored the unknown key');
// `concepts[]` on an explanation is ignored before cutover in both
for(const c of [A,B])assert.ok((await call(c,{events:[{kind:'explanation',text:'Compactness explained',concepts:['compactness']}]})).ok);
console.log('PASS save_progress before cutover equals the previous function on '+compared+' legacy payloads (only a structured attempt is refused)');
