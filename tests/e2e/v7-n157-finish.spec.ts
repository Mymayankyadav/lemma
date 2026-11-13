import {test,expect,type Page} from '@playwright/test';
import {NOW,DATE} from './v7-scenes';
test.use({locale:'en-IN',timezoneId:'Asia/Kolkata'});
const flags='v6Shell,v7Shell,v7Room,v7Ruler,v7Qed,v7Spread,v7Margin,v7Scratch,v7Paper,v7Week,v7DeskClock,focusOrbit';
const url=(route:string,on=true)=>'/lemma/?demo=1&flags='+(on?flags:'v6Shell,v7Shell')+'#'+route;
async function go(page:Page,route:string,width=1280){
 await page.setViewportSize({width,height:844});await page.clock.setFixedTime(NOW);await page.goto(url(route));await page.waitForLoadState('networkidle');
}
for(const width of [390,1440])for(const scheme of ['light','dark'] as const)test(`Study almanac keeps short-history days compact at ${width} in ${scheme}`,async({page})=>{
 await page.emulateMedia({colorScheme:scheme});await go(page,'/insights',width);
 const almanac=page.locator('section.v7-chart',{hasText:'Study almanac'}),grid=almanac.locator('.v7-heatmap');
 await expect(grid).toBeVisible();
 const first=grid.locator('[data-chart-point]').first(),cell=(await first.boundingBox())!,box=(await grid.boundingBox())!;
 expect(cell.width).toBeLessThanOrEqual(25);expect(cell.height).toBeLessThanOrEqual(25);
 expect(cell.width).toBeGreaterThanOrEqual(23);expect(Math.abs(cell.width-cell.height)).toBeLessThanOrEqual(1);
 expect(box.height).toBeLessThanOrEqual(182);
 const count=await grid.locator('[data-chart-point]').count();
 await almanac.getByRole('button',{name:'Show as table'}).click();
 await expect(almanac.locator('tbody tr')).toHaveCount(count);
 await almanac.getByRole('button',{name:'Show chart'}).click();
 await expect(grid.locator('[data-chart-point][tabindex="0"]')).toHaveCount(1);
});
test('New block ruler changes the saved duration, with keyboard access and exact-version Undo',async({page})=>{
 await go(page,'/calendar?view=day&date='+DATE+'&quick=1',390);
 const sheet=page.getByRole('dialog',{name:'New block',exact:true}),slider=sheet.getByRole('slider',{name:'Length'});
 await expect(slider).toHaveValue('50');await slider.focus();await page.keyboard.press('ArrowRight');await expect(slider).toHaveValue('55');
 await sheet.getByLabel('Title',{exact:true}).fill('Ruler integration proof');await sheet.getByRole('button',{name:'Add block',exact:true}).click();
 const block=page.getByRole('button',{name:/Ruler integration proof, Planned study/});await expect(block).toBeVisible();
 await expect(block).toHaveAttribute('aria-label',/14:00–14:55/);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(block).toHaveCount(0);
});
test('Calendar ruler scrolls the actual day grid and exposes spoken times',async({page})=>{
 await go(page,'/calendar?view=day&date='+DATE,390);
 const slider=page.getByRole('slider',{name:'Browse day'}),grid=page.getByRole('region',{name:'Day time grid'});
 await expect(slider).toBeVisible();const before=await grid.evaluate(node=>node.scrollTop);
 await slider.focus();await page.keyboard.press('End');await expect(slider).toHaveAttribute('aria-valuetext','23:55');
 await expect.poll(()=>grid.evaluate(node=>node.scrollTop)).toBeGreaterThan(before);
 await page.keyboard.press('Home');await expect.poll(()=>grid.evaluate(node=>node.scrollTop)).toBe(0);
 await expect(grid.locator('.v7-cal-gutter time').first()).toHaveText('00:00');
});
for(const width of [600,900,1280,1728])test('Cards and Paths keep list beside detail at '+width,async({page})=>{
 for(const route of ['/projects','/cards']){
  await go(page,route,width);await expect(page.locator('.v7-library-detail main')).toBeVisible();
  const list=page.locator('.v7-library-list'),detail=page.locator('.v7-library-detail');
  await expect(detail.locator(route==='/projects'?'.v7-path-head':'.v7-card-face')).toBeVisible();
  await expect(list).toBeVisible();await expect(page.locator('main')).toHaveCount(1);
  const a=(await list.boundingBox())!,b=(await detail.boundingBox())!;expect(a.x+a.width).toBeLessThanOrEqual(b.x+1);
  const links=list.locator(route==='/projects'?'.v7-paths-title':'.v7-cards-row > a');await expect(links.nth(1)).toBeVisible();
  await links.nth(1).click();await expect(links.nth(1)).toHaveAttribute('aria-current','page');
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 }
});
test('Phone and flag-off navigation retain one page; all visual flags remain opt-in',async({page})=>{
 await go(page,'/cards/1',390);await expect(page.locator('.v7-library-split')).toHaveCount(0);
 await page.setViewportSize({width:1280,height:844});await page.goto(url('/cards/1',false));await expect(page.locator('.v7-library-split')).toHaveCount(0);
 await page.goto(url('/calendar?view=day&date='+DATE,false));await expect(page.getByRole('slider',{name:'Browse day'})).toHaveCount(0);
});
test('New task opens the complete form and saves the entered title and estimate',async({page})=>{
 await go(page,'/tasks?new=1',390);const sheet=page.getByRole('dialog',{name:'New task',exact:true});
 await sheet.getByLabel('Title',{exact:true}).fill('Capture approval task');await sheet.getByLabel(/^Estimate · minutes/).fill('35');
 await sheet.getByRole('button',{name:'Save task',exact:true}).click();await expect(sheet).toHaveCount(0);
 await expect(page.locator('.v7-tk-row').filter({hasText:'Capture approval task'})).toContainText('35 min');
});
