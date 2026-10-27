'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
function compare(){
 const expected=JSON.parse(fs.readFileSync(path.join(root,'supabase/tests/security_snapshot.expected.json'),'utf8'));
 const out=execFileSync('psql',['--no-psqlrc','--no-password','--quiet','--tuples-only','--no-align','--set','ON_ERROR_STOP=1','--host','127.0.0.1','--port','54322','--username','postgres','--dbname','postgres','--file',path.join(root,'supabase/tests/security_snapshot.sql')],{cwd:root,encoding:'utf8',timeout:30000,env:{...process.env,PGPASSWORD:'postgres',PGSSLMODE:'disable'}});
 const actual=JSON.parse(out.trim());
 for(const [section,count] of [['tables',5],['policies',13],['functions',6],['migrations',9]])
   assert.equal(actual[section]?.length,count,'wrong L8 metadata count: '+section);
 assert.deepStrictEqual(actual,expected,'L8 local/production catalog drift');
 console.log('ok: L8 exact production/local parity: five tables, 13 policies, six RPCs, nine migrations');
}
if(require.main===module)try{compare();}catch(e){console.error('FAIL L8 security parity: '+e.message);process.exitCode=1;}
module.exports={compare};
