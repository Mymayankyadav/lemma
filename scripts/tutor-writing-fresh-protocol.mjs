// Record inputs and frozen selection before the fresh follow-up replay.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const dir='docs/implementation/2026-11-21/writing-aid-tutor';
const hash=async p=>createHash('sha256').update(await readFile(p)).digest('hex');
const validation=JSON.parse(await readFile(`${dir}/validation-pre-fix.json`,'utf8'));
const manifest=JSON.parse(await readFile(`${dir}/manifest.json`,'utf8'));
const sources=['scripts/tutor-writing-fresh-dataset.py',`${dir}/fresh-dataset.json`,`${dir}/validation-pre-fix.json`,
 `${dir}/models-pre-fix.json`,`${dir}/manifest.json`,'src/features/tutor/writingAid/engine.ts',
 'src/features/tutor/writingAid/learning.ts','src/features/tutor/writingAid/policy.ts','src/features/tutor/writingAid/tutorContext.ts'];
const hashes=Object.fromEntries(await Promise.all(sources.map(async p=>[p,await hash(p)])));
const protocol={scope:'Fresh synthetic post-fix follow-up drafted after earlier outcomes; not independent preregistration.',
 winnerFrozenFromPriorValidation:validation.winner,modelSelection:'No retraining or reselection; report all 24 configurations.',
 split:'12 new users, eight new family IDs, new templates, days 100–111 after the earlier days 0–41.',
 candidates:manifest.candidates.map(x=>x.id),hashes};
await writeFile(`${dir}/fresh-protocol.json`,JSON.stringify(protocol,null,2)+'\n');
console.log(JSON.stringify({winner:protocol.winnerFrozenFromPriorValidation,hashes}));
