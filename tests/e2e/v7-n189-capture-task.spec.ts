import {expect,test} from '@playwright/test';
import {at,NOW} from './v7-scenes';

test.use({timezoneId:'Asia/Kolkata'});

for(const expanded of [false,true]){
 test('timed task reaches tab storage with its exact owner-local time: '+(expanded?'expanded editor':'quick Enter'),async({page})=>{
  await page.clock.setFixedTime(NOW);
  await page.goto(at('/'));
  await page.getByRole('button',{name:'Capture',exact:true}).click();
  const field=page.getByRole('textbox',{name:'What do you want to add?'});
  await field.fill('Review lemma tomorrow 4:17pm 45m #real');
  await page.getByRole('radio',{name:'Task',exact:true}).click();
  if(expanded){
   await page.getByRole('button',{name:'More options'}).click();
   const dialog=page.getByRole('dialog',{name:'New task'});
   await expect(dialog.getByLabel('Title',{exact:true})).toHaveValue('Review lemma');
   await expect(dialog.getByLabel(/Estimate/)).toHaveValue('45');
   await expect(dialog.getByRole('radio',{name:'Date & time'})).toHaveAttribute('aria-checked','true');
   // Draft contents travel in navigation state, never the URL.
   expect(decodeURIComponent(page.url())).not.toContain('Review lemma');
   await dialog.getByRole('button',{name:'Save task'}).click();
  }else{
   await expect(page.getByRole('button',{name:'Add task'})).toBeEnabled();
   await field.press('Enter');
  }
  const readRows=()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('lemma.v6.demo.tasks.v1')??'{"tasks":[]}').tasks
    .filter((row:{title:string})=>row.title==='Review lemma'));
  await expect.poll(readRows).toHaveLength(1);
  const [row]=await readRows();
  expect(row.due).toEqual({kind:'instant',at:'2026-11-10T10:47:00.000Z'});
  expect(row.estimateMinutes).toBe(45);
  expect(row.projectId).toBeTruthy();
  expect(row.subjectId).toBeTruthy();
  await page.reload();
  expect((await readRows())[0]).toMatchObject({id:row.id,due:row.due});
 });
}
