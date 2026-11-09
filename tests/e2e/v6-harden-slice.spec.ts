import {test,expect,type Locator,type Page} from '@playwright/test';

const home='./?demo=1&flags=v6Shell#/';
const log='./?demo=1&flags=v6Shell#/log';
const progress='./?demo=1&flags=v6Shell#/insights?range=7';
const longIntent='Prove '+'C'.repeat(145)+' \\(\\forall x\\in X\\)';
const scenarios=[
 {width:320,theme:'graph-night'},
 {width:360,theme:'graph'},
 {width:390,theme:'graph-night'},
] as const;

async function prepare(page:Page){
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
 await page.route('https://fonts.gstatic.com/**',r=>r.fulfill({body:''}));
 // One owner-scoped empty demo account per browser tab. Never reset it on route
 // navigation or reload: that would hide recovery and persisted-effort bugs.
 await page.addInitScript(()=>{
  try{
   if(!sessionStorage.getItem('lemma.v6.demo.study.v1'))
    sessionStorage.setItem('lemma.v6.demo.study.v1',
     JSON.stringify({schema:1,entries:[],blocks:[]}));
  }catch{/* session storage might be disabled */}
 });
}
async function layout(page:Page,theme:'graph'|'graph-night'){
 await page.evaluate(value=>{
  document.documentElement.style.fontSize='200%';
  document.documentElement.setAttribute('data-theme',value);
 },theme);
 await expect(page.locator('html')).toHaveAttribute('data-v6','');
 expect(await page.evaluate(()=>getComputedStyle(document.documentElement).colorScheme))
  .toBe(theme==='graph-night'?'dark':'light');
}
async function withinScreen(page:Page,locator:Locator){
 await expect(locator).toBeVisible();
 const bounds=await locator.boundingBox();
 expect(bounds).not.toBeNull();
 const width=page.viewportSize()!.width;
 expect(bounds!.x).toBeGreaterThanOrEqual(-1);
 expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width+1);
}
async function touchTarget(locator:Locator){
 await expect(locator).toBeVisible();
 const bounds=await locator.boundingBox();
 expect(bounds).not.toBeNull();
 expect(bounds!.height).toBeGreaterThanOrEqual(44);
}
async function start(page:Page){
 await expect(page.getByRole('textbox',{name:'Focus intention'})).toBeVisible();
 await page.getByRole('textbox',{name:'Focus intention'}).fill(longIntent);
 await page.getByRole('button',{name:'Start focus'}).click();
 await expect(page.getByRole('dialog',{name:'Focus'})).toBeVisible();
}

for(const {width,theme} of scenarios){
 test('N98 first-slice geometry and owner effort at '+width+'px / '+theme+' / 200% text',async({page})=>{
  test.setTimeout(120_000);
  await page.setViewportSize({width,height:844});
  await prepare(page);
  await page.goto(home);
  await start(page);
  await layout(page,theme);
  const dialog=page.getByRole('dialog',{name:'Focus'});
  await withinScreen(page,dialog);
  await expect(dialog).toContainText(longIntent);
  await touchTarget(dialog.getByRole('button',{name:'Close'}));
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await touchTarget(page.getByRole('button',{name:'Return to focus'}));

  await page.goto(log);
  await expect(page.getByRole('heading',{name:'Time log'})).toBeVisible();
  await layout(page,theme);
  await withinScreen(page,page.locator('main').last());
  // N121 D5: "Add time" opens a dialog with date and time pickers.
  await touchTarget(page.getByRole('button',{name:'Add time'}));
  await page.getByRole('button',{name:'Add time'}).click();
  await page.getByRole('textbox',{name:'Manual intent'}).fill(longIntent);
  const end=new Date(Date.now()-5*60_000),begin=new Date(end.getTime()-10*60_000);
   const ownerFields=await page.evaluate(({start,stop})=>{
    const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
    const fmt=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',
     hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
    const parts=(iso:string)=>{
     const rows=fmt.formatToParts(new Date(iso));
     const value=(key:string)=>rows.find(x=>x.type===key)?.value??'';
     return {day:value('year')+'-'+value('month')+'-'+value('day'),clock:value('hour')+':'+value('minute')};
    };
    return {begin:parts(start),end:parts(stop)};
   },{start:begin.toISOString(),stop:end.toISOString()});
   if(ownerFields.begin.day!==ownerFields.end.day)throw Error('N121 manual log case straddles midnight; adjust its fixed clock fixture');
   await page.getByLabel('Manual date').fill(ownerFields.begin.day);
   await page.getByLabel('Manual start').fill(ownerFields.begin.clock);
   await page.getByLabel('Manual end').fill(ownerFields.end.clock);
  await page.getByRole('button',{name:'Save time'}).click();
  await expect(page.locator('article')).toContainText(longIntent);
  await withinScreen(page,page.locator('article').first());
  await touchTarget(page.getByRole('button',{name:'Edit entry'}));
  await page.getByRole('button',{name:'Edit entry'}).click();
  await withinScreen(page,page.getByRole('combobox',{name:'Study subject'}));

  await page.goto(progress);
  await expect(page.getByRole('region',{name:'Saved study effort'})).toBeVisible();
  await layout(page,theme);
  const saved=page.getByRole('region',{name:'Total logged time'});
  await expect(saved).toContainText('10 min');
  await withinScreen(page,saved);
  // N121 D1: one "Time range" control (Today · 7 · 30 · 90 days).
  const recent=page.getByRole('group',{name:'Time range'});
  await touchTarget(recent.getByRole('button',{name:'7 days'}));
  await recent.getByRole('button',{name:'90 days'}).click();
  await withinScreen(page,page.getByRole('region',{name:'Daily logged minutes'}));
  const accessory=page.getByRole('complementary',{name:'Focus accessory'});
  await withinScreen(page,accessory);
  await touchTarget(accessory.getByRole('button',{name:'Open focus'}));
  const a=await accessory.boundingBox();
  const nav=await page.getByRole('navigation',{name:'Main navigation'}).boundingBox();
  expect(a&&nav).toBeTruthy();
  expect(a!.y+a!.height).toBeLessThanOrEqual(nav!.y+1);
 });
}

test('N98 reload and Back preserve one authoritative focus entry with explicit lease takeover',async({page})=>{
 test.setTimeout(90_000);
 await page.setViewportSize({width:320,height:640});
 await prepare(page);
 await page.goto(home);
 await start(page);
 await page.getByRole('dialog',{name:'Focus'}).getByRole('button',{name:'Close'}).click();
 await page.reload();
 await expect(page.getByRole('button',{name:'Return to focus'})).toBeEnabled();
 await page.getByRole('button',{name:'Return to focus'}).click();
 const dialog=page.getByRole('dialog',{name:'Focus'});
 // #1315: the timer lease lives under Timer details on the Focus page.
 await dialog.getByText('Timer details',{exact:true}).click();
 await expect(dialog.getByRole('button',{name:'Next phase'})).toBeDisabled();
 await dialog.getByRole('button',{name:'Take control of timer'}).click();
 await expect(dialog.getByRole('button',{name:'Next phase'})).toBeEnabled();
 await dialog.getByRole('button',{name:'Close'}).click();
 await page.goto(progress);
 const accessory=page.getByRole('complementary',{name:'Focus accessory'});
 await expect(accessory).toBeVisible();
 await accessory.getByRole('button',{name:'Open focus'}).click();
 await expect(page.getByRole('dialog',{name:'Focus'})).toBeVisible();
 await page.goBack();
 await expect(page).toHaveURL(/insights[?]range=7$/);
 await expect(page.getByRole('dialog',{name:'Focus'})).toHaveCount(0);
 await expect(accessory).toBeVisible();
});

test('N98 long open focus asks for confirmation without auto-saving elapsed effort',async({page})=>{
 test.setTimeout(90_000);
 await page.setViewportSize({width:390,height:844});
 await page.clock.install();
 await prepare(page);
 await page.goto(home);
 await start(page);
 await page.clock.fastForward(3*60*60*1000+60_000);
 await expect(page.getByRole('dialog',{name:'Focus'})).toContainText('over three hours old');
 await page.getByRole('dialog',{name:'Focus'}).getByRole('button',{name:'Close'}).click();
 await page.goto(log);
 await expect(page.getByText(/^No study time saved this week\./)).toBeVisible();
 await expect(page.getByRole('complementary',{name:'Focus accessory'})).toBeVisible();
});

test('N98 flag off never mounts the v6 log or focus accessory',async({page})=>{
 await prepare(page);
 await page.goto('./?demo=1#/log');
 await expect(page).toHaveURL(/#[/]$/);
 await expect(page.getByRole('complementary',{name:'Focus accessory'})).toHaveCount(0);
});
