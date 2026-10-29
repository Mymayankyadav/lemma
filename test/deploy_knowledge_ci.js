'use strict';
// Read-only exact-head readiness wait. This file's default entry is its fixture
// suite; only --wait reads GitHub. It never dispatches workflows or runs SQL.
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const REQUIRED = ['regression', 'local-stack'];

function readiness(payload, sha) {
  if (!Array.isArray(payload?.check_runs)) throw Error('Malformed check-runs response');
  return REQUIRED.filter(name => {
    const checks = payload.check_runs.filter(c => c.name === name && c.head_sha === sha);
    // A newer retry supersedes an earlier success at the same commit.
    checks.sort((a,b) => b.id-a.id);
    const check = checks[0];
    if (!check) return true;
    if (!Number.isSafeInteger(check.id) || !['queued','in_progress','completed'].includes(check.status))
      throw Error('Malformed required check: '+name);
    if (check.status !== 'completed') return true;
    if (check.conclusion !== 'success')
      throw Error('Required current-main check failed: '+name+' ('+check.conclusion+')');
    return false;
  });
}

async function waitForMainCi({sha,getMain,getChecks,sleep,now=Date.now,log=console.log,
  timeoutMs=600000,intervalMs=15000}) {
  if (!/^[a-f0-9]{40}$/.test(sha || '')) throw Error('Invalid dispatch SHA');
  const deadline=now()+timeoutMs;
  for (;;) {
    if (await getMain() !== sha) throw Error('Main moved; redispatch on the new main head');
    const pending=readiness(await getChecks(),sha);
    // Catch a merge during the check lookup, including on the successful poll.
    if (await getMain() !== sha) throw Error('Main moved; redispatch on the new main head');
    if (now() >= deadline) throw Error('Timed out waiting for exact-main CI');
    if (!pending.length) {log('Exact-main regression/local-stack SUCCESS: '+sha);return;}
    log('Waiting for exact-main CI: '+pending.join(', '));
    await sleep(Math.min(intervalMs,deadline-now()));
  }
}

async function selfTest() {
  const sha='a'.repeat(40),other='b'.repeat(40);
  const check=(name,status='completed',conclusion='success',id=1,head_sha=sha)=>
    ({name,status,conclusion,id,head_sha});
  const green={check_runs:REQUIRED.map(n=>check(n))};
  const fixture=(options={})=>{
    let tick=0,poll=0,mainReads=0;
    const calls={sleeps:0,logs:[]};
    return {calls,args:{sha,timeoutMs:30,intervalMs:10,now:()=>tick,
      getMain:async()=>{mainReads++;return options.main?.(mainReads) || sha;},
      getChecks:async()=>{poll++;if(options.error)throw Error('GitHub unavailable');
        return options.checks?.(poll) || green;},
      sleep:async ms=>{tick+=ms;calls.sleeps++;},log:s=>calls.logs.push(s)}};
  };
  let f=fixture();await waitForMainCi(f.args);assert.equal(f.calls.sleeps,0);
  f=fixture({checks:n=>n===1?{check_runs:[]}:
    n===2?{check_runs:[check('regression','in_progress',null)]}:green});
  await waitForMainCi(f.args);assert.equal(f.calls.sleeps,2);
  for (const result of ['failure','cancelled','timed_out','skipped','neutral',null]) {
    f=fixture({checks:()=>({check_runs:[check('regression','completed',result)]})});
    await assert.rejects(waitForMainCi(f.args),/check failed/);
    assert.equal(f.calls.sleeps,0,'terminal failure never waits or retries CI');
  }
  f=fixture({checks:()=>({check_runs:[...green.check_runs,
    check('regression','completed','failure',2)]})});
  await assert.rejects(waitForMainCi(f.args),/check failed/);
  f=fixture({checks:n=>n===1?{check_runs:[...green.check_runs,
    check('regression','queued',null,2)]}:{check_runs:[...green.check_runs,
    check('regression','completed','success',2)]}});
  await waitForMainCi(f.args);assert.equal(f.calls.sleeps,1);
  for(const read of [1,2,3]) {
    f=fixture({main:n=>n>=read?other:sha,checks:()=>({check_runs:[]})});
    await assert.rejects(waitForMainCi(f.args),/Main moved/);
  }
  f=fixture({main:n=>n>=2?other:sha});
  await assert.rejects(waitForMainCi(f.args),/Main moved/,'main changed during the green poll');
  f=fixture({checks:()=>({check_runs:green.check_runs.map(c=>({...c,head_sha:other}))})});
  await assert.rejects(waitForMainCi(f.args),/Timed out/);
  assert.equal(f.calls.sleeps,3,'another SHA cannot clear the wait');
  f=fixture({checks:()=>({check_runs:[]})});
  await assert.rejects(waitForMainCi(f.args),/Timed out/);
  f=fixture({checks:()=>({})});await assert.rejects(waitForMainCi(f.args),/Malformed/);
  f=fixture({error:true});await assert.rejects(waitForMainCi(f.args),/GitHub unavailable/);
  await assert.rejects(waitForMainCi({...fixture().args,sha:'main'}),/Invalid dispatch SHA/);
  console.log('PASS migration CI wait: pending-to-green, terminal/latest failures, stale main, foreign SHA, API error and timeout');
}

if (require.main === module) {
  const mode=process.argv[2];
  const main=async()=>{
    if (process.argv.length===2) return selfTest();
    if (mode!=='--wait' || process.argv.length!==3) throw Error('Unexpected CI wait arguments');
    const repo=process.env.GITHUB_REPOSITORY,sha=process.env.GITHUB_SHA;
    if (repo!=='Mymayankyadav/lemma') throw Error('Refusing non-Lemma repository');
    const api=path=>JSON.parse(execFileSync('gh',['api','repos/'+repo+'/'+path],
      {encoding:'utf8',timeout:15000}));
    await waitForMainCi({sha,getMain:async()=>api('branches/main')?.commit?.sha,
      getChecks:async()=>api('commits/'+sha+'/check-runs?filter=latest&per_page=100'),
      sleep:ms=>new Promise(resolve=>setTimeout(resolve,ms))});
  };
  main().catch(err=>{console.error(err.message);process.exitCode=1;});
}
module.exports={readiness,waitForMainCi,selfTest};
