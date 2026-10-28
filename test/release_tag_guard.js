'use strict';
// RELEASE-01: a tag must identify the *current* fully accepted Pages deployment.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const SHA = /^[0-9a-f]{40}$/;
const REQUIRE = Object.freeze({
  'Lemma regression tests': 'push',
  'Lemma local Supabase sync gates': 'push',
  'Deploy Lemma web': 'push',
  'Lemma live Pages smoke': 'workflow_run',
});
function check(tagSha, mainSha, allRuns) {
  if (!SHA.test(tagSha) || !SHA.test(mainSha) || tagSha !== mainSha)
    throw Error('Release tag must equal current main HEAD');
  if (!Array.isArray(allRuns) || allRuns.length > 100)
    throw Error('Invalid bounded GitHub Actions run inventory');
  const chosen = {};
  for (const [name, event] of Object.entries(REQUIRE)) {
    const candidates = allRuns.filter(r => r && r.name === name && r.event === event &&
      r.head_branch === 'main' && r.head_sha === tagSha);
    candidates.sort((a,b) => Date.parse(b.created_at) - Date.parse(a.created_at) ||
      (b.id || 0) - (a.id || 0));
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
    const runs=Object.entries(REQUIRE).map(([name,event],i)=>({
      name,event,id:i+1,head_sha:sha,head_branch:'main',status:'completed',
      conclusion:'success',created_at:new Date(Date.parse(clock)+i*60000).toISOString(),
      updated_at:new Date(Date.parse(clock)+i*60000+20000).toISOString()
    }));
    assert.equal(check(sha,sha,runs).smokeRun,4);
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
      created_at:'2026-10-28T11:09:00Z',conclusion:'failure'});
    assert.throws(()=>check(sha,sha,bad),/regression/);
    console.log('ok: release tag exact-current-main, latest green workflows and post-deploy smoke negative controls');
  } else throw Error('Unknown tag guard arguments');
}
module.exports={check};
