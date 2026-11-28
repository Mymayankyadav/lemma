// Run timed probes sequentially. Each invocation has a fresh output directory and a manifest of attempted work.
import {spawn,spawnSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pickDevices,profiles,SCRATCH} from './lib.mjs';
import {imageMode} from './evidence.mjs';
const args=process.argv.slice(2);
const option=(name,fallback)=>args.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3)??fallback;
const csv=s=>s.split(',').filter(Boolean);
const devices=pickDevices(option('devices',process.env.AUDIT_DEVICES)),modes=csv(option('profiles',process.env.AUDIT_PROFILE??(process.env.AUDIT_BETA==='1'?'beta':profiles.join(','))));
const sceneIds=csv(option('scenes','')),caseIds=csv(option('cases',''));
const skip=new Set(csv(option('skip',''))),dry=args.includes('--dry');
if(!modes.length||modes.some(m=>!profiles.includes(m)))throw new Error('Select profiles from '+profiles);
const here='scripts/ui-audit-2026-11-27/',completed=[],failures=[];
if(!dry)mkdirSync(SCRATCH,{recursive:true});
const out=dry?join(SCRATCH,'<run>'):mkdtempSync(join(SCRATCH,'run-'));
const report={devices,profiles:modes,images:imageMode,scenes:sceneIds,cases:caseIds,skip:[...skip],completed,failures};
function save(){if(!dry)writeFileSync(join(out,'run.json'),JSON.stringify(report,null,2));}
function run(cmd,argv,env={}){
  console.log('$',cmd,...argv,env.AUDIT_PROFILE??'');
  if(dry)return true;
  const result=spawnSync(cmd,argv,{stdio:'inherit',env:{...process.env,...env}});
  const item={command:[cmd,...argv],profile:env.AUDIT_PROFILE,status:result.status};
  if(result.status===0)completed.push(item);else{failures.push({...item,error:result.error?.message??result.signal});process.exitCode=1;}
  save();return result.status===0;
}
let server;
async function main(){
  save();
  if(!run(process.execPath,[here+'coverage.mjs']))return;
  if(!process.env.AUDIT_URL){
    if(!run('npm',['run','build'],{VITE_ALLOW_FLAG_OVERRIDES:'1'}))return;
    if(!dry){
      server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4177','--strictPort'],{stdio:'inherit'});
      let ready=false;
      for(let i=0;i<80&&server.exitCode===null;i++){
        if(await fetch('http://127.0.0.1:4177/lemma/').then(r=>r.ok).catch(()=>false)){ready=true;break;}
        await new Promise(r=>setTimeout(r,250));
      }
      if(!ready||server.exitCode!==null)throw new Error('The audit preview did not start');
    }
  }
  for(const profile of modes){
    const env={AUDIT_OUT:join(out,'profiles',profile),AUDIT_PROFILE:profile,AUDIT_IMAGES:imageMode,AUDIT_SCENES:sceneIds.join(',')};
    for(const device of devices)for(const stage of ['capture','keyboard','sweep','motion','states']){
      if(skip.has(stage))continue;
      const filters=stage==='motion'?caseIds:stage==='keyboard'?[]:sceneIds;
      run(process.execPath,[here+stage+'.mjs',device,...filters],env);
    }
    if(!skip.has('capture'))run('python3',[here+'agg.py'],env);
  }
  if(!skip.has('zip'))run('python3',[here+'package.py'],{AUDIT_OUT:out,AUDIT_IMAGES:imageMode});
}
try{await main();}
catch(error){failures.push({error:error.message});process.exitCode=1;console.error(error.message);}
finally{server?.kill();save();}
console.log(failures.length?'Incomplete audit:':'Audit output:',out);
