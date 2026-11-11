import {test,expect,type Page} from '@playwright/test';
import {at,NOW,openScene,shots} from './v7-scenes';

test.use({locale:'en-IN',timezoneId:'Asia/Kolkata'});
const shot=(name:string)=>shots.find(scene=>scene.name===name)!;

for(const scheme of ['light','dark'] as const){
 test(`KC4/RV2: fourteen-day subject forecast, direct labels, keyboard and table in ${scheme}`,async({page})=>{
  await openScene(page,shot('review-hub'),scheme,{width:390,height:844});
  const chart=page.locator('.v7-chart').filter({has:page.getByRole('heading',{name:'Due each day'})});
  await expect(chart.locator('[data-chart-point]')).toHaveCount(14);
  await expect(chart).toContainText('next 14 days');
  const series=await chart.locator('.v7-chart-direct-label').count();
  expect(series).toBeGreaterThan(1);expect(series).toBeLessThanOrEqual(3);
  await expect(chart.locator('.v7-chart-legend')).toHaveCount(0);
  const points=chart.locator('[data-chart-point]');
  await points.first().focus();await page.keyboard.press('ArrowRight');await expect(points.nth(1)).toBeFocused();
  await expect(chart.getByRole('status')).not.toBeEmpty();
  await chart.getByRole('button',{name:'Show as table'}).click();
  await expect(chart.locator('tbody tr')).toHaveCount(14);
  await expect(chart.locator('thead th')).toHaveCount(series+1);
  await expect(chart.locator('tbody tr').first()).toContainText('Today');
 });
 test(`SH2: Capture reserves dock space at rest and keeps five navigation links in ${scheme}`,async({page})=>{
  for(const width of [320,360,390])for(const scene of ['today','calendar-day','tasks']){
   await openScene(page,shot(scene),scheme,{width,height:844});
   const nav=page.getByRole('navigation',{name:'Main navigation'}),capture=page.getByRole('button',{name:'Capture',exact:true});
   await expect(nav.getByRole('link')).toHaveCount(5);
   const a=await nav.boundingBox(),b=await capture.boundingBox(),dock=await page.locator('.v7-dock').boundingBox();
   expect(b!.x,`${scene} ${width}`).toBeGreaterThanOrEqual(a!.x+a!.width-1);
   expect(b!.y).toBeGreaterThanOrEqual(dock!.y);
   expect(b!.y+b!.height).toBeLessThanOrEqual(dock!.y+dock!.height+1);
   await expect(capture).toBeInViewport();
  }
 });
}

for(const scheme of ['light','dark'] as const)for(const name of ['today','focus','review-round','calendar-day','path-map','atlas']){
 test(`Scorecard: ${name} has names, solid chrome and high-contrast ${scheme} evidence`,async({page},testInfo)=>{
  await openScene(page,shot(name),scheme,{width:390,height:844});
  await page.locator('html').evaluate(node=>node.setAttribute('data-contrast','high'));
  await expect(page.locator('html')).toHaveAttribute('data-contrast','high');
  await expect(page.getByRole('main')).toHaveCount(1);
  const nav=page.getByRole('navigation',{name:'Main navigation'});
  await expect(nav.getByRole('link')).toHaveCount(5);
  for(const button of await page.getByRole('button').all()){
   if(!await button.isVisible())continue;
   expect(await button.evaluate(node=>node.getAttribute('aria-label')||node.getAttribute('aria-labelledby')||node.textContent?.trim()||node.getAttribute('title'))).toBeTruthy();
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await testInfo.attach('high-contrast-'+name+'-'+scheme,{body:await page.screenshot({animations:'disabled'}),contentType:'image/png'});
 });
}

test('PA11: Focus state agrees with Today/session row, reload retains the ring, reduced motion is still, and Enter parks a thought',async({page})=>{
 await openScene(page,shot('today-quick-focus'),'dark',{width:390,height:844});
 const sheet=page.getByRole('dialog',{name:'Start a focus session'});
 await sheet.getByRole('radio',{name:/Pomodoro/}).first().click();
 await sheet.getByRole('button',{name:'Start focus',exact:true}).click();
 await expect(page.locator('.v7-focus')).toHaveAttribute('data-word','Focus');
 const before=await page.getByTestId('focus-clock').textContent();
 await page.reload();await expect(page.getByTestId('focus-clock')).toHaveText(before!);
 const ring=await page.locator('.v7-focus-arc').getAttribute('stroke-dashoffset');
 await page.reload();await expect(page.locator('.v7-focus-arc')).toHaveAttribute('stroke-dashoffset',ring!);
 await expect(page.locator('.v7-focus-emblem')).toHaveAttribute('data-still','true');
 for(const control of await page.locator('.v7-focus-controls button').all())expect((await control.boundingBox())!.y).toBeGreaterThanOrEqual(844*.6);
 await page.getByRole('textbox',{name:'Park a thought',exact:true}).fill('Why is this cover finite?');
 await page.getByRole('textbox',{name:'Park a thought',exact:true}).press('Enter');
 await expect(page.getByRole('textbox',{name:'Park a thought',exact:true})).toHaveValue('');
 await expect(page).toHaveURL(/#\/focus/);
 await page.getByRole('button',{name:'Pause',exact:true}).click();
 await expect(page.locator('.v7-focus')).toHaveAttribute('data-word','Paused');
 await page.getByRole('link',{name:'Minimise'}).click();
 await expect(page.locator('.v7-session-word')).toHaveText('Paused');
 await expect(page.locator('.v7-today-hero .v7-live-chip')).toContainText('Paused');
 await page.getByRole('link',{name:'Return to focus'}).click();
 await page.getByRole('button',{name:'Resume',exact:true}).click();
 await page.getByRole('button',{name:'Take a break',exact:true}).click();
 await expect(page.locator('.v7-focus')).toHaveAttribute('data-word','Break');
 await expect(page.locator('.v7-focus-breath')).toHaveAttribute('data-still','true');
});

async function startRound(page:Page){
 await openScene(page,shot('review-hub'),'dark',{width:390,height:844});
 const count=Number(await page.getByLabel('Cards in this round').textContent());
 expect(count).toBe(23);
 await page.getByRole('button',{name:/^Start \d+ cards$/}).click();
 await expect(page.locator('.v7-review-card')).toBeVisible();
 return count;
}
async function swipeRight(page:Page){
 const box=await page.locator('.v7-review-front').boundingBox();
 await page.mouse.move(box!.x+12,box!.y+box!.height/2);
 await page.mouse.down();await page.mouse.move(box!.x+152,box!.y+box!.height/2,{steps:8});await page.mouse.up();
}
for(const input of ['keyboard','swipes'] as const){
 test(`PA11 Review: all 23 seeded cards can be completed with ${input}`,async({page})=>{
  test.setTimeout(120_000);
  const count=await startRound(page);
  for(let i=0;i<count;i++){
   if(input==='keyboard')await page.keyboard.press('Space');else await swipeRight(page);
   await expect(page.locator('.v7-review')).toHaveAttribute('data-revealed','true');
   const dock=await page.locator('.v7-review-dock').boundingBox();expect(dock!.y).toBeGreaterThanOrEqual(844*2/3);
   if(input==='keyboard')await page.keyboard.press('3');else await swipeRight(page);
   if(i<count-1){await expect(page.getByRole('progressbar',{name:'Review progress'})).toHaveAttribute('aria-valuenow',String(i+1));await expect(page.locator('.v7-review')).toHaveAttribute('data-revealed','false');}
  }
  await expect(page).toHaveURL(/#\/review\/done\?run=/);
 });
}

test('PA11 Review: Undo removes the last coloured segment',async({page})=>{
 await startRound(page);await page.keyboard.press('Space');await page.keyboard.press('3');
 await expect(page.locator('.v7-review-progress [data-grade]')).toHaveCount(1);
 await page.keyboard.press('u');
 await expect(page.locator('.v7-review-progress [data-grade]')).toHaveCount(0);
 await expect(page.getByRole('progressbar',{name:'Review progress'})).toHaveAttribute('aria-valuenow','0');
});

test('BS2/QA4: title receives focus and the quick-add draft is above the sheet',async({page})=>{
 await openScene(page,shot('calendar-block-sheet'),'dark',{width:390,height:844});
 await expect(page.getByRole('dialog').getByRole('textbox',{name:'Calendar block title',exact:true})).toBeFocused();
 await openScene(page,shot('calendar-quick-add'),'dark',{width:390,height:844});
 const draft=await page.locator('[data-kind="draft"]').boundingBox(),sheet=await page.getByRole('dialog').boundingBox();
 expect(draft!.y+draft!.height).toBeLessThanOrEqual(sheet!.y-4);
 expect(draft!.y+draft!.height).toBeGreaterThan(0);
});

test('PA11 Close the day: an unplanned day saves its aim and stays closed after reload',async({page})=>{
 await page.clock.setFixedTime(NOW);await page.goto(at('/today/close?date=2026-11-08'));
 await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByRole('button',{name:'Next',exact:true}).click();
 await page.getByRole('textbox',{name:'Aim for tomorrow'}).fill('Understand compactness');
 await page.getByRole('button',{name:'Close the day',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Day closed',exact:true})).toBeVisible();
 await page.goto(at('/today/close?date=2026-11-08'));
 await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByRole('button',{name:'Next',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Aim for tomorrow'})).toHaveValue('Understand compactness');
 await expect(page.getByRole('button',{name:'Day already closed'})).toBeDisabled();
});

test('PA11 Today: hero/primary are above the fold and the heavy profile stays under 1,500 elements',async({page})=>{
 await openScene(page,shot('today'),'dark',{width:390,height:844});
 const hero=await page.getByRole('region',{name:'Your next step'}).boundingBox();
 expect(hero!.y+hero!.height).toBeLessThanOrEqual(844);
 const primary=await page.locator('.v7-primary').evaluateAll(nodes=>nodes.filter(node=>{const b=node.getBoundingClientRect();return b.width>0&&b.height>0&&b.y>=0&&b.bottom<=innerHeight;}).length);
 expect(primary).toBe(1);
 await page.goto('/lemma/?demo=extreme&flags=v7Shell,v6Shell#/');
 await expect(page.getByRole('region',{name:'Your next step'})).toBeVisible();
 expect(await page.locator('main *').count()).toBeLessThan(1500);
});

test('PA11 Tasks: dragging saves order across reload and the menu moves it back',async({page})=>{
 await openScene(page,shot('tasks'),'dark',{width:390,height:844});
 for(const title of ['Audit reorder A','Audit reorder B']){
  await page.getByRole('button',{name:'Capture',exact:true}).click();
  await page.getByRole('textbox',{name:'What do you want to add?'}).fill(title);
  await page.getByRole('button',{name:'Add task',exact:true}).click();
 }
 await page.reload();
 const group=page.getByRole('region',{name:'No date',exact:true}),rows=group.locator('.v7-tk-row');
 const first=rows.filter({hasText:'Audit reorder A'}),second=rows.filter({hasText:'Audit reorder B'});
 const firstId=await first.getAttribute('data-task-id'),secondId=await second.getAttribute('data-task-id');
 await first.getByRole('button',{name:'Reorder Audit reorder A',exact:true}).dragTo(second);
 await expect(page.getByRole('status').filter({hasText:'Task order saved'})).toBeVisible();
 await page.reload();
 const order=await rows.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-task-id')));
 expect(order.indexOf(secondId)).toBeLessThan(order.indexOf(firstId));
 await first.getByRole('button',{name:'More actions for Audit reorder A'}).click();
 await page.getByRole('menuitem',{name:'Move up',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Task order saved'})).toBeVisible();
 await page.reload();
 const back=await rows.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-task-id')));
 expect(back.indexOf(firstId)).toBeLessThan(back.indexOf(secondId));
});
