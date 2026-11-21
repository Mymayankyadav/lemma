import {test,expect} from '@playwright/test';
import {at} from './v7-scenes';

test('the shared editor saves a Busy block with its task, exact bounds and no path',async({page})=>{
 const startsAt='2026-11-11T12:00:00.000Z';
 await page.goto(at('/calendar?view=day&date=2026-11-11&quick=1&task=demo-task-1&start='+encodeURIComponent(startsAt)));
 const sheet=page.getByRole('dialog',{name:'New time block'});
 const title='Busy fixture appointment';
 const field=sheet.getByRole('textbox',{name:'Calendar block title'});
 await expect(field).toHaveValue('Prove continuity');
 await field.fill(title);
 await sheet.getByRole('radio',{name:'Busy'}).click();
 const length=sheet.getByRole('slider',{name:'Length'});
 for(let step=0;step<5;step++)await length.press('ArrowLeft');
 await expect(length).toHaveValue('25');
 await expect(sheet.getByRole('button',{name:'Path: No path'})).toBeVisible();
 await sheet.getByRole('button',{name:'More',exact:true}).click();
 await expect(sheet.getByRole('button',{name:'Task: Prove continuity'})).toBeVisible();
 await expect(field).toHaveValue(title);
 await expect(sheet.getByRole('radio',{name:'Busy'})).toBeChecked();
 expect(decodeURIComponent(page.url())).not.toContain(title);
 await sheet.getByRole('button',{name:'Create block'}).click();
 await expect(sheet).toBeHidden();
 await expect(page).not.toHaveURL(/new=block/);
 const saved=await page.evaluate(name=>{
  const snapshot=JSON.parse(sessionStorage.getItem('lemma.v6.demo.study.v1')??'null');
  return snapshot?.blocks.find((block:{title:string})=>block.title===name);
 },title);
 expect(saved).toMatchObject({kind:'busy',taskId:'demo-task-1',
  startsAt,endsAt:'2026-11-11T12:25:00.000Z'});
 expect(saved.projectId??null).toBeNull();
 await page.reload();
 await expect(sheet).toBeHidden();
});

test('More retains the Study path and cancelling discards the draft',async({page})=>{
 await page.goto(at('/calendar?view=day&date=2026-11-11&quick=1'));
 const sheet=page.getByRole('dialog',{name:'New time block'});
 const title='Unsaved study fixture';
 await sheet.getByRole('textbox',{name:'Calendar block title'}).fill(title);
 await sheet.getByRole('button',{name:'Path: No path'}).click();
 await page.getByRole('dialog',{name:'Path',exact:true}).getByRole('radio',{name:'Real Analysis',exact:true}).check();
 await sheet.getByRole('button',{name:'More',exact:true}).click();
 await expect(sheet.getByRole('radio',{name:'Study'})).toBeChecked();
 await expect(sheet.getByRole('button',{name:'Path: Real Analysis',exact:true})).toBeVisible();
 await expect(sheet.getByRole('button',{name:'Checkpoint: No checkpoint'})).toBeVisible();
 await sheet.getByRole('button',{name:'Cancel'}).click();
 await expect(sheet).toBeHidden();
 await expect(page).not.toHaveURL(/new=block|quick=1/);
 await page.reload();
 await expect(sheet).toBeHidden();
 const persisted=await page.evaluate(name=>
  JSON.parse(sessionStorage.getItem('lemma.v6.demo.study.v1')??'null')?.blocks.some((block:{title:string})=>block.title===name)??false,title);
 expect(persisted).toBe(false);
});
