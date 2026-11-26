import {expect,test,type Page} from '@playwright/test';
import {at,NOW} from './v7-scenes';
import {setTimeRuler} from './helpers/time-ruler';

const route=(path:string)=>at(path).replace('flags=','flags=uiRepairV1,');
const calendar='/calendar?view=day&date=2026-11-10';
const stamp='2026-11-06T08:00:00.000Z';
const task={id:'proof-task',title:'Prove the gluing lemma',body:'',status:'backlog',position:1,
 subjectId:null,projectId:null,checkpointId:null,due:{kind:'none'},priority:'normal',
 estimateMinutes:25,completedAt:null,version:1,createdAt:stamp,updatedAt:stamp};
const busy={id:'seminar',title:'Seminar day',kind:'busy',status:'planned',startsAt:'2026-11-09T18:30:00.000Z',
 endsAt:'2026-11-10T18:30:00.000Z',timeZone:'Asia/Kolkata',version:1,subjectId:null,projectId:null,checkpointId:null,sessionId:null};
test.use({timezoneId:'Asia/Kolkata',viewport:{width:390,height:844},reducedMotion:'reduce'});

async function seed(page:Page,tasks:unknown[]=[],blocks:unknown[]=[]){
 await page.addInitScript(({tasks,blocks})=>{
  if(!sessionStorage.getItem('lemma.v6.demo.tasks.v1'))sessionStorage.setItem('lemma.v6.demo.tasks.v1',JSON.stringify({schema:1,tasks}));
  if(!sessionStorage.getItem('lemma.v6.demo.study.v1'))sessionStorage.setItem('lemma.v6.demo.study.v1',JSON.stringify({schema:1,entries:[],blocks}));
 },{tasks,blocks});
 await page.clock.setFixedTime(NOW);
}

async function taskRows(page:Page){
 return page.evaluate(()=>JSON.parse(sessionStorage.getItem('lemma.v6.demo.tasks.v1')!).tasks as
  {id:string;title:string;estimateMinutes:number;projectId:string|null;subjectId:string|null;due:{kind:string;at?:string}}[]);
}

for(const expanded of [false,true]){
 test('Capture updates the open backlog, group count and Undo '+(expanded?'after expanding and cancelling':'from the field'),async({page})=>{
  await seed(page,[{...task,title:'Neighbour proof',due:{kind:'instant',at:'2026-11-10T11:00:00.000Z'}}]);
  await page.goto(route('/tasks'));
  const group=page.locator('section.v7-tk-card').filter({hasText:'Neighbour proof'});
  await expect(group.getByRole('heading')).toContainText('· 1');
  await page.getByRole('button',{name:'Capture',exact:true}).click();
  const field=page.getByRole('textbox',{name:'What do you want to add?'});
  const original='Review lemma tomorrow 4:10pm 25m #real';
  await field.fill(original);
  await page.getByRole('radio',{name:'Task',exact:true}).click();
  if(expanded){
   const more=page.getByRole('button',{name:'Add details'});
   await more.click();
   let dialog=page.getByRole('dialog',{name:'New task'});
   await expect(dialog.getByLabel('Title',{exact:true})).toHaveValue('Review lemma');
   await dialog.getByRole('button',{name:'Cancel'}).click();
   await expect(field).toHaveValue(original);
   await more.click();
   dialog=page.getByRole('dialog',{name:'New task'});
   await expect(dialog.getByLabel(/Estimate/)).toHaveValue('25');
   await expect(dialog.getByRole('slider',{name:'Due time',exact:true})).toHaveAttribute('aria-valuetext','16:10');
   await dialog.getByRole('button',{name:'Save task'}).click();
  }else await field.press('Enter');
  await expect(group.getByText('Review lemma',{exact:true})).toBeVisible();
  await expect(group.getByRole('heading')).toContainText('· 2');
  const matching=(await taskRows(page)).filter(row=>row.title==='Review lemma');
  expect(matching).toHaveLength(1);
  expect(matching[0]).toMatchObject({estimateMinutes:25,due:{kind:'instant',at:'2026-11-10T10:40:00.000Z'}});
  expect(matching[0]).toMatchObject({projectId:'project-analysis',subjectId:'subject-analysis'});
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect(group.getByText('Review lemma',{exact:true})).toHaveCount(0);
  await expect(group.getByRole('heading')).toContainText('· 1');
  expect((await taskRows(page)).map(row=>row.title)).toEqual(['Neighbour proof']);
  await page.reload();
  await expect(group.getByRole('heading')).toContainText('· 1');
  await expect(page.getByText('Review lemma',{exact:true})).toHaveCount(0);
 });
}

for(const [width,scale] of [[360,130],[390,130],[390,100]]){
 test('Time entry is immediately reachable and the due control stays tappable at '+width+'px and '+scale+'% text',async({page})=>{
  await page.setViewportSize({width,height:width===360?800:844});
  if(scale===130)await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{
   document.documentElement.style.fontSize='130%';
  }));
  await seed(page);
  await page.goto(route('/tasks?new=1'));
  const editor=page.getByRole('dialog',{name:'New task'}),due=editor.getByRole('button',{name:'Due: None',exact:true});
  await editor.getByLabel('Title',{exact:true}).fill('Exact due');
  await due.scrollIntoViewIfNeeded();
  await page.evaluate(()=>document.fonts.ready);
  const bounds=await due.evaluate(async button=>{
   const heights:number[]=[];
   for(let i=0;i<24;i++){
    await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    heights.push(button.getBoundingClientRect().height);
   }
   const rect=button.getBoundingClientRect(),hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
   return {heights:heights.slice(4),center:!!hit&&button.contains(hit)};
  });
  expect(Math.max(...bounds.heights)-Math.min(...bounds.heights)).toBeLessThanOrEqual(1);
  expect(bounds.center).toBe(true);
  await due.click();
  await page.getByRole('dialog',{name:'Due',exact:true}).getByRole('radio',{name:'Date & time',exact:true}).check();
  await editor.getByRole('button',{name:/^Due date:/}).click();
  const calendar=page.getByRole('dialog',{name:'Choose a date'});
  await expect(calendar.getByRole('button',{name:'Today',exact:true})).toBeVisible();
  await calendar.getByRole('button',{name:'Today',exact:true}).click();
  const ruler=editor.getByRole('slider',{name:'Due time',exact:true});
  await ruler.scrollIntoViewIfNeeded();
  const entry=await ruler.boundingBox();
  expect(entry!.y).toBeGreaterThanOrEqual(0);
  expect(entry!.y+entry!.height).toBeLessThan(width===360?800:844);
  await ruler.press('Home');await expect(ruler).toHaveAttribute('aria-valuetext','00:00');
  await ruler.press('End');await expect(ruler).toHaveAttribute('aria-valuetext','23:59');
  const clock=width===360?'16:10':'16:00';
  await setTimeRuler(ruler,width===360?970:960);
  await expect(ruler).toHaveAttribute('aria-valuetext',clock);
  await editor.getByRole('button',{name:'Save task'}).click();
  await expect(page.getByRole('checkbox',{name:'Complete Exact due'})).toBeVisible();
  const [created]=await taskRows(page);
  expect(created.due.at).toBe(width===360?'2026-11-09T10:40:00.000Z':'2026-11-09T10:30:00.000Z');
  await page.reload();await page.getByRole('button',{name:'More actions for Exact due'}).click();
  await page.getByRole('menuitem',{name:'Edit',exact:true}).click();
  const edit=page.getByRole('dialog',{name:'Edit task'});
  await expect(edit.getByRole('slider',{name:'Due time',exact:true})).toHaveAttribute('aria-valuetext',clock);
  await edit.getByLabel('Title',{exact:true}).fill('Exact due edited');
  await edit.getByRole('button',{name:'Save changes'}).click();
  await expect(page.getByRole('checkbox',{name:'Complete Exact due edited'})).toBeVisible();
  const [saved]=await taskRows(page);
  expect(saved).toMatchObject({id:created.id,due:created.due});
 });
}

test('Plan study tasks distinguishes no eligible work and opens the new task form',async({page})=>{
 await seed(page,[{...task,status:'completed',completedAt:stamp}]);
 await page.goto(route(calendar+'&plan=1'));
 const planner=page.getByRole('dialog',{name:'Plan study tasks'});
 await expect(planner.getByText('No eligible tasks to plan.')).toBeVisible();
 await expect(planner.getByRole('button',{name:/Add \d+ blocks?/})).toHaveCount(0);
 await expect(planner.getByText(/No free slots left/)).toHaveCount(0);
 await planner.getByRole('link',{name:'Add task'}).click();
 await expect(page.getByRole('dialog',{name:'New task'})).toBeVisible();
});

test('A full day offers another day, persists one selected block and preserves its busy reservation',async({page})=>{
 await seed(page,[task],[busy]);
 await page.goto(route(calendar+'&plan=1'));
 const planner=page.getByRole('dialog',{name:'Plan study tasks'});
 await expect(planner.getByText(/No free slots left/)).toBeVisible();
 await expect(planner.getByText('No eligible tasks to plan.')).toHaveCount(0);
 await planner.getByRole('button',{name:'Plan 2 days'}).click();
 const add=planner.getByRole('button',{name:'Add 1 block'});
 await expect(add).toBeEnabled();
 await planner.getByRole('checkbox',{name:task.title}).uncheck();
 await expect(add).toHaveCount(0);
 await planner.getByRole('checkbox',{name:task.title}).check();
 await add.click();
 await expect(planner).toHaveCount(0);
 const read=()=>page.evaluate(()=>({
  blocks:JSON.parse(sessionStorage.getItem('lemma.v6.demo.study.v1')!).blocks as {id:string;taskId?:string;startsAt:string;endsAt:string}[],
  plans:JSON.parse(sessionStorage.getItem('lemma.v6.demo.day-plans.v1')!).plans as {planDate:string;status:string}[],
 }));
 const after=await read();expect(after.blocks).toHaveLength(2);
 expect(after.blocks.find(block=>block.id===busy.id)).toMatchObject(busy);
 const scheduled=after.blocks.filter(block=>block.taskId===task.id);expect(scheduled).toHaveLength(1);
 expect(Date.parse(scheduled[0].startsAt)).toBeGreaterThanOrEqual(Date.parse(busy.endsAt));
 expect(Date.parse(scheduled[0].endsAt)-Date.parse(scheduled[0].startsAt)).toBe(25*60000);
 expect(after.plans).toMatchObject([{planDate:'2026-11-11',status:'committed'}]);
 await page.goto(route('/calendar?view=day&date=2026-11-11'));
 await expect(page.getByRole('button',{name:/Prove the gluing lemma, Planned study/})).toBeVisible();
 await page.reload();expect(await read()).toEqual(after);
 await page.goto(route('/calendar?view=day&date=2026-11-11&plan=1'));
 await expect(planner.getByText('No eligible tasks to plan.')).toBeVisible();
});

test('A task with a zero estimate offers an estimate and leaves estimated tasks selectable',async({page})=>{
 await seed(page,[{...task,id:'zero',title:'Unsized proof',estimateMinutes:0},task]);
 await page.goto(route(calendar+'&plan=1'));
 const planner=page.getByRole('dialog',{name:'Plan study tasks'});
 await expect(planner.getByText('No time estimate yet')).toBeVisible();
 await expect(planner.getByRole('link',{name:'Add an estimate'})).toBeVisible();
 await expect(planner.getByRole('button',{name:'Add 1 block'})).toBeEnabled();
});

test('Editing an older off-grid instant keeps its precision and a date-only Capture stays date-only',async({page})=>{
 const precise='2026-11-10T10:47:13.250Z';
 await seed(page,[{...task,due:{kind:'instant',at:precise}}]);
 await page.goto(route('/tasks'));
 await page.getByRole('button',{name:'More actions for '+task.title}).click();
 await page.getByRole('menuitem',{name:'Edit',exact:true}).click();
 const editor=page.getByRole('dialog',{name:'Edit task'});
 await expect(editor.getByRole('slider',{name:'Due time',exact:true})).toHaveAttribute('aria-valuetext','16:17');
 await editor.getByLabel('Title',{exact:true}).fill('Previously saved proof');
 await editor.getByRole('button',{name:'Save changes'}).click();
 await page.getByRole('button',{name:'Capture',exact:true}).click();
 const field=page.getByRole('textbox',{name:'What do you want to add?'});
 await field.fill('Read compactness tomorrow');await page.getByRole('radio',{name:'Task',exact:true}).click();
 await field.press('Enter');
 await expect(page.getByRole('checkbox',{name:'Complete Read compactness'})).toBeVisible();
 await page.reload();
 const rows=await taskRows(page);
 expect(rows.find(row=>row.id===task.id)?.due).toEqual({kind:'instant',at:precise});
 expect(rows.find(row=>row.title==='Read compactness')?.due).toEqual({kind:'date',date:'2026-11-10'});
});
