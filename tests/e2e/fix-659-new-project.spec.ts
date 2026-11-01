import {test,expect} from '@playwright/test';

// FIX #659: a new-project sheet is a functional cold route. Its inert
// backdrop must not hydrate the entire 60-project library before the form
// paints, but dismissing the sheet must still load the real Paths screen.
// Every 4x CPU case is a first attempt: never allow a retry to hide a miss.
test.describe.configure({retries:0});

for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test('FIX #659 cold New project sheet and real Paths on close: '+profile+' '+theme+' '+width,async({page})=>{
  test.setTimeout(90_000);
  await page.setViewportSize({width,height:width===360?740:844});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  await page.addInitScript(()=>{
   let scheduled=false;
   const observer=new MutationObserver(()=>{
    if(scheduled||!document.querySelector('[role="dialog"][aria-modal="true"] #project-title'))return;
    scheduled=true;
    observer.disconnect();
    requestAnimationFrame(()=>requestAnimationFrame(()=>
     performance.mark('lemma-fix-659-new-project-first-paint')));
   });
   observer.observe(document,{subtree:true,childList:true});
  });
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#/projects/new',{waitUntil:'domcontentloaded',timeout:90_000});
  const dialog=page.getByRole('dialog',{name:'New project'});
  await expect(dialog).toBeVisible({timeout:90_000});
  await expect(dialog.getByRole('textbox',{name:'Name'})).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Add PDFs, .tex or .md files'})).toBeVisible();
  await page.waitForFunction(()=>performance.getEntriesByName('lemma-fix-659-new-project-first-paint','mark').length===1);
  const paintMs=await page.evaluate(()=>performance.getEntriesByName('lemma-fix-659-new-project-first-paint','mark')[0].startTime);
  console.info('FIX #659 cold New project 4x',JSON.stringify({profile,theme,width,paintMs}));
  expect(Number.isFinite(paintMs)).toBe(true);
  expect(paintMs,'First real New project sheet paint at 4x CPU').toBeLessThan(1500);
  const backdrop=page.locator('[data-new-project-backdrop]');
  await expect(backdrop).toHaveAttribute('aria-hidden','true');
  await expect(backdrop).toHaveAttribute('inert','');
  await expect(backdrop.getByRole('heading',{name:'Paths',includeHidden:true})).toHaveCount(1);
  await expect(backdrop.locator('[data-project-row]')).toHaveCount(0);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
  await dialog.getByRole('button',{name:'Close'}).click();
  await expect(page.getByRole('heading',{name:'Paths',exact:true})).toBeVisible();
  await expect(page.locator('[data-project-row]').first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(0);
  await cdp.detach();
 });
}
