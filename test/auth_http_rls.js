'use strict';
/* SYNC-04: opt-in, real HTTP RLS verification. No privileged/service-role keys.
 * Tokens stay in local environment variables; do not run with real learning notes.
 * The default command runs the deterministic network-free self-test.
 * The --live command requires a separate explicit opt-in.
 */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const ORIGIN = 'https://yemqnhnztlbyxmjxidis.supabase.co';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{5,79}$/;
const TABLES = ['notes','profiles','review_events','review_retractions'];
const ACK = 'SYNC-04-SYNTHETIC-HTTP-TEST';

function validateInputs({ key, aToken, bToken, aNote, bNote, ack }) {
  if (ack !== ACK) throw new Error('Explicit SYNC-04 synthetic-fixture acknowledgment required');
  if (!key || !aToken || !bToken) throw new Error('Two independent access tokens and a publishable key are required');
  if (aToken === bToken) throw new Error('Access tokens must be different');
  if (!NOTE_ID.test(aNote || '') || !NOTE_ID.test(bNote || '') || aNote === bNote)
    throw new Error('Provide distinct short synthetic note IDs (letters, digits, underscore, hyphen)');
  return { key, aToken, bToken, aNote, bNote };
}

async function runProbe(input, fetchImpl = fetch) {
  const { key, aToken, bToken, aNote, bNote } = validateInputs(input);
  async function call(path, token, method = 'GET', payload) {
    // Constant project origin: malicious environment variables cannot
    // redirect access tokens to an unexpected server.
    const headers = { apikey:key, Authorization:'Bearer ' + token, Accept:'application/json' };
    if (payload !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetchImpl(ORIGIN + path, {
      method, headers, cache:'no-store', redirect:'error',
      ...(payload !== undefined ? {body:JSON.stringify(payload)} : {})
    });
    let body;
    try { body = await response.json(); }
    catch { throw new Error('HTTP returned invalid JSON (status ' + response.status + ')'); }
    return { ok:response.ok, status:response.status, body };
  }
  async function identity(token) {
    const r = await call('/auth/v1/user', token);
    if (!r.ok || !UUID.test(r.body?.id || ''))
      throw new Error('Token is not a valid independently authenticated user session');
    return r.body.id;
  }
  const [aUser,bUser] = await Promise.all([identity(aToken),identity(bToken)]);
  if (aUser === bUser) throw new Error('Two different real auth identities are required');
  async function select(token, table, filter, projection) {
    const params = new URLSearchParams({select:projection, ...filter, limit:'1'});
    const r = await call('/rest/v1/' + table + '?' + params, token);
    if (!r.ok || !Array.isArray(r.body))
      throw new Error('Authenticated REST read failed for ' + table + ' (status ' + r.status + ')');
    return r.body;
  }
  async function ownedNote(token,id) {
    const records = await select(token, 'notes', {id:'eq.' + id}, 'id,revision,deleted_at,data');
    if (records.length !== 1 || records[0].id !== id) throw new Error('Synthetic note not visible to its owner');
    const n = records[0];
    if (!Number.isSafeInteger(n.revision) || n.revision < 1 ||
        typeof n.data?.title !== 'string' || !n.data.title.startsWith('SYNC-04'))
      throw new Error('Refusing to probe unlabelled or invalid note; provide only SYNC-04 fixtures');
    return n;
  }
  // Complete every read-only preflight before any write-denial RPC.
  const [aBefore,bBefore] = await Promise.all([ownedNote(aToken,aNote),ownedNote(bToken,bNote)]);
  for (const [readerToken,otherId] of [[aToken,bUser],[bToken,aUser]]) {
    for (const table of TABLES) {
      const foreign = await select(readerToken,table,{user_id:'eq.' + otherId},'user_id');
      if (foreign.length) throw new Error('RLS read leak detected in ' + table);
    }
  }
  for (const [attackerToken,victimId] of [[aToken,bNote],[bToken,aNote]]) {
    const forbidden = await select(attackerToken,'notes',{id:'eq.' + victimId},'id');
    if (forbidden.length) throw new Error('Cross-owner note ID visible to wrong identity');
  }
  for (const [attackerToken,ownerToken,victimId,rev,before] of [
    [bToken,aToken,aNote,aBefore.revision,aBefore],
    [aToken,bToken,bNote,bBefore.revision,bBefore]
  ]) {
    // Expected revision >=1 means no missing-row insert is allowed.
    // If the caller has no note by this ID, the authenticated RPC must
    // return stale_note_revision without mutating either owner's note.
    const result = await call('/rest/v1/rpc/commit_note',attackerToken,'POST',{
      p_note_id:victimId,p_expected_revision:rev,p_request_id:randomUUID(),
      p_data:null,p_delete:true
    });
    if (result.ok) throw new Error('Cross-owner write unexpectedly succeeded');
    if (result.body?.message !== 'stale_note_revision')
      throw new Error('Cross-owner write did not fail with expected scoped revision error');
    const [after,wrongOwner] = await Promise.all([
      ownedNote(ownerToken,victimId),
      select(attackerToken,'notes',{id:'eq.' + victimId},'id')
    ]);
    assert.deepEqual(after,before,'Owner fixture changed during denial probe');
    if (wrongOwner.length) throw new Error('Cross-owner denial probe created a note');
  }
  return { accounts:2, tables:TABLES.length, deniedWrites:2 };
}

async function selfTest() {
  const A = '00000000-0000-4000-8000-000000000001';
  const B = '00000000-0000-4000-8000-000000000002';
  const fixtures = [
    {owner:A,id:'sync04-fixture-a',revision:3,deleted_at:'2026-10-27T00:00:00Z',data:{title:'SYNC-04 A'}},
    {owner:B,id:'sync04-fixture-b',revision:1,deleted_at:null,data:{title:'SYNC-04 B'}}
  ];
  const input = {key:'sb_publishable_test',aToken:'token-a',bToken:'token-b',
    aNote:fixtures[0].id,bNote:fixtures[1].id,ack:ACK};
  function mock(mode) {
    let posts = 0;
    const fake = async (url, options) => {
      assert.ok(url.startsWith(ORIGIN + '/'),'token must only reach the fixed Lemma project');
      assert.equal(options.redirect,'error');
      const principal = options.headers.Authorization === 'Bearer token-a' ? A : B;
      const u = new URL(url);
      let data = [], status = 200;
      if (u.pathname === '/auth/v1/user') data = {id:mode === 'same-user' ? A : principal};
      else if (u.pathname === '/rest/v1/rpc/commit_note') {
        posts++;
        status = mode === 'allow-cross-write' ? 200 : 409;
        data = mode === 'allow-cross-write' ? 4 : {message:'stale_note_revision'};
      } else {
        const table = u.pathname.split('/').at(-1);
        if (table === 'notes' && u.searchParams.has('id')) {
          const id = u.searchParams.get('id').slice(3);
          data = fixtures.filter(f=>f.id===id && (f.owner===principal || mode==='leak'))
            .map(({id,revision,deleted_at,data})=>({id,revision,deleted_at,data}));
          if (u.searchParams.get('select')==='id') data=data.map(({id})=>({id}));
        } else if (u.searchParams.has('user_id') && mode === 'leak') data = [{user_id:'foreign'}];
      }
      return {ok:status>=200 && status<300,status,json:async()=>data};
    };
    return {fake,postCount:()=>posts};
  }
  const good = mock('good');
  assert.deepEqual(await runProbe(input,good.fake),{accounts:2,tables:4,deniedWrites:2});
  assert.equal(good.postCount(),2);
  const leak = mock('leak');
  await assert.rejects(runProbe(input,leak.fake),/RLS read leak detected|Cross-owner note ID visible/);
  assert.equal(leak.postCount(),0,'a read leak blocks all write probes');
  await assert.rejects(runProbe(input,mock('same-user').fake),/Two different real auth identities/);
  const writable = mock('allow-cross-write');
  await assert.rejects(runProbe(input,writable.fake),/Cross-owner write unexpectedly succeeded/);
  assert.equal(writable.postCount(),1);
  const wrongFixture=mock('good');
  await assert.rejects(runProbe({...input,aNote:'nonexistent-note'},wrongFixture.fake),/Synthetic note not visible/);
  assert.equal(wrongFixture.postCount(),0,'missing fixture cannot trigger a write');
  assert.throws(()=>validateInputs({...input,ack:'wrong'}),/acknowledgment/);
  assert.throws(()=>validateInputs({...input,aNote:input.bNote}),/distinct short synthetic/);
  console.log('ok: two-user HTTP RLS probe guards, reciprocal read/write denial and safe preflight (mock transport only)');
}

if (require.main === module) {
  if (process.argv.includes('--live')) {
    runProbe({
      key:process.env.LEMMA_RLS_PUBLIC_KEY,
      aToken:process.env.LEMMA_RLS_TOKEN_A,bToken:process.env.LEMMA_RLS_TOKEN_B,
      aNote:process.env.LEMMA_RLS_NOTE_A,bNote:process.env.LEMMA_RLS_NOTE_B,
      ack:process.env.LEMMA_RLS_ACK
    }).then(result=>console.log('PASS: independently authenticated HTTP RLS:',result.accounts,
      'users,',result.tables,'table filters,',result.deniedWrites,'cross-account write denials'))
      .catch(err=>{ console.error('FAIL: '+err.message);process.exitCode=1; });
  } else if (process.argv.length === 2 || process.argv.includes('--self-test')) {
    selfTest().catch(err=>{console.error(err);process.exitCode=1;});
  } else { console.error('Use --self-test or --live'); process.exitCode=2; }
}
module.exports = { runProbe, selfTest, validateInputs };
