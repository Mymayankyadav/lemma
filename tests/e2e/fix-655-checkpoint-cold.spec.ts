import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';

test.describe.configure({retries:0});

// FIX #655: a checkpoint remains a sheet over the actual project, but the
// project chooser is not needed until someone opens it. These checks guard
// the user journey while the cold CP4 4x CPU budget is measured by FIX #540.
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [390,360] as const){
 test('FIX #655 checkpoint keeps real background and on-demand project chooser: '+profile+' '+theme+' '+width,async({page})=>{
  test.setTimeout(120_000);
  await page.setViewportSize({width,height:width===360?740:844});
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',r=>r.fulfill({body:''}));
  await page.addInitScript(()=>{
   const progress=()=>document.querySelector('[data-sheet-background] section[aria-label="Checkpoint progress"]');
   const steps=()=>document.querySelector('section[aria-label="Checkpoint steps"]');
   const loaded=()=>!!progress()&&!!steps();
   const visible=(element:Element|null)=>{
    if(!element)return false;
    const bounds=element.getBoundingClientRect();
    if(bounds.width<=0||bounds.height<=0)return false;
    for(let node:Element|null=element;node;node=node.parentElement){
     const style=getComputedStyle(node);
     if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return false;
    }
    return true;
   };
   let scheduled=false;
   const observer=new MutationObserver(()=>{
    if(scheduled||!loaded())return;
    scheduled=true;
    observer.disconnect();
    // DOM insertion is not first visible paint. Wait for a rendered frame
    // containing the real inert Project backdrop and interactive CP4 steps.
    const afterPaint=()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
     if(visible(progress())&&visible(steps())){
      performance.mark('lemma-cp4-loaded');
     }else{
      afterPaint();
     }
    }));
    afterPaint();
   });
   observer.observe(document,{childList:true,subtree:true});
  });
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#/p/real-analysis/cp/CP4',{waitUntil:'domcontentloaded',timeout:90_000});
  await expect(page.getByRole('heading',{name:'Checkpoint',level:1})).toBeVisible({timeout:90_000});
  const backdrop=page.locator('[data-sheet-background]');
  await expect(backdrop).toHaveAttribute('inert','');
  await expect(backdrop.getByRole('region',{name:'Checkpoint progress',includeHidden:true})).toBeAttached({timeout:90_000});
  await expect(page.getByRole('dialog',{name:'Compactness'})).toBeVisible({timeout:90_000});
  await expect(page.getByRole('region',{name:'Checkpoint steps'})).toBeVisible({timeout:90_000});
  await expect(page.getByRole('dialog',{name:'Switch project'})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  expect(await page.locator('*').count()).toBeLessThan(1500);
  const readyMs=await page.evaluate(()=>performance.getEntriesByName('lemma-cp4-loaded','mark')[0]?.startTime??NaN);
  console.info('FIX #655 CP4 cold 4x',JSON.stringify({profile,theme,width,readyMs}));
  expect(Number.isFinite(readyMs)).toBe(true);
  expect(readyMs,'First real CP4 sheet + project at 4x CPU').toBeLessThan(1500);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
  await cdp.detach();
  mkdirSync('test-results/screens/fix-655',{recursive:true});
  await page.screenshot({path:'test-results/screens/fix-655/'+profile+'-'+theme+'-'+width+'.png'});
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await expect(page).toHaveURL(/#\/p\/real-analysis$/);
  const open=page.getByRole('button',{name:/Switch project from/});
  await expect(open).toBeVisible();
  await open.click();
  const chooser=page.getByRole('dialog',{name:'Switch project'});
  await expect(chooser.getByRole('searchbox',{name:'Find a project'})).toBeVisible();
  await chooser.getByRole('button',{name:'Close'}).click();
  await expect(chooser).toHaveCount(0);
 });
}
