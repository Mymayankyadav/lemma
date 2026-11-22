import {test,expect} from '@playwright/test';
import {NOW,at} from './v7-scenes';
import {liveTutorFixtureResponse,prepareLiveTutor} from './helpers/live-tutor';
import type {TutorThreadView} from '../../src/data/tutor/manual-api';
import type {TutorAttachment} from '../../src/data/tutor/attachment-types';
import {referencedImageIds} from '../../supabase/functions/_shared/tutor-answer';
import {measureV7Design} from './helpers/v7-design';

const pageAt=(route:string,flags='')=>at(route).replace(/(?=#)/,flags?','+flags:'');
const photoFixture={name:'answer.png',mimeType:'image/png',
  buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==','base64')};
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
  expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('lemma.demo.capacity-overrides')??'{}')['2026-11-09'])).toBeGreaterThan(0);
  await page.goto(pageAt('/','todayNextStep,v7Ruler').replace('demo=1','demo=first-use'));
  await expect(page.getByRole('heading',{name:'Welcome to Lemma'})).toBeVisible();
  await expect(page.getByRole('region',{name:'Get started'}).getByRole('link')).toHaveCount(3);
});

test('Today offers evening, late-night and running-session actions',async({page})=>{
  const today=pageAt('/','todayNextStep');
  const hero=page.getByRole('region',{name:'Your next step'});
  await page.clock.setFixedTime(new Date('2026-11-09T21:15:00+05:30'));
  await page.goto(today);
  await expect(hero.getByRole('link',{name:'Close the day',exact:true})).toHaveAttribute('href','#/today/close');

  await page.clock.setFixedTime(new Date('2026-11-10T00:40:00+05:30'));
  await page.reload();
  await expect(page.getByRole('heading',{name:'Still up?',exact:true})).toBeVisible();
  await expect(hero.getByRole('link',{name:'Plan tomorrow',exact:true})).toBeVisible();

  await page.clock.setFixedTime(NOW);
  await page.reload();
  await hero.getByRole('button',{name:'Quick focus',exact:true}).click();
  await page.getByRole('dialog',{name:'Start a focus session',exact:true}).getByRole('button',{name:'Start focus',exact:true}).click();
  await expect(page).toHaveURL(/#\/focus$/);
  await page.goto(today);
  await expect(hero.getByRole('link',{name:'Return to focus',exact:true})).toBeVisible();
});

test('the Atlas keeps filters in Layers and opens list concepts',async({page})=>{
  await page.goto(pageAt('/atlas'));
  await expect(page.locator('.v7-atlas-sky[data-drawn-extent]')).toBeVisible();
  const area=(await page.evaluate(measureV7Design)).picture;
  expect(area?.clear).toBeGreaterThanOrEqual(.92);
  expect(area?.extent).toBeGreaterThanOrEqual(.60);
  const layers=page.getByRole('button',{name:'Layers',exact:true});
  await layers.click();
  const sheet=page.getByRole('dialog',{name:'Layers'});
  await sheet.getByRole('button',{name:'Uncertain'}).click();
  await expect(sheet.getByRole('button',{name:'Uncertain'})).toHaveAttribute('aria-pressed','true');
  await sheet.getByRole('button',{name:'All',exact:true}).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'List',exact:true}).click();
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
  await page.getByRole('textbox',{name:'Your answer',exact:true}).click();
  await expect(page.getByRole('group',{name:'Answer keyboard'})).toBeVisible();
  expect((await chat.boundingBox())?.height).toBeGreaterThanOrEqual(420);
  await page.getByRole('button',{name:'Write by hand',exact:true}).dblclick();
  const canvas=page.getByRole('img',{name:'Draw your answer'});
  const box=(await canvas.boundingBox())!;
  await page.mouse.move(box.x+30,box.y+30);
  await page.mouse.down();
  await page.mouse.move(box.x+100,box.y+80,{steps:5});
  await page.mouse.up();
  await expect(page.getByRole('button',{name:'Send',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Insert drawing',exact:true}).click();
  const answer=page.getByRole('textbox',{name:'Your answer',exact:true});
  await expect(answer.getByRole('button',{name:'Edit drawing',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Edit answer',exact:true}).click();
  await page.getByRole('dialog',{name:'Answer actions'}).getByRole('button',{name:'Photo',exact:true}).click();
  await page.getByLabel('Choose photo file',{exact:true}).setInputFiles(photoFixture);
  const removePhoto=answer.getByRole('button',{name:'Remove photo',exact:true});
  await expect(removePhoto).toBeVisible();
  await removePhoto.click();
  await expect(removePhoto).toHaveCount(0);
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await chat.getByRole('button',{name:'View drawing 1',exact:true}).click();
  const viewer=page.getByRole('dialog',{name:'Drawing 1',exact:true});
  await expect(viewer.getByRole('img')).toBeVisible();
  await viewer.getByRole('button',{name:'Zoom in',exact:true}).click();
  await expect.poll(()=>viewer.getByRole('img').evaluate(image=>
    image.getBoundingClientRect().width-(image.parentElement?.clientWidth??0))).toBeGreaterThan(0);
});

test('Tutor reloads an offline image queue and attaches it once after reconnecting',async({page})=>{
  const {owner,cpId,threadId,payload}=await prepareLiveTutor(page);
  let disconnected=false, submissions=0;
  const uploads:string[]=[];
  let thread:TutorThreadView={head:{threadId:null,pendingTurnId:null,lastSequence:0},turns:[],recoveredDrafts:[],canSubmit:true,canConnect:false};
  await page.route('**/storage/v1/object/tutor-ink/**',route=>{
    if(route.request().method()==='POST'){
      uploads.push(new URL(route.request().url()).pathname.split('/tutor-ink/')[1]);
      return route.fulfill({json:{Key:'tutor-ink/'+uploads.at(-1)}});
    }
    return route.fulfill({body:photoFixture.buffer,contentType:'image/png'});
  });
  await page.route('**/rest/v1/**',route=>{
    const request=route.request(),resource=new URL(request.url()).pathname.split('/rest/v1/')[1];
    if(resource==='rpc/tutor_thread_state')return disconnected
      ?route.fulfill({status:503,json:{message:'Offline fixture'}}):route.fulfill({json:thread});
    if(resource==='rpc/tutor_owner_ink_command'){
      const data=request.postDataJSON(),images=data.p_attachments as TutorAttachment[];
      expect([data.p_owner,data.p_checkpoint]).toEqual([owner,cpId]);
      expect([...uploads].sort()).toEqual(images.map(image=>owner+'/'+image.id).sort());
      expect(images).toMatchObject([{mimeType:'image/jpeg',kind:'photo'},{mimeType:'image/png',kind:'drawing'}]);
      submissions++;
      const {operationId,question}=data.p_command;
      expect(referencedImageIds(question)).toEqual(images.map(image=>image.id));
      thread={...thread,head:{threadId,pendingTurnId:operationId,lastSequence:1},
        turns:[{id:operationId,threadId,sequence:1,status:'awaiting-tutor',version:1,snapshot:{question,selectedContext:[],attachments:images}}]};
      return route.fulfill({json:{status:'submitted',operationId,turnId:operationId}});
    }
    return route.fulfill({json:liveTutorFixtureResponse(payload,resource,request.headers().accept)});
  });
  await page.goto('/lemma/?demo=0&flags=v7Shell,tutorThreads,tutorScratch#/p/logic/cp/CP1/tutor');
  await page.getByRole('button',{name:'Write a question'}).click();
  await page.getByRole('button',{name:'Edit answer',exact:true}).click();
  await page.getByRole('dialog',{name:'Answer actions'}).getByRole('button',{name:'Photo',exact:true}).click();
  await page.getByLabel('Choose photo file',{exact:true}).setInputFiles(photoFixture);
  const answer=page.getByRole('textbox',{name:'Your answer',exact:true});
  const removePhoto=answer.getByRole('button',{name:'Remove photo',exact:true});
  const removeDrawing=answer.getByRole('button',{name:'Remove drawing',exact:true});
  await expect(removePhoto).toBeVisible();
  await page.getByRole('button',{name:'Write by hand',exact:true}).dblclick();
  const canvas=page.getByRole('img',{name:'Draw your answer'});
  const box=(await canvas.boundingBox())!;
  await page.mouse.move(box.x+25,box.y+30);
  await page.mouse.down();
  await page.mouse.move(box.x+95,box.y+60,{steps:4});
  await page.mouse.up();
  await page.getByRole('button',{name:'Insert drawing',exact:true}).click();
  await expect(removeDrawing).toBeVisible();
  disconnected=true;
  await page.evaluate(()=>dispatchEvent(new Event('offline')));
  await page.getByRole('button',{name:'Queue answer'}).click();
  await expect(page.getByText('Answer queued',{exact:false})).toBeVisible();
  await expect(removePhoto).toBeDisabled();
  await expect(removeDrawing).toBeDisabled();
  await expect(answer).toHaveAttribute('contenteditable','false');
  const queuedText=await answer.textContent();
  await answer.focus();
  await page.keyboard.type('unexpected');
  await expect(answer).toHaveText(queuedText!);
  await page.getByRole('button',{name:'Keep as draft'}).click();
  await expect(page.getByText('Answer queued',{exact:false})).toHaveCount(0);
  await expect(answer.locator('[data-image-id]')).toHaveCount(2);
  await expect(removePhoto).toBeEnabled();
  await expect(removeDrawing).toBeEnabled();
  await page.getByRole('button',{name:'Queue answer'}).click();
  await page.reload();
  await expect(page.getByText('Answer queued',{exact:false})).toBeVisible();
  await expect(removePhoto).toBeDisabled();
  await expect(removeDrawing).toBeDisabled();
  expect(submissions).toBe(0);
  disconnected=false;
  await page.evaluate(()=>dispatchEvent(new Event('online')));
  await expect.poll(()=>submissions).toBe(1);
  await expect(page.getByRole('log').getByRole('button',{name:'View photo 1',exact:true})).toBeVisible();
  await expect(page.getByRole('log').getByRole('button',{name:'View drawing 1',exact:true})).toBeVisible();
  await expect(page.getByText('Answer queued',{exact:false})).toHaveCount(0);
});

test('calendar creation and direct results use the v7 shell',async({page})=>{
  await page.clock.setFixedTime(NOW);
  await page.goto(pageAt('/calendar?view=day&date=2026-11-09&quick=1'));
  const sheet=page.getByRole('dialog',{name:'New time block'});
  // N220 (Owner report): Start is a typed time field, not a ruler.
  await expect(sheet.getByRole('textbox',{name:'Start',exact:true})).toBeVisible();
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
