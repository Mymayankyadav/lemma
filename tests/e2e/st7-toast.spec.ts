import {test,expect} from '@playwright/test';

// ST-7 I2: whether a toast needs More depends on rendered lines, not length.
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test(`ST-7 toast with an action reveals short-but-overflowing text at ${width}px (${theme})`,async({page})=>{
  await page.setViewportSize({width,height:width===360?740:844});
  const message='The proposed changes could not be saved because the connection was interrupted. Please try again.';
  // Playwright runs Vite preview (a production build), so source-module imports
  // are unavailable. Replace only the kit's toast fixture in its served JS;
  // this exercises the real toast and action without a production test hook.
  let fixturePatched=false;
  await page.route('**/assets/*.js',async route=>{
   const response=await route.fetch();
   const body=await response.text();
   if(body.includes('Prompt copied')){
    fixturePatched=true;
    await route.fulfill({response,body:body.replaceAll('Prompt copied',message)});
   }else await route.fulfill({response});
  });
  await page.goto(`/lemma/?demo=1&theme=${theme}#/kit`);
  await expect(page.getByRole('heading',{name:'Component kit'})).toBeVisible();
  await page.getByRole('button',{name:'Show toast with action'}).click();
  expect(fixturePatched).toBe(true);
  const status=page.getByRole('status').filter({hasText:message});
  await expect(status).toBeVisible();
  const more=status.getByRole('button',{name:'Show notification details'});
  await expect(more).toBeVisible();
  const text=status.locator('[id^="toast-message-"]');
  const before=await text.evaluate(node=>({scroll:node.scrollHeight,client:node.clientHeight}));
  expect(before.scroll).toBeGreaterThan(before.client+1);
  const hitBoxes=async()=>status.getByRole('button').evaluateAll(buttons=>buttons.map(button=>{
   const rect=button.getBoundingClientRect();return {label:button.getAttribute('aria-label')||button.textContent||'',width:rect.width,height:rect.height};
  }));
  for(const hit of await hitBoxes()){
   expect(hit.width,hit.label+' tap target width').toBeGreaterThanOrEqual(44);
   expect(hit.height,hit.label+' tap target height').toBeGreaterThanOrEqual(44);
  }
  await more.click();
  await expect(status.getByRole('button',{name:'Collapse notification details'})).toBeVisible();
  for(const hit of await hitBoxes()){
   expect(hit.width,hit.label+' expanded tap width').toBeGreaterThanOrEqual(44);
   expect(hit.height,hit.label+' expanded tap height').toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  const after=await text.evaluate(node=>({scroll:node.scrollHeight,client:node.clientHeight}));
  expect(after.client).toBeGreaterThan(before.client);
  expect(after.scroll).toBeLessThanOrEqual(after.client+1);
  await expect(text).toHaveCSS('overflow-y','auto');
  await page.screenshot({path:`test-results/screens/st-7-toast-${width}-${theme}.png`});
  // Expanded notifications must stay available beyond their original 4-second
  // lifetime. After collapsing, ordinary automatic dismissal resumes.
  await page.waitForTimeout(4300);
  await expect(status.getByRole('button',{name:'Collapse notification details'})).toBeVisible();
  await status.getByRole('button',{name:'Collapse notification details'}).click();
  await expect(status.getByRole('button',{name:'Show notification details'})).toBeVisible();
  await expect(status).toHaveCount(0,{timeout:6000});
 });
}
