import {test,expect} from '@playwright/test';
test.use({locale:'en-IN',timezoneId:'Asia/Kolkata'});
for(const viewport of [{width:320,height:640},{width:390,height:844}]){
 test(`N121 A1 route sheet has reachable footer at ${viewport.width}`,async({page})=>{
  await page.setViewportSize(viewport);
  await page.goto('/?demo=1&flags=v6Shell#/projects/new');
  const dialog=page.getByRole('dialog',{name:'New path'});
  await expect(dialog).toBeVisible();
  const body=dialog.locator('.ui-sheet-body');
  expect(await body.evaluate(el=>parseFloat(getComputedStyle(el).paddingLeft))).toBeGreaterThanOrEqual(16);
  await dialog.getByRole('textbox',{name:'Name'}).fill('Local path');
  await dialog.getByRole('button',{name:'Create path'}).click({trial:true});
  await expect(page.getByRole('navigation',{name:'Main navigation'}).getByRole('link')).toHaveCount(5);
 });
 test(`N121 A6 menu reaches missing screens at ${viewport.width}`,async({page})=>{
  await page.setViewportSize(viewport);
  await page.goto('/?demo=1&flags=v6Shell#/');
  await page.getByLabel('Menu',{exact:true}).click();
  const menu=page.getByRole('navigation',{name:'Notebook destinations'});
  for(const label of ['Tasks','Practice','Time log','Close the day']){
   await expect(menu.getByRole('link',{name:label,exact:true})).toBeVisible();
  }
 });
}

test('N121 E2 demo plan proposals never show UUID or JSON draft editing',async({page})=>{
 await page.goto('/?demo=1&flags=v6Shell#/proposals/proposal-6');
 await expect(page.getByRole('main',{name:'Plan proposal review'})).toBeVisible();
 await expect(page.getByRole('region',{name:'Editable proposal draft'})).toHaveCount(0);
 await expect(page.getByText(/Expected a UUID|Full draft payload \(JSON\)|Retry drafts/)).toHaveCount(0);
});

test('N121 D1 Progress uses one range selector and consistent saved effort',async({page})=>{
 await page.goto('/?demo=1&flags=v6Shell#/insights?range=30');
 await expect(page.getByRole('combobox',{name:'Time range'})).toHaveCount(1);
 await expect(page.getByRole('group',{name:'Recent study ranges'})).toHaveCount(0);
 const total=page.getByRole('region',{name:'Total logged time'});
 await expect(total).toBeVisible();
 const metric=page.getByRole('group',{name:'Logged study time'});
 await expect(metric).toBeVisible();
 const formatted=(await total.locator('strong').innerText()).trim();
 await expect(metric.locator('strong')).toHaveText(formatted);
});
