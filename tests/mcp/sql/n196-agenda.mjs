// Isolated SQL gate. PGLite runs locally; NOTIF_TEST_DATABASE_URL uses the existing native PG17 fixture.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readdir,readFile,access} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../../..');
const foundation=process.env.N196_FOUNDATION_DIR||root;
const fixture=pathToFileURL(resolve(foundation,'tests/mcp/sql/fixtures/n191-pg-fixture.mjs'));
const nativeFixture=await access(fixture).then(()=>true,()=>false);
const db=process.env.NOTIF_TEST_DATABASE_URL && nativeFixture ? await (await import(fixture)).openN191Postgres(process.env.NOTIF_TEST_DATABASE_URL)
  : new (await import(process.env.PGLITE_MODULE||'@electric-sql/pglite')).PGlite();
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
try {
  for(const role of ['anon','authenticated','service_role'])
    if(!(await q('select 1 from pg_roles where rolname=$1',[role])).length)await db.exec('create role '+role);
  await db.exec(`create schema auth; create schema extensions; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;`);
  await db.exec(`create function extensions.gen_random_bytes(n int) returns bytea language sql as $$select decode(repeat('00',n),'hex')$$;
    grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
  const paths=new Map();
  for(const dir of [foundation,root]){
    const migrations=resolve(dir,'supabase/migrations');
    for(const name of await readdir(migrations))
      if(name.endsWith('.sql')&&!name.includes('_storage')) paths.set(name,resolve(migrations,name));
  }
  for(const name of [...paths.keys()].sort()) await db.exec(await readFile(paths.get(name),'utf8'));
  const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
  for(const [id,key] of [[owner,'a'],[other,'b']]){
    await q('insert into auth.users(id) values($1)',[id]);
    await q('insert into public.settings(user_id,connector_secret) values ($1,$2)',[id,key.repeat(48)]);
    await q('insert into public.tasks(user_id,title,estimate_minutes) values ($1,$2,15)',[id,'task '+key]);
  }
  await db.exec('set role authenticated');
  await assert.rejects(q('select public.lemma_agenda_snapshot($1)',[other]),/permission denied|Verified owner/);
  await db.exec('reset role; set role service_role');
  const realCore=(await q("select to_regprocedure('public.lemma_planning_snapshot_mcp(uuid,text,jsonb)') is not null as present"))[0].present;
  if(!realCore){
    const [unknown]=await q('select public.lemma_agenda_snapshot($1) as host',[owner]);
    assert.equal(unknown.host.reason,'Evidence foundation unavailable');
    await db.exec(`reset role;create function public.lemma_planning_snapshot_mcp(p_owner uuid,p_kind text,p_args jsonb)
      returns jsonb language sql stable as $$ select jsonb_build_object('asOf',p_args->'p_as_of','watermark',p_args->'p_watermark')
        ||case when p_kind='calendar' then jsonb_build_object('status','ok','availability',null,'fixed','[]'::jsonb,
          'horizonEnd',p_args->'p_horizon_end') else '{"events":[],"nextAfter":null}'::jsonb end $$;
      set role service_role;`);
  }
  const [row]=await q('select public.lemma_agenda_snapshot($1) as host',[owner]), snapshot=row.host;
  assert.equal(snapshot.calendar.status,'ok');
  assert.equal(snapshot.watermark,snapshot.calendar.watermark);
  assert.deepEqual(snapshot.tasks.map(t=>t.title),['task a']);
  assert.equal(snapshot.rows.settings.connector_secret,undefined);
  const empty=snapshot.calendar.availability;
  assert.equal(empty,null,'unset capacity stays unknown');
  assert.ok(!JSON.stringify(snapshot).includes('task b'));
  console.log('N196 owner snapshot, SQL grants, clock, capacity and scope passed ('+(realCore?'N191':'independent contract fixture')+')');
  await db.exec('reset role');
  const subject=randomUUID(),project=randomUUID(),concept=randomUUID(),item=randomUUID();
  await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Math','M','cyan')",[subject,owner]);
  await q("insert into public.projects(id,user_id,subject_id,slug,title,goal) values($1,$2,$3,'algebra','Algebra','Prove')",[project,owner,subject]);
  await q("insert into public.concepts(id,user_id,subject_id,slug,name) values($1,$2,$3,'sets','Sets')",[concept,owner,subject]);
  await q("insert into public.items(id,user_id,origin,text,fingerprint) values($1,$2,'user_supplied','Synthetic proof item','n196-synthetic')",[item,owner]);
  await q(`insert into public.atlas_practice_bank(user_id,item_id,item_version,project_id,concept_id,facet,context,track,policy,bank,rubric,family,
    form,minutes,uncued,novel,valid_until) values($1,$2,1,$3,$4,'use','proof','track','p','bank','rubric','family','whole',15,true,true,now()+interval '3 days')`,
    [owner,item,project,concept]);
  await db.exec('set role service_role');
  const bankSql='select public.lemma_practice_bank_snapshot($1,statement_timestamp()) as bank';
  const [bank]=await q(bankSql,[owner]);assert.equal(bank.bank.length,1);assert.equal(bank.bank[0].arm,'atlas80');
  assert.deepEqual((await q(bankSql,[other]))[0].bank,[]);
  await db.exec('reset role');
  await q("update public.items set text='Revised exercise' where id=$1",[item]);
  await db.exec('set role service_role');
  assert.deepEqual((await q(bankSql,[owner]))[0].bank,[],'A revised item needs a current approved mapping');
  await db.exec('reset role');
  console.log('N196 registered bank owner scope, native route, and item-version invalidation passed');
  const today=(await q("select (now() at time zone 'UTC')::date::text as d"))[0].d;
  const shift=(date,days)=>new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
  const start=shift(today,-21), anchors=Array(12).fill(0), pairAnchors=JSON.stringify([anchors,anchors]);
  const trial=randomUUID(), course='test-'+trial;
  const certificate={track:course,bank:'bank1',rubric:'r1',policy:'p1',version:1,source:'randomized-pilot',
    validThrough:shift(today,7),routes:{'0-4':'hard72'},evidence:{'0-4':{atlas80:{n:100},hard72:{n:100,eligible:true,
      bounds:{transfer7:{lower:.1},abandon_rate:{upper:0},trigger_rate:{upper:0},feedback_share:{upper:0},idle_share:{upper:0}}}}}};
  const pairSql='select public.lemma_trial_assign($1,$2,$3::uuid[],$4::jsonb,$5::date) as arms';
  const users=Array.from({length:54},()=>randomUUID());
  await q('insert into auth.users(id) select unnest($1::uuid[])',[users]);
  await db.exec('set role authenticated');
  await assert.rejects(q('select * from public.atlas_practice_pairs'),/denied/);
  await assert.rejects(q('select public.lemma_trial_register($1,$2,$3,$4,$5)',[trial,'test',JSON.stringify(certificate),'hard72',start]),/denied|Research service/);
  await db.exec('reset role;set role service_role');
  const regSql='select public.lemma_trial_register($1,$2,$3,$4,$5)';
  const registration=[trial,'synthetic-fixture',JSON.stringify(certificate),'hard72',start];
  await q(regSql,registration);await q(regSql,registration);
  const marks=await q("select public.lemma_trial_advance($1,$2,true) as state",[trial,start]);
  assert.equal(marks[0].state.stop,'');
  const pairId=randomUUID(), first=[trial,pairId,users.slice(0,2),pairAnchors,start];
  let assigned;
  if(db.native) {
    const independent=()=>db.transaction(async client=>{await client.query('set local role service_role');return (await client.query(pairSql,first)).rows[0].arms;});
    const [a,b]=await Promise.all([independent(),independent()]);assert.deepEqual(a,b);assigned=a;
  }else assigned=(await q(pairSql,first))[0].arms;
  assert.deepEqual([...assigned].sort(),['atlas80','hard72']);
  assert.deepEqual((await q(pairSql,first))[0].arms,assigned);
  await assert.rejects(q(pairSql,[trial,pairId,users.slice(0,2).reverse(),pairAnchors,start]),/Conflicting/);
  const grade='select public.lemma_trial_outcome($1,$2,$3,$4,$5)';
  await assert.rejects(q(grade,[trial,users[0],shift(start,19),today,1]),/assessment/);
  for(let i=0;i<24;i++){
    const two=users.slice(2*i,2*i+2);
    const arms=i===0?assigned:(await q(pairSql,[trial,randomUUID(),two,pairAnchors,start]))[0].arms;
    assert.deepEqual([...arms].sort(),['atlas80','hard72']);
    for(let j=0;j<2;j++)await q(grade,[trial,two[j],shift(start,20),today,arms[j]==='hard72'?1:0]);
  }
  await assert.rejects(q(grade,[trial,users[0],shift(start,20),today,assigned[0]==='hard72'?0:1]),/Conflicting/);
  const over=(await q(pairSql,[trial,randomUUID(),users.slice(48,50),pairAnchors,start]))[0].arms;
  assert.deepEqual(over,['atlas80','atlas80']);
  for(const n of [7,14,21]){
    const d=shift(start,n);
    const [r]=await q('select public.lemma_trial_advance($1,$2,true) as state',[trial,d]);
    assert.equal(r.state.promoted,n===21);
    assert.deepEqual(r.state.grades,n===21?[24,24,24]:[0,0,0]);
    if(n===21){assert.ok(r.state.benefit[0]>5);assert.equal(r.state.harm.length,1);}
  }
  await assert.rejects(q('select public.lemma_trial_advance($1,$2,false)',[trial,today]),/Conflicting/);
  const idx=assigned.indexOf('hard72');
  const armSql="select public.lemma_trial_arm($1,$2,'p1','bank1','r1',$3::jsonb,$4) as arm";
  const permitted=await q(armSql,[users[idx],course,JSON.stringify(anchors),start+'T12:00:00Z']);
  assert.equal(permitted[0].arm,'hard72');
  assert.equal((await q(armSql,[users[idx],course,JSON.stringify(anchors),shift(start,14)+'T12:00:00Z']))[0].arm,'atlas80');
  assert.equal((await q(armSql,[users[1-idx],course,JSON.stringify(anchors),start+'T12:00:00Z']))[0].arm,'atlas80');
  const later=shift(today,7),[outage]=await q('select public.lemma_trial_advance($1,$2,false) as state',[trial,later]);
  assert.equal(outage.state.stop,'monitor_unavailable');
  assert.deepEqual((await q(pairSql,[trial,randomUUID(),users.slice(50,52),pairAnchors,later]))[0].arms,['atlas80','atlas80']);
  console.log('N196 paired retries, assessor dates, 24-pair cap, day-21 promotion, day-14 fallback and outage stop passed');
  for(const mode of ['late','harm','expired']){
    const id=randomUUID(),track='test-'+id,expiry=mode==='expired'?start:shift(today,7);
    await q(regSql,[id,'monitor-fixture',JSON.stringify({...certificate,track,validThrough:expiry}),'hard72',start]);
    const n=mode==='harm'?24:1;
    for(let i=0;i<n;i++){
      const subjects=users.slice(2*i,2*i+2), pair=(await q(pairSql,[id,randomUUID(),subjects,pairAnchors,start]))[0];
      for(const [j,person] of subjects.entries()){
        const reported=mode==='late'&&pair.arms[j]==='hard72'?shift(today,1):today;
        await q(grade,[id,person,shift(start,20),reported,pair.arms[j]==='hard72'?0:1]);
      }
    }
    for(const elapsed of [7,14,21]){
      const [step]=await q('select public.lemma_trial_advance($1,$2,true) as state',[id,shift(start,elapsed)]);
      if(mode==='expired'&&elapsed===7)assert.deepEqual((await q(pairSql,[id,randomUUID(),users.slice(50,52),pairAnchors,shift(start,7)]))[0].arms,['atlas80','atlas80']);
      if(elapsed===21&&mode!=='expired')assert.equal(step.state.stop,mode==='late'?'coverage':'harm');
    }
  }
  console.log('N196 late-report coverage stop, adverse-cohort harm stop and expired-certificate admission passed');


}finally{await db.close();}
