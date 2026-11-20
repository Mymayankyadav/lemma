import {test,expect} from '@playwright/test';
import {NOW,at} from './v7-scenes';

const pageAt=(route:string,flags='')=>at(route).replace(/(?=#)/,flags?','+flags:'');
test.use({locale:'en-IN',timezoneId:'Asia/Kolkata',viewport:{width:390,height:844}});

test('Today exposes the plan, time ruler and the first-run steps',async({page})=>{
  await page.clock.setFixedTime(NOW);
  await page.goto(pageAt('/','todayNextStep,v7Ruler'));
  const hero=page.getByRole('region',{name:'Your next step'});
  await expect(hero).toBeVisible({timeout:12000});
  await expect(hero.getByRole('list',{name:'Study loop'})).toContainText('Checks');
  await hero.getByRole('button',{name:'Why this'}).click();
  await expect(page.getByRole('dialog',{name:'Why this'})).toBeVisible();
  await page.keyboard.press('Escape');
  const ruler=hero.getByRole('slider',{name:/Time you have now/});
  await ruler.focus();
  await ruler.press('ArrowRight');
  await expect(hero.getByText('Plan updated for', {exact:false})).toBeVisible();
  await page.goto(pageAt('/','todayNextStep,v7Ruler').replace('demo=1','demo=first-use'));
  await expect(page.getByRole('heading',{name:'Welcome to Lemma'})).toBeVisible();
  await expect(page.getByRole('region',{name:'Get started'}).getByRole('link')).toHaveCount(3);
});

test('the Atlas keeps filters in Layers and opens list concepts',async({page})=>{
  await page.goto(pageAt('/atlas'));
  await expect(page.locator('.v7-atlas-sky')).toBeVisible();
  const layers=page.getByRole('button',{name:'Layers',exact:true});
  await layers.click();
  const sheet=page.getByRole('dialog',{name:'Layers'});
  await sheet.getByRole('button',{name:'Uncertain'}).click();
  await expect(sheet.getByRole('button',{name:'Uncertain'})).toHaveAttribute('aria-pressed','true');
  await sheet.getByRole('button',{name:'All',exact:true}).click();
  await page.keyboard.press('Escape');
  await page.getByRole('radio',{name:'List',exact:true}).click();
  const list=page.getByRole('region',{name:'Concept list'});
  await list.getByRole('button',{name:/Compactness/}).first().click();
  await expect(page.locator('.v7-atlas-sheet')).toHaveAttribute('data-expanded','true');
});

test('Tutor opens in reading mode and sends an image-only answer',async({page})=>{
  await page.goto(pageAt('/p/real-analysis/cp/CP4/tutor','tutorScratch'));
  await expect(page.getByRole('status').filter({hasText:'Not listening'})).toBeVisible();
  await page.getByRole('button',{name:'Write a question'}).click();
  const chat=page.getByRole('log',{name:'Conversation'});
  await expect(chat).toBeVisible();
  expect((await chat.boundingBox())?.height).toBeGreaterThanOrEqual(590);
  await page.getByRole('button',{name:'Keys',exact:true}).click();
  await expect(page.getByRole('group',{name:'Answer keyboard'})).toBeVisible();
  expect((await chat.boundingBox())?.height).toBeGreaterThanOrEqual(420);
  await page.getByRole('button',{name:'Scratch',exact:true}).click();
  const canvas=page.getByRole('img',{name:'Draw your answer'});
  const box=(await canvas.boundingBox())!;
  await page.mouse.move(box.x+30,box.y+30);
  await page.mouse.down();
  await page.mouse.move(box.x+100,box.y+80,{steps:5});
  await page.mouse.up();
  await expect(page.getByText('Drawing',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Photo',exact:true}).click();
  await page.getByLabel('Choose photo file',{exact:true}).setInputFiles({
    name:'answer.png',mimeType:'image/png',
    buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==','base64'),
  });
  await expect(page.getByRole('button',{name:'Remove photo 1'})).toBeVisible();
  await page.getByRole('button',{name:'Remove photo 1'}).click();
  await expect(page.getByRole('button',{name:'Remove photo 1'})).toHaveCount(0);
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await chat.getByRole('button',{name:'View drawing'}).click();
  await expect(page.getByRole('dialog',{name:'Drawing'}).getByRole('img')).toBeVisible();
});

test('calendar creation and direct results use the v7 shell',async({page})=>{
  await page.clock.setFixedTime(NOW);
  await page.goto(pageAt('/calendar?view=day&date=2026-11-09&quick=1'));
  const sheet=page.getByRole('dialog',{name:'New time block'});
  await expect(sheet.getByRole('slider',{name:/Start/})).toBeVisible();
  await expect(sheet.getByRole('button',{name:'More',exact:true})).toBeVisible();
  await page.goto(pageAt('/review/done'));
  await expect(page.getByRole('heading',{name:'Review results'})).toBeVisible();
  await expect(page.getByRole('navigation',{name:'Main navigation'})).not.toBeVisible();
});

test('search starts a draft task and Settings can add a goal',async({page})=>{
  await page.goto(pageAt('/'));
  await page.getByRole('button',{name:'Search',exact:true}).first().click();
  const search=page.getByRole('dialog',{name:'Search'}).getByRole('combobox',{name:'Search'});
  await search.fill('Brouwer exercise 4568');
  await page.getByRole('button',{name:/Add task.*Brouwer exercise/}).click();
  const task=page.getByRole('dialog',{name:'New task'});
  await expect(task.getByRole('textbox',{name:'Title'})).toHaveValue('Brouwer exercise 4568');
  await page.keyboard.press('Escape');
  await expect(task).toBeHidden();
  await page.goto(pageAt('/settings?section=planning'));
  await page.getByRole('button',{name:'Add a goal'}).click();
  await expect(page.getByRole('dialog',{name:'Add a goal'}).getByRole('slider',{name:/Focus target/})).toBeVisible();
});

test('missing records identify the record and the way back',async({page})=>{
  for(const [route,text,link] of [
    ['/p/missing-path', "This path doesn't exist.",'Back to Paths'],
    ['/p/real-analysis/cp/missing', "This checkpoint doesn't exist.",'Back to the path'],
    ['/cards/99999', "Card #99999 doesn't exist.",'Back to Cards'],
  ]) {
    await page.goto(pageAt(route));
    await expect(page.getByText(text,{exact:true})).toBeVisible();
    await expect(page.getByRole('link',{name:link})).toBeVisible();
  }
});
