// Install the Chromium that Playwright pins, in an order that survives a CI runner whose package mirrors are unreachable.
//
// Why this order: Playwright's with-deps install mode runs `apt-get update` first. On a runner that cannot resolve the Ubuntu
// mirrors that call hangs for minutes, and when the timeout kills `npx` the orphaned apt-get keeps its lock, so every later apt
// call fails and the browser is never even downloaded. So:
//   1. download the pinned browser without apt (Playwright's CDN, then the official Chrome-for-Testing files);
//   2. prove it launches — that is the real requirement, and hosted runners normally already have the host libraries;
//   3. only if it cannot launch, install host dependencies with apt, bounded and with its whole process group killed on timeout.
// Nothing is skipped: the job still fails if the browser cannot launch at the end.
import {spawn,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {homedir,tmpdir} from 'node:os';
const require=createRequire(import.meta.url);
const budget=Number(process.env.LEMMA_CHROMIUM_STEP_MS)||180_000;
/** Run a command and kill its whole process group on timeout, so a stuck apt-get cannot keep its lock. */
const run=(command,args,timeout=budget)=>new Promise(done=>{
 const child=spawn(command,args,{stdio:'inherit',env:process.env,detached:true});
 const timer=setTimeout(()=>{console.error(`${command} ${args.join(' ')} exceeded ${timeout} ms; stopping its process group.`);try{process.kill(-child.pid,'SIGKILL');}catch{/* already gone */}},timeout);
 child.on('exit',code=>{clearTimeout(timer);done(code);});
 child.on('error',()=>{clearTimeout(timer);done(1);});
});
const npx=(args,timeout)=>run('npx',args,timeout);
/** The authoritative check: a headless launch of the pinned Chromium, in a child process so a crash cannot take this script down. */
const launches=async()=>await run(process.execPath,['-e',
 "const {chromium}=require('playwright-core');(async()=>{const b=await chromium.launch({headless:true});const p=await b.newPage();await p.goto('about:blank');console.log('Chromium launch OK: '+b.version());await b.close();})().catch(e=>{console.error(String(e).split('\\n')[0]);process.exit(1);})"],60_000)===0;

const fallbackOnly=process.argv.includes('--official-fallback');

async function officialFallback(){
 if(process.platform!=='linux'||process.arch!=='x64')throw Error('The official fallback supports the Linux x64 CI runner only.');
 const packageRoot=dirname(require.resolve('playwright-core/package.json'));
 const descriptors=JSON.parse(readFileSync(join(packageRoot,'browsers.json'),'utf8')).browsers;
 const configured=process.env.PLAYWRIGHT_BROWSERS_PATH;
 const cache=configured==='0'?join(packageRoot,'.local-browsers'):configured?resolve(configured):join(process.env.XDG_CACHE_HOME||join(homedir(),'.cache'),'ms-playwright');
 mkdirSync(cache,{recursive:true});
 const temporary=mkdtempSync(join(tmpdir(),'lemma-chromium-'));
 try{
  for(const name of ['chromium','chromium-headless-shell']){
   const descriptor=descriptors.find(item=>item.name===name);
   if(!descriptor?.browserVersion||!/^\d+\.\d+\.\d+\.\d+$/.test(descriptor.browserVersion)||!/^\d+$/.test(descriptor.revision))throw Error('Invalid pinned Playwright browser metadata');
   const archive=name==='chromium'?'chrome-linux64':'chrome-headless-shell-linux64';
   const url=`https://storage.googleapis.com/chrome-for-testing-public/${descriptor.browserVersion}/linux64/${archive}.zip`;
   const zip=join(temporary,archive+'.zip'),destination=join(cache,name.replaceAll('-','_')+'-'+descriptor.revision);
   console.log(`Official CFT fallback: ${name} ${descriptor.browserVersion}, revision ${descriptor.revision}`);
   execFileSync('curl',['--fail','--location','--retry','2','--max-time','180','--output',zip,url],{stdio:'inherit'});
   mkdirSync(destination,{recursive:true});
   execFileSync('python3',['-c',`import pathlib,sys,zipfile,os
archive,destination=sys.argv[1:]
root=pathlib.Path(destination).resolve()
with zipfile.ZipFile(archive) as z:
 if z.testzip() is not None: raise RuntimeError('Corrupt browser archive')
 for item in z.infolist():
  if not (root/item.filename).resolve().is_relative_to(root): raise RuntimeError('Invalid browser archive path')
 z.extractall(root)
 for item in z.infolist():
  path=root/item.filename
  mode=(item.external_attr>>16)&0o777
  if path.exists() and mode: os.chmod(path,mode)
`,zip,destination],{stdio:'inherit'});
   const executable=join(destination,archive,name==='chromium'?'chrome':'chrome-headless-shell');
   const version=execFileSync(executable,['--version'],{encoding:'utf8'});
   if(!version.includes(descriptor.browserVersion))throw Error('Downloaded Chromium version does not match the lockfile');
   writeFileSync(join(destination,'INSTALLATION_COMPLETE'),'');
   console.log(version.trim());
  }
 }finally{rmSync(temporary,{recursive:true,force:true});}
}

// 1. The browser, without apt.
if(fallbackOnly||await npx(['playwright','install','chromium'])!==0){
 if(!fallbackOnly)console.warn('Playwright could not download Chromium; using the official Chrome-for-Testing files.');
 await officialFallback();
}
// 2. Does it launch? Hosted runners normally already have the host libraries, so apt is never touched.
if(await launches())process.exit(0);
// 3. Missing host libraries: install them, bounded, and check again. A failure here still fails the job.
console.warn('Chromium did not launch; installing its host dependencies.');
await npx(['playwright','install-deps','chromium']);
if(await launches())process.exit(0);
throw Error('Chromium cannot launch after installation');
