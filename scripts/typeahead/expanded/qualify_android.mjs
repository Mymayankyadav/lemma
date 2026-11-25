/** Run against a connected lab phone and a debuggable build of the normal Lemma Android WebView. */
import {createHash, randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile, writeFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {chromium} from '@playwright/test';

const {values: opts} = parseArgs({options: {
  adb: {type: 'string', default:'adb'}, serial:{type:'string'}, out:{type:'string',default:'android-qualification.json'},
  pack:{type:'string'}, reference:{type:'string'}, renderer:{type:'string'},
}});
const pkg='io.github.mymayankyadav.lemma';
function adb(...args) {return execFileSync(opts.adb,args,{encoding:'utf8',timeout:20_000}).trim();}
const result={qualified:false, started:new Date().toISOString()};
let port, browser, selectedSerial, deviceFile;
try {
  const connected=adb('devices','-l').split('\n').slice(1).filter(line=>/^\S+\s+device\b/u.test(line)).map(line=>line.split(/\s/u)[0]);
  const serial=opts.serial ?? (connected.length===1 ? connected[0] : undefined);
  if (!serial || !connected.includes(serial)) throw new Error('A uniquely selected, authorized physical Android phone is required');
  selectedSerial=serial;
  const device=(...args)=>adb('-s',serial,...args);
  const shell=(...args)=>device('shell',...args);
  if (serial.startsWith('emulator-') || ['ro.kernel.qemu','ro.boot.qemu'].some(prop=>shell('getprop',prop)==='1')) throw new Error('Emulator cannot qualify a phone');
  result.device={model:shell('getprop','ro.product.model'),build:shell('getprop','ro.build.fingerprint'), os:shell('getprop','ro.build.version.release'),
    webview:shell('dumpsys','webviewupdate').split('\n').find(x=>x.includes('Current WebView package'))?.trim()};
  if (!opts.pack || !opts.reference) throw new Error('Supply the pinned .lemmapack and native reference');
  const descriptor=JSON.parse(await readFile(new URL('../../../src/features/tutor/writingAid/decoder/android-fp16.json',import.meta.url),'utf8'));
  const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
  const referenceBytes=await readFile(opts.reference);
  result.identity={packageSha256:digest(await readFile(opts.pack)),referenceSha256:digest(referenceBytes)};
  if (result.identity.packageSha256!==descriptor.packageSha256 ||
      result.identity.referenceSha256!=='4f626357c80b481c2a7f602aa4d628a59eaee9d1cb3c26d0f8bf03e3a0fed886') throw new Error('The phone lab inputs differ from the pinned export');
  shell('am','start','-W','-n',pkg+'/.MainActivity','--ez','lemmaTypeaheadLab','true');
  const pid=shell('pidof',pkg).split(/\s/u)[0];
  if (!/^\d+$/u.test(pid)) throw new Error('Lemma is not running');
  port=device('forward','tcp:0','localabstract:webview_devtools_remote_'+pid);
  browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
  const context=browser.contexts()[0], page=context.pages().find(tab=>new URL(tab.url()).hostname==='localhost');
  if (!page) throw new Error('The installed Lemma WebView is unavailable');
  const url=new URL('/lemma/',page.url());
  url.search=new URLSearchParams({demo:'1',flags:'v7Shell,v6Shell,tutorScratch,writingAidSettings,typeaheadV2',
    'typeahead-replay':'1','typeahead-arm':'neural','typeahead-graph-trial':'1','typeahead-strict-trial':'1'}).toString();
  url.hash='/p/real-analysis/cp/CP4/tutor';
  await page.goto(url.href);
  const answer=page.getByRole('textbox',{name:'Your answer',exact:true});
  const open=page.getByRole('button',{name:'Write a question',exact:true});
  async function openComposer() {
    await open.or(answer).filter({visible:true}).first().waitFor();
    if (!await answer.isVisible()) {
      try {await open.click({timeout:2000});} catch (error) {if (!await answer.isVisible()) throw error;}
    }
    await answer.focus();
  }
  const openSettings=async()=>{
    await page.getByRole('button',{name:'Session actions',exact:true}).click();
    await page.getByRole('button',{name:'Writing assistance',exact:true}).click();
  };
  function nativeNodes() {
    const xml=shell('uiautomator','dump','/dev/tty');
    return [...xml.matchAll(/<node\\s+([^>]+)>/gu)].map(([,raw])=>{
      const fields=Object.fromEntries([...raw.matchAll(/([\\w-]+)="([^"]*)"/gu)].map(([,key,value])=>[key,value]));
      const box=/^\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]$/u.exec(fields.bounds)?.slice(1).map(Number);
      return {...fields,box};
    });
  }
  function tapNative(node) {
    const [x,y,right,bottom]=node.box;
    shell('input','tap',String(Math.round((x+right)/2)),String(Math.round((y+bottom)/2)));
  }
  await openComposer();
  await openSettings();
  const settings=page.getByRole('dialog',{name:'Writing assistance',exact:true});
  const remove=settings.getByRole('button',{name:'Remove model'});
  const alreadyInstalled=await remove.isVisible();
  if (!alreadyInstalled) {
    // Chrome's remote file transfer caps buffers at 50 MiB. Use the Android document picker.
    const name='lemma-lab-'+randomUUID()+'.lemmapack';
    deviceFile='/sdcard/Download/'+name;
    device('push',opts.pack,deviceFile);
    shell('am','broadcast','-a','android.intent.action.MEDIA_SCANNER_SCAN_FILE','-d','file://'+deviceFile);
    await settings.locator('input[type=file]').click();
    let selected=false, openedDrawer=false, openedDownloads=false;
    for (let attempt=0;attempt<12 && !selected;attempt++) {
      const nodes=nativeNodes().filter(node=>node.box);
      const file=nodes.find(node=>node.text===name || node['content-desc']?.includes(name));
      if (file) {tapNative(file);selected=true;break;}
      const downloads=nodes.find(node=>node.text==='Downloads' || node['content-desc']==='Downloads');
      const drawer=nodes.find(node=>/show roots|navigation drawer|show locations/iu.test(node['content-desc']??''));
      if (downloads && !openedDownloads) {tapNative(downloads);openedDownloads=true;}
      else if (drawer && !openedDrawer) {tapNative(drawer);openedDrawer=true;}
      await page.waitForTimeout(350);
    }
    if (!selected) throw new Error('The native document picker did not select the staged FP16 package');
  }
  await remove.waitFor({timeout:120000});
  await page.keyboard.press('Escape');
  await settings.waitFor({state:'hidden'});
  await page.reload();
  await openComposer();
  await page.keyboard.type('We use the ');
  const gpu=await page.evaluate(async()=>{const adapter=await navigator.gpu?.requestAdapter();return adapter &&
    {features:[...adapter.features],vendor:adapter.info?.vendor,device:adapter.info?.device,description:adapter.info?.description,
      fallback:adapter.info?.isFallbackAdapter};});
  result.adapter=gpu ?? null;
  const refs=JSON.parse(referenceBytes);
  if (refs.length<300 || !refs.some(r=>r.ids.length===512) || !refs.some(r=>r.ids.length===1)) throw new Error('Incomplete native reference');
  const rows=[];
  for (const [i,r] of refs.entries()) {
    const sample=await page.evaluate(test=>new Promise((resolve,reject)=>{
      const receive=e=>{if(e.detail.labId!==test.labId)return;clearTimeout(timer);window.removeEventListener('lemma-typeahead-lab-result',receive);resolve(e.detail);};
      const timer=setTimeout(()=>{window.removeEventListener('lemma-typeahead-lab-result',receive);reject(new Error('No FP16 worker parity reply'));},30000);
      window.addEventListener('lemma-typeahead-lab-result',receive);window.dispatchEvent(new CustomEvent('lemma-typeahead-lab-case',{detail:test}));
    }),{labId:String(i),ids:r.ids,stablePrefix:r.stablePrefix,previousIds:r.previousIds});
    const same=list=>Array.isArray(list)&&[...list].sort().join() === [...r.top].sort().join();
    rows.push({group:r.group,length:r.ids.length,prefillMs:sample.prefillMs,decodeMs:sample.decodeMs,provider:sample.provider,
      agrees:same(sample.top),cachedAgrees:(r.ids.length===1||same(sample.cachedTop))&&(!r.previousIds||same(sample.retokenizedTop))});
  }
  const quantile=(values,p)=>values.toSorted((a,b)=>a-b)[Math.ceil(p*values.length)-1];
  result.parity=Object.fromEntries([...new Set(rows.map(r=>r.group))].map(group=>{const cases=rows.filter(r=>r.group===group);
    return [group,{count:cases.length,full:cases.filter(r=>r.agrees).length,cached:cases.filter(r=>r.cachedAgrees).length}];}));
  result.provider=[...new Set(rows.map(r=>r.provider))];
  result.prefillP95=quantile(rows.map(r=>r.prefillMs),.95);
  result.decodeP95=quantile(rows.map(r=>r.decodeMs).filter(Number.isFinite),.95);
  const mem=process=>{const data=shell('dumpsys','meminfo',process); return Number(/TOTAL PSS:\s*(\d+)/u.exec(data)?.[1])||null;};
  let renderer=opts.renderer;
  try {
    const session=await browser.newBrowserCDPSession();
    const {processInfo}=await session.send('SystemInfo.getProcessInfo');
    const ids=processInfo.filter(process=>process.type.toLowerCase()==='renderer').map(process=>String(process.id));
    if (renderer && ids.length && !ids.includes(renderer)) throw new Error('Renderer belongs to another browser');
    if (!renderer && ids.length===1) renderer=ids[0];
    await session.detach();
  } catch (error) {if (String(error.message).includes('another browser')) throw error;}
  if (renderer && (!/^\d+$/u.test(renderer) || !/sandboxed_process|webview/iu.test(shell('cat','/proc/'+renderer+'/cmdline')))) throw new Error('Invalid renderer process');
  result.rendererPid=renderer ?? null;
  result.memory=[];
  result.menuDelivery={requests:0,onTimeWithScores:0,deliveredContinuations:0};
  async function drainDelivery() {
    const marks=await page.evaluate(()=>{
      const results=performance.getEntriesByName('lemma.typeahead.neural.coverage').map(entry=>entry.detail);
      performance.clearMarks('lemma.typeahead.neural.coverage');
      return results;
    });
    for (const row of marks) {
      result.menuDelivery.requests++;
      if (row.matchedPending && row.arrivedBeforeDeadline && !row.late) {
        if (row.scored>0) result.menuDelivery.onTimeWithScores++;
        if (row.hasContinuation) result.menuDelivery.deliveredContinuations++;
      }
    }
  }
  const latencies=[];
  const tap=page.getByRole('button',{name:'q',exact:true}).first();
  const view=nativeNodes().find(node=>node.class==='android.webkit.WebView' && node.box)?.box;
  if (!view) throw new Error('Could not locate the physical WebView bounds');
  const scale=(view[2]-view[0])/await page.evaluate(()=>innerWidth);
  await drainDelivery();
  const end=Date.now()+600000;
  while (Date.now()<end) {
    await answer.fill('');await answer.focus();
    if (await tap.isVisible()) {
      const box=await tap.boundingBox();
      // Arm the listener before adb sends the tap. Require the intended key and visible edit.
      await tap.evaluate(key=>{
        window.lemmaTapResult=new Promise(resolve=>{
          const field=document.querySelector('[aria-label="Your answer"]');
          const handle=event=>{
            if (!key.contains(event.target)) return;
            const started=event.timeStamp;
            const check=()=>{
              if (field?.textContent==='q') {clean();requestAnimationFrame(()=>resolve(performance.now()-started));}
            };
            observer=new MutationObserver(check);
            observer.observe(field,{childList:true,subtree:true,characterData:true});
            check();
          };
          let observer;
          const clean=()=>{clearTimeout(timer);observer?.disconnect();document.removeEventListener('pointerdown',handle,true);};
          const timer=setTimeout(()=>{clean();resolve(null);},2000);
          document.addEventListener('pointerdown',handle,true);
        });
      });
      shell('input','tap',String(Math.round(view[0]+(box.x+box.width/2)*scale)),String(Math.round(view[1]+(box.y+box.height/2)*scale)));
      latencies.push(await page.evaluate(()=>window.lemmaTapResult));
    }
    await page.keyboard.type('We use the upper bound of the sequence. ',{delay:60});
    await page.keyboard.press('ArrowLeft');await page.keyboard.press('Backspace');await page.keyboard.insertText('s');
    await drainDelivery();
    result.memory.push({appPssKiB:mem(pid),rendererPssKiB:renderer?mem(renderer):null});
    await page.waitForTimeout(2000);
  }
  result.sustainedMinutes=10;
  const measured=latencies.filter(Number.isFinite);
  result.adbTap={attempts:latencies.length, valid:measured.length, missed:latencies.length-measured.length,
    pointerToFrameP95:measured.length ? quantile(measured,.95) : null};
  result.peakAppAndRendererPssKiB=renderer?Math.max(...result.memory.map(row=>row.appPssKiB+row.rendererPssKiB)):null;
  await drainDelivery();
  await context.setOffline(true);
  try {
    await page.reload();
    await openComposer();
    await openSettings();await remove.waitFor();
    result.offlineInstalled=true;
    await page.keyboard.press('Escape');await settings.waitFor({state:'hidden'});
    await page.reload();await openComposer();await answer.focus();await page.keyboard.type('We use the ');
    result.offlineWorker=await page.evaluate(()=>new Promise(resolve=>{
      const receive=e=>{if(e.detail.labId!=='offline')return;clearTimeout(timer);window.removeEventListener('lemma-typeahead-lab-result',receive);resolve(e.detail);};
      const timer=setTimeout(()=>{window.removeEventListener('lemma-typeahead-lab-result',receive);resolve(null);},30000);
      window.addEventListener('lemma-typeahead-lab-result',receive);
      setTimeout(()=>window.dispatchEvent(new CustomEvent('lemma-typeahead-lab-case',{detail:{labId:'offline',ids:[1,2]}})),500);
    }));
    await openSettings();
    if (!alreadyInstalled) {await remove.click();await remove.waitFor({state:'detached'});result.removed=true;}
  } finally {await context.setOffline(false);}
  result.deviceGatesPassed=Object.values(result.parity).every(x=>x.full/x.count>=.95&&x.cached/x.count>=.95) &&
    result.decodeP95<=15 && result.offlineWorker?.top?.length===3 && result.adbTap.valid>=100 && result.adbTap.missed===0 && result.memory.every(m=>m.appPssKiB&&m.rendererPssKiB);
  result.status='Measured; promotion also requires the held-out product replay.';
} catch(error) {result.status='pending';result.reason=String(error.message);process.exitCode=2;}
finally {
  try {
    if (browser) await browser.close();
    if (port) adb('-s',selectedSerial,'forward','--remove','tcp:'+port);
    if (deviceFile) adb('-s',selectedSerial,'shell','rm',deviceFile);
  } catch (error) {result.cleanupError=String(error.message);}
  await writeFile(opts.out,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:result.status,qualified:result.qualified,reason:result.reason}));
}
