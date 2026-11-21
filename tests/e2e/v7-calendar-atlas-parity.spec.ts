import {expect,test} from '@playwright/test';
import {at,NOW} from './v7-scenes';

test.use({locale:'en-IN',timezoneId:'Asia/Kolkata'});
test.beforeEach(async({page})=>{await page.clock.setFixedTime(NOW);});

test('Calendar retains ranked study times through the planner in every view',async({page})=>{
 for(const view of ['day','week','month','agenda']){
  await page.goto(at('/calendar?view='+view+'&date=2026-11-09'));
  await page.getByRole('button',{name:'Calendar actions',exact:true}).click();
  await page.getByRole('menuitem',{name:'Plan study tasks',exact:true}).click();
  const planner=page.getByRole('dialog',{name:'Plan study tasks',exact:true});
  await planner.getByText('Suggested study times',{exact:true}).click();
  const slots=planner.getByRole('list',{name:'Ranked study times',exact:true});
  const first=slots.getByRole('listitem').first();
  await expect(first).toContainText(/kept \d+ of \d+ recent/);
  if(view==='agenda'){
   await first.getByRole('button',{name:'Add study block',exact:true}).click();
   await expect(first.getByRole('status')).toHaveText('Added');
   await first.getByRole('button',{name:'Undo',exact:true}).click();
   await expect(first.getByRole('button',{name:'Add study block',exact:true})).toBeVisible();
  }
 }
});

test('mobile Calendar Agenda exposes overdue triage',async({page})=>{
 await page.goto(at('/calendar?view=agenda&date=2026-11-09'));
 await page.getByRole('button',{name:'1 overdue. Triage',exact:true}).click();
 const triage=page.getByRole('dialog',{name:'1 overdue',exact:true});
 await expect(triage.getByText('Work on eigenvectors')).toBeVisible();
 await triage.getByRole('link',{name:'Reschedule',exact:true}).click();
 await expect(triage).toHaveCount(0);
 const editor=page.getByRole('dialog',{name:'New time block',exact:true});
 await expect(editor).toBeVisible();
 await expect(editor.getByRole('textbox',{name:'Calendar block title',exact:true})).toHaveValue('Work on eigenvectors');
 await expect(editor.getByRole('slider',{name:'Length',exact:true})).toHaveAttribute('aria-valuetext','25 min');
});

test('Atlas filtered List only offers jumps to subjects with visible concepts',async({page})=>{
 await page.goto(at('/atlas?view=list'));
 await page.getByRole('button',{name:'Layers',exact:true}).click();
 const layers=page.getByRole('dialog',{name:'Layers',exact:true});
 await layers.getByRole('button',{name:'Shaky',exact:true}).click();
 await layers.getByText('Jump to subject',{exact:true}).click();
 await expect(layers.getByRole('button',{name:'Linear Algebra',exact:true})).toHaveCount(0);
 await layers.getByRole('button',{name:'Topology',exact:true}).click();
 await expect(layers).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Topology',exact:true})).toBeInViewport();
});
