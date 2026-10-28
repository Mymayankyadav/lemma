'use strict';
// KNOWLEDGE-01 K2a: real disposable local GoTrue/PostgREST security and CAS.
// This test refuses every origin except the CLI-confirmed loopback Supabase.
// It creates only synthetic users/contexts; never accesses production or Carrel.
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {localCredentials,isLocalAnonKey} = require('./auth_http_rls');
const ORIGIN = 'http://127.0.0.1:54321';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

async function main() {
  const {key} = localCredentials();
  assert.ok(isLocalAnonKey(key));
  async function call(path,token,method='GET',payload) {
    assert.ok(path.startsWith('/'), 'local relative route required');
    const response=await fetch(ORIGIN+path,{
      method,redirect:'error',cache:'no-store',
      headers:{apikey:key,Authorization:'Bearer '+token,
        Accept:'application/json',...(payload===undefined?{}:{'Content-Type':'application/json'})},
      ...(payload===undefined?{}:{body:JSON.stringify(payload)})
    });
    const body=await response.json().catch(()=>null);
    return {ok:response.ok,status:response.status,body};
  }
  const must=async(path,token,method,payload)=>{
    const r=await call(path,token,method,payload);
    assert.ok(r.ok, 'unexpected local HTTP '+r.status+': '+String(r.body?.message||''));
    return r.body;
  };
  async function signup() {
    const email='knowledge-k2a-'+randomUUID()+'@example.test';
    const result=await must('/auth/v1/signup',key,'POST',{
      email,password:'Lemma-K2a-'+randomUUID()+'-A9!'
    });
    assert.match(result?.user?.id||'',UUID);
    assert.ok(result.access_token);
    return {id:result.user.id,token:result.access_token};
  }
  const [a,b]=await Promise.all([signup(),signup()]);
  assert.notEqual(a.id,b.id,'must test two real independent identities');
  const aid=randomUUID(),bid=randomUUID();
  const write=(user,id,expected,request,title,markdown)=>call(
    '/rest/v1/rpc/commit_study_context',user.token,'POST',{
      p_context_id:id,p_expected_revision:expected,p_request_id:request,
      p_title:title,p_context_markdown:markdown
    });
  const read=(user,table,filters={})=>{
    const params=new URLSearchParams({select:'*',...filters});
    return must('/rest/v1/'+table+'?'+params,user.token);
  };
  const reqA=randomUUID(),reqB=randomUUID();
  const [firstA,firstB]=await Promise.all([
    write(a,aid,0,reqA,'KNOWLEDGE K2a A','Synthetic accepted context A'),
    write(b,bid,0,reqB,'KNOWLEDGE K2a B','Synthetic accepted context B')
  ]);
  assert.equal(firstA.body,1);assert.equal(firstB.body,1);
  const retry=await write(a,aid,0,reqA,'KNOWLEDGE K2a A','Synthetic accepted context A');
  assert.equal(retry.body,1,'lost-response retry must be exactly once');
  const wrongRetry=await write(a,aid,0,reqA,'KNOWLEDGE K2a A','changed retry');
  assert.equal(wrongRetry.ok,false);
  assert.equal(wrongRetry.body?.message,'idempotency_key_reused');
  const stale=await write(a,aid,0,randomUUID(),'KNOWLEDGE K2a A','stale update');
  assert.equal(stale.body?.message,'stale_context_revision');

  const update=await write(a,aid,1,randomUUID(),'KNOWLEDGE K2a A2','Accepted after revision 1');
  assert.equal(update.body,2);
  const concurrent=await Promise.all([
    write(a,aid,2,randomUUID(),'KNOWLEDGE K2a race one','One of two attempts'),
    write(a,aid,2,randomUUID(),'KNOWLEDGE K2a race two','One of two attempts')
  ]);
  assert.equal(concurrent.filter(x=>x.ok&&x.body===3).length,1,'exactly one CAS winner');
  assert.equal(concurrent.filter(x=>!x.ok&&x.body?.message==='stale_context_revision').length,1,
    'loser must explicitly report stale revision');
  const own=await read(a,'study_context_files',{id:'eq.'+aid});
  assert.equal(own.length,1);assert.equal(own[0].revision,3);
  const histories=await read(a,'study_context_revisions',{
    context_id:'eq.'+aid,order:'revision.asc'
  });
  assert.deepEqual(histories.map(r=>r.revision),[1,2,3],
    'all accepted snapshots are retained exactly once');
  assert.equal(histories[0].context_markdown,'Synthetic accepted context A');
  assert.equal(histories[0].origin,'accepted_write');
  assert.equal(histories[1].context_markdown,'Accepted after revision 1');

  // Positive controls: every owner can see its own current row and history.
  assert.equal((await read(b,'study_context_files',{id:'eq.'+bid})).length,1);
  assert.equal((await read(b,'study_context_revisions',{context_id:'eq.'+bid})).length,1);
  for(const [attacker,victimId] of [[b,aid],[a,bid]]) {
    assert.deepEqual(await read(attacker,'study_context_files',{id:'eq.'+victimId}),[]);
    assert.deepEqual(await read(attacker,'study_context_revisions',{context_id:'eq.'+victimId}),[]);
  }
  const attacker=await write(b,aid,3,randomUUID(),'Wrong owner','Cannot overwrite');
  assert.equal(attacker.body?.message,'stale_context_revision');
  assert.equal((await read(a,'study_context_files',{id:'eq.'+aid}))[0].revision,3);
  const direct=await call('/rest/v1/study_context_files',a.token,'POST',{
    id:randomUUID(),title:'bypass attempt',context_markdown:'not via CAS'
  });
  assert.equal(direct.ok,false,'direct writes must be revoked');
  const historicalOverwrite=await call('/rest/v1/study_context_revisions?context_id=eq.'+aid,
    a.token,'PATCH',{title:'tamper'});
  assert.equal(historicalOverwrite.ok,false,'immutable ledger cannot be overwritten');
  const anon=await call('/rest/v1/rpc/commit_study_context',key,'POST',{
    p_context_id:randomUUID(),p_expected_revision:0,p_request_id:randomUUID(),
    p_title:'anon',p_context_markdown:'forbidden'
  });
  assert.equal(anon.ok,false,'anonymous callers cannot commit');
  const oversized=await write(a,randomUUID(),0,randomUUID(),
    'oversized','z'.repeat(65537));
  assert.equal(oversized.body?.message,'invalid_context_payload');

  // Simulate an already-existing pre-K2 row using local-only privileged SQL.
  // This is a synthetic fixture, not a production backfill. Its current value
  // must be preserved as a clearly labelled baseline on first CAS edit.
  const oldId=randomUUID();
  assert.match(oldId,UUID);assert.match(a.id,UUID);
  execFileSync('psql',[
    '--no-psqlrc','--no-password','--quiet','--set','ON_ERROR_STOP=1',
    '--host','127.0.0.1','--port','54322','--username','postgres',
    '--dbname','postgres','--command',
    "insert into public.study_context_files(user_id,id,title,context_markdown,source_refs,revision) values ('"+
    a.id+"','"+oldId+"','Legacy local sample','Existing Markdown','[{\"legacy\":true}]',4)"
  ],{timeout:15000,stdio:'pipe',env:{...process.env,PGPASSWORD:'postgres',PGSSLMODE:'disable'}});
  const legacy=await write(a,oldId,4,randomUUID(),'Edited legacy','New Markdown');
  assert.equal(legacy.body,5);
  const before=await read(a,'study_context_revisions',{
    context_id:'eq.'+oldId,order:'revision.asc'
  });
  assert.deepEqual(before.map(r=>r.revision),[4,5]);
  assert.equal(before[0].origin,'legacy_current_baseline');
  assert.equal(before[0].context_markdown,'Existing Markdown');
  assert.deepEqual(before[0].source_refs,[{legacy:true}]);
  assert.deepEqual(before[1].source_refs,[{legacy:true}],
    'K2a edits must not remove old source references');

  console.log('PASS: K2a local authenticated owner RLS, CAS race, idempotent retry, immutable history, legacy preservation, bounded writes; no production access');
}
if(require.main===module)main().catch(error=>{
  console.error('FAIL local KNOWLEDGE-01 K2a: '+error.message);
  process.exitCode=1;
});
module.exports={main};
