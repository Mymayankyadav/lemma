import {expect,test,type Page,type TestInfo} from '@playwright/test';
import {at,DATE,NOW} from './v7-scenes';

test.use({viewport:{width:390,height:844},locale:'en-IN',timezoneId:'Asia/Kolkata'});

async function go(page:Page,route:string,flags='',empty=false){
  const address=at(route).replace(/(?=#)/,flags?','+flags:'');
  await page.goto(empty?address.replace('demo=1','demo=first-use'):address);
  await expect(page.locator('#main-content')).toBeVisible({timeout:12000});
}

async function frame(page:Page,info:TestInfo,id:string){
  await page.evaluate(()=>document.fonts.ready);
  const path=info.outputPath(id+'.png');
  await page.screenshot({path,animations:'disabled'});
  await info.attach(id,{path,contentType:'image/png'});
}

test.beforeEach(async({page})=>{await page.clock.setFixedTime(NOW);});

test('B1, B9 and B16 share the current step, show sources once, and explain a locked checkpoint',async({page},info)=>{
  await go(page,'/projects');
  await expect(page.getByText(/Compactness · step 3 of 4/)).toBeVisible();
  await frame(page,info,'B1-paths');
  await go(page,'/p/real-analysis/cp/CP4');
  const steps=page.getByRole('region',{name:'Steps'});
  await expect(steps.locator('[aria-current=step]')).toContainText('Use a finite subcover');
  await frame(page,info,'B1-checkpoint');
  await go(page,'/p/real-analysis?tab=sources');
  const sources=page.locator('.v7-path-source-list');
  await expect(sources.getByRole('button',{name:/Rudin/i})).toBeVisible();
  await expect(sources.getByText(/1 of 342 pages transcribed/)).toHaveCount(1);
  await frame(page,info,'B9-sources');
  await go(page,'/p/real-analysis/cp/CP8');
  await expect(page.getByText('Unlocks after Heine–Borel')).toBeVisible();
  await expect(page.getByRole('link',{name:/^Review Uniform continuity/})).toHaveCount(0);
  await frame(page,info,'B16-locked');
});

test('B2 renders separate missing-record messages and return actions',async({page},info)=>{
  for(const [name,route,copy] of [
    ['path','/p/unknown-path',"This path doesn't exist."],
    ['checkpoint','/p/real-analysis/cp/unknown',"This checkpoint doesn't exist."],
    ['card','/cards/99999',"Card #99999 doesn't exist."],
  ]){
    await go(page,route);
    await expect(page.getByText(copy,{exact:true})).toBeVisible();
    await expect(page.getByRole('link',{name:/^Back to /})).toBeVisible();
    await frame(page,info,'B2-'+name);
  }
});

test('B3 and L13 restore the deleted task and use the sentence form',async({page},info)=>{
  await go(page,'/tasks?new=1');
  const editor=page.getByRole('dialog',{name:'New task'});
  const title='Check the finite cover';
  await editor.getByRole('textbox',{name:'Title'}).fill(title);
  await expect(editor.getByRole('button',{name:/^Due/})).toBeVisible();
  await expect(editor.getByRole('button',{name:'More options',exact:true})).toBeVisible();
  await frame(page,info,'L13-task-form');
  await editor.getByRole('button',{name:'Save task'}).click();
  const row=page.locator('.v7-tk-row').filter({hasText:title});
  await row.getByRole('button',{name:'More actions for '+title}).click();
  await page.getByRole('menuitem',{name:'Delete task',exact:true}).click();
  await expect(row).toHaveCount(0);
  const undo=page.locator('.v7-app-toast').filter({hasText:'Task deleted'}).getByRole('button',{name:'Undo',exact:true});
  await expect(undo).toBeVisible();
  await frame(page,info,'B3-task-undo');
  await undo.click();
  await expect(row).toBeVisible();
});

test('B10 announces a capture type and Add details follows the learner’s choice',async({page},info)=>{
  await go(page,'/');
  await page.getByRole('button',{name:'Capture',exact:true}).click();
  const capture=page.getByRole('dialog',{name:'Capture'});
  await capture.getByRole('textbox',{name:'What do you want to add?'}).fill('Rudin tomorrow 4pm 90m');
  await expect(capture.locator('[aria-live=polite]')).toHaveText('Adds a time block');
  await frame(page,info,'B10-type-announcement');
  await capture.getByRole('radio',{name:'Task',exact:true}).click();
  await capture.getByRole('button',{name:'Add details'}).click();
  await expect(page.getByRole('dialog',{name:'New task'})).toBeVisible();
  await frame(page,info,'B10-chosen-editor');
});

test('B12 and T11 edit an Inbox card and use caption-size plan tags',async({page},info)=>{
  await go(page,'/proposals');
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'Edit proposed card'});
  await editor.getByRole('textbox',{name:'Front',exact:true}).fill('Why does the cover have a finite subcover?');
  await expect(editor.getByRole('region',{name:'Live preview'})).toContainText('Why does the cover');
  await frame(page,info,'B12-inbox-edit');
  await page.keyboard.press('Escape');
  await go(page,'/proposals?tab=plan');
  const tags=page.locator('.v7-inbox-mini small');
  await expect(tags.first()).toBeVisible();
  for(const tag of await tags.all())expect(await tag.evaluate(node=>getComputedStyle(node).fontSize)).toBe('12px');
  await frame(page,info,'T11-plan-tags');
});

test('B13 shows the running timer in a break state',async({page},info)=>{
  await go(page,'/?quick=1');
  const sheet=page.getByRole('dialog',{name:'Start a focus session'});
  await sheet.getByRole('radio',{name:/Pomodoro/}).first().click();
  await sheet.getByRole('button',{name:'Start focus',exact:true}).click();
  await expect(page.locator('.v7-focus')).toHaveAttribute('data-word','Focus');
  await page.clock.setFixedTime(new Date(NOW.getTime()+120_000));
  await page.getByRole('button',{name:'Take a break',exact:true}).click();
  await expect(page.locator('.v7-focus')).toHaveAttribute('data-word','Break');
  await frame(page,info,'B13-focus-break');
});

test('B14, B20 and B23 keep Tutor settings actionable and an empty Agenda clean',async({page},info)=>{
  await go(page,'/settings?section=tutor');
  await expect(page.getByRole('heading',{name:'Teaching style',exact:true})).toHaveCount(1);
  const panel=page.getByRole('main');
  await expect(panel.getByRole('button',{name:/Show/i}).first()).toBeVisible();
  await frame(page,info,'B14-B23-tutor-settings');
  await go(page,'/calendar?view=agenda&date='+DATE,'',true);
  await expect(page.getByText(/Nothing planned/).first()).toBeVisible();
  await expect(page.locator('.v7-ag-row[data-kind=deadline]')).toHaveCount(0);
  await frame(page,info,'B20-empty-agenda');
});

test('B24, L9 and T9 keep library filtering singular and card keys scrollable',async({page},info)=>{
  await go(page,'/cards');
  const filter=page.getByRole('button',{name:'Filter',exact:true});
  expect((await filter.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await page.getByRole('searchbox',{name:'Search cards'}).fill('no exact matches qp735');
  await expect(page.getByRole('button',{name:'Clear filters',exact:true})).toHaveCount(1);
  await frame(page,info,'B24-T9-cards-filter');
  await go(page,'/cards?new=1');
  const editor=page.getByRole('dialog',{name:'New card'});
  await expect(editor.getByRole('button',{name:/^Checkpoint/})).toHaveCount(0);
  await editor.getByRole('textbox',{name:'Front',exact:true}).fill('Compactness');
  await expect(editor.getByRole('region',{name:'Live preview'})).toContainText('Compactness');
  const toolbar=editor.getByRole('toolbar',{name:'Maths keys'});
  expect(await toolbar.evaluate(node=>node.scrollWidth>node.clientWidth)).toBe(true);
  await toolbar.getByRole('button').last().focus();
  await expect(toolbar.getByRole('button').last()).toBeInViewport();
  await frame(page,info,'L9-card-keys');
});

test('L8, L10 and T10 keep first-card fields wide, Scratch in flow and the proof mark at 64px',async({page},info)=>{
  await go(page,'/review','v7Scratch',true);
  const region=page.getByRole('region',{name:'First card'});
  await region.getByRole('button',{name:'Create a path and card'}).click();
  const front=region.getByLabel('Front',{exact:true}),back=region.getByLabel('Back',{exact:true});
  await region.getByLabel('Path name').fill('First topology path');
  await front.fill('What is a clopen set?');
  await back.fill('A set that is both open and closed.');
  const [frontBox,backBox]=await Promise.all([front.boundingBox(),back.boundingBox()]);
  expect(frontBox?.width).toBeGreaterThan(300);
  expect(frontBox?.width).toBe(backBox?.width);
  await frame(page,info,'L8-first-card');
  await region.getByRole('button',{name:'Save card'}).click();
  await page.getByRole('button',{name:'Review now'}).click();
  const card=page.getByRole('article',{name:'Review card'});
  await expect(card).toBeVisible();
  const firstTop=(await card.boundingBox())!.y;
  await page.getByRole('button',{name:'Show answer',exact:true}).click();
  await expect(card.getByText('A set that is both open and closed.',{exact:true})).toBeVisible();
  expect((await card.boundingBox())!.y).toBeCloseTo(firstTop,0);
  await page.getByRole('button',{name:/scratch/i}).click();
  await expect(card.getByText('A set that is both open and closed.',{exact:true})).toBeInViewport();
  await frame(page,info,'L10-review-and-scratch');
  await page.getByRole('group',{name:'Grade answer'}).getByRole('button',{name:/^Easy\b/}).click();
  const end=page.getByRole('img',{name:'Done',exact:true});
  expect((await end.boundingBox())?.width).toBe(64);
  await frame(page,info,'T10-review-end-mark');
});

test('T7 and U6 use kit controls in the Calendar and Pad',async({page},info)=>{
  await go(page,'/calendar?view=day&date='+DATE+'&new=block');
  const editor=page.getByRole('dialog',{name:'New time block'});
  // N220 (Owner report): Start is the kit's typed time field, not a ruler.
  await expect(editor.getByRole('textbox',{name:'Start',exact:true})).toBeVisible();
  await expect(editor.locator('input[type=date],input[type=time],select')).toHaveCount(0);
  await frame(page,info,'T7-kit-time-block');
  await page.keyboard.press('Escape');
  await go(page,'/pad?path=real-analysis');
  const picker=page.getByRole('region',{name:'Choose a Pad checkpoint'});
  await expect(picker.getByRole('button',{name:/Path/}).first()).toBeVisible();
  await expect(picker.locator('select')).toHaveCount(0);
  await frame(page,info,'U6-device-pad');
});
