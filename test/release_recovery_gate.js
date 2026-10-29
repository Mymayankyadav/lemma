'use strict';
// RELEASE-01 R7: the automated release must never call existing card-only
// JSON backups a complete account-workspace recovery implementation.
// This is only an evidence-presence gate. Real test implementations and their
// exact-commit CI results remain required and independently reviewable.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REQUIRED = Object.freeze([
  // A-owned: real disposable GoTrue/PostgREST round trip, two owners,
  // immutable histories, exact revisions, interruption/retry and denial.
  'test/stack_knowledge_workspace_restore.js',
  // F-owned: complete 19-table data/recovery acceptance, including receipt
  // metadata, scheduled cards, revision and event preservation.
  'test/release_workspace_restore.js',
  // Existing companion coverage: unsynced local drafts/outbox and exact
  // source-schema inventory validation.
  'test/account_local_recovery.js',
  'test/release_workspace_archive.js',
  'test/ui_workspace_recovery.js'
]);
function requireAcceptance(root) {
  const missing = REQUIRED.filter(p => !fs.existsSync(path.join(root,p)));
  if (missing.length)
    throw Error('Full account recovery acceptance not implemented: '+missing.join(', '));
  const pkg = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  const regression = pkg.scripts?.['test:lanes'] || '';
  const local = fs.readFileSync(path.join(root,'.github/workflows/sync-local.yml'),'utf8');
  const accounts = pkg.scripts?.['test:account'] || '';
  const ui = pkg.scripts?.['test:ui'] || '';
  if (!/run_prefix\.js\s+study_\s+tutor_\s+release_/.test(regression) ||
      !/run_prefix\.js\s+stack_/.test(local) ||
      !/test\/account_local_recovery\.js/.test(accounts) ||
      !/node test\/release_workspace_restore\.js --local/.test(local) ||
      !/test\/ui_workspace_recovery\.js/.test(ui))
    throw Error('Full restore acceptance files are not wired into both required CI suites');
  return {required:REQUIRED.length};
}
// Full recovery is not available to students while B's production Settings
// feature flag remains disabled. Synthetic UI fixtures do not count as a
// released user-accessible recovery path.
function requireVisibleRecoveryControls(root){
  const raw=fs.readFileSync(path.join(root,'src/app/view_settings.js'),'utf8');
  // Ignore whole-line and block comments: a commented-out recovery mount is
  // not an accessible Settings feature. This is a source regression gate,
  // not a substitute for B's real authenticated production acceptance.
  const source=raw.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^[ \t]*\/\/[^\n]*$/gm,'');
  const definitions=[...source.matchAll(/^[ \t]*const ACCOUNT_RECOVERY_READY\s*=\s*(true|false)\s*;[ \t]*$/gm)];
  if(definitions.length!==1 || definitions[0][1]!=='true')
    throw Error('Account recovery controls are not enabled in production Settings');
  // Require the actual Settings render to mount the section behind the signed-in
  // flag and restore API. A stray "if" or dead helper must not pass the tag gate.
  if(!/\bif\s*\(\s*ACCOUNT_RECOVERY_READY\s*&&\s*LemmaAccount\.user\s*&&\s*typeof\s+LemmaCloudBridge\.restoreRecoveryPair\s*===\s*['"]function['"]\s*\)\s*page\.append\(\s*accountRecoverySection\(\)\s*\)\s*;/.test(source))
    throw Error('Account recovery controls are not mounted behind the signed-in restore guard');
  const begin=source.indexOf('function accountRecoverySection(){');
  const end=source.indexOf('\n  function render(',begin);
  if(begin<0 || end<=begin)throw Error('Account recovery section implementation is missing');
  const section=source.slice(begin,end);
  const required=[
    [/text:'Download account backup'/,'private backup download control'],
    [/text:'Restore account backup'/,'explicit restore control'],
    [/const current=\(\)=>root\.isConnected&&LemmaAccount\.user\?\.id===ownerId&&\s*LemmaAccount\.client===client&&App\.workspaceRevision===generation&&!App\.workspaceBlocked;/,
      'owner, client and workspace revalidation'],
    [/restore\.disabled=[^;]*!validated[^;]*!consent\.checked[^;]*Store\.mode!=='local'/,
      'local-only, previewed, explicitly consented restore'],
    [/restoreRecoveryPair\(pair,\{requestId,studentConfirmed:true,dryRun:true\}\)/,
      'authenticated dry-run restore preflight'],
    [/const accepted=await confirmDialog\([\s\S]*?check\(\);if\(!accepted\)return;/,
      'final restore confirmation and identity recheck'],
    [/restoreRecoveryPair\(pair,\{requestId,studentConfirmed:true,dryRun:false,resumeSync:true\}\)/,
      'explicit confirmed restore and queued-edit resumption']
  ];
  for(const [pattern,description] of required)
    if(!pattern.test(section))throw Error('Account recovery controls missing '+description);
  return true;
}
function verifyExecutableAcceptance(root){
  const suite=require(path.join(root,'test/release_workspace_restore.js'));
  const backend=require(path.join(root,'test/stack_knowledge_workspace_restore.js'));
  if(suite.contract!=='lemma.workspace.restore.v1' ||
     typeof suite.assertRoundTrip!=='function' || typeof suite.selfTest!=='function' ||
     typeof backend.main!=='function')
    throw Error('Full restore suites are not executable acceptance implementations');
  const result=suite.selfTest();
  if(result?.tables!==19 || result.negativeCases<38)
    throw Error('Full restore acceptance negative controls failed');
  return result;
}
if (require.main === module) {
  if (process.argv[2] === '--tag') {
    if (process.argv.length !== 3) throw Error('Unexpected release recovery gate arguments');
    const root=path.resolve(__dirname,'..');
    const pass=requireAcceptance(root);
    verifyExecutableAcceptance(root);
    requireVisibleRecoveryControls(root);
    console.log('Recovery acceptance suites present and wired: '+pass.required+
      ' (must also pass exact-SHA regression/local-stack)');
  } else if (process.argv.length === 2) {
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'lemma-recovery-gate-'));
    try {
      fs.mkdirSync(path.join(root,'test'),{recursive:true});
      fs.mkdirSync(path.join(root,'.github/workflows'),{recursive:true});
      for(const p of REQUIRED)fs.writeFileSync(path.join(root,p),"'use strict';\n");
      fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({scripts:{
        'test:lanes':'node test/run_prefix.js study_ tutor_ release_',
        'test:account':'node test/account_local_recovery.js',
        'test:ui':'node test/ui_workspace_recovery.js'
      }}));
      fs.writeFileSync(path.join(root,'.github/workflows/sync-local.yml'),
        'run: node test/run_prefix.js stack_\nrun: node test/release_workspace_restore.js --local\n');
      assert.equal(requireAcceptance(root).required,REQUIRED.length);
      assert.throws(()=>verifyExecutableAcceptance(root),/not executable acceptance/);
      assert.equal(verifyExecutableAcceptance(path.resolve(__dirname,'..')).tables,19);
      const settings=path.join(root,'src/app/view_settings.js');
      fs.mkdirSync(path.dirname(settings),{recursive:true});
      const actual=fs.readFileSync(path.join(__dirname,'../src/app/view_settings.js'),'utf8');
      assert.match(actual,/const ACCOUNT_RECOVERY_READY = false;/,
        'current production recovery remains held pending live owner acceptance');
      const enabled=actual.replace('const ACCOUNT_RECOVERY_READY = false;',
        'const ACCOUNT_RECOVERY_READY = true;');
      fs.writeFileSync(settings,actual);
      assert.throws(()=>requireVisibleRecoveryControls(root),/not enabled/);
      fs.writeFileSync(settings,enabled);
      assert.equal(requireVisibleRecoveryControls(root),true,
        'synthetic enabled Settings source retains its full guarded flow');
      const reject=(needle,replacement,reason)=>{
        assert(enabled.includes(needle),'fixture source anchor exists: '+needle);
        fs.writeFileSync(settings,enabled.replace(needle,replacement));
        assert.throws(()=>requireVisibleRecoveryControls(root),reason);
      };
      reject('const ACCOUNT_RECOVERY_READY = true;',
        '// const ACCOUNT_RECOVERY_READY = true;',/not enabled/);
      reject('page.append(accountRecoverySection());',
        '/* page.append(accountRecoverySection()); */',/not mounted/);
      reject('page.append(accountRecoverySection());',
        'page.append(knowledgeDraftSection());',/not mounted/);
      reject('if (ACCOUNT_RECOVERY_READY && LemmaAccount.user &&',
        'if (ACCOUNT_RECOVERY_READY && true &&',/not mounted/);
      reject('function accountRecoverySection(){',
        'function disconnectedRecoverySection(){',/implementation is missing/);
      reject('LemmaAccount.client===client','true',/owner, client and workspace/);
      reject("restore.disabled=busy||!validated||!consent.checked||Store.mode!=='local';",
        "restore.disabled=busy||!validated||!consent.checked||true;",/local-only/);
      reject('studentConfirmed:true,dryRun:true',
        'studentConfirmed:false,dryRun:true',/dry-run restore preflight/);
      reject('const accepted=await confirmDialog(',
        'const accepted=await skippedDialog(',/final restore confirmation/);
      reject('studentConfirmed:true,dryRun:false,resumeSync:true',
        'studentConfirmed:false,dryRun:false,resumeSync:true',/explicit confirmed restore/);
      fs.writeFileSync(settings,enabled);
      assert.equal(requireVisibleRecoveryControls(root),true);

      for(const p of REQUIRED) {
        fs.rmSync(path.join(root,p));
        assert.throws(()=>requireAcceptance(root),/not implemented/);
        fs.writeFileSync(path.join(root,p),"'use strict';\n");
      }
      fs.writeFileSync(path.join(root,'.github/workflows/sync-local.yml'),
        'run: echo not-a-stack-gate\n');
      assert.throws(()=>requireAcceptance(root),/not wired/);
      console.log('ok: release tag refuses missing restore tests, unwired CI, disconnected recovery UI and removed consent guards');
    } finally {fs.rmSync(root,{recursive:true,force:true});}
  } else throw Error('Unknown release recovery gate arguments');
}
module.exports={requireAcceptance,verifyExecutableAcceptance,requireVisibleRecoveryControls,REQUIRED};
