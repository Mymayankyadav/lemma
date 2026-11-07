import {test,expect,type Page} from '@playwright/test';

// N96: hard rollback evidence. Build with the real v6 flag override and real
// tab-local demo APIs; no test mock can conceal deleted owner records.
const withFlag=(hash:string)=>'./?demo=1&flags=v6Shell#'+hash;
const withoutFlag=(hash:string)=>'./?demo=1#'+hash;
const LEGACY_ROUTES=[
 ['/', 'Home'],['/projects','Paths'],['/projects/new','New project'],
 ['/p/real-analysis','Project'],['/p/real-analysis/cp/CP4','Checkpoint'],
 ['/s/real-analysis/7','Session record'],['/proposals','Approve'],
 ['/proposals/example','Plan proposal'],['/review','Review'],
 ['/review/run','Card review'],['/review/done','Review complete'],
 ['/cards','Cards'],['/cards/7','Card detail'],['/atlas','Atlas'],
 ['/insights','Insights'],['/settings','Settings'],['/sign-in','Sign in'],
 ['/kit','Component kit'],
] as const;

type Snapshot={
 study:{schema:1;entries:Array<{id:string;intent:string;status:string}>;blocks:Array<{id:string;title:string}>};
 tasks:{schema:1;tasks:Array<{id:string;title:string}>};
};
async function snapshot(page:Page):Promise<Snapshot>{
 return page.evaluate(()=>{
  const study=sessionStorage.getItem('lemma.v6.demo.study.v1');
  const tasks=sessionStorage.getItem('lemma.v6.demo.tasks.v1');
  if(!study||!tasks)throw Error('Study and task snapshots must both exist');
  return {study:JSON.parse(study),tasks:JSON.parse(tasks)};
 });
}
async function createFocus(page:Page,intent:string){
 await page.getByRole('textbox',{name:'Focus intention'}).fill(intent);
 await page.getByRole('button',{name:'Start focus'}).click();
 const modal=page.getByRole('dialog',{name:'Focus',exact:true});
 await expect(modal).toBeVisible();
 await modal.getByRole('button',{name:'Finish'}).click();
 await modal.getByRole('spinbutton',{name:'Minutes to save'}).fill('6');
 await modal.getByRole('button',{name:'Save',exact:true}).click();
 await expect(modal).toBeHidden();
 await expect(page.locator('output[aria-label="Logged today"]')).toContainText('6 min');
}
async function createTask(page:Page,title:string){
 const actions=page.getByRole('navigation',{name:'Page actions'});
 await actions.locator('summary').filter({hasText:'Add'}).click();
 await actions.getByRole('button',{name:'Task',exact:true}).click();
 const modal=page.getByRole('dialog',{name:'New task'});
 await expect(modal).toBeVisible();
 await modal.getByRole('textbox',{name:'Task title'}).fill(title);
 await modal.getByRole('button',{name:'Save task'}).click();
 await expect(modal).toBeHidden();
 await expect(page.locator('[data-v6-header] [role="status"]')).toContainText('Task saved');
}
async function createBlock(page:Page,title:string){
 const form=page.getByRole('region',{name:'Plan a calendar block'});
 await expect(form).toBeVisible();
 await form.getByRole('textbox',{name:'Title'}).fill(title);
 await form.locator('input[aria-label="Block start"]').fill('2026-11-06T16:00');
 await form.locator('input[aria-label="Block end"]').fill('2026-11-06T16:30');
 await form.getByRole('button',{name:'Add block'}).click();
 await expect(page.getByText(title,{exact:true}).first()).toBeVisible();
}

test('N96 v6 data survives flag-off legacy route audit and reappears on re-enable',async({page})=>{
 test.setTimeout(180_000);
 await page.setViewportSize({width:390,height:844});
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
 await page.route('https://fonts.gstatic.com/**',r=>r.fulfill({body:''}));
 // A stable civil date avoids accidental midnight rollover and seeded overlap.
 await page.clock.install({time:new Date('2026-11-06T15:00:00.000Z')});
 await page.addInitScript(()=>{
  try{
   if(!sessionStorage.getItem('lemma.v6.demo.study.v1'))
    sessionStorage.setItem('lemma.v6.demo.study.v1',
     JSON.stringify({schema:1,entries:[],blocks:[]}));
   if(!sessionStorage.getItem('lemma.v6.demo.tasks.v1'))
    sessionStorage.setItem('lemma.v6.demo.tasks.v1',
     JSON.stringify({schema:1,tasks:[]}));
  }catch{/* The assertions below expose blocked storage. */}
 });
 const runtimeErrors:string[]=[];
 page.on('pageerror',error=>runtimeErrors.push(error.message));

 const intent='N96 rollback study proof';
 const task='N96 rollback saved task';
 const block='N96 rollback reserved block';
 await page.goto(withFlag('/'));
 await expect(page.locator('[data-v6-header]')).toBeVisible();
 await createFocus(page,intent);
 await createTask(page,task);

 await page.goto(withFlag('/calendar?view=day&date=2026-11-06'));
 await createBlock(page,block);
 const before=await snapshot(page);
 expect(before.study.entries.some(x=>x.intent===intent&&x.status==='saved')).toBe(true);
 expect(before.study.blocks.some(x=>x.title===block)).toBe(true);
 expect(before.tasks.tasks.some(x=>x.title===task)).toBe(true);

 // Turning the flag OFF is a navigation, not a reset of tab-local storage.
 // Visit every canonical prior route while observing real runtime errors.
 for(const [route,heading] of LEGACY_ROUTES){
  await page.goto(withoutFlag(route));
  await expect(page.getByRole('heading',{level:1,name:heading,exact:true})).toBeVisible();
  await expect(page.locator('[data-v6-header]')).toHaveCount(0);
 }
 expect(runtimeErrors).toEqual([]);
 const off=await snapshot(page);
 expect(off).toEqual(before); // No v6 entry, block or task was deleted.

 // Re-enable in the *same tab* and prove the exact records returned in UI
 // and retained their persisted IDs, not just matching display counts.
 await page.goto(withFlag('/'));
 await expect(page.locator('output[aria-label="Logged today"]')).toContainText('6 min');
 await page.goto(withFlag('/calendar?view=day&date=2026-11-06'));
 await expect(page.getByText(block,{exact:true}).first()).toBeVisible();
 await page.goto(withFlag('/tasks'));
 await expect(page.getByRole('heading',{name:task,exact:true})).toBeVisible();
 const restored=await snapshot(page);
 expect(restored).toEqual(before);
 expect(runtimeErrors).toEqual([]);
});
