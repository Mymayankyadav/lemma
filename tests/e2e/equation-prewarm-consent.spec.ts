import {expect,test} from '@playwright/test';
import {EQUATION_MODEL, EQUATION_MODEL_CACHE, equationModelUrl} from '../../src/features/tutor/input/equationModel';
import symbolManifest from '../../public/models/tutor-symbols/detypify-0.3.0-lemma-v1/manifest.json' with {type:'json'};

const fixtures=Object.values(EQUATION_MODEL.files).map(equationModelUrl);
for(const installedRuntime of [false,true]){
  test('truncated cached equation weights wait for repair consent; cached runtime: '+installedRuntime,async({page,context})=>{
    const external:string[]=[],runtimeRequests:string[]=[];
    await context.route('https://huggingface.co/**',route=>{
      external.push(route.request().url());
      return route.fulfill({status:503,body:'offline',headers:{'access-control-allow-origin':'*'}});
    });
    await page.goto('/lemma/?demo=1&flags=v7Shell,tutorScratch#/p/real-analysis/cp/CP4/tutor');
    await page.evaluate(async({name,urls,haveRuntime,manifest})=>{
      const cache=await caches.open(name);
      for(const url of urls)await cache.put(url,new Response('truncated'));
      if(haveRuntime){
        const c=await caches.open('lemma-tutor-symbol-assets-v'+manifest.cacheGeneration+'-'+manifest.assetSetVersion);
        const wasm='/lemma/models/tutor-symbols/'+manifest.assetSetVersion+'/'+manifest.files.wasm.path;
        await c.put(wasm,await fetch(wasm));
      }
    },{name:EQUATION_MODEL_CACHE,urls:fixtures,haveRuntime:installedRuntime,manifest:symbolManifest});
    context.on('request',req=>{if(req.url().endsWith('/'+symbolManifest.files.wasm.path))runtimeRequests.push(req.url());});
    await page.getByRole('button',{name:'Write a question'}).click();
    await page.getByRole('textbox',{name:'Your answer',exact:true}).focus();
    await page.getByRole('group',{name:'Answer keyboard',exact:true}).getByRole('button',{name:'Equation mode',exact:true}).click();
    const paper=page.locator('.tutor-equation-paper'),box=(await paper.boundingBox())!;
    await page.mouse.move(box.x+20,box.y+40);await page.mouse.down();
    await page.mouse.move(box.x+80,box.y+65,{steps:6});await page.mouse.up();
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
