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
  'test/release_workspace_archive.js'
]);
function requireAcceptance(root) {
  const missing = REQUIRED.filter(p => !fs.existsSync(path.join(root,p)));
  if (missing.length)
    throw Error('Full account recovery acceptance not implemented: '+missing.join(', '));
  const pkg = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  const regression = pkg.scripts?.['test:lanes'] || '';
  const local = fs.readFileSync(path.join(root,'.github/workflows/sync-local.yml'),'utf8');
  const accounts = pkg.scripts?.['test:account'] || '';
  if (!/run_prefix\.js\s+study_\s+tutor_\s+release_/.test(regression) ||
      !/run_prefix\.js\s+stack_/.test(local) ||
      !/test\/account_local_recovery\.js/.test(accounts))
    throw Error('Full restore acceptance files are not wired into both required CI suites');
  return {required:REQUIRED.length};
}
if (require.main === module) {
  if (process.argv[2] === '--tag') {
    if (process.argv.length !== 3) throw Error('Unexpected release recovery gate arguments');
    const pass=requireAcceptance(path.resolve(__dirname,'..'));
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
        'test:account':'node test/account_local_recovery.js'
      }}));
      fs.writeFileSync(path.join(root,'.github/workflows/sync-local.yml'),
        'run: node test/run_prefix.js stack_\n');
      assert.equal(requireAcceptance(root).required,4);
      for(const p of REQUIRED) {
        fs.rmSync(path.join(root,p));
        assert.throws(()=>requireAcceptance(root),/not implemented/);
        fs.writeFileSync(path.join(root,p),"'use strict';\n");
      }
      fs.writeFileSync(path.join(root,'.github/workflows/sync-local.yml'),
        'run: echo not-a-stack-gate\n');
      assert.throws(()=>requireAcceptance(root),/not wired/);
      console.log('ok: release tag refuses missing owner-restoration tests or unwired CI');
    } finally {fs.rmSync(root,{recursive:true,force:true});}
  } else throw Error('Unknown release recovery gate arguments');
}
module.exports={requireAcceptance,REQUIRED};
