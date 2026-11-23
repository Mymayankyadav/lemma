import {expect,test,type Page} from '@playwright/test';
import {openScratch} from './helpers/scratch';
import {liveTutorFixtureResponse,prepareLiveTutor} from './helpers/live-tutor';
import type {SavedTutorTurn,TutorThreadView} from '../../src/data/tutor/manual-api';

const demo='/lemma/?demo=1&flags=v7Shell,tutorScratch#/p/real-analysis/cp/CP4/tutor';
async function openAnswer(page:Page){
  await page.setViewportSize({width:393,height:873});
  await page.goto(demo);
  await page.getByRole('button',{name:'Write a question',exact:true}).click();
}
async function drawInRotatedPaper(page:Page,svg:ReturnType<Page['getByRole']>) {
  const {start,end}=await svg.evaluate(element=>{
    const matrix=(element as SVGSVGElement).getScreenCTM();
    if(!matrix)throw new Error('Drawing surface is not mounted');
    const first=new DOMPoint(120,54).matrixTransform(matrix);
    const last=new DOMPoint(170,86).matrixTransform(matrix);
    return {start:{x:first.x,y:first.y},end:{x:last.x,y:last.y}};
  });
  await page.mouse.move(start.x,start.y);
  await page.mouse.down();
  await page.mouse.move(end.x,end.y,{steps:5});
  await page.mouse.up();
  const path=svg.locator('g path').first();
  await expect(path).toHaveAttribute('d',/^M1[12][0-9] [0-9]+L/);
}

test('scratch pad expands, rotates, writes in upright paper coordinates, and returns',async({page})=>{
  await openAnswer(page);
  await openScratch(page);
  await page.getByRole('region',{name:'Scratch pad'}).getByRole('button',{name:'Full screen scratch pad'}).click();
  const full=page.getByRole('dialog',{name:'Scratch pad'});
  await expect(full).toHaveAttribute('data-fullscreen','true');
  await full.getByRole('button',{name:'Landscape scratch pad'}).click();
  await expect(full).toHaveAttribute('data-landscape','true');
  await drawInRotatedPaper(page,full.getByRole('img',{name:'Draw your answer'}));
  await full.getByRole('button',{name:'Exit scratch pad full screen'}).click();
  await expect(page.getByRole('region',{name:'Scratch pad'})).toBeVisible();
  await expect(page.getByRole('img',{name:'Draw your answer'}).locator('g path').first()).toHaveAttribute('d',/L/);
});

test('equation paper expands and supports landscape drawing in canonical model coordinates',async({page})=>{
  await openAnswer(page);
  await page.getByRole('group',{name:'Answer keyboard',exact:true}).getByRole('button',{name:'Equation mode',exact:true}).click();
  await page.getByRole('region',{name:'Equation mode'}).getByRole('button',{name:'Full screen equation'}).click();
  const full=page.getByRole('dialog',{name:'Equation mode'});
  await expect(full).toHaveAttribute('data-fullscreen','true');
  await full.getByRole('button',{name:'Landscape equation'}).click();
  await expect(full).toHaveAttribute('data-landscape','true');
  await drawInRotatedPaper(page,full.getByRole('img',{name:'Write an equation'}));
  await full.getByRole('button',{name:'Exit equation full screen'}).click();
  await expect(page.getByRole('region',{name:'Equation mode'})).toBeVisible();
});

test('an answer typed while the tutor is away is queued, survives reload, and submits after the prior reply',async({page})=>{
  const {threadId,payload}=await prepareLiveTutor(page);
  const id='88888888-8888-4888-8888-888888888884';
  const snapshot={question:'Please solve the first question.',selectedContext:[]};
  const pending:SavedTutorTurn={id,threadId,sequence:1,version:1,status:'awaiting-tutor',snapshot};
  const completed:SavedTutorTurn={id,threadId,sequence:1,version:2,status:'completed',snapshot,
    finalReply:{turnId:id,messageId:'reply',body:'You can continue.',
      provenance:{kind:'connector',reportedHost:'claude',hostVerified:false},citations:[],suggestions:[]}};
  let thread:TutorThreadView={head:{threadId,lastSequence:1,pendingTurnId:id},turns:[pending],recoveredDrafts:[],canSubmit:true,canConnect:false};
  const posted:string[]=[];
  await page.route('**/rest/v1/**',route=>{
    const request=route.request(),path=new URL(request.url()).pathname.split('/rest/v1/')[1];
    if(path==='rpc/tutor_thread_state')return route.fulfill({json:thread});
    if(path==='rpc/tutor_owner_command'||path==='rpc/tutor_owner_ink_command'){
      const command=request.postDataJSON().p_command;
      posted.push(command.question);
      return route.fulfill({json:{status:'submitted',operationId:command.operationId}});
    }
    return route.fulfill({json:liveTutorFixtureResponse(payload,path,request.headers().accept)});
  });
  await page.goto('/lemma/?demo=0&flags=v7Shell,tutorThreads,tutorScratch#/p/logic/cp/CP1/tutor');
  const answer=page.getByRole('textbox',{name:'Your answer',exact:true});
  const queue=page.getByRole('button',{name:'Queue answer',exact:true});
  await expect(queue).toBeEnabled();
  await answer.fill('My follow-up while you are away');
  await queue.click();
  await expect(page.getByText('Answer saved on this device',{exact:false})).toBeVisible();
  expect(posted).toEqual([]);
  await page.reload();
  await expect(page.getByText('Answer saved on this device',{exact:false})).toBeVisible();
  expect(posted).toEqual([]);
  thread={...thread,head:{...thread.head,pendingTurnId:null},turns:[completed]};
  await page.reload();
  await expect.poll(()=>posted).toEqual(['My follow-up while you are away']);
  await expect(page.getByText('Answer saved on this device',{exact:false})).toHaveCount(0);
});
