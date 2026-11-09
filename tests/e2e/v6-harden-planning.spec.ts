import {test,expect,type Page} from '@playwright/test';

// N99: exercise the real v6 routes and demo adapters; no mocked presentation.
test.use({timezoneId:'America/New_York'});
const route=(page:Page,path:string)=>page.goto('./?demo=1&flags=v6Shell#'+path);
async function noPageOverflow(page:Page){
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1))
  .toBe(true);
}
async function enlargeText(page:Page){
 await page.evaluate(()=>{document.documentElement.style.fontSize='200%'});
}
test('N99 Tasks paginate 55 records, maintain 44px actions and reload without lost rows',async({page})=>{
 test.setTimeout(120_000);
 await page.setViewportSize({width:320,height:640});
 await page.addInitScript(()=>{
  if(!sessionStorage.getItem('lemma.v6.demo.tasks.v1')){
   const tasks=Array.from({length:55},(_,i)=>({
    id:'n99-task-'+i,title:'Prove the continuity lemma '+i+' with extended mathematical notation',
    body:'',status:'backlog',position:i,subjectId:null,projectId:null,checkpointId:null,
    due:{kind:'none'},priority:'normal',estimateMinutes:25,completedAt:null,version:1,
    createdAt:'2026-11-06T08:00:00.000Z',updatedAt:'2026-11-06T08:00:00.000Z',
   }));
   sessionStorage.setItem('lemma.v6.demo.tasks.v1',JSON.stringify({schema:1,tasks}));
  }
 });
 await route(page,'/tasks');
 const backlog=page.getByRole('region',{name:'Tasks backlog'});
 await expect(backlog).toContainText('20 shown of 55 tasks');
 await expect(backlog.locator('li')).toHaveCount(20);
 await backlog.getByRole('button',{name:'Show more'}).click();
 await expect(backlog).toContainText('40 shown of 55 tasks');
 await backlog.getByRole('button',{name:'Show more'}).click();
 await expect(backlog).toContainText('55 shown of 55 tasks');
 await expect(backlog.locator('li')).toHaveCount(55);
 await expect(backlog.getByRole('button',{name:'Show more'})).toHaveCount(0);
 const first=backlog.getByRole('button',{name:'Complete Prove the continuity lemma 0 with extended mathematical notation'});
 const dimensions=await first.boundingBox();
 expect(dimensions).not.toBeNull();
 expect(dimensions!.height).toBeGreaterThanOrEqual(44);
 await enlargeText(page);
 await noPageOverflow(page);
 await page.reload();
 await expect(backlog).toContainText('20 shown of 55 tasks');
 await expect(backlog.locator('li')).toHaveCount(20);
});

test('N99 all four Calendar views remain accessible through DST and 200% text',async({page})=>{
 test.setTimeout(120_000);
 await page.setViewportSize({width:320,height:640});
 await page.addInitScript(()=>{
  if(!sessionStorage.getItem('lemma.v6.demo.study.v1'))
   sessionStorage.setItem('lemma.v6.demo.study.v1',
    JSON.stringify({schema:1,entries:[],blocks:[]}));
 });
 await route(page,'/calendar?view=month&date=2026-11-01');
 const month=page.getByRole('region',{name:'Month schedule'});
 await expect(month).toBeVisible();
 await expect(month).toHaveAttribute('tabindex','0');
 await expect(page.locator('[aria-label="Month date grid"] button')).toHaveCount(42);
 await enlargeText(page);
 await noPageOverflow(page);
 await month.focus();
 await page.keyboard.press('ArrowRight');
 await page.getByRole('button',{name:'Open 2026-11-01 in Day view'}).click();
 const day=page.getByRole('region',{name:'Day schedule'});
 await expect(day).toBeVisible();
 // The autumn fall-back in New York has 25 distinct real-hour rows.
 await expect(day.locator('time[datetime]')).toHaveCount(25);
 await expect(page.getByRole('region',{name:'Day hourly timetable'})).toHaveAttribute('tabindex','0');
 await noPageOverflow(page);
 const views=page.getByRole('group',{name:'Calendar view'});
 await views.getByRole('button',{name:'Week'}).click();
 await expect(page.getByRole('region',{name:'Week schedule'})).toHaveAttribute('tabindex','0');
 await views.getByRole('button',{name:'Agenda'}).click();
 await expect(page.locator('[aria-label="Next seven days"]')).toBeVisible();
 await noPageOverflow(page);
});

test('N99 Planner native sheet stays bounded and restores Calendar on Escape',async({page})=>{
 test.setTimeout(120_000);
 await page.setViewportSize({width:360,height:640});
 await route(page,'/calendar?view=agenda&date=2026-11-06');
 // #1321: planning actions open from the one "Planning tools" button.
 await page.getByText('Planning tools',{exact:true}).click();
 await page.getByRole('button',{name:'Plan study tasks'}).click();
 const dialog=page.getByRole('dialog',{name:'Plan study tasks'});
 await expect(dialog).toBeVisible();
 const box=await dialog.boundingBox();
 expect(box).not.toBeNull();
 expect(box!.height).toBeLessThanOrEqual(640*.9);
 await page.keyboard.press('Escape');
 await expect(dialog).toBeHidden();
 await page.getByRole('button',{name:'Plan study tasks'}).click();
 await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'Close'}).click();
 await expect(dialog).toBeHidden();
 await noPageOverflow(page);
});

test('N99 ritual and Practice routes retain readable empty states and keyboard controls',async({page})=>{
 test.setTimeout(120_000);
 await page.setViewportSize({width:390,height:844});
 await route(page,'/today/close?date=2026-11-06');
 await expect(page.getByRole('main',{name:'Close day ritual'})).toBeVisible();
 await expect(page.getByText('No day plan exists for this date.')).toBeVisible();
 await enlargeText(page);
 await noPageOverflow(page);
 await page.getByRole('button',{name:'Back to Today'}).click();
 await expect(page).toHaveURL(/#\/$/);
 await route(page,'/practice');
 await expect(page.getByRole('heading',{name:'Practice topics'})).toBeVisible();
 const archived=page.getByRole('button',{name:/Show archived topics/});
 await archived.focus();
 await page.keyboard.press('Enter');
 await expect(page.getByRole('region',{name:'Archived practice topics'})).toBeVisible();
 await noPageOverflow(page);
});

// The Ritual uses a separate bounded owner listing; the 51st task must not vanish.
test('N99 day ritual retains the 55th unfinished task across paginated owner reads',async({page})=>{
 test.setTimeout(120_000);
 await page.setViewportSize({width:360,height:640});
 await page.addInitScript(()=>{
  if(!sessionStorage.getItem('lemma.v6.demo.tasks.v1')){
   const tasks=Array.from({length:55},(_,i)=>({
    id:'n99-task-'+i,title:'Owner ritual task '+i,body:'',status:'backlog',
    position:i,subjectId:null,projectId:null,checkpointId:null,
    due:{kind:'none'},priority:'normal',estimateMinutes:25,completedAt:null,version:1,
    createdAt:'2026-11-06T08:00:00.000Z',updatedAt:'2026-11-06T08:00:00.000Z',
   }));
   sessionStorage.setItem('lemma.v6.demo.tasks.v1',JSON.stringify({schema:1,tasks}));
  }
  if(!sessionStorage.getItem('lemma.v6.demo.day-plans.v1')){
   const plan={id:'n99-plan',planDate:'2026-11-06',timeZone:'America/New_York',
    intention:'Review unfinished theorems',capacityMinutes:60,availability:{sources:[]},
    status:'committed',closedAt:null,tomorrowFirstTaskId:null,ritual:{},version:1,
    createdAt:'2026-11-06T08:00:00.000Z',updatedAt:'2026-11-06T08:00:00.000Z'};
   sessionStorage.setItem('lemma.v6.demo.day-plans.v1',
    JSON.stringify({schema:1,plans:[plan],items:[]}));
  }
 });
 await route(page,'/today/close?date=2026-11-06');
 const choices=page.getByRole('region',{name:'Carry over unfinished tasks'});
 await expect(choices.getByRole('checkbox')).toHaveCount(55);
 await choices.getByRole('checkbox',{name:'Owner ritual task 54'}).check();
 await expect(choices.getByRole('checkbox',{name:'Owner ritual task 54'})).toBeChecked();
 await noPageOverflow(page);
});
