// One command for the whole audit, in dependency order. Needs: npm ci, Python 3 with Pillow, and nothing else.
//   node scripts/ui-audit-2026-11-27/run-all.mjs [--devices=all|phones|tablets|a,b] [--skip=sweep,motion,states,keyboard,zip] [--dry]
// Order: coverage gate (static) -> build + serve -> per device: capture, keyboard, sweep -> metrics aggregate ->
//        motion (one device at a time, so timings are real) -> hover/press/focus states -> keyframe strips -> zip.
// Output goes to AUDIT_OUT (default artifacts/ui-audit-2026-11-27). AUDIT_URL skips the build and uses that server.
// The build must allow flag overrides: the first-use / stress / extreme demo profiles and /kit need VITE_ALLOW_FLAG_OVERRIDES=1.
import {spawn,spawnSync} from 'node:child_process';
import {pickDevices,SCRATCH} from './lib.mjs';
const args=process.argv.slice(2);const flag=(n,d)=>args.find(a=>a.startsWith('--'+n+'='))?.split('=')[1]??d;
const devices=pickDevices(flag('devices','all')),skip=new Set((flag('skip','')||'').split(',').filter(Boolean)),dry=args.includes('--dry');
const here='scripts/ui-audit-2026-11-27/';
const run=(cmd,a,env={})=>{console.log('\n$',cmd,...a);if(dry)return 0;const r=spawnSync(cmd,a,{stdio:'inherit',env:{...process.env,...env}});if(r.status)console.error('  exited',r.status);return r.status;};
if(run('node',[here+'coverage.mjs']))process.exit(1);
let server;const url=process.env.AUDIT_URL;
if(!url){
 run('npm',['run','build'],{VITE_ALLOW_FLAG_OVERRIDES:'1'});
 if(!dry){server=spawn('node',['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4177','--strictPort'],{stdio:'inherit'});
  for(let i=0;i<60;i++){if(await fetch('http://127.0.0.1:4177/lemma/').then(r=>r.ok).catch(()=>false))break;await new Promise(r=>setTimeout(r,250));}}
}
// Per-device work may run in parallel (3 at a time); motion may not.
const pool=async(jobs,n)=>{const q=[...jobs];await Promise.all(Array.from({length:n},async()=>{while(q.length)await q.shift()();}));};
await pool(devices.map(d=>async()=>{
 await new Promise(res=>{const steps=[['capture.mjs',[d]],...(skip.has('keyboard')?[]:[['keyboard.mjs',[d]]]),...(skip.has('sweep')?[]:[['sweep.mjs',[d]]])];
  (async()=>{for(const [f,a] of steps)await new Promise(r=>{console.log('\n$ node',f,...a);if(dry)return r();spawn('node',[here+f,...a],{stdio:'inherit'}).on('exit',r);});res();})();});
}),3);
run('python3',[here+'agg.py']);
if(!skip.has('motion'))for(const d of devices.filter(d=>/^(phone-p|phone-l|ipad-p|ipad-l|desktop)$/.test(d)))run('node',[here+'motion.mjs',d]);
if(!skip.has('states'))for(const d of devices.filter(d=>/^(ipad-l|desktop)$/.test(d)))run('node',[here+'states.mjs',d]);
for(const d of devices.filter(d=>/^(phone-p|phone-l|ipad-p|ipad-l|desktop)$/.test(d)))run('python3',[here+'strips.py',d]);
if(!skip.has('zip'))run('python3',[here+'package.py']);
server?.kill();
console.log('\nDone. Output:',SCRATCH);
