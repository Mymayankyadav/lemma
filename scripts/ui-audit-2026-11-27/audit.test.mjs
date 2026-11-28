// node --test scripts/ui-audit-2026-11-27/audit.test.mjs
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

test('discovery replays the thirteenth control, replacement dialogs and query-value transitions',async t=>{
  const html=`<!doctype html><main id="main-content"><h1>Audit fixture</h1><section></section></main><script>
    const host=document.querySelector('section');
    function render(){
      const h=location.hash.slice(1);
      if(h!=='/fixture'){host.innerHTML='<h2>'+h.slice(1)+'</h2>';return;}
      host.innerHTML=Array.from({length:12},(_,i)=>'<button>Idle '+i+'</button>').join('')+
        '<button onclick="first()">Open editor</button>';
    }
    function first(){host.innerHTML='<dialog open aria-label="Editor"><button onclick="second()">More</button></dialog>';}
    function second(last=false){
      host.innerHTML='<dialog open aria-label="Options"><p>Step '+(last?2:1)+'</p><button>Next</button></dialog>';
      host.querySelector('button').onclick=last?links:()=>second(true);
    }
    function links(){host.innerHTML='<dialog open aria-label="Destinations"><a href="#/calendar?view=week">Week</a><a href="#/calendar?view=month">Month</a></dialog>';}
    onhashchange=render;render();
  </script>`;
  const server=createServer((_,res)=>{res.setHeader('Content-Type','text/html');res.end(html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
  process.env.AUDIT_URL='http://127.0.0.1:'+server.address().port+'/lemma/?demo=1';
  process.env.AUDIT_OUT=mkdtempSync(join(tmpdir(),'lemma-audit-test-'));process.env.AUDIT_IMAGES='none';
  const {crawl,routeKey}=await import('./sweep.mjs');
  const {launchBrowser}=await import('./lib.mjs');
  const browser=await launchBrowser();t.after(()=>browser.close());
  const seed={id:'test',hash:'/fixture'};
  assert.notEqual(routeKey('/calendar?view=week'),routeKey('/calendar?view=month'));
  assert.equal(routeKey('/p/analysis?tab=exam&date=2026-11-01'),routeKey('/p/topology?date=2026-12-01&tab=exam'));
  const report=await crawl(browser,'phone-p',[seed]);
  assert.deepEqual(report.errors,[]);assert.equal(report.summary.complete,true);
  const paths=Object.values(report.states);
  for(const value of ['week','month']){
    const leaf=paths.find(state=>state.hash==='#/calendar?view='+value);
    assert.deepEqual(leaf?.via.map(step=>step[1]),['Open editor','More','Next','Next',value==='week'?'Week':'Month']);
  }
  assert.ok(report.edges.find(e=>e.action==='More'&&e.motion.frames>0));
  const partial=await crawl(browser,'phone-p',[seed],{maxControls:1,maxStates:1});
  assert.equal(partial.summary.complete,false);assert.equal(partial.deferred,12);
  assert.deepEqual(readdirSync(process.env.AUDIT_OUT),[]);
});

test('the default plan schedules every stage on every layout for all four motion profiles',async()=>{
  const {spawnSync}=await import('node:child_process');
  const {DEVICES,profiles}=await import('./lib.mjs');
  const cmd=spawnSync(process.execPath,['scripts/ui-audit-2026-11-27/run-all.mjs','--dry','--devices=all','--profiles='+profiles.join(',')],{encoding:'utf8'});
  assert.equal(cmd.status,0,cmd.stderr);
  for(const profile of profiles)for(const device of Object.keys(DEVICES))for(const stage of ['capture','keyboard','sweep','motion','states']){
    assert.ok(cmd.stdout.includes('/'+stage+'.mjs '+device+' '+profile+'\n'),[stage,device,profile].join(' '));
  }
});

test('compact packaging uses the same eight examples even in a directory with extra images',async()=>{
  const {execFileSync}=await import('node:child_process');
  const {mkdirSync,readFileSync,writeFileSync}=await import('node:fs');
  const {dirname}=await import('node:path');
  const examples=JSON.parse(readFileSync(new URL('./evidence.json',import.meta.url),'utf8'));
  assert.equal(examples.length,8);
  const root=mkdtempSync(join(tmpdir(),'lemma-audit-pack-'));
  const png=execFileSync('python3',['-c',"from PIL import Image; import sys; Image.new('RGB',(80,120)).save(sys.stdout.buffer,format='PNG')"]);
  for(const profile of ['standard','reduced'])for(const file of [...examples.map(row=>row[3]),'shots/desktop/extra.png']){
    const path=join(root,'profiles',profile,file);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,png);
  }
  for(const mode of ['compact','none']){
    execFileSync('python3',['scripts/ui-audit-2026-11-27/package.py'],{env:{...process.env,AUDIT_OUT:root,AUDIT_IMAGES:mode,METRICS_ONLY:'0'}});
    const index=JSON.parse(execFileSync('python3',['-c',"import sys, zipfile; print(zipfile.ZipFile(sys.argv[1]).read('index.json').decode())",join(root,'ui-audit-images-1.zip')]));
    assert.equal(index.images.length,mode==='compact'?8:0);
    assert.ok(index.images.every(i=>i.width===80&&i.height===120&&i.file.startsWith('standard/')));
  }
});
