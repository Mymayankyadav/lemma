// Keep Playwright's pinned browser version and tests intact when its CDN serves
// HTML instead of the archive. Fallback uses the same vendor-owned CFT files.
import {spawnSync,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {homedir,tmpdir} from 'node:os';
const require=createRequire(import.meta.url);
const run=(args,timeout)=>spawnSync('npx',args,{stdio:'inherit',env:process.env,timeout}).status;
const fallbackOnly=process.argv.includes('--official-fallback');
if(!fallbackOnly&&run(['playwright','install','--with-deps','chromium'],180_000)===0)process.exit(0);
if(process.platform!=='linux'||process.arch!=='x64')throw Error('The official fallback supports the Linux x64 CI runner only.');
// Install host dependencies even when the normal installer failed before them.
if(!fallbackOnly&&run(['playwright','install-deps','chromium'])!==0)throw Error('Chromium host dependencies could not be installed.');
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
// Let Playwright finish its own FFmpeg and host validation against the exact
// installed browser. A failure here still fails CI; no test is skipped.
if(!fallbackOnly&&run(['playwright','install','chromium'],180_000)!==0)throw Error('Playwright browser installation is incomplete');
