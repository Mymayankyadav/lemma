// Atlas v3 cutover release step (docs/current/N180.md):
//   node --experimental-strip-types scripts/atlas/release.mts export.json gates.json <owner-uuid> <resume_tokens_max> [--parity-ok]
// export.json: the `rows` object from scripts/atlas/export.sql. gates.json: {"gates":{...}} from research/sim/gates.py.
// Prints the model_fits insert (run it as the service role after the Owner's yes) and the release report for atlas_v2_activate. Writes nothing itself.
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {modelFit,fitSql,diagnostics,releaseReport,betaImports} from './release-core.ts';
const [exportFile,gatesFile,owner,resume,...flags]=process.argv.slice(2);
if(!exportFile||!gatesFile||!owner||!resume)throw Error('usage: release.mts export.json gates.json <owner-uuid> <resume_tokens_max> [--parity-ok]');
const raw=JSON.parse(readFileSync(exportFile,'utf8')),rows=raw.rows??raw,gates=JSON.parse(readFileSync(gatesFile,'utf8')).gates;
const walk=(dir:string):string[]=>readdirSync(dir).flatMap(n=>{const p=join(dir,n);return statSync(p).isDirectory()?walk(p):/\.(ts|tsx|mts)$/.test(n)?[p]:[];});
const sources=Object.fromEntries([...walk('src'),...walk('supabase/functions')].map(p=>[p,readFileSync(p,'utf8')]));
const fit=modelFit(rows),now=new Date(),d=diagnostics(rows,fit,now),beta=betaImports(sources);
const report=releaseReport({gates,diagnostics:d.diagnostics,card_tokens_max:d.card_tokens_max,resume_tokens_max:Number(resume),parity_ok:flags.includes('--parity-ok'),no_beta_imports:beta.length===0});
console.log(JSON.stringify({model_fit_sql:fitSql(owner,fit),fit_input_hash:fit.input_hash,beta_imports:beta,report},null,1));
