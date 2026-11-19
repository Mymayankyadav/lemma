import {test,expect} from '@playwright/test';
import {at} from './v7-scenes';

test('More options saves a Busy block with exact bounds and no hidden path',async({page})=>{
 const startsAt='2026-11-11T12:00:00.000Z';
 await page.goto(at('/calendar?view=day&date=2026-11-11&quick=1&task=demo-task-1&start='+encodeURIComponent(startsAt)));
 const quick=page.getByRole('dialog',{name:'New block'});
 const title='Busy fixture appointment';
 await expect(quick.getByRole('textbox',{name:'Title'})).toHaveValue('Prove continuity');
 await quick.getByRole('textbox',{name:'Title'}).fill(title);
 const path=quick.getByRole('group',{name:'Path',exact:true}).getByRole('button').first();
 await path.click();
 await expect(path).toHaveAttribute('aria-pressed','true');
 await quick.getByRole('radio',{name:'Busy'}).click();
 await quick.getByRole('button',{name:'25 min'}).click();
 await quick.getByRole('button',{name:'More options'}).click();
 const full=page.getByRole('dialog',{name:'New time block'});
 await expect(full.getByRole('textbox',{name:'Calendar block title'})).toHaveValue(title);
 await expect(full.getByRole('radio',{name:'Busy'})).toHaveAttribute('aria-checked','true');
 expect(decodeURIComponent(page.url())).not.toContain(title);
 await full.getByRole('button',{name:'Create block'}).click();
 await expect(full).toBeHidden();
 await expect(page).not.toHaveURL(/new=block/);
 const saved=await page.evaluate(name=>{
  const snapshot=JSON.parse(sessionStorage.getItem('lemma.v6.demo.study.v1')??'null');
  return snapshot?.blocks.find((block:{title:string})=>block.title===name);
 },title);
 expect(saved).toMatchObject({kind:'busy',taskId:'demo-task-1',
  startsAt,endsAt:'2026-11-11T12:25:00.000Z'});
 expect(saved.projectId??null).toBeNull();
 await page.reload();
 await expect(full).toBeHidden();
});

test('More options retains the Study path and discards a cancelled draft',async({page})=>{
 await page.goto(at('/calendar?view=day&date=2026-11-11&quick=1'));
 const quick=page.getByRole('dialog',{name:'New block'});
 const title='Unsaved study fixture';
 await quick.getByRole('textbox',{name:'Title'}).fill(title);
 const path=quick.getByRole('group',{name:'Path',exact:true}).getByRole('button').first();
 const pathTitle=(await path.textContent())?.trim();
 expect(pathTitle).toBeTruthy();
 await path.click();
 await quick.getByRole('button',{name:'More options'}).click();
 const full=page.getByRole('dialog',{name:'New time block'});
 await expect(full.getByRole('radio',{name:'Study'})).toHaveAttribute('aria-checked','true');
 await expect(full.getByText(pathTitle!,{exact:true})).toBeVisible();
 await full.getByRole('button',{name:'Cancel'}).click();
 await expect(full).toBeHidden();
 await expect(page).not.toHaveURL(/new=block|quick=1/);
 await page.reload();
 await expect(full).toBeHidden();
 const persisted=await page.evaluate(name=>
  JSON.parse(sessionStorage.getItem('lemma.v6.demo.study.v1')??'null')?.blocks.some((block:{title:string})=>block.title===name)??false,title);
 expect(persisted).toBe(false);
});
