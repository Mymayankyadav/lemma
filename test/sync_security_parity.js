'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
// SHIP-A1: the deployed SYNC-04 history and three KNOWLEDGE-01 migrations
// are exact, ordered invariants. Lane D/E may append plan/tutor migrations;
// the one reviewed R2e owner-snapshot migration is pinned byte-for-version.
// An unrecognized or reordered version is never silently ignored.
const knowledgeMigrations=[
 {version:'20261028031800',name:'knowledge_context_cas'},
 {version:'20261028043000',name:'knowledge_source_revisions'},
 {version:'20261028051500',name:'structured_context_v1'}
];
const ownerSnapshotMigration={version:'20261028163000',name:'release01_owner_snapshot_v1'};
function assertAllowedMigrationHistory(migrations,legacy){
 assert.equal(legacy.length,9,'original production migration baseline changed');
 assert.ok(Array.isArray(migrations),'migration history must be an array');
 assert.ok(migrations.length>=12,'missing required knowledge migrations');
 assert.deepStrictEqual(migrations.slice(0,9),legacy,'original nine production migrations drifted');
 assert.deepStrictEqual(migrations.slice(9,12),knowledgeMigrations,
   'three additive knowledge migrations missing, renamed or reordered');
 const seen=new Set(migrations.slice(0,12).map(m=>m.version));
 let previous=migrations[11].version;
 for(const m of migrations.slice(12)){
   assert.ok(m && typeof m==='object','invalid additional migration');
   assert.match(m.version,/^\d{14}$/,'invalid additional migration version');
   const isPinnedSnapshot=m.version===ownerSnapshotMigration.version &&
     m.name===ownerSnapshotMigration.name;
   if(m.name===ownerSnapshotMigration.name)
     assert.ok(isPinnedSnapshot,'R2e snapshot migration version changed');
   if(!isPinnedSnapshot)
     assert.match(m.name,/^(?:[a-z0-9]+_)*?(?:plan01|tutor01)_[a-z0-9_]+$/,
       'only named plan01/tutor01 or pinned R2e migration may extend baseline');
   assert.ok(m.version>previous,'additional migrations must be timestamp-ordered');
   assert.ok(!seen.has(m.version),'duplicate migration version');
   seen.add(m.version); previous=m.version;
 }
}
function compare(){
 // Exercise positive/negative extension cases in the real local-stack gate.
 require('./sync_migration_parity.js');
 const expected=JSON.parse(fs.readFileSync(path.join(root,'supabase/tests/security_snapshot.expected.json'),'utf8'));
 const out=execFileSync('psql',['--no-psqlrc','--no-password','--quiet','--tuples-only','--no-align','--set','ON_ERROR_STOP=1','--host','127.0.0.1','--port','54322','--username','postgres','--dbname','postgres','--file',path.join(root,'supabase/tests/security_snapshot.sql')],{cwd:root,encoding:'utf8',timeout:30000,env:{...process.env,PGPASSWORD:'postgres',PGSSLMODE:'disable'}});
 const actual=JSON.parse(out.trim());
 // Compare the original production SYNC-04 surface byte-for-byte. The new
 // KNOWLEDGE-01 additive context migration must be present as an exact named
 // extension, not silently excluded from migration-history verification.
 for(const [section,count] of [['tables',5],['policies',13],['functions',6]])
   assert.equal(actual[section]?.length,count,'wrong L8 metadata count: '+section);
 assertAllowedMigrationHistory(actual.migrations,expected.migrations);
 const {migrations:ignoredLocal,...legacyActual}=actual;
 const {migrations:ignoredBaseline,...legacyExpected}=expected;
 assert.deepStrictEqual(legacyActual,legacyExpected,'L8 production sync table/policy/function drift');
 console.log('ok: L8 nine legacy and three knowledge migrations exact, only named plan/tutor or exact R2e snapshot extension allowed; full sync security snapshot matches');
}
module.exports={compare,assertAllowedMigrationHistory,knowledgeMigrations,ownerSnapshotMigration};
if(require.main===module)try{compare();}catch(e){console.error('FAIL L8 security parity: '+e.message);process.exitCode=1;}
