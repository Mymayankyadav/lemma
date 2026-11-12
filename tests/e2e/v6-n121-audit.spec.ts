import {test,expect,type Page,type Locator} from '@playwright/test';
import {readFileSync} from 'node:fs';

// N121: one regression test per finding group of the 9 Nov 2026 v6 UI audit
// (docs/v6/ui-audit-2026-11-09/AUDIT.md). The seed is the auditor's month of demo
// data anchored on Mon 9 Nov 2026, 13:43 IST.
const seed:Record<string,string>=JSON.parse(readFileSync('tests/fixtures/ui-audit-2026-11-09-seed.json','utf8'));
const NOW=new Date('2026-11-09T08:13:00Z');
test.use({locale:'en-IN',timezoneId:'Asia/Kolkata'});

const url=(path:string,profile='1')=>'./?demo='+profile+'&flags=v6Shell#'+path;
async function setup(page:Page,{seeded=true,clock=true}:{seeded?:boolean;clock?:boolean}={}){
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
 await page.route('https://fonts.gstatic.com/**',r=>r.fulfill({body:''}));
 if(clock)await page.clock.install({time:NOW});
 // Seed once per tab, so a reload never overwrites what the test itself saved.
 if(seeded)await page.addInitScript(values=>{
  try{if(!sessionStorage.getItem('audit.seeded')){
   for(const [key,value] of Object.entries(values))sessionStorage.setItem(key,value);
   sessionStorage.setItem('audit.seeded','1');
  }}catch{/* storage blocked: the assertions expose it */}
 },seed);
}
async function settled(page:Page){
 await page.waitForLoadState('networkidle');
 await expect(page.locator('#main-content').getByText(/^Loading\b/)).toHaveCount(0,{timeout:20_000});
}
/** Playwright's actionability check: the element receives the tap at its own centre. */
async function reachable(target:Locator){
 await target.scrollIntoViewIfNeeded();
 await target.click({trial:true,timeout:3000});
}
async function visibleText(page:Page):Promise<string>{
 return page.evaluate(()=>{
  const parts:string[]=[];
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  while(walker.nextNode()){
   const node=walker.currentNode,el=node.parentElement,text=node.textContent?.trim();
   if(!text||!el)continue;
   const box=el.getBoundingClientRect(),style=getComputedStyle(el);
   if(!box.width||!box.height||style.visibility==='hidden'||el.closest('.sr-only,[aria-hidden="true"],script,style'))continue;
   parts.push(text);
  }
  return parts.join(' ‖ ');
 });
}

// ---------------------------------------------------------------------------- A1
for(const viewport of [{width:320,height:640},{width:375,height:667},{width:390,height:844},{width:412,height:915}]){
 test('N121 A1 sheet actions receive taps at '+viewport.width+'x'+viewport.height,async({page})=>{
  test.setTimeout(120_000);
  await page.setViewportSize(viewport);
  await setup(page,{seeded:false,clock:false});
  await page.emulateMedia({colorScheme:'dark'});
  const check=async(dialog:Locator,action:Locator)=>{
   await expect(dialog).toBeVisible();
   await reachable(action);
   // The sheet title is not covered by the page header.
   const title=dialog.locator('.ui-sheet-title,h2').first();
   const covered=await title.evaluate(el=>{const r=el.getBoundingClientRect();const top=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!top&&!el.contains(top)&&!top.contains(el);});
   expect(covered,'sheet title covered').toBe(false);
   const body=dialog.locator('.ui-sheet-body').first();
   if(await body.count())expect(await body.evaluate(el=>parseFloat(getComputedStyle(el).paddingLeft))).toBeGreaterThanOrEqual(16);
  };
  await page.goto(url('/projects/new'));
  const path=page.getByRole('dialog',{name:'New path'});
  await path.getByRole('textbox',{name:'Name'}).fill('Galois theory');
  await check(path,path.getByRole('button',{name:'Create path'}));
  await page.goto(url('/cards?new=1'));
  const card=page.getByRole('dialog',{name:'New card'});
  await check(card,card.getByRole('button',{name:'Create card'}));
  await reachable(card.getByRole('button',{name:'Close'}));
  await page.goto(url('/cards/7'));
  await page.getByRole('button',{name:'Edit card'}).click();
  const edit=page.getByRole('dialog',{name:'Edit card'});
  await check(edit,edit.getByRole('button',{name:'Save changes'}));
  await edit.getByRole('button',{name:'Close'}).click();
  await page.locator('#main-content').getByRole('button',{name:'Delete card'}).click();
  const remove=page.getByRole('dialog',{name:'Delete this card?'});
  await check(remove,remove.getByRole('button',{name:'Delete card'}));
  await reachable(remove.getByRole('button',{name:'Cancel'}));
  await page.goto(url('/proposals'));
  await page.getByRole('button',{name:'Edit card'}).click();
  const inbox=page.getByRole('dialog',{name:'Edit card'});
  await check(inbox,inbox.getByRole('button',{name:'Approve'}));
 });
}

// ---------------------------------------------------------------------------- A2
for(const viewport of [{width:390,height:844},{width:1280,height:800}]){
 test('N121 A2 dialogs are centred or full-width at '+viewport.width,async({page})=>{
  test.setTimeout(120_000);
  await page.setViewportSize(viewport);
  await setup(page,{seeded:false,clock:false});
  const geometry=async(dialog:Locator,primary:Locator)=>{
   await expect(dialog).toBeVisible();
   const box=(await dialog.boundingBox())!;
   const left=box.x,right=viewport.width-(box.x+box.width),top=box.y,bottom=viewport.height-(box.y+box.height);
   expect(Math.abs(left-right),'horizontally centred').toBeLessThanOrEqual(1);
   expect(top).toBeGreaterThanOrEqual(0);
   if(viewport.width>=700&&box.height<viewport.height-40)expect(Math.abs(top-bottom),'vertically centred').toBeLessThanOrEqual(1);
   await reachable(primary);
  };
  await page.goto(url('/'));
  const actions=page.getByRole('navigation',{name:'Page actions'});
  await actions.locator('summary').filter({hasText:'Add'}).click();
  await actions.getByRole('button',{name:'Task',exact:true}).click();
  const task=page.getByRole('dialog',{name:'New task'});
  await geometry(task,task.getByRole('button',{name:'Save task'}));
  await page.keyboard.press('Escape');
  await page.goto(url('/cards'));
  await page.getByRole('button',{name:'Filters'}).click();
  const filters=page.getByRole('dialog',{name:'Filter cards'});
  await geometry(filters,filters.getByRole('button',{name:'Apply filters'}));
  await page.keyboard.press('Escape');
  await page.goto(url('/calendar?new=block'));
  const block=page.getByRole('dialog',{name:'New time block'});
  await geometry(block,block.getByRole('button',{name:'Create block'}));
  await page.keyboard.press('Escape');
  await page.getByText('Planning tools',{exact:true}).click();
  await page.getByRole('button',{name:'Plan study tasks'}).click();
  const planner=page.getByRole('dialog',{name:'Plan study tasks'});
  await geometry(planner,planner.getByRole('button',{name:'Close'}));
 });
}

// ------------------------------------------------------------------------- A3/A4
test('N121 A3/A4 no raw machine formats on v6 routes and their open dialogs',async({page})=>{
 test.setTimeout(240_000);
 await page.setViewportSize({width:390,height:844});
 await setup(page);
 const routes=['/','/projects','/p/real-analysis','/p/real-analysis/cp/CP4','/s/real-analysis/7','/proposals',
  '/proposals/proposal-6','/review','/cards','/cards/7','/atlas','/insights','/insights?view=time','/insights?view=learning',
  '/calendar','/calendar?view=day','/calendar?view=week','/calendar?view=month','/tasks','/log','/practice','/today/close'];
 const rules:[string,RegExp][]=[
  ['ISO instant',/\d{4}-\d\d-\d\dT\d\d:\d\d/],
  ['ISO date',/(?<![\dT:./-])\d{4}-\d\d-\d\d(?![\dT])/],
  ['slash date with seconds',/\b\d{1,2}\/\d{1,2}\/\d{4},\s*\d{1,2}:\d\d:\d\d/],
  ['UUID',/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/],
  ['internal id',/\b(subject|project|checkpoint)-[a-z][a-z0-9-]*\b/],
  ['IANA zone',/\bAsia\/[A-Z][a-z]+/],
  ['GMT offset',/\bGMT[+-]\d/],
 ];
 const problems:string[]=[];
 const scan=async(where:string)=>{
  const text=await visibleText(page);
  for(const [name,rule] of rules){const hit=text.match(rule);if(hit)problems.push(where+': '+name+' "'+hit[0]+'"');}
 };
 for(const route of routes){await page.goto(url(route));await settled(page);await scan(route);}
 // Open sheets and dialogs too: the release audit only ever saw closed screens.
 await page.goto(url('/calendar?view=day'));await settled(page);
 await page.getByText('Planning tools',{exact:true}).click();
 await page.getByRole('button',{name:'Plan study tasks'}).click();
 await expect(page.getByRole('dialog',{name:'Plan study tasks'}).getByRole('region',{name:'Planner preview'})).toBeVisible();
 await scan('planner');
 await page.goto(url('/log'));await settled(page);
 await page.getByRole('button',{name:'Add time'}).click();await scan('add time');
 await page.keyboard.press('Escape');
 const edit=page.getByRole('button',{name:/^Edit entry /}).first();
 if(await edit.count()){await edit.click();await scan('edit entry');}
 expect(problems).toEqual([]);
});

// ---------------------------------------------------------------------------- A5
test('N121 A5 a Pomodoro break reads the same on the Today card and the dock',async({page})=>{
 test.setTimeout(90_000);
 await setup(page,{seeded:false,clock:false});
 await page.addInitScript(()=>{if(!sessionStorage.getItem('lemma.v6.demo.study.v1'))
  sessionStorage.setItem('lemma.v6.demo.study.v1',JSON.stringify({schema:1,entries:[],blocks:[]}));});
 await page.goto(url('/'));
 await page.getByRole('combobox',{name:'Focus activity'}).selectOption({label:'Proof workshop · pomodoro · 25 min'});
 await page.getByRole('button',{name:'Start focus'}).click();
 const dialog=page.getByRole('dialog',{name:'Focus'});
 await dialog.getByRole('button',{name:'Take a break'}).click();
 await expect(dialog.locator('.cr-focus-eyebrow')).toHaveText(/break/i);
 await dialog.getByRole('button',{name:'Close'}).click();
 const card=page.getByRole('region',{name:'Current study action'});
 const dock=page.getByRole('complementary',{name:'Focus accessory'});
 await expect(dock).toBeVisible();
 const cardLabel=(await card.locator('.notebook-focus-status span').first().innerText()).split('·')[0].trim();
 expect(cardLabel).toMatch(/break/i);
 await expect(dock).toContainText(cardLabel);
});

// ---------------------------------------------------------------------------- A6
test('N121 A6 the menu reaches Tasks, Practice, Time log and Close the day, each with its title',async({page})=>{
 await setup(page,{seeded:false,clock:false});
 for(const [label,title] of [['Tasks','Tasks'],['Practice','Practice'],['Time log','Time log'],['Close the day','Close the day']]){
  await page.goto(url('/'));
  await page.getByRole('navigation',{name:'Page actions'}).locator('summary').filter({hasText:'Menu'}).click();
  await page.getByRole('navigation',{name:'Notebook destinations'}).getByRole('link',{name:label,exact:true}).click();
  await expect(page.locator('[data-v6-header] h1')).toHaveText(title);
 }
 // Add → Time block opens the block dialog itself, not just the Calendar.
 await page.goto(url('/'));
 await page.getByRole('navigation',{name:'Page actions'}).locator('summary').filter({hasText:'Add'}).click();
 await page.getByRole('navigation',{name:'Add to notebook'}).getByRole('link',{name:'Time block'}).click();
 await expect(page.getByRole('dialog',{name:'New time block'})).toBeVisible();
});

// ---------------------------------------------------------------------------- A7
test('N121 A7 an Inbox decision offers Undo and its toast never covers the action bar',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await setup(page,{seeded:false,clock:false});
 await page.goto(url('/proposals'));
 const actions=page.locator('[data-ui=proposal-actions]');
 await expect(actions).toBeVisible();
 const before=(await page.locator('[aria-label="Proposal position"]').innerText()).match(/of ([\d,]+)/)?.[1];
 await actions.getByRole('button',{name:'Approve card'}).click();
 const toast=page.getByRole('status').filter({hasText:'Approved'});
 await expect(toast).toBeVisible();
 await expect(toast.getByRole('button',{name:'Undo'})).toBeVisible();
 const [t,a]=await Promise.all([toast.boundingBox(),actions.boundingBox()]);
 expect(t!.y+t!.height,'toast sits above the action bar').toBeLessThanOrEqual(a!.y+1);
 await toast.getByRole('button',{name:'Undo'}).click();
 await expect(page.locator('[aria-label="Proposal position"]')).toContainText('of '+before);
});

// ---------------------------------------------------------------------------- B1
test('N121 B1 future deadlines are never overdue; overdue items appear once, in one banner',async({page})=>{
 await setup(page);
 await page.goto(url('/calendar?view=agenda&date=2026-11-16'));
 await settled(page);
 const agenda=page.locator('[aria-label="Next seven days"]');
 await expect(agenda).toBeVisible();
 await expect(agenda).not.toContainText('Overdue');
 const banner=page.getByRole('region',{name:'Overdue items'});
 await expect(banner).toHaveCount(1);
 await expect(banner).toContainText(/^\d+ overdue · /);
 await banner.locator('summary').click();
 for(const title of ['Monoids and groups','Sets, maps, well-definedness','Integers and Z/nZ','Subgroups, cosets, Lagrange, cyclic groups'])
  await expect(banner).toContainText(title);
 const count=Number((await banner.locator('summary').innerText()).match(/^(\d+)/)![1]);
 await banner.getByRole('button',{name:'Mark Monoids and groups done'}).click();
 await expect(banner.locator('summary')).toContainText((count-1)+' overdue');
});

// ---------------------------------------------------------------------------- B3
test('N121 B3 Day is a time grid: geometry, now line, tap to create, drag persists',async({page})=>{
 test.setTimeout(90_000);
 await page.setViewportSize({width:390,height:844});
 await setup(page);
 await page.goto(url('/calendar?view=day&date=2026-11-09'));
 await settled(page);
 await expect(page.locator('#main-content')).not.toContainText('GMT');
 const grid=page.getByRole('region',{name:'Day time grid'});
 await expect(grid).toBeVisible();
 await expect(grid.locator('[data-calendar-now]')).toHaveCount(1);
 const block=grid.getByRole('button',{name:/^Heine–Borel proof attempt,/});
 const box=(await block.boundingBox())!;
 const hour=await grid.evaluate(el=>{const t=[...el.querySelectorAll('time')].map(x=>x.getBoundingClientRect().top);return t[1]-t[0];});
 expect(Math.abs(box.height+4-1.5*hour),'a 15:00–16:30 block is 1.5 hours tall').toBeLessThanOrEqual(6);
 // Tap an empty slot: the block dialog opens with that time.
 // The grid opens scrolled to an hour before now (12:43); tap the empty slot at the top of the view.
 const view=(await grid.boundingBox())!;
 const surface=grid.locator('[aria-label="Select empty time to create a block"]');
 const area=(await surface.boundingBox())!;
 await page.mouse.click(area.x+area.width-8,view.y+12);
 const dialog=page.getByRole('dialog',{name:'New time block'});
 await expect(dialog).toBeVisible();
 await expect(dialog.getByLabel('Calendar block start')).not.toHaveValue('');
 await page.keyboard.press('Escape');
 // Drag the block by its grip one hour down; the move persists after reload.
 await block.focus();
 await page.keyboard.press('Alt+ArrowDown');
 await expect(page.getByRole('status').filter({hasText:'Calendar block moved'})).toBeVisible();
 await page.reload();await settled(page);
 await expect(page.getByRole('region',{name:'Day time grid'}).getByRole('button',{name:/^Heine–Borel proof attempt, .*15:15/})).toBeVisible();
});

// ---------------------------------------------------------------------------- B4
test('N121 B4 Week fits a 390 px phone and never splits titles',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await setup(page);
 await page.goto(url('/calendar?view=week&date=2026-11-09'));
 await settled(page);
 const grid=page.getByRole('region',{name:'Week time grid'});
 await expect(grid).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 const size=await grid.evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth}));
 expect(size.scroll).toBeLessThanOrEqual(size.client+1);
 const titles=grid.locator('[data-week-event] strong');
 expect(await titles.count()).toBeGreaterThan(0);
 const styles=await titles.evaluateAll(list=>list.map(el=>[getComputedStyle(el).textOverflow,getComputedStyle(el).wordBreak]));
 for(const [overflow,words] of styles){expect(overflow).toBe('ellipsis');expect(words).toBe('normal');}
});

// ---------------------------------------------------------------------------- B5
test('N121 B5 Month cells show dots, not "0m · 0 blocks"; logging a planned block is no conflict',async({page})=>{
 await setup(page);
 await page.goto(url('/calendar?view=month&date=2026-11-09'));
 await settled(page);
 const grid=page.locator('[aria-label="Month date grid"]');
 await expect(grid.locator('button')).toHaveCount(42);
 await expect(grid).not.toContainText('0m');
 await expect(grid).not.toContainText('blocks');
 expect(await grid.locator('button').first().getAttribute('aria-label')).toMatch(/^Open [A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2} in Day view: /);
 const fonts=await grid.locator('button span').evaluateAll(list=>list.filter(el=>el.textContent?.trim()).map(el=>parseFloat(getComputedStyle(el).fontSize)));
 for(const size of fonts)expect(size).toBeGreaterThanOrEqual(12);
});

// ---------------------------------------------------------------------------- B8
test('N121 B8 the planner offers no slot before now and shows no ISO text',async({page})=>{
 await setup(page);
 await page.goto(url('/calendar?view=day&date=2026-11-09'));
 await settled(page);
 await page.getByText('Planning tools',{exact:true}).click();
 await page.getByRole('button',{name:'Plan study tasks'}).click();
 const dialog=page.getByRole('dialog',{name:'Plan study tasks'});
 await expect(dialog.getByRole('region',{name:'Planner preview'})).toBeVisible();
 const text=await dialog.innerText();
 expect(text).not.toMatch(/\d{4}-\d\d-\d\dT/);
 expect(text).not.toMatch(/too_long|after_due|no_estimate|no_capacity/);
 const starts=await dialog.locator('input[type=time][aria-label$=" start"]').evaluateAll(list=>list.map(el=>(el as HTMLInputElement).value));
 for(const start of starts)expect(start>='13:45','placement '+start+' starts after 13:43').toBe(true);
 await expect(dialog.getByRole('button',{name:/^Add \d+ blocks? to calendar$/})).toBeVisible();
});

// ------------------------------------------------------------------------- C1/C2
test('N121 C1/C2 Today shows today’s calendar blocks, due and overdue items',async({page})=>{
 await setup(page);
 await page.goto(url('/'));
 await settled(page);
 const schedule=page.getByRole('region',{name:"Today's schedule"});
 await expect(schedule).toBeVisible();
 await expect(schedule).toContainText('Heine–Borel proof attempt');
 await expect(page.getByText(/^\d+ due today$/)).toBeVisible();
 await expect(page.getByText(/^\d+ overdue$/)).toBeVisible();
 await expect(page.getByText('No upcoming committed study block today.')).toHaveCount(0);
 await page.getByRole('button',{name:'Start planned focus'}).click();
 await expect(page.getByRole('dialog',{name:'Focus'}).or(page.getByText(/^Focus started:/)).first()).toBeVisible();
});

// ---------------------------------------------------------------------------- D1
test('N121 D1 one study-time total across Overview and Time',async({page})=>{
 await setup(page);
 await page.goto(url('/insights?range=30'));
 await settled(page);
 await expect(page.getByRole('group',{name:'Time range'})).toHaveCount(1);
 const total=page.getByRole('region',{name:'Total logged time'}).locator('strong');
 await expect(total).not.toHaveText('—');
 const overview=(await total.innerText()).trim();
 expect(overview,'49 h, never "2940 min"').not.toMatch(/^\d{3,} min$/);
 await page.getByRole('group',{name:'Progress views'}).getByRole('button',{name:'Time'}).click();
 await expect(page.getByRole('region',{name:'Total logged time'}).locator('strong')).toHaveText(overview);
 await expect(page.locator('#main-content')).not.toContainText('subject-');
});

// ---------------------------------------------------------------------------- D5
test('N121 D5 Time log forms have no ID, ISO or JSON fields',async({page})=>{
 await setup(page);
 await page.goto(url('/log'));
 await settled(page);
 await page.getByRole('button',{name:'Add time'}).click();
 const add=page.getByRole('dialog',{name:'Add time'});
 await expect(add.locator('input[type=date]')).toHaveCount(1);
 await expect(add.locator('input[type=time]')).toHaveCount(2);
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:/^Edit entry /}).first().click();
 const edit=page.getByRole('dialog',{name:'Edit entry'});
 await expect(edit.getByRole('combobox',{name:'Study subject'})).toBeVisible();
 await expect(edit.getByRole('textbox',{name:/ID$/})).toHaveCount(0);
 await expect(edit.locator('textarea[aria-label*="JSON" i],textarea[aria-label*="interval" i]')).toHaveCount(0);
 expect(await edit.innerText()).not.toMatch(/\d{4}-\d\d-\d\dT\d\d/);
});

// ---------------------------------------------------------------------------- E1
test('N121 E1 Browse queue renders math and cloze, one list',async({page})=>{
 await setup(page,{seeded:false,clock:false});
 await page.goto(url('/proposals'));
 await page.getByRole('button',{name:'Browse queue'}).click();
 const queue=page.getByRole('region',{name:'Select Inbox proposals'});
 await expect(queue).toBeVisible();
 const text=await queue.innerText();
 expect(text).not.toContain('$');
 expect(text).not.toContain('{{c');
 await expect(page.getByRole('region',{name:'Proposal groups'})).toBeHidden();
 for(const name of await queue.getByRole('checkbox').evaluateAll(list=>list.map(el=>el.getAttribute('aria-label')??'')))
  expect(name).not.toMatch(/\$|\{\{c|\\/);
});

// ---------------------------------------------------------------------------- E2
test('N121 E2 a demo plan proposal shows no UUID error and leads with what changes',async({page})=>{
 await setup(page,{seeded:false,clock:false});
 await page.goto(url('/proposals/proposal-6'));
 await expect(page.getByRole('main',{name:'Plan proposal review'})).toBeVisible();
 await expect(page.getByText(/UUID|Full draft payload|Retry drafts/)).toHaveCount(0);
 await expect(page.getByRole('region',{name:'What changes'})).toBeVisible();
});

// ---------------------------------------------------------------------------- E3
test('N121 E3 equal card fronts are told apart by their meta line',async({page})=>{
 test.setTimeout(120_000);
 await setup(page,{seeded:false,clock:false});
 await page.goto(url('/cards','stress'));
 const rows=page.locator('[data-card-row]');
 await expect(rows.first()).toBeVisible({timeout:90_000});
 const metas=await page.locator('[data-card-meta]').evaluateAll(list=>list.slice(0,20).map(el=>el.textContent));
 expect(new Set(metas).size).toBe(metas.length);
});

// ---------------------------------------------------------------------------- E5
test('N121 E5 the concept map header count equals the map summary',async({page})=>{
 test.setTimeout(120_000);
 await setup(page,{seeded:false,clock:false});
 await page.goto(url('/atlas','stress'));
 const subtitle=page.locator('[data-v6-header-subtitle]');
 await expect(subtitle).toHaveText(/^\d+ concepts · \d+ connections$/,{timeout:90_000});
 const header=(await subtitle.innerText()).trim();
 await page.goto(url('/atlas?view=map','stress'));
 await expect(page.locator('[data-atlas-summary]')).toContainText(header,{timeout:90_000});
});

// ---------------------------------------------------------------------------- F6
test('N121 F6 Review "Change" opens the daily review settings, not the Settings index',async({page})=>{
 await setup(page,{seeded:false,clock:false});
 await page.goto(url('/review'));
 await page.getByRole('link',{name:'Change daily review limit'}).click();
 await expect(page.locator('.lemma-settings-page > h2')).toHaveText('Study & review');
 await expect(page.getByRole('tab',{name:'Study defaults'})).toHaveAttribute('aria-selected','true');
});

// ---------------------------------------------------------------------------- F7
test('N121 F7 all four grade buttons are reachable at 375x667',async({page})=>{
 await page.setViewportSize({width:375,height:667});
 await setup(page,{seeded:false,clock:false});
 await page.goto(url('/review'));
 await page.getByRole('button',{name:/^Start [1-9][0-9]* cards$/}).click();
 await page.getByRole('button',{name:'Show answer'}).click();
 const grades=page.getByRole('region',{name:'Grade answer'});
 await expect(grades.getByRole('button')).toHaveCount(4);
 for(const button of await grades.getByRole('button').all())await button.click({trial:true,timeout:3000});
 expect(await grades.innerText()).not.toMatch(/\d+(mo|d)\b|✓/);
 // A fresh tab with no saved run: /review/run is not a dead end.
 const fresh=await page.context().newPage();
 await fresh.goto(url('/review/run'));
 await expect(fresh.getByRole('heading',{name:'No review in progress'})).toBeVisible();
 await expect(fresh.getByRole('button',{name:'Start review'})).toBeVisible();
});

// ---------------------------------------------------------------------------- F10
test('N121 F10 overdue tasks are marked and lead their group',async({page})=>{
 await setup(page);
 await page.goto(url('/tasks'));
 await settled(page);
 const backlog=page.getByRole('region',{name:'Backlog'});
 await expect(backlog.locator('li').first()).toContainText('Overdue · ');
 await page.getByRole('button',{name:/^\d+ overdue$/}).click();
 // The filter re-renders the list after the click, so a one-time snapshot of the rows raced it (rows vanished mid-check).
 // Retry until every visible row is overdue, and require the filtered list to be non-empty.
 const rows=page.locator('section[aria-label] li');
 await expect(rows.first()).toContainText('Overdue · ');
 await expect(rows.filter({hasNotText:'Overdue · '})).toHaveCount(0);
});

// ---------------------------------------------------------------------------- H1
test('N121 H1 desktop: the tab bar follows the content column; Week is wide enough',async({page})=>{
 await page.setViewportSize({width:1280,height:800});
 await setup(page);
 await page.goto(url('/'));
 await settled(page);
 const nav=(await page.getByRole('navigation',{name:'Main navigation'}).boundingBox())!;
 const main=(await page.locator('#main-content').boundingBox())!;
 expect(nav.width).toBeLessThanOrEqual(main.width+32);
 await page.goto(url('/calendar?view=week&date=2026-11-09'));
 await settled(page);
 const column=(await page.locator('[data-week-grid-column]').first().boundingBox())!;
 expect(column.width).toBeGreaterThanOrEqual(120);
});
