import {test,expect} from '@playwright/test';

// ST-7 I2: whether a toast needs More depends on rendered lines, not length.
for(const theme of ['graph','graph-night'] as const){
 test(`ST-7 toast with an action reveals short-but-overflowing text at 360px (${theme})`,async({page})=>{
  await page.setViewportSize({width:360,height:740});
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
  await more.click();
  await expect(status.getByRole('button',{name:'Collapse notification details'})).toBeVisible();
  const after=await text.evaluate(node=>({scroll:node.scrollHeight,client:node.clientHeight}));
  expect(after.client).toBeGreaterThan(before.client);
  expect(after.scroll).toBeLessThanOrEqual(after.client+1);
  await expect(text).toHaveCSS('overflow-y','auto');
  await page.screenshot({path:`test-results/screens/st-7-toast-360-${theme}.png`});
  // Expanded notifications must stay available beyond their original 4-second
  // lifetime. After collapsing, ordinary automatic dismissal resumes.
  await page.waitForTimeout(4300);
  await expect(status.getByRole('button',{name:'Collapse notification details'})).toBeVisible();
  await status.getByRole('button',{name:'Collapse notification details'}).click();
  await expect(status.getByRole('button',{name:'Show notification details'})).toBeVisible();
  await expect(status).toHaveCount(0,{timeout:6000});
 });
}
