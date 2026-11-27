import {expect,test,type Page} from '@playwright/test';
import {EQUATION_MODEL, EQUATION_MODEL_CACHE, equationModelUrl} from '../../src/features/tutor/input/equationModel';
import symbolManifest from '../../public/models/tutor-symbols/detypify-0.3.0-lemma-v1/manifest.json' with {type:'json'};

const fixtures=Object.values(EQUATION_MODEL.files).map(equationModelUrl);
const tutor='/lemma/?demo=1&flags=v7Shell,tutorScratch#/p/real-analysis/cp/CP4/tutor';
const runtimeCache='lemma-tutor-symbol-assets-v'+symbolManifest.cacheGeneration+'-'+symbolManifest.assetSetVersion;
const wasm='/lemma/models/tutor-symbols/'+symbolManifest.assetSetVersion+'/'+symbolManifest.files.wasm.path;
test.use({serviceWorkers:'block'});

async function seed(page:Page, runtime:'none'|'valid'|'invalid'){
  await page.evaluate(async({name,urls,runtime,runtimeCache,wasm})=>{
    const cache=await caches.open(name);
    for(const url of urls)await cache.put(url,new Response('truncated'));
    if(runtime!=='none'){
      const c=await caches.open(runtimeCache);
      await c.put(wasm,runtime==='valid'?await fetch(wasm):new Response('truncated-wasm'));
    }
  },{name:EQUATION_MODEL_CACHE,urls:fixtures,runtime,runtimeCache,wasm});
}
async function openEquation(page:Page){
  await page.getByRole('button',{name:'Write a question'}).click();
  await page.getByRole('textbox',{name:'Your answer',exact:true}).focus();
  await page.getByRole('group',{name:'Answer keyboard',exact:true}).getByRole('button',{name:'Equation mode',exact:true}).click();
}
async function draw(page:Page){
  const box=(await page.locator('.tutor-equation-paper').boundingBox())!;
  await page.mouse.move(box.x+20,box.y+40);await page.mouse.down();
  await page.mouse.move(box.x+80,box.y+65,{steps:6});await page.mouse.up();
}
for(const installedRuntime of [false,true]){
  test('truncated cached equation weights wait for repair consent; cached runtime: '+installedRuntime,async({page,context})=>{
    const external:string[]=[],runtimeRequests:string[]=[];
    await context.route('https://huggingface.co/**',route=>{
      external.push(route.request().url());
      return route.fulfill({status:503,body:'offline',headers:{'access-control-allow-origin':'*'}});
    });
    await page.goto(tutor);
    await seed(page,installedRuntime?'valid':'none');
    context.on('request',req=>{if(req.url().endsWith(wasm))runtimeRequests.push(req.url());});
    await openEquation(page);
    await draw(page);
    expect(runtimeRequests).toEqual([]);
    expect(external).toEqual([]);
    await page.getByRole('button',{name:'Read equation',exact:true}).click();
    const agree=page.getByRole('button',{name:/Read equations on this device/});
    await expect(agree).toBeVisible();
    expect(external).toEqual([]);
    const snapshot=()=>page.evaluate(async({name,urls})=>{
      const cache=await caches.open(name);
      return Promise.all(urls.map(async url=>(await cache.match(url))?.text()));
    },{name:EQUATION_MODEL_CACHE,urls:fixtures});
    expect(await snapshot()).toEqual(['truncated','truncated','truncated']);
    await agree.click();
    await expect(page.getByRole('region',{name:'Equation mode',exact:true}).getByRole('alert')).toContainText('503');
    expect(external.length).toBeGreaterThan(0);
    expect(external.every(url=>fixtures.includes(url))).toBe(true);
    expect(await snapshot()).toEqual(['truncated','truncated','truncated']);
  });
}


test('Read retains cached WASM when the packaged fallback fails, then replaces it after verification',async({page,context})=>{
  const external:string[]=[];
  await context.route('https://huggingface.co/**',route=>{
    external.push(route.request().url());
    return route.fulfill({status:503,headers:{'access-control-allow-origin':'*'}});
  });
  await page.goto(tutor);
  await seed(page,'invalid');
  const size=()=>page.evaluate(async({cache,wasm})=>{
    const hit=await (await caches.open(cache)).match(wasm);
    return (await hit?.arrayBuffer())?.byteLength ?? -1;
  },{cache:runtimeCache,wasm});
  let failRuntime=true;
  await context.route('**'+wasm,route=>failRuntime?route.fulfill({status:503}):route.continue());
  await openEquation(page);
  await draw(page);
  const attempted=context.waitForEvent('response',r=>r.url().endsWith(wasm)&&r.status()===503);
  await page.getByRole('button',{name:'Read equation',exact:true}).click();
  await attempted;
  expect(await size()).toBe('truncated-wasm'.length);
  expect(external).toEqual([]);

  // A failed fetch must not make later interactive recovery impossible.
  failRuntime=false;
  const agree=page.getByRole('button',{name:/Read equations on this device/});
  const runtimeError=page.getByRole('alert').filter({hasText:'Could not read tutor model asset'});
  await expect(agree.or(runtimeError)).toBeVisible();
  if(await runtimeError.isVisible()){
    await page.getByRole('button',{name:'Try again',exact:true}).click();
  }
  await expect(agree).toBeVisible();
  await agree.click();
  await expect.poll(size).toBe(symbolManifest.files.wasm.bytes);
  expect(external.length).toBeGreaterThan(0);
});

for(const isolated of [false,true]){
  test('only nonisolated equation pages request speculative preparation; isolated: '+isolated,async({page,context})=>{
    // Both the entry document and the same-origin worker carry COEP in an isolated deployment.
    if(isolated)await context.route(/\/lemma\/(?:\?demo=1|assets\/equationRecognizer\.worker-)/,async route=>{
      const response=await route.fetch();
      await route.fulfill({response,headers:{...response.headers(),
        'cross-origin-opener-policy':'same-origin','cross-origin-embedder-policy':'require-corp'}});
    });
    // Check the actual Worker handoff, not page timing or a mock readiness result.
    await page.addInitScript(()=>{
      const probe={gotStatus:false,prepared:0,reads:0};
      Object.assign(window,{equationPrewarmProbe:probe});
      const Original=window.Worker;
      window.Worker=class extends Original {
        private equation:boolean;
        constructor(url:string|URL,options?:WorkerOptions) {
          super(url,options);
          this.equation=String(url).includes('equationRecognizer.worker');
          if(this.equation)this.addEventListener('message',event=>{
            if(event.data?.type==='status'&&event.data.cached)probe.gotStatus=true;
          });
        }
        override postMessage(...args:Parameters<Worker['postMessage']>) {
          if(this.equation&&args[0]?.type==='prepare')probe.prepared++;
          if(this.equation&&args[0]?.type==='recognize')probe.reads++;
          super.postMessage(...args);
        }
      };
    });
    const probe=()=>page.evaluate(()=>(window as Window&{
      equationPrewarmProbe:{gotStatus:boolean;prepared:number;reads:number}
    }).equationPrewarmProbe);
    await page.goto(tutor);
    expect(await page.evaluate(()=>[window.crossOriginIsolated,!!navigator.serviceWorker.controller])).toEqual([isolated,false]);
    await seed(page,'valid');
    await openEquation(page);
    await expect.poll(async()=>(await probe()).gotStatus).toBe(true);
    await draw(page);
    await page.getByRole('button',{name:'Read equation',exact:true}).click();
    await expect(page.getByRole('button',{name:/Read equations on this device/})).toBeVisible();
    expect(await probe()).toMatchObject({prepared:isolated?0:1,reads:1});
  });
}
