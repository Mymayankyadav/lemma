import {expect,test,type Page} from '@playwright/test';
import {at,NOW} from './v7-scenes';

const go=async(page:Page,route:string,flags='')=>{
 await page.goto(at(route).replace(/(?=#)/,flags?','+flags:''));
 await expect(page.locator('#main-content')).toBeVisible();
 await page.evaluate(()=>document.fonts.ready);
};
test.use({locale:'en-IN',timezoneId:'Asia/Kolkata'});
test.beforeEach(async({page})=>{await page.clock.setFixedTime(NOW);});

test('Calendar keeps its title, moves a week with arrows and puts Choose date fourth',async({page})=>{
 await go(page,'/calendar?view=day&date=2026-11-09');
 await expect(page.getByRole('heading',{name:'Calendar',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:/^Date:|^Calendar date:/})).toHaveCount(0);
 await page.getByRole('button',{name:'Next week',exact:true}).click();
 await expect(page).toHaveURL(/date=2026-11-16/);
 await page.getByRole('button',{name:'Previous week',exact:true}).click();
 await expect(page).toHaveURL(/date=2026-11-09/);
 await page.getByRole('button',{name:'Calendar actions'}).click();
 const menu=page.getByRole('menu',{name:'Calendar actions'});
 await expect(menu.getByRole('menuitem')).toHaveText(['Go to today','Browse day','Plan study tasks','Choose date']);
 await menu.getByRole('menuitem',{name:'Choose date'}).click();
 const date=page.getByRole('dialog',{name:'Choose a date'});
 await expect(date).toBeVisible();
 await date.getByRole('button',{name:'Tomorrow',exact:true}).click();
 await expect(page).toHaveURL(/date=2026-11-10/);
 await expect(date).toHaveCount(0);
});

test('Calendar month navigation clamps the day without skipping a month',async({page})=>{
 await go(page,'/calendar?view=month&date=2026-01-31');
 await page.getByRole('button',{name:'Next month',exact:true}).click();
 await expect(page).toHaveURL(/date=2026-02-28/);
 await page.getByRole('button',{name:'Previous month',exact:true}).click();
 await expect(page).toHaveURL(/date=2026-01-28/);
});

for(const [width,height,scale] of [[320,640,100],[390,844,160],[844,390,100]])test(`Tutor controls do not overlap at ${width}×${height}, ${scale}% text`,async({page})=>{
 await page.setViewportSize({width,height});
 await page.addInitScript(value=>document.addEventListener('DOMContentLoaded',()=>document.documentElement.style.fontSize=value+'%'),scale);
 await go(page,'/p/real-analysis/cp/CP4/tutor','tutorScratch');
 await page.getByRole('button',{name:'Write a question'}).click();
 const answer=page.getByRole('textbox',{name:'Your answer'});
 await answer.fill('A finite intersection of open sets is open.');await answer.click();
 await expect(page.getByRole('group',{name:'Answer keyboard'})).toBeVisible();
 const boxes=await page.evaluate(()=>{
  const box=(selector:string)=>document.querySelector(selector)!.getBoundingClientRect().toJSON();
  return {header:box('.tutor-header'),title:box('.tutor-header-title'),progress:box('.tutor-session-progress'),chat:box('.chat'),composer:box('.keyboard-composer'),field:box('.composer'),keys:box('.kb'),
   overflow:document.documentElement.scrollWidth-innerWidth};
 });
 expect(boxes.overflow).toBeLessThanOrEqual(1);
 expect(boxes.title.top).toBeGreaterThanOrEqual(boxes.header.top-1);
 expect(boxes.title.bottom).toBeLessThanOrEqual(boxes.progress.top+1);
 expect(boxes.header.top).toBeGreaterThanOrEqual(0);
 if(width>height)expect(boxes.chat.right).toBeLessThanOrEqual(boxes.composer.left+1);
 else expect(boxes.chat.bottom).toBeLessThanOrEqual(boxes.composer.top+1);
 expect(boxes.field.bottom).toBeLessThanOrEqual(boxes.keys.top+1);
 for(const label of ['Write by hand','Edit answer','Send']){
  const button=page.locator('.composer').getByRole('button',{name:label,exact:true});
  await expect(button).toBeVisible();const box=(await button.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);
 }
 const last=page.getByRole('button',{name:'New line',exact:true});await last.scrollIntoViewIfNeeded();
 const lastBox=(await last.boundingBox())!;expect(lastBox.y+lastBox.height).toBeLessThanOrEqual(height+1);
 await page.getByRole('button',{name:'Edit answer',exact:true}).click();
 const actions=page.getByRole('dialog',{name:'Answer actions',exact:true});
 for(const label of ['Photo','Hint 1/4','Stuck','Context','Undo typing','Redo typing'])await expect(actions.getByRole('button',{name:label,exact:true})).toBeVisible();
 await actions.getByRole('button',{name:'Close',exact:true}).click();
 await page.getByRole('button',{name:'Write by hand',exact:true}).dblclick();
 await expect(page.getByRole('img',{name:'Draw your answer'})).toBeVisible();
 await expect(page.getByRole('group',{name:'Answer keyboard'})).toHaveCount(0);
});

test('Scratch-enabled Tutor retains typing undo, redo, context and connection',async({page})=>{
 await go(page,'/p/real-analysis/cp/CP4/tutor','tutorScratch');
 await page.getByRole('button',{name:'Write a question'}).click();
 const answer=page.getByRole('textbox',{name:'Your answer'});
 await answer.fill('Finite subcover');
 await page.getByRole('button',{name:'Edit answer',exact:true}).click();
 await page.getByRole('button',{name:'Undo typing'}).click();await expect(answer).toHaveJSProperty('textContent','');
 await page.getByRole('button',{name:'Edit answer',exact:true}).click();
 await page.getByRole('button',{name:'Redo typing'}).click();await expect(answer).toHaveJSProperty('textContent','Finite subcover');
 await page.getByRole('button',{name:'Edit answer',exact:true}).click();await page.getByRole('button',{name:'Context',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Context for your tutor'})).toBeVisible();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Session actions'}).click();
 await expect(page.getByRole('button',{name:'Copy prompt',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Connection',exact:true}).click();await expect(page.getByRole('dialog',{name:'Connection',exact:true})).toBeVisible();
});

test('Progress can leave an empty range, open its subject history and create a goal',async({page})=>{
 await go(page,'/insights?range=day');
 const range=page.getByRole('radiogroup',{name:'Range'});
 await expect(range).toBeVisible();await range.getByRole('radio',{name:'30 days',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Focus by day'})).toBeVisible();
 await page.getByRole('button',{name:'Progress actions'}).click();await page.getByRole('menuitem',{name:'Progress details'}).click();
 const details=page.getByRole('dialog',{name:'Progress details'});
 await expect(details.getByRole('heading',{name:'Time by subject'})).toBeVisible();await expect(details).toContainText('Checkpoints');
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'Progress actions'}).click();await page.getByRole('menuitem',{name:'Add a goal'}).click();
 await expect(page.getByRole('dialog',{name:'Add a goal'})).toBeVisible();
});

test('Review keeps forecast and memory reachable with an empty library',async({page})=>{
 await page.goto(at('/review').replace('demo=1','demo=first-use'));
 await expect(page.getByText('No cards yet',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Review actions'}).click();await page.getByRole('menuitem',{name:'Forecast and memory'}).click();
 const details=page.getByRole('dialog',{name:'Forecast and memory'});
 await expect(details.getByRole('heading',{name:'Due each day'})).toBeVisible();await expect(details.getByRole('region',{name:'Memory, last 30 days'})).toBeVisible();
});

test('Atlas retains the Tonight, Shaky and Demonstrated subsets and subject index',async({page})=>{
 await go(page,'/atlas?view=list');await page.getByRole('button',{name:'Layers',exact:true}).click();
 const layers=page.getByRole('dialog',{name:'Layers'});
 for(const label of ['Tonight','Shaky','Demonstrated','All concepts']){
  await layers.getByRole('button',{name:label,exact:true}).click();await expect(layers.getByRole('button',{name:label,exact:true})).toHaveAttribute('aria-pressed','true');
 }
 await layers.getByRole('button',{name:'Jump to subject'}).click();await layers.getByRole('button',{name:'Topology',exact:true}).click();
 await expect(layers).toHaveCount(0);await expect(page.locator('.v7-atlas-subject[aria-label="Topology"]')).toBeInViewport();
});

test('Path estimates, source pages and session continuation remain usable',async({page})=>{
 await go(page,'/p/real-analysis');await page.getByRole('button',{name:'Plan estimates',exact:true}).click();
 await expect(page.locator('.v7-atlas-fit')).toBeVisible();await expect(page.locator('.v7-learning-details')).toContainText('Compactness');
 await go(page,'/p/real-analysis?tab=sources');await page.getByRole('region',{name:'Sources',exact:true}).getByRole('button',{name:/Rudin/i}).first().click();
 await expect(page.getByRole('region',{name:/Page transcription for/})).toBeVisible();await expect(page.getByRole('button',{name:'Download as .md'})).toBeVisible();
 await go(page,'/s/real-analysis/7');await page.getByRole('button',{name:'Continue with tutor',exact:true}).click();
 await expect(page).toHaveURL(/#\/p\/real-analysis\/cp\/CP4\/tutor$/);
});

test('Today retains targets and practice entry; diagnostics retains the area table',async({page})=>{
 await go(page,'/','todayNextStep');await page.getByRole('button',{name:'Daily targets',exact:true}).click();
 await expect(page.getByRole('region',{name:'Targets'})).toBeVisible();await page.getByRole('button',{name:'Study details',exact:true}).click();
 await page.getByRole('link',{name:'Open practice question',exact:true}).click();await expect(page).toHaveURL(/#\/practice\?question=1$/);
 await expect(page.getByRole('button',{name:'Practice question',exact:true})).toHaveAttribute('aria-expanded','true');
 await go(page,'/settings?section=advanced');await page.getByRole('button',{name:'Knowledge by area',exact:true}).click();
 await expect(page.getByRole('columnheader',{name:'Transfer',exact:true})).toBeVisible();
});

test('Task keeps exact long estimates, minute precision and a subject override with a path',async({page})=>{
 await go(page,'/tasks?new=1');
 const sheet=page.getByRole('dialog',{name:'New task',exact:true});
 await sheet.getByLabel('Title',{exact:true}).fill('Exact study estimate');
 await sheet.getByRole('button',{name:'More options',exact:true}).click();
 await sheet.getByRole('button',{name:'Exact estimate',exact:true}).click();
 await sheet.getByLabel('Minutes · Optional',{exact:true}).fill('347');
 await sheet.getByRole('button',{name:/^Path:/}).click();await page.getByRole('dialog',{name:'Path',exact:true}).getByRole('radio',{name:'Real Analysis',exact:true}).click();
 await sheet.getByRole('button',{name:/^Subject:/}).click();await page.getByRole('dialog',{name:'Subject',exact:true}).getByRole('radio',{name:'Topology',exact:true}).click();
 await sheet.getByRole('button',{name:/^Due:/}).click();await page.getByRole('dialog',{name:'Due',exact:true}).getByRole('radio',{name:'Date & time',exact:true}).click();
 await sheet.getByRole('button',{name:'Type due time',exact:true}).click();
 const time=page.getByRole('dialog',{name:'Due time',exact:true});
 await time.getByLabel('Time (HH:MM)').fill('2560');await expect(time.getByRole('button',{name:'Use time'})).toBeDisabled();
 await time.getByLabel('Time (HH:MM)').fill('0917');await time.getByRole('button',{name:'Use time'}).click();
 await expect(sheet.getByRole('slider',{name:'Due time',exact:true})).toHaveValue('557');
 await sheet.getByRole('button',{name:'Save task'}).click();await expect(sheet).toHaveCount(0);
 const read=()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('lemma.v6.demo.tasks.v1')??'{"tasks":[]}').tasks.find((task:{title:string})=>task.title==='Exact study estimate'));
 await expect.poll(read).toMatchObject({estimateMinutes:347,projectId:'project-analysis',subjectId:'subject-topology',due:{kind:'instant',at:'2026-11-09T03:47:00.000Z'}});
});

for(const [route,label] of [['/cards','Search cards'],['/projects','Search paths and checkpoints']])test(`Library search has room for its prompt on a small phone: ${route}`,async({page})=>{
 await page.setViewportSize({width:320,height:640});await go(page,route);
 const search=page.getByRole('searchbox',{name:label});
 expect((await search.boundingBox())!.width).toBeGreaterThanOrEqual(240);
 await search.fill('no such study result');await expect(page.getByText(/No cards match|No paths match/).first()).toBeVisible();
});
