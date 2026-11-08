// N52 PGlite stage: captures the owner preset/default at first timer start.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const checkEqual=(actual,expected,description)=>{
 const stack=new Error().stack?.split('\n')[2]||'';
 const at=Number(stack.match(/:(\d+):\d+\)?$/)?.[1]||0);
 let n=at,letters='';
 while(n>0){letters=String.fromCharCode(65+(n-1)%26)+letters;n=Math.floor((n-1)/26);}
 return assert.equal(actual,expected,description??('TIMER_ASSERT_AT_'+(letters||'UNKNOWN')));
};
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const owner='11111111-1111-1111-1111-111111111111';
const other='22222222-2222-2222-2222-222222222222';
const mkOp=n=>'bbbbbbbb-bbbb-4bbb-8bbb-'+String(n).padStart(12,'0');
try{
 await db.exec([
  'create role anon; create role authenticated; create role service_role;',
  'create schema auth;create schema extensions;create table auth.users(id uuid primary key);',
  "create function auth.uid() returns uuid language sql as $uid$ select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,nullif(current_setting('test.uid',true),'')::uuid) $uid$;",
  "create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$select decode(repeat('00',n),'hex')$bytes$;",
  'grant usage on schema auth to authenticated;',
  'grant execute on function auth.uid() to authenticated;'
 ].join('\n'));
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const files=(await readdir(dir)).filter(f=>f.endsWith('.sql')&&!f.includes('_storage')).sort();
 assert.ok(files.includes('20261116120000_study_timer_modes.sql'));
 for(const file of files)await db.exec(await readFile(new URL(file,dir),'utf8'));
 const docs=JSON.parse(await readFile(new URL('../../../docs/v6/capability-registry/study_entries.json',import.meta.url),'utf8'));
 const columns=(await q("select attname from pg_attribute where attrelid='public.study_entries'::regclass and attnum>0 and not attisdropped")).map(x=>x.attname).sort();
 assert.deepEqual(Object.keys(docs.columns).sort(),columns,'all timer columns inventoried');
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[owner,'a'.repeat(48)]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[other,'b'.repeat(48)]);
 const preset=(await q("insert into public.presets(user_id,label,mode,focus_minutes,break_minutes,cycles) values($1,'Proofs','pomodoro',18,7,3) returning id",[owner]))[0].id;
 const foreign=(await q("insert into public.presets(user_id,label,mode) values($1,'Foreign','open') returning id",[other]))[0].id;
 const draft=(await q("insert into public.study_entries(user_id,source,status,preset_id,intent) values($1,'timer','draft',$2,'Timer with preset') returning id",[owner,preset]))[0].id;
 await q("select set_config('test.uid',$1,false)",[owner]);
 await db.exec('set role authenticated');
 // Browser owner RLS INSERT permission is not permission to forge a timer
 // already running with forged state, a captured configuration, or a lease. Reject even when
 // attacker-controlled provenance looks like the authorized study dispatcher.
 const entriesBeforeAttack=(await q(
   "select count(*)::integer n from public.study_entries where user_id=$1",[owner]))[0].n;
 const journalBeforeAttack=(await q(
   "select count(*)::integer n from public.action_changes where table_name='study_entries'"))[0].n;
 await q("select set_config('lemma.tool','study',false)");
 await q("select set_config('lemma.source','chatgpt',false)");
 for(const statement of [
   "insert into public.study_entries(user_id,source,status,mode,phase,config,excluded_intervals,lease_device,lease_expires_at) values($1,'timer','running','pomodoro','break','{\"focus_minutes\":999}'::jsonb,'[]'::jsonb,'forged',now()+interval '1 hour')",
   "insert into public.study_entries(user_id,source,status,config) values($1,'timer','draft','{\"mode\":\"pomodoro\"}'::jsonb)",
   "insert into public.study_entries(user_id,source,status,lease_version) values($1,'manual','saved',99)",
 ])await assert.rejects(q(statement,[owner]),/Protected timer INSERT requires an audited study command/);
 // A direct running insert referencing a preset must never appear to have
 // captured that preset while still holding default open-mode config.
 await assert.rejects(q(
  "insert into public.study_entries(user_id,source,status,preset_id) values($1,'timer','running',$2)",
  [owner,preset]),/Protected timer INSERT requires an audited study command/);
 await assert.rejects(q(
  "insert into public.study_entries(user_id,source,status,preset_id) values($1,'timer','paused',$2)",
  [owner,preset]),/Protected timer INSERT requires an audited study command/,
  'paused preset entries cannot skip captured timer configuration');
 await assert.rejects(q(
  "insert into public.study_entries(user_id,source,status,preset_id) values($1,'manual','saved',$2)",
  [owner,preset]),/Protected timer INSERT requires an audited study command/);
 checkEqual((await q(
   "select count(*)::integer n from public.study_entries where user_id=$1",[owner]))[0].n,
   entriesBeforeAttack,'forged owner inserts leave no entries');
 checkEqual((await q(
   "select count(*)::integer n from public.action_changes where table_name='study_entries'"))[0].n,
   journalBeforeAttack,'rejected inserts never journal');
 await q("select set_config('lemma.tool','',false)");
 await q("select set_config('lemma.source','',false)");
 const browserDraft=(await q(
   "insert into public.study_entries(user_id,source,status,preset_id,intent) values($1,'timer','draft',$2,'Owner draft') returning id",[owner,preset]))[0].id;
 checkEqual((await q(
   "select status from public.study_entries where id=$1",[browserDraft]))[0].status,
   'draft','legitimate owner draft with preset still succeeds');
 const manualSaved=(await q(
   "insert into public.study_entries(user_id,source,status) values($1,'manual','saved') returning id",[owner]))[0].id;
 assert.ok(manualSaved,'existing direct manual saved-entry compatibility is preserved');
 const start={schemaVersion:1,resource:'study_entries',operation:'start',operationId:mkOp(1),
   target:{id:draft},expectedVersion:1,patch:{}};
 const result=(await q('select public.study_command($1::jsonb) result',[JSON.stringify(start)]))[0].result;
 checkEqual(result.status,'ok');
 let row=(await q('select mode,config,phase,cycle,phase_ends_at from public.study_entries where id=$1',[draft]))[0];
 checkEqual(row.mode,'pomodoro');checkEqual(row.config.focus_minutes,18);
 checkEqual(row.config.break_minutes,7);checkEqual(row.config.cycles,3);
 checkEqual(row.phase,'focus');checkEqual(row.cycle,1);assert.ok(row.phase_ends_at);
 await db.exec('reset role');
 // Existing N11 schema permits only one running or paused entry per owner.
 // Finish this test fixture before starting the next timer.
 await q("update public.study_entries set status='saved' where id=$1",[draft]);
 await q("update public.presets set focus_minutes=45 where id=$1",[preset]);
 await q("update public.settings set focus_defaults='{\"mode\":\"flowtime\",\"focus_minutes\":40,\"break_minutes\":10,\"long_break_minutes\":15,\"cycles\":4,\"flowtime_break_ratio\":0.25}'::jsonb where user_id=$1",[owner]);
 row=(await q('select mode,config from public.study_entries where id=$1',[draft]))[0];
 checkEqual(row.mode,'pomodoro');
 checkEqual(row.config.focus_minutes,18,'later preset edits do not rewrite captured config');
 const newDraft=(await q("insert into public.study_entries(user_id,source,status,intent) values($1,'timer','draft','Defaults after change') returning id",[owner]))[0].id;
 await q("select set_config('test.uid',$1,false)",[owner]);
 await db.exec('set role authenticated');
 const second={...start,operationId:mkOp(2),target:{id:newDraft}};
 checkEqual((await q('select public.study_command($1::jsonb) result',[JSON.stringify(second)]))[0].result.status,'ok');
 row=(await q('select mode,config,phase_ends_at from public.study_entries where id=$1',[newDraft]))[0];
 checkEqual(row.mode,'flowtime');checkEqual(row.config.focus_minutes,40);
 checkEqual(row.phase_ends_at,null);
 await db.exec('reset role');
 await assert.rejects(q('update public.study_entries set preset_id=$1 where id=$2',[foreign,newDraft]),
  /foreign key|violates/,'a timer cannot reference another owner preset');
 await assert.rejects(q("update public.study_entries set mode='invalid' where id=$1",[newDraft]),
  /constraint|violates/);
 await assert.rejects(q("update public.study_entries set energy='sleepy' where id=$1",[newDraft]),
  /constraint|violates/);

 // N52 lifecycle operations use the same study_command and audit receipt path.
 const as=async(id,role='authenticated')=>{
   await db.exec('reset role');
   await q("select set_config('request.jwt.claims','{}',false)");
   await q("select set_config('test.uid',$1,false)",[id]);
   await db.exec('set role '+role);
 };
 let opNumber=10;
 const req=(operation,patch,id,version,extra={})=>({
   schemaVersion:1,resource:'study_entries',operation,operationId:mkOp(opNumber++),
   target:{id},expectedVersion:version,patch,...extra
 });
 const command=async value=>(await q(
   'select public.study_command($1::jsonb) result',[JSON.stringify(value)]))[0].result;
 const get=async id=>(await q(
   'select * from public.study_entries where id=$1',[id]))[0];
 await as(owner);
 let flow=await get(newDraft);
 // The browser has owner RLS UPDATE rights. Neither a missing lease nor a
 // forged lemma.tool provenance may bypass the captured snapshot or ledger.
 // Even a no-op UPDATE of an explicitly protected ledger column must reject.
 const unleasedBefore=JSON.stringify(flow);
 const actionRowsBefore=(await q("select count(*)::integer n from public.action_changes where table_name='study_entries' and row_pk->>'id'=$1",[newDraft]))[0].n;
 for(const attack of [
   "update public.study_entries set config='{\"mode\":\"open\"}'::jsonb where id=$1",
   "update public.study_entries set excluded_intervals='[]'::jsonb where id=$1",
   "update public.study_entries set phase='long_break' where id=$1",
 ])await assert.rejects(q(attack,[newDraft]),/protected timer fields require an audited study command/);
 await q("select set_config('lemma.tool','study',false)");
 await assert.rejects(q("update public.study_entries set config='{\"mode\":\"open\"}'::jsonb where id=$1",[newDraft]),
   /protected timer fields require an audited study command/);
 await q("select set_config('lemma.tool','',false)");
 checkEqual(JSON.stringify(await get(newDraft)),unleasedBefore,
  'forged no-lease direct writes cannot mutate the captured timer');
 checkEqual((await q("select count(*)::integer n from public.action_changes where table_name='study_entries' and row_pk->>'id'=$1",[newDraft]))[0].n,actionRowsBefore,
  'rejected unleased writes never journal');
 const firstTake=req('take_lease',{device:'owner-device-a',lease_minutes:3},
   newDraft,flow.version);
 const taken=await command(firstTake);
 checkEqual(taken.status,'ok');
 checkEqual(taken.entry.lease_device,'owner-device-a');
 checkEqual(taken.entry.lease_version,1);
 assert.ok(taken.actionNo>0);
 assert.deepEqual(await command(firstTake),taken,'device lease replay is exact');
 const reused=await command({...firstTake,patch:{device:'owner-device-b'}});
 checkEqual(reused.status,'conflict','changed-payload lease operationId cannot replay');
 flow=await get(newDraft);
 const badPhase=await command(req('next_phase',{
   device:'owner-device-b',lease_version:flow.lease_version},newDraft,flow.version));
 checkEqual(badPhase.status,'conflict','second device cannot change phase');
 const noToken=await command(req('pause',{},newDraft,flow.version));
 checkEqual(noToken.status,'conflict','legacy pause also respects active lease');
 checkEqual((await get(newDraft)).version,flow.version);
 const takeover=await command(req('take_lease',{device:'owner-device-b',lease_minutes:5},
   newDraft,flow.version));
 checkEqual(takeover.status,'ok');
 checkEqual(takeover.entry.lease_version,2);
 // Table-level owner RLS does not bypass the active-lease command check.
 await assert.rejects(q("update public.study_entries set status='paused' where id=$1",[newDraft]),
   /Active timer lease requires an audited study command/);
 await assert.rejects(q("update public.study_intervals set kind='break' where entry_id=$1 and ended_at is null",[newDraft]),
   /Active timer lease requires an audited interval command/);
 // Authenticated owners may set arbitrary custom GUCs. Forged provenance
 // must not let UPDATE, DELETE or INSERT bypass the active device lease.
 const guardBefore=(await q(
   "select id,entry_id,user_id,kind,started_at,ended_at from public.study_intervals where entry_id=$1 order by id",[newDraft]));
 const guardJournal=(await q(
   "select count(*)::integer n from public.action_changes where table_name='study_intervals' and row_pk->>'entry_id'=$1",[newDraft]))[0].n;
 await q("select set_config('lemma.tool','study',false)");
 await q("select set_config('lemma.source','chatgpt',false)");
 for(const attack of [
   ["update public.study_intervals set kind='break' where entry_id=$1 and ended_at is null",[newDraft]],
   ["delete from public.study_intervals where entry_id=$1 and ended_at is null",[newDraft]],
   ["insert into public.study_intervals(entry_id,user_id,kind,started_at) values($1,$2,'focus',now()-interval '1 minute')",[newDraft,owner]],
 ])await assert.rejects(q(attack[0],attack[1]),/Active timer lease requires an audited interval command/);
 assert.deepEqual((await q(
   "select id,entry_id,user_id,kind,started_at,ended_at from public.study_intervals where entry_id=$1 order by id",[newDraft])),
   guardBefore,'forged provenance cannot mutate leased intervals');
 checkEqual((await q(
   "select count(*)::integer n from public.action_changes where table_name='study_intervals' and row_pk->>'entry_id'=$1",[newDraft]))[0].n,
   guardJournal,'rejected forged-provenance interval writes have no journal');
 await q("select set_config('lemma.tool','',false)");
 await q("select set_config('lemma.source','',false)");
 const deniedOld=await command(req('next_phase',{
   device:'owner-device-a',lease_version:1},newDraft,takeover.entry.version));
 checkEqual(deniedOld.status,'conflict','previous generation cannot mutate after takeover');
 // Flowtime break scales the *measured focus time* by the captured ratio.
 await db.exec('reset role');
 await q("update public.study_intervals set started_at=now()-interval '50 minutes' where entry_id=$1 and kind='focus' and ended_at is null",[newDraft]);
 await as(owner);
 const intoBreak=await command(req('next_phase',{
   device:'owner-device-b',lease_version:2},newDraft,takeover.entry.version));
 checkEqual(intoBreak.status,'ok');
 checkEqual(intoBreak.entry.phase,'break');
 checkEqual(intoBreak.entry.status,'paused');
 const breakMinutes=(new Date(intoBreak.entry.phase_ends_at).getTime()-Date.now())/60000;
 assert.ok(breakMinutes>=12&&breakMinutes<=14,
   '50 focused minutes x .25 ratio yields approximately 13-minute Flowtime break');
 let opened=(await q("select kind from public.study_intervals where entry_id=$1 and ended_at is null",[newDraft]));
 assert.deepEqual(opened.map(x=>x.kind),['break'],'phase transition opens exactly one break');
 const intoFocus=await command(req('next_phase',{
   device:'owner-device-b',lease_version:2,energy:'steady'},
   newDraft,intoBreak.entry.version));
 checkEqual(intoFocus.entry.phase,'focus');
 checkEqual(intoFocus.entry.cycle,2);
 checkEqual(intoFocus.entry.energy,'steady');
 checkEqual(intoFocus.entry.phase_ends_at,null,'Flowtime focus has no timer deadline');
 // Exclusion deducts the rightmost free focus, without ever double counting.
 // Simulate a long current focus period. The multirange union also
 // handles a fixture whose overlapping historical focus intervals would
 // otherwise double count the same time.
 await db.exec('reset role');
 await q("update public.study_intervals set started_at=now()-interval '25 minutes' where entry_id=$1 and kind='focus' and ended_at is null",[newDraft]);
 await as(owner);
 const ex1=await command(req('exclude_minutes',{
   minutes:10,reason:'Distracted',
   device:'owner-device-b',lease_version:2},newDraft,intoFocus.entry.version));
 checkEqual(ex1.status,'ok');
 checkEqual(ex1.entry.excluded_intervals.length,1);
 const ex2=await command(req('exclude_minutes',{
   minutes:10,reason:'Interrupted',
   device:'owner-device-b',lease_version:2},newDraft,ex1.entry.version));
 checkEqual(ex2.entry.excluded_intervals.length,2,'N52_EXCLUSION_SEGMENT_COUNT_'+String.fromCharCode(65+ex2.entry.excluded_intervals.length));
 const removedSeconds=spans=>spans.reduce((total,span)=>
   total+(new Date(span.to).getTime()-new Date(span.from).getTime())/1000,0);
 assert.ok(Math.abs(removedSeconds(ex1.entry.excluded_intervals)-600)<.1,
   'one exclusion must deduct exactly ten minutes');
 assert.ok(Math.abs(removedSeconds(ex2.entry.excluded_intervals)-1200)<.1,
   'two exclusions must deduct exactly twenty distinct minutes');
 assert.ok(new Date(ex2.entry.excluded_intervals[0].from)>=
   new Date(ex2.entry.excluded_intervals[1].to),
   'second exclusion must be earlier than the last excluded tail');
 await assert.rejects(command(req('exclude_minutes',{
   minutes:40,reason:'Too much',
   device:'owner-device-b',lease_version:2},newDraft,ex2.entry.version)),
   /Not enough unexcluded focus minutes/);
 checkEqual((await get(newDraft)).excluded_intervals.length,2);
 // Undo of a reasoned deduction restores the exact ledger and row version.
 const undo=(await q('select public.undo_action($1,$2,false) result',
   [owner,ex2.actionNo]))[0].result;
 checkEqual(Number(undo.undone),Number(ex2.actionNo));
 const afterUndo=await get(newDraft);
 checkEqual(afterUndo.excluded_intervals.length,1);
 assert.ok(Math.abs(removedSeconds(afterUndo.excluded_intervals)-600)<.1,
   'undo must restore the exact previous deducted minutes');
 await db.exec('reset role');
 const journal=(await q("select table_name from public.action_changes where action_no=$1",
   [intoBreak.actionNo])).map(x=>x.table_name);
 assert.ok(journal.includes('study_entries')&&journal.includes('study_intervals'),
   'phase transitions journal the entry and its interval changes atomically');
 await as(other);
 await assert.rejects(command(req('take_lease',{device:'foreign'},newDraft,1)),
   /not found for owner/);
 // Expiry removes the device claim, not the immutability requirement.
 await db.exec('reset role');
 await q("update public.study_entries set lease_expires_at=now()-interval '1 second' where id=$1",[newDraft]);
 await as(owner);
 const expiredBefore=JSON.stringify(await get(newDraft));
 const expiredJournalBefore=(await q("select count(*)::integer n from public.action_changes where table_name='study_entries' and row_pk->>'id'=$1",[newDraft]))[0].n;
 for(const attack of [
   "update public.study_entries set config='{\"mode\":\"pomodoro\"}'::jsonb where id=$1",
   "update public.study_entries set excluded_intervals='[]'::jsonb where id=$1",
 ])await assert.rejects(q(attack,[newDraft]),/protected timer fields require an audited study command/);
 checkEqual(JSON.stringify(await get(newDraft)),expiredBefore,
  'expired lease still forbids direct config and exclusion tampering');
 checkEqual((await q("select count(*)::integer n from public.action_changes where table_name='study_entries' and row_pk->>'id'=$1",[newDraft]))[0].n,expiredJournalBefore,
  'rejected expired-lease updates never journal');
 // Release the one-active-owner slot and exercise a two-cycle Pomodoro.
 await db.exec('reset role');
 await q("update public.study_entries set status='saved' where id=$1",[newDraft]);
 const pomoPreset=(await q("insert into public.presets(user_id,label,mode,focus_minutes,break_minutes,long_break_minutes,cycles) values($1,'Two-cycle','pomodoro',2,1,3,2) returning id",[owner]))[0].id;
 const pomo=(await q("insert into public.study_entries(user_id,source,status,preset_id) values($1,'timer','draft',$2) returning id",[owner,pomoPreset]))[0].id;
 await as(owner);
 const pStart=await command(req('start',{},pomo,1));
 checkEqual(pStart.status,'ok');
 let pRow=await get(pomo);
 checkEqual(pRow.config.focus_minutes,2);
 const pLease=await command(req('take_lease',{device:'pomo-device'},pomo,pRow.version));
 const p1=await command(req('next_phase',{device:'pomo-device',lease_version:1},
   pomo,pLease.entry.version));
 checkEqual(p1.entry.phase,'break','first cycle has short break');
 let remain=(new Date(p1.entry.phase_ends_at).getTime()-Date.now())/60000;
 assert.ok(remain>0.8&&remain<=1.1,'short break uses captured one-minute preset');
 const p2=await command(req('next_phase',{device:'pomo-device',lease_version:1},
   pomo,p1.entry.version));
 checkEqual(p2.entry.cycle,2);
 checkEqual(p2.entry.phase,'focus');
 const p3=await command(req('next_phase',{device:'pomo-device',lease_version:1},
   pomo,p2.entry.version));
 checkEqual(p3.entry.phase,'long_break','second cycle switches to long break');
 remain=(new Date(p3.entry.phase_ends_at).getTime()-Date.now())/60000;
 assert.ok(remain>2.8&&remain<=3.1,'long break uses captured three-minute preset');
 await db.exec('reset role');
 await q("update public.study_entries set lease_expires_at=now()-interval '1 second' where id=$1",[pomo]);
 await as(owner);
 const expired=await command(req('next_phase',{device:'pomo-device',lease_version:1},
   pomo,p3.entry.version));
 checkEqual(expired.status,'conflict','expired lease cannot advance phases');
 const freshLease=await command(req('take_lease',{device:'pomo-new-owner'},
   pomo,p3.entry.version));
 checkEqual(freshLease.entry.lease_version,2,'taking an expired lease advances generation');
 // Open mode never invents a countdown in any phase.
 await db.exec('reset role');
 await q("update public.study_entries set status='saved' where id=$1",[pomo]);
 await q("update public.settings set focus_defaults=jsonb_set(focus_defaults,'{mode}','\"open\"'::jsonb) where user_id=$1",[owner]);
 const open=(await q("insert into public.study_entries(user_id,source,status) values($1,'timer','draft') returning id",[owner]))[0].id;
 await as(owner);
 const openStart=await command(req('start',{},open,1));
 let openRow=await get(open);
 checkEqual(openRow.mode,'open');
 checkEqual(openRow.phase_ends_at,null);
 const openLease=await command(req('take_lease',{device:'open-device'},open,openRow.version));
 const openBreak=await command(req('next_phase',{
   device:'open-device',lease_version:1},open,openLease.entry.version));
 checkEqual(openBreak.entry.phase,'break');
 checkEqual(openBreak.entry.phase_ends_at,null);
 const openFocus=await command(req('next_phase',{
   device:'open-device',lease_version:1},open,openBreak.entry.version));
 checkEqual(openFocus.entry.phase,'focus');
 checkEqual(openFocus.entry.phase_ends_at,null);
 const originalPause=req('pause',{},open,openFocus.entry.version,
   {device:'open-device',leaseVersion:1});
 const ownerPaused=await command(originalPause);
 checkEqual(ownerPaused.status,'ok','the lease holder can still call old study commands');
 checkEqual((await get(open)).status,'paused');
 // Service-role MCP uses the registry to reach the very same command and owner.
 await db.exec('reset role');
 const otherDraft=(await q("insert into public.study_entries(user_id,source,status) values($1,'timer','draft') returning id",[other]))[0].id;
 await q("select set_config('test.uid','',false)");
 await db.exec('set role service_role');
 const mcpPayload=req('take_lease',{device:'connector-device'},otherDraft,1);
 const mc=(await q("select public.mcp_command($1,'chatgpt',$2::jsonb) result",
   [other,JSON.stringify(mcpPayload)]))[0].result;
 checkEqual(mc.status,'ok');
 checkEqual(mc.entry.lease_device,'connector-device');
 assert.deepEqual((await q("select public.mcp_command($1,'chatgpt',$2::jsonb) result",
   [other,JSON.stringify(mcpPayload)]))[0].result,mc);
 await db.exec('reset role');
 checkEqual((await q('select source from public.actions where no=$1',
   [mc.actionNo]))[0].source,'chatgpt','MCP audit source must be trusted dispatcher');

 console.log('PASS N52 staged timer schema, owner preset FK, start-time immutable configuration and mode constraints');
}finally{await db.close()}
