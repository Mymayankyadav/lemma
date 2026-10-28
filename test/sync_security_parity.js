'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
function compare(){
 const expected=JSON.parse(fs.readFileSync(path.join(root,'supabase/tests/security_snapshot.expected.json'),'utf8'));
 const out=execFileSync('psql',['--no-psqlrc','--no-password','--quiet','--tuples-only','--no-align','--set','ON_ERROR_STOP=1','--host','127.0.0.1','--port','54322','--username','postgres','--dbname','postgres','--file',path.join(root,'supabase/tests/security_snapshot.sql')],{cwd:root,encoding:'utf8',timeout:30000,env:{...process.env,PGPASSWORD:'postgres',PGSSLMODE:'disable'}});
 const actual=JSON.parse(out.trim());
 // Compare the original production SYNC-04 surface byte-for-byte. The new
 // KNOWLEDGE-01 additive context migration must be present as an exact named
 // extension, not silently excluded from migration-history verification.
 for(const [section,count] of [['tables',5],['policies',13],['functions',6]])
   assert.equal(actual[section]?.length,count,'wrong L8 metadata count: '+section);
 assert.equal(expected.migrations.length,9,'original production migration baseline changed');
 assert.equal(actual.migrations.length,11,'expected precisely two additive knowledge migrations');
 assert.deepStrictEqual(actual.migrations.slice(0,9),expected.migrations,
   'original nine production migrations drifted');
 assert.deepStrictEqual(actual.migrations[9],
   {version:'20261028031800',name:'knowledge_context_cas'},
   'new context migration missing or unexpectedly renamed');
 const {migrations:ignoredLocal,...legacyActual}=actual;
 const {migrations:ignoredBaseline,...legacyExpected}=expected;
 assert.deepStrictEqual(legacyActual,legacyExpected,'L8 production sync table/policy/function drift');
 console.log('ok: L8 original nine migrations and full sync security snapshot match; two named additive knowledge migrations verified');
}
if(require.main===module)try{compare();}catch(e){console.error('FAIL L8 security parity: '+e.message);process.exitCode=1;}
module.exports={compare};
