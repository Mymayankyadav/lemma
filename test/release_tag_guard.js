'use strict';
// RELEASE-01: a tag must identify the *current* fully accepted Pages deployment.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const SHA = /^[0-9a-f]{40}$/;
// GitHub Actions terminal outcomes. A malformed *older* trusted run is not
// harmless: it must not be discarded merely because a newer run is green.
const COMPLETED_CONCLUSIONS = new Set([
  'success','failure','cancelled','timed_out','action_required',
  'neutral','skipped','stale','startup_failure'
]);
// GitHub Actions display names are not unique. A release attestation must
// refer to the expected workflow implementation, not a same-named workflow.
const REQUIRE = Object.freeze({
  'Lemma regression tests': { event:'push', path:'.github/workflows/test.yml' },
  'Lemma local Supabase sync gates': { event:'push', path:'.github/workflows/sync-local.yml' },
  'Deploy Lemma web': { event:['push','workflow_dispatch'], path:'.github/workflows/pages.yml' },
  'Lemma live Pages smoke': { event:'workflow_run', path:'.github/workflows/release.yml' },
});
function check(tagSha, mainSha, allRuns) {
  if (!SHA.test(tagSha) || !SHA.test(mainSha) || tagSha !== mainSha)
    throw Error('Release tag must equal current main HEAD');
  if (!Array.isArray(allRuns) || allRuns.length > 100)
    throw Error('Invalid bounded GitHub Actions run inventory');
  const chosen = {};
  for (const [name, spec] of Object.entries(REQUIRE)) {
    const candidates = allRuns.filter(r => r && r.name === name &&
      r.path === spec.path &&
      (Array.isArray(spec.event) ? spec.event.includes(r.event) : r.event === spec.event) &&
      r.head_branch === 'main' && r.head_sha === tagSha);
    // A retried run retains its original created_at; its latest attempt can
    // finish after a newer run. updated_at orders the evidence actually
    // observed at release time. Never let malformed dates sort as NaN/equals.
    const seen = new Set();
    const timestamp = (value, field) => {
      if (typeof value !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value))
        throw Error('Malformed trusted ' + name + ' ' + field);
      const parsed = Date.parse(value);
      if (!Number.isFinite(parsed) ||
          new Date(parsed).toISOString().slice(0,19) !== value.slice(0,19))
        throw Error('Malformed trusted ' + name + ' ' + field);
      return parsed;
    };
    for (const run of candidates) {
      if (!Number.isSafeInteger(run.id) || run.id <= 0 || seen.has(run.id))
        throw Error('Missing or duplicate trusted ' + name + ' run ID');
      seen.add(run.id);
      const created = timestamp(run.created_at, 'created_at');
      const updated = timestamp(run.updated_at, 'updated_at');
      if (updated < created)
        throw Error('Inconsistent trusted ' + name + ' run chronology');
      const completed = run.status === 'completed';
      if (!['queued','in_progress','completed','waiting','requested','pending'].includes(run.status) ||
          (completed ? !COMPLETED_CONCLUSIONS.has(run.conclusion) : run.conclusion !== null))
        throw Error('Malformed trusted ' + name + ' run state');
    }
    candidates.sort((a,b) => Date.parse(b.updated_at) - Date.parse(a.updated_at) ||
      b.id - a.id);
    const latest = candidates[0];
    if (!latest || !Number.isFinite(Date.parse(latest.created_at)) ||
        latest.status !== 'completed' || latest.conclusion !== 'success')
      throw Error('Missing latest successful ' + name + ' for exact release SHA');
    chosen[name] = latest;
  }
  const deploy = chosen['Deploy Lemma web'];
  const smoke = chosen['Lemma live Pages smoke'];
  if (!Number.isFinite(Date.parse(deploy.updated_at)) ||
      Date.parse(smoke.created_at) < Date.parse(deploy.updated_at))
    throw Error('Live Pages smoke did not verify the most recent deploy');
  return {sha:tagSha, deployRun:deploy.id, smokeRun:smoke.id};
}
if (require.main === module) {
  if (process.argv[2] === '--check') {
    if (process.argv.length !== 6) throw Error('Usage: release_tag_guard.js --check runs.json TAG_SHA MAIN_SHA');
    const runs = JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
    const accepted = check(process.argv[4],process.argv[5],runs.workflow_runs);
    console.log('PASS tag/head and exact deployed Pages smoke: ' + accepted.sha +
      ' deploy=' + accepted.deployRun + ' smoke=' + accepted.smokeRun);
  } else if (process.argv.length === 2) {
    const sha='a'.repeat(40), clock='2026-10-28T11:00:00Z';
    const runs=Object.entries(REQUIRE).map(([name,spec],i)=>({
      name,path:spec.path,event:Array.isArray(spec.event) ? spec.event[0] : spec.event,
      id:i+1,head_sha:sha,head_branch:'main',status:'completed',
      conclusion:'success',created_at:new Date(Date.parse(clock)+i*60000).toISOString(),
      updated_at:new Date(Date.parse(clock)+i*60000+20000).toISOString()
    }));
    assert.equal(check(sha,sha,runs).smokeRun,4);
    const manual = JSON.parse(JSON.stringify(runs)); manual[2].event='workflow_dispatch';
    assert.equal(check(sha,sha,manual).deployRun,3);
    const copy = x => JSON.parse(JSON.stringify(x));
    assert.throws(()=>check('b'.repeat(40),sha,runs),/current main HEAD/);
    assert.throws(()=>check(sha,sha,runs.slice(0,3)),/live Pages smoke/i);
    let bad=copy(runs);bad[3].head_branch='feature';
    assert.throws(()=>check(sha,sha,bad),/live Pages smoke/i);
    bad=copy(runs);bad[1].conclusion='failure';
    assert.throws(()=>check(sha,sha,bad),/local Supabase/);
    bad=copy(runs);bad[3].created_at=clock;
    assert.throws(()=>check(sha,sha,bad),/most recent deploy/);
    bad=copy(runs);bad.push({...bad[0],id:500,
      created_at:'2026-10-28T11:09:00Z',
      updated_at:'2026-10-28T11:09:20Z',conclusion:'failure'});
    assert.throws(()=>check(sha,sha,bad),/regression/);
    // A display name alone is not evidence that the trusted workflow ran.
    bad=copy(runs);bad[0].path='.github/workflows/fake-regression.yml';
    assert.throws(()=>check(sha,sha,bad),/regression/);
    bad=copy(runs);bad[1].path=null;
    assert.throws(()=>check(sha,sha,bad),/local Supabase/);
    bad=copy(runs);bad[2].path='.github/workflows/alternate-pages.yml';
    assert.throws(()=>check(sha,sha,bad),/Deploy Lemma web/);
    bad=copy(runs);bad[3].path='.github/workflows/alternate-smoke.yml';
    assert.throws(()=>check(sha,sha,bad),/live Pages smoke/);
    bad=copy(runs);bad.push({...bad[0],path:'.github/workflows/spoof.yml',
      id:999,created_at:'2026-10-28T12:00:00Z',conclusion:'success'});
    assert.equal(check(sha,sha,bad).smokeRun,4,
      'same-named untrusted workflow must not displace trusted success');
    bad=copy(runs);bad[0].conclusion='failure';
    bad.push({...bad[0],path:'.github/workflows/spoof.yml',
      id:999,created_at:'2026-10-28T12:00:00Z',conclusion:'success'});
    assert.throws(()=>check(sha,sha,bad),/regression/,
      'same-named untrusted success must not conceal trusted failure');
    // A failed retry of an older run may complete after a newer successful
    // run. created_at ordering alone would incorrectly accept that success.
    bad=copy(runs);
    bad.push({...bad[0],id:501,created_at:'2026-10-28T10:59:00Z',
      updated_at:'2026-10-28T11:10:00Z',conclusion:'failure'});
    assert.throws(()=>check(sha,sha,bad),/regression/);
    bad=copy(runs);
    bad.push({...bad[0],id:502,created_at:'not-a-date',
      updated_at:'2026-10-28T11:11:00Z',conclusion:'failure'});
    assert.throws(()=>check(sha,sha,bad),/Malformed trusted.*created_at/);
    bad=copy(runs);
    bad.push({...bad[0],id:503,created_at:'2026-02-31T11:00:00Z',
      updated_at:'2026-10-28T11:11:00Z',conclusion:'failure'});
    assert.throws(()=>check(sha,sha,bad),/Malformed trusted.*created_at/);
    bad=copy(runs);bad[0].updated_at='invalid';
    assert.throws(()=>check(sha,sha,bad),/Malformed trusted.*updated_at/);
    bad=copy(runs);bad[0].updated_at='2026-10-28T10:59:00Z';
    assert.throws(()=>check(sha,sha,bad),/chronology/);
    bad=copy(runs);bad.push({...bad[0],conclusion:'failure'});
    assert.throws(()=>check(sha,sha,bad),/duplicate trusted.*run ID/);
    bad=copy(runs);bad[0].id=null;
    assert.throws(()=>check(sha,sha,bad),/run ID/);
    bad=copy(runs);bad[0].status='unknown';
    assert.throws(()=>check(sha,sha,bad),/run state/);
    bad=copy(runs);bad[0].status='completed';bad[0].conclusion=null;
    assert.throws(()=>check(sha,sha,bad),/run state/);
    // A pending retry is not a completed release gate.
    bad=copy(runs);
    bad.push({...bad[0],id:504,created_at:'2026-10-28T10:59:00Z',
      updated_at:'2026-10-28T11:10:00Z',status:'in_progress',conclusion:null});
    assert.throws(()=>check(sha,sha,bad),/regression/);
    // R17: malformed older trusted history must fail, even with a green latest run.
    for (const outcome of COMPLETED_CONCLUSIONS) {
      bad=copy(runs);
      bad.push({...bad[0],id:600+Array.from(COMPLETED_CONCLUSIONS).indexOf(outcome),
        created_at:'2026-10-28T10:58:00Z',updated_at:'2026-10-28T10:58:20Z',
        status:'completed',conclusion:outcome});
      assert.equal(check(sha,sha,bad).smokeRun,4,
        'valid older terminal result should not displace latest success');
    }
    bad=copy(runs);
    bad.push({...bad[0],id:620,created_at:'2026-10-28T10:58:00Z',
      updated_at:'2026-10-28T10:58:20Z',conclusion:'fabricated-success'});
    assert.throws(()=>check(sha,sha,bad),/Malformed trusted.*run state/,
      'unknown older terminal conclusion cannot be ignored');
    for (const status of ['queued','in_progress','waiting','requested','pending']) {
      bad=copy(runs);
      bad.push({...bad[0],id:621,created_at:'2026-10-28T10:58:00Z',
        updated_at:'2026-10-28T10:58:20Z',status,conclusion:'success'});
      assert.throws(()=>check(sha,sha,bad),/Malformed trusted.*run state/,
        'unfinished older trusted run must not claim terminal success');
    }
    bad=copy(runs);
    bad.push({...bad[0],id:622,created_at:'2026-10-28T10:58:00Z',
      updated_at:'2026-10-28T10:58:20Z',status:'queued',conclusion:undefined});
    assert.throws(()=>check(sha,sha,bad),/Malformed trusted.*run state/,
      'missing null conclusion in unfinished run is malformed');
    console.log('ok: release tag exact-current-main, canonical workflow paths, latest trusted green runs and post-deploy smoke');
  } else throw Error('Unknown tag guard arguments');
}
module.exports={check};
