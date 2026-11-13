import {test,expect,type Page} from '@playwright/test';
import {NOW,DATE,at} from './v7-scenes';
test.use({locale:'en-IN',timezoneId:'Asia/Kolkata'});
const room=(hash:string)=>at(hash).replace('v7Shell,v6Shell','v7Shell,v6Shell,v7Room');
async function open(page:Page,hash:string,width=390){
 await page.setViewportSize({width,height:844});
 await page.clock.setFixedTime(NOW);
 await page.goto(room(hash));
 await expect(page.locator('html')).toHaveAttribute('data-v7-room','');
 await page.waitForLoadState('networkidle');
}

test('Calendar gives at least 75% of a normal phone to the grid; now opens in the upper third',async({page})=>{
 for(const width of [360,390]){
  await open(page,'/calendar?view=day&date='+DATE,width);
  const grid=page.getByRole('region',{name:'Day time grid'});
  await expect(grid).toBeVisible();
  const box=(await grid.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(844*.75);
  const needle=(await page.locator('[data-calendar-now]').boundingBox())!;
  expect(Math.abs(needle.y-box.y-box.height/3)).toBeLessThan(8);
  await page.getByRole('combobox',{name:'Calendar view'}).selectOption('week');
  await expect(page.locator('main')).toHaveAttribute('data-calendar-view','week');
 }
});

test('Calendar accepts suggestions one by one on the same day, without duplicating a task',async({page})=>{
 await open(page,'/calendar?view=day&date='+DATE);
 const suggested=page.getByRole('button',{name:/^Add suggested block /});
 await expect(suggested.first()).toBeAttached();
 await expect(suggested.first()).toHaveCSS('border-top-style','dashed');
 expect((await suggested.first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
 const before=await page.locator('[data-calendar-block]').count();
 await suggested.first().click();
 await expect(page.locator('[data-calendar-block]')).toHaveCount(before+1);
 await expect(suggested.first()).toBeAttached();
 await suggested.first().click();
 await expect(page.locator('[data-calendar-block]')).toHaveCount(before+2);
 // Demo has no action journal. The real receipt's Undo is covered by n157-room-interactions.test.tsx.
});

test('Tasks controls fit in 200 px and overdue copy names its parts',async({page})=>{
 await open(page,'/tasks',360);
 await expect(page.locator('.v7-tk-row').first()).toBeVisible();
 await expect(page.locator('.v7-hub-title')).toHaveText('Tasks');
 const end=await page.locator('.v7-tk-filters').evaluate(node=>node.getBoundingClientRect().bottom);
 expect(end).toBeLessThanOrEqual(200);
 await expect(page.locator('.v7-tk-overdue')).not.toContainText('Tasks, deadlines and practice');
 await expect(page.locator('.v7-tk-overdue .v7-meta')).toContainText(/\d+ (task|deadline|practice)/);
});

test('Path spine opens at the current card and finished stages can be unfolded by keyboard',async({page})=>{
 await open(page,'/p/real-analysis');
 const spine=page.getByRole('navigation',{name:'Path checkpoints'});
 await expect(spine).toBeAttached();
 expect(await spine.locator('a').count()).toBeGreaterThan(3);
 const current=page.locator('.v7-path-row[data-state="current"]');
 await expect(current).toBeInViewport();
 await expect(current.getByRole('button',{name:'Continue with tutor'})).toBeVisible();
 await current.getByRole('button',{name:'Continue with tutor'}).click();
 await expect(page.getByRole('dialog',{name:'Continue with your tutor'})).toBeVisible();
 await page.keyboard.press('Escape');
 const folded=page.locator('.v7-path-stage details').first();
 await expect(folded).not.toHaveAttribute('open');
 await folded.locator('summary').focus();await page.keyboard.press('Enter');
 await expect(folded).toHaveAttribute('open','');
});

test('Search shows the three last opened things, action chips and keyboard navigation',async({page})=>{
 await open(page,'/p/real-analysis');
 for(const hash of ['/p/linear-algebra','/p/topology','/cards/1']){
  await page.evaluate(value=>{location.hash='#'+value;},hash);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('main h1').first()).toBeVisible();
 }
 await page.keyboard.press('Control+k');
 const recent=page.getByRole('region',{name:'Jump back in'});
 await expect(recent.getByRole('option')).toHaveCount(3);
 await expect(page.locator('.v7-search-actions')).toBeVisible();
 await page.getByRole('combobox',{name:'Search'}).fill('compact');
 await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
 await expect(page.getByRole('dialog',{name:'Search'})).toHaveCount(0);
});

test('First run is subject, rhythm, then tutor; each step can be skipped',async({page})=>{
 await open(page,'/welcome');
 await expect(page.getByRole('heading',{level:1})).toHaveText('What are you studying?');
 await page.getByRole('button',{name:'Skip this step'}).click();
 await expect(page.getByRole('heading',{level:1})).toHaveText('Your rhythm');
 await page.getByLabel('Day starts at').fill('09:00');
 await page.getByRole('button',{name:'Save rhythm'}).click();
 await expect(page.getByRole('heading',{level:1})).toHaveText('Connect your tutor');
 await expect(page.getByLabel('Connector address')).toHaveAttribute('readonly');
 await expect(page.getByRole('link',{name:'Open Claude'})).toHaveAttribute('href','https://claude.ai/');
 await expect(page.getByRole('link',{name:'Open ChatGPT'})).toHaveAttribute('href','https://chatgpt.com/');
 await page.getByRole('button',{name:'Skip and finish'}).click();
 await expect(page).toHaveURL(/#\/$/);
});

test('Atlas subsets filter the subject-grouped list and the letter index works',async({page})=>{
 await open(page,'/atlas?view=list');
 await expect(page.getByRole('navigation',{name:'Concept subsets'})).toBeVisible();
 await expect(page.locator('.v7-room-atlas-subject').first()).toBeVisible();
 await page.getByRole('button',{name:'Demonstrated',exact:true}).click();
 const states=page.locator('.v7-room-atlas-subject .v7-atlas-row-text small');
 expect(await states.count()).toBeGreaterThan(0);
 for(const state of await states.allTextContents())expect(state).toMatch(/^Demonstrated/);
 const jump=page.getByRole('navigation',{name:'Subject index'}).getByRole('button').last();
 await jump.click();
 await expect(page.locator('.v7-room-atlas-index')).toHaveCSS('position','sticky');
});

test('Learning title matches its tab, grades use an ink ramp, and hero emblems never crop',async({page})=>{
 await open(page,'/insights?tab=learning');
 await expect(page.locator('.v7-hub-title')).toHaveText('Learning');
 const chart=page.locator('section.v7-chart').filter({has:page.getByRole('heading',{name:'Reviews by day',exact:true})});
 await expect(chart).toBeVisible();
 const fills=await chart.locator('svg path[fill]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('fill')));
 expect(fills.some(fill=>fill?.includes('color-mix'))).toBe(true);
 expect(fills.some(fill=>fill?.includes('status-danger'))).toBe(true);
 await open(page,'/');
 await expect(page.locator('.v7-today-hero-emblem')).toBeHidden();
});

test('Flag off retains the original first-run order, Calendar controls and header titles',async({page})=>{
 await page.goto(at('/welcome'));
 await expect(page.getByRole('heading',{level:1})).toHaveText('Connect your tutor');
 await page.goto(at('/calendar?view=day&date='+DATE));
 await expect(page.getByRole('combobox',{name:'Calendar view'})).toHaveCount(0);
 await expect(page.locator('.v7-hub-title')).toHaveText('Calendar');
 await expect(page.locator('html')).not.toHaveAttribute('data-v7-room');
});

for(const colorScheme of ['light','dark'] as const)test('Room layouts fit at 200% phone text and on desktop in '+colorScheme,async({page})=>{
 await page.emulateMedia({colorScheme,reducedMotion:'reduce'});
 for(const profile of [{width:360,text:200},{width:1728,text:100}]){
  for(const route of ['/calendar?view=day&date='+DATE,'/tasks','/p/real-analysis','/atlas?view=list','/welcome','/insights?tab=learning']){
   await open(page,route,profile.width);
   await page.evaluate(text=>{document.documentElement.style.fontSize=text+'%';},profile.text);
   await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),{message:route+' horizontal overflow'}).toBeLessThanOrEqual(1);
   await expect(page.locator('main h1').first()).toBeVisible();
  }
 }
});
