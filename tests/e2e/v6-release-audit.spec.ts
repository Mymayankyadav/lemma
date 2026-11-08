import {test,expect,type Page} from '@playwright/test';

// N101 audits the Vite build in the same checkout, not the standalone mockup.
const url=(path:string,stress=false)=>
 './?demo='+(stress?'stress':'1')+'&flags=v6Shell#'+path;
// Deep links use ids that exist in the demo fixture; the third entry is text the
// loaded screen must show, so a "not found" page cannot pass as a deep link.
const routes:readonly (readonly [string,string,string?])[]=[
 ['Today','/'],['Paths','/projects'],['New path','/projects/new'],
 ['Path','/p/real-analysis','Real Analysis'],['Checkpoint','/p/real-analysis/cp/CP4','Compactness'],
 ['Session','/s/real-analysis/7'],['Inbox','/proposals'],
 ['Proposal','/proposals/proposal-6'],['Review','/review'],
 ['Review round','/review/run'],['Review complete','/review/done'],
 ['Cards','/cards'],['Card','/cards/7','N7'],['Atlas','/atlas'],
 ['Progress','/insights'],['Settings','/settings'],['Sign in','/sign-in'],
 ['Kit','/kit'],['Calendar','/calendar'],['Tasks','/tasks'],
 ['Time log','/log'],['Practice','/practice'],['Close day','/today/close?date=2026-11-06'],
];
// Known release defects: only the sideways-overflow measurement is an expected
// failure; every other check on these routes still runs and must pass.
const knownOverflow:Record<string,string>={
 '320 /kit':'Known release defect #1300: Kit wider than a 320px viewport at 200% text',
};
const displays=[{width:320,height:640},{width:360,height:780},{width:390,height:844}] as const;
const themes=[{name:'Day',value:'graph'},{name:'Night',value:'graph-night'}] as const;
async function setup(page:Page){
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
 await page.route('https://fonts.gstatic.com/**',r=>r.fulfill({body:''}));
}
async function presentation(page:Page,theme:string,large=true){
 await page.evaluate(({theme,large})=>{
  document.documentElement.setAttribute('data-theme',theme);
  document.documentElement.style.fontSize=large?'200%':'100%';
 },{theme,large});
}
// A lazy route renders "Loading screen…" inside #main-content and data screens
// show "Loading …" status text, so the shell alone does not prove the screen loaded.
async function settled(page:Page,expected?:string){
 await page.waitForLoadState('networkidle');
 const main=page.locator('#main-content');
 await expect(main.getByText(/^Loading\b/),'screen still loading').toHaveCount(0,{timeout:20_000});
 // Screen states are labelled "<Thing> loading" / "<Thing> unavailable" (e.g. "Project loading").
 await expect(main.getByRole('region',{name:/^\w+ loading$/})).toHaveCount(0);
 await expect(main.getByRole('region',{name:/^\w+ unavailable$/}),'deep link shows an unavailable screen').toHaveCount(0);
 await expect(page.getByText(/^(Couldn’t open this screen|Proposal unavailable\.|This card could not be loaded\.)/),
  'screen shows an error state').toHaveCount(0);
 if(expected)await expect(main).toContainText(expected);
}
async function contained(page:Page,detail:string){
 const dims=await page.evaluate(()=>({
  content:document.documentElement.scrollWidth,viewport:window.innerWidth,
 }));
 expect(dims.content,detail+' must not scroll sideways').toBeLessThanOrEqual(dims.viewport+1);
}
for(const display of displays)for(const theme of themes)for(const [name,path,expected] of routes){
 const known=knownOverflow[display.width+' '+path];
 test('N101 '+display.width+'px '+theme.name+' 200% '+name+' '+path,async({page})=>{
  test.setTimeout(90_000);
  await page.setViewportSize(display);
  await setup(page);
  const exceptions:string[]=[];
  page.on('pageerror',error=>exceptions.push(error.message));
  await page.goto(url(path));
  await expect(page.locator('html')).toHaveAttribute('data-v6','');
  await presentation(page,theme.value);
  if(path!=='/sign-in'){
   await expect(page.locator('[data-v6-header]')).toBeVisible();
   await expect(page.getByRole('navigation',{name:'Main navigation'})
    .getByRole('link')).toHaveCount(5);
   await expect(page.getByRole('navigation',{name:'Page actions'})).toBeVisible();
  }else{
   await expect(page.getByRole('navigation',{name:'Main navigation'})).toHaveCount(0);
  }
  await expect(page.locator('#main-content')).toBeVisible();
  await settled(page,expected);
  expect(await page.evaluate(()=>getComputedStyle(document.documentElement).colorScheme))
   .toBe(theme.name==='Night'?'dark':'light');
  if(!known)await contained(page,display.width+'px '+theme.name+' '+name);
  expect(exceptions,'uncaught browser exceptions on '+name).toEqual([]);
 });
 if(known)test('N101 '+display.width+'px '+theme.name+' 200% '+name+' '+path+' overflow',async({page})=>{
  test.fail(true,known);
  test.setTimeout(90_000);
  await page.setViewportSize(display);
  await setup(page);
  await page.goto(url(path));
  await presentation(page,theme.value);
  await settled(page,expected);
  await contained(page,display.width+'px '+theme.name+' '+name);
 });
}
// docs/v6/screens holds the design mockup captures (the target) and must never be
// overwritten. Set LEMMA_RELEASE_CAPTURE=1 to refresh the app captures in docs/v6/release-captures.
const shots=[
 ['today','/'],['paths','/projects'],['review','/review'],
 ['calendar','/calendar'],['progress','/insights'],['inbox','/proposals'],
 ['cards','/cards'],['atlas','/atlas'],['settings','/settings'],
] as const;
const captureDir=process.env.LEMMA_RELEASE_CAPTURE==='1'
 ? 'docs/v6/release-captures' : 'test-results/v6-release/screens';

// Capture PNGs from the actual Vite application, not the historical prototype.
// Viewport captures (what a 390×844 phone shows): full-page captures drew the
// fixed bottom navigation over the middle of long screens.
async function releaseScreenshot(page:Page,file:string){
 await page.screenshot({path:captureDir+'/'+file,
  animations:'disabled',scale:'css'});
}

test('N101 screenshot capture of the real app, both palettes at 390x844',async({page})=>{
 test.setTimeout(180_000);
 await page.setViewportSize({width:390,height:844});
 await setup(page);
 // N110: the mockup captures show a running Pomodoro focus (its dock sits above the
 // navigation on every screen), so the app captures start one first.
 await page.goto(url('/'));
 await settled(page);
 await page.getByRole('textbox',{name:'Focus intention'}).fill('Topology');
 await page.getByRole('combobox',{name:'Timer mode'}).selectOption('pomodoro');
 await page.getByRole('button',{name:'Start focus'}).click();
 const focus=page.getByRole('dialog',{name:'Focus'});
 await expect(focus).toBeVisible();
 await presentation(page,'graph',false);
 await releaseScreenshot(page,'focus-day.png');
 await focus.getByRole('button',{name:'Close'}).click();
 await expect(focus).toBeHidden();
 for(const theme of themes)for(const [name,path] of shots){
  await page.goto(url(path));
  await expect(page.locator('[data-v6-header]')).toBeVisible();
  await presentation(page,theme.value,false);
  await settled(page);
  await expect(page.getByRole('complementary',{name:'Focus accessory'})).toBeVisible();
  await contained(page,'screenshot '+name+'-'+theme.name);
  await releaseScreenshot(page,name+'-'+theme.name.toLowerCase()+'.png');
 }
});
test('N101 acceptance: Focus save survives reload and reaches log, Calendar and Progress',async({page})=>{
 test.setTimeout(120_000);
 await setup(page);
 await page.addInitScript(()=>{
  if(!sessionStorage.getItem('lemma.v6.demo.study.v1'))
   sessionStorage.setItem('lemma.v6.demo.study.v1',
    JSON.stringify({schema:1,entries:[],blocks:[]}));
 });
 await page.goto(url('/'));
 await page.getByRole('textbox',{name:'Focus intention'}).fill('N101 end-to-end proof');
 await page.getByRole('button',{name:'Start focus'}).click();
 const dialog=page.getByRole('dialog',{name:'Focus'});
 await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'Pause',exact:true}).click();
 await dialog.getByRole('button',{name:'Resume',exact:true}).click();
 await dialog.getByRole('button',{name:'Finish'}).click();
 await dialog.getByRole('spinbutton',{name:'Minutes to save'}).fill('4');
 await dialog.getByRole('button',{name:'Save',exact:true}).click();
 await expect(dialog).toBeHidden();
 await page.reload();
 await expect(page.locator('output[aria-label="Logged today"]')).toContainText('4 min');
 await page.goto(url('/log'));
 await expect(page.getByRole('heading',{name:'Time log'})).toBeVisible();
 await expect(page.locator('article')).toContainText('N101 end-to-end proof');
 await page.goto(url('/insights?range=7'));
 await expect(page.getByRole('region',{name:'Total logged time'})).toContainText('4 min');
 await page.goto(url('/calendar'));
 await expect(page.locator('[data-v6-header]')).toContainText('Calendar');
 await page.goBack();
 await expect(page).toHaveURL(/insights[?]range=7$/);
});
test('N101 acceptance: Inbox, grading, Atlas and Planner remain reachable',async({page})=>{
 test.setTimeout(120_000);
 await setup(page);
 await page.setViewportSize({width:320,height:640});
 await page.goto(url('/proposals',true));
 const actions=page.locator('[data-v6-proposal-actions]');
 await expect(actions).toBeVisible();
 await presentation(page,'graph-night');
 const dock=page.getByRole('navigation',{name:'Main navigation'});
 const [a,n]=await Promise.all([actions.boundingBox(),dock.boundingBox()]);
 expect(a&&n).toBeTruthy();
 expect(a!.y+a!.height,'Inbox controls must clear dock').toBeLessThanOrEqual(n!.y+1);
 // Stress validates the Inbox stacking; v6 Review has a separate owner demo
 // queue and a durable start label ("Start N cards"), not legacy "Start review".
 await dock.getByRole('link',{name:'Review'}).click();
 await page.goto(url('/review'));
 const start=page.getByRole('button',{name:/^Start [1-9][0-9]* cards$/});
 await expect(start).toBeEnabled();
 await start.click();
 await expect(page.getByRole('main',{name:'Durable review run'})).toBeVisible();
 await page.getByRole('button',{name:'sure',exact:true}).click();
 const grades=page.getByRole('region',{name:'Grade answer'});
 await expect(grades.getByRole('button')).toHaveCount(4);
 await grades.getByRole('button',{name:/^Good/}).click();
 await expect(page.getByRole('main',{name:'Durable review run'})).toBeVisible();
 await page.goto(url('/atlas'));
 await expect(page.locator('[data-v6-header]')).toContainText('Concept map');
 await page.goto(url('/calendar'));
 await page.getByRole('button',{name:'Plan study tasks'}).click();
 await expect(page.getByRole('dialog',{name:'Plan study tasks'})).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog',{name:'Plan study tasks'})).toBeHidden();
 await contained(page,'acceptance Planner');
});

test('N101 known release defect #1299: grading lacks undo in durable v6 Review',async({page})=>{
 test.fail(true,'Known release defect #1299: v6 Review omits undo-last-grade action');
 await setup(page);
 await page.goto(url('/review'));
 const start=page.getByRole('button',{name:/^Start [1-9][0-9]* cards$/});
 await expect(start).toBeEnabled();
 await start.click();
 await page.getByRole('button',{name:'sure',exact:true}).click();
 await page.getByRole('region',{name:'Grade answer'})
  .getByRole('button',{name:/^Good/}).click();
 await expect(page.getByRole('button',{name:'Undo last answer'})).toBeVisible();
});
