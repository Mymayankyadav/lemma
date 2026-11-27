import {expect,test} from '@playwright/test';
import {at,NOW,DATE} from './v7-scenes';
import {enableSurfaceBeta} from './helpers/surface-preview';
import {REDUCE_EFFECTS_KEY} from '../../src/ui/v7/effects';

test.beforeEach(async({page})=>{
 await enableSurfaceBeta(page);
});

test('Calendar view selection and the requested date survive the full view loop',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.clock.setFixedTime(NOW);
 await page.goto(at('/calendar?view=day&date='+DATE));
 const choices=page.getByRole('radiogroup',{name:'Calendar view'});
 const region=page.getByRole('region',{name:'Day time grid'});
 await expect(region).toBeVisible();
 await region.evaluate(node=>{node.scrollTop=220;});
 for(const view of ['Week','Month','Agenda','Day']){
  await choices.getByRole('radio',{name:view,exact:true}).click();
  await expect(choices.getByRole('radio',{name:view,exact:true})).toBeChecked();
  await expect(page).toHaveURL(new RegExp('date='+DATE));
  await expect(page.locator('.v7-cal-pane:not([data-exiting])')).not.toHaveAttribute('aria-busy','true');
 }
 await expect(region).toBeVisible();
 expect(await region.evaluate(node=>node.scrollTop)).toBeGreaterThan(0);
 for(let step=0;step<3;step++){
  await page.getByRole('button',{name:'Next week',exact:true}).click();
  await expect(region).toBeVisible();
  await expect(page.locator('[data-loading-surface="section"].v7-cal-skeleton')).toHaveCount(0);
 }
});

test('Atlas neighbour picks keep the detent and focus, and Back restores the previous concept',async({page})=>{
 await page.goto(at('/atlas?view=map&id=concept-compactness'));
 const atlas=page.getByRole('main',{name:'Atlas',exact:true}),sheet=atlas.locator('.v7-atlas-sheet');
 await sheet.getByRole('button',{name:'Show neighbours and actions'}).click();
 const heading=sheet.getByRole('heading',{level:2});
 const conceptName=heading.locator('.v7-atlas-title-text:not([data-exiting])');
 const neighbour=sheet.locator('.v7-atlas-sheet-content:not([data-exiting]) .v7-atlas-neighbours').getByRole('button').first();
 const pickNeighbour=async()=>{
  const previous=await conceptName.textContent();
  await neighbour.click();
  await expect(conceptName).not.toHaveText(previous!);
  await expect(heading).toBeFocused();
  await expect(sheet).toHaveAttribute('data-expanded','true');
  return (await conceptName.textContent())!;
 };
 const first=await pickNeighbour();
 await pickNeighbour();
 await atlas.getByRole('button',{name:'Back',exact:true}).click();
 await expect(conceptName).toHaveText(first);
 await expect(heading).toBeFocused();
 await expect(sheet).toHaveAttribute('data-expanded','true');
});

test('Review continues a committed swipe from the release point and focuses the next question',async({page})=>{
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.clock.setFixedTime(NOW);
 await page.goto(at('/review'));
 await page.getByRole('button',{name:/^(Start review, \d+ cards?|Resume)/}).first().click();
 await page.getByRole('button',{name:'Show answer'}).click();
 await expect(page.getByRole('group',{name:'Answer',exact:true})).toBeFocused();
 const card=page.getByRole('article',{name:'Review card',exact:true}),box=await card.boundingBox();
 expect(box).not.toBeNull();
 await card.evaluate(node=>{
  node.addEventListener('pointerup',()=>{
   const root=document.documentElement;
   const x=()=>new DOMMatrixReadOnly(getComputedStyle(node).transform).m41;
   const released=x();let closest=released;
   root.dataset.reviewRelease=String(released);
   const sample=()=>{
    if(!node.isConnected){root.dataset.reviewClosest=String(closest);return;}
    closest=Math.min(closest,x());requestAnimationFrame(sample);
   };
   requestAnimationFrame(sample);
  },{once:true});
 });
 await page.mouse.move(box!.x+32,box!.y+32);
 await page.mouse.down();
 await page.mouse.move(box!.x+152,box!.y+32,{steps:6});
 await page.mouse.up();
 await expect(page.getByRole('group',{name:'Question',exact:true})).toBeFocused();
 const root=page.locator('html');
 await expect(root).toHaveAttribute('data-review-closest',/.+/);
 const released=Number(await root.getAttribute('data-review-release'));
 expect(released).toBeGreaterThan(96);
 expect(Number(await root.getAttribute('data-review-closest'))).toBeGreaterThanOrEqual(released-1);
});

test('rapid review grade keys are accepted once per revealed card',async({page})=>{
 await page.clock.setFixedTime(NOW);
 await page.goto(at('/review'));
 await page.getByRole('button',{name:/^(Start review, \d+ cards?|Resume)/}).first().click();
 const progress=page.getByRole('progressbar',{name:'Review progress',exact:true});
 await expect(progress).toHaveAttribute('aria-valuenow','0');
 for(let number=1;number<=5;number++){
  await expect(page.getByRole('button',{name:'Show answer'})).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByRole('group',{name:'Answer',exact:true})).toBeFocused();
  await expect(page.getByRole('group',{name:'Grade answer',exact:true})).toBeVisible();
  for(let repeat=0;repeat<5;repeat++)await page.keyboard.press('3');
  await expect(progress).toHaveAttribute('aria-valuenow',String(number));
 }
 await expect(page.getByRole('button',{name:'Show answer'})).toBeVisible();
});

test('Undo waits for a grade in flight and restores the same question',async({page})=>{
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.clock.setFixedTime(NOW);
 await page.goto(at('/review'));
 await page.getByRole('button',{name:/^(Start review, \d+ cards?|Resume)/}).first().click();
 const question=page.getByRole('group',{name:'Question',exact:true}),original=await question.textContent();
 await page.getByRole('button',{name:'Show answer'}).click();
 await page.evaluate(()=>{
  const native=HTMLElement.prototype.animate;
  HTMLElement.prototype.animate=function(keyframes,options){
   const animation=native.call(this,keyframes,options);
   if(this.matches('.v7-review-card')&&Array.isArray(keyframes)&&keyframes.at(-1)?.opacity===0){
    animation.pause();
    document.addEventListener('finish-review-exit',()=>animation.finish(),{once:true});
    document.documentElement.dataset.reviewExitHeld='';
   }
   return animation;
  };
 });
 await page.keyboard.press('3');
 await expect(page.locator('html')).toHaveAttribute('data-review-exit-held','');
 await page.keyboard.press('u');
 await page.evaluate(()=>document.dispatchEvent(new Event('finish-review-exit')));
 await expect(page.getByRole('progressbar',{name:'Review progress'})).toHaveAttribute('aria-valuenow','0');
 await expect(page.locator('.v7-review-progress [data-grade]')).toHaveCount(0);
 await expect(question).toHaveText(original!);
 await expect(question).toBeFocused();
});

for(const preference of ['system','settings'] as const){
 test('Review overlaps the outgoing and incoming fades with '+preference+' reduced motion',async({page})=>{
  await page.emulateMedia({reducedMotion:preference==='system'?'reduce':'no-preference'});
  if(preference==='settings')await page.addInitScript(key=>localStorage.setItem(key,'1'),REDUCE_EFFECTS_KEY);
  await page.clock.setFixedTime(NOW);
  await page.goto(at('/review'));
  await page.getByRole('button',{name:/^(Start review, \d+ cards?|Resume)/}).first().click();
  await page.getByRole('button',{name:'Show answer'}).click();
  const card=page.getByRole('article',{name:'Review card',exact:true});
  await card.evaluate(old=>{
   const stage=old.parentElement!;
   const observer=new MutationObserver(()=>{
    const next=stage.querySelector('.v7-review-card:not([data-exiting])');
    if(!old.hasAttribute('data-exiting')||next===old||!next)return;
    const transform=getComputedStyle(next).transform;
    document.documentElement.dataset.reviewCrossfade=transform;
    observer.disconnect();
   });
   observer.observe(stage,{childList:true,subtree:true,attributes:true,attributeFilter:['data-exiting']});
  });
  await page.keyboard.press('3');
  await expect(page.getByRole('group',{name:'Question',exact:true})).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('data-review-crossfade','none');
 });
}

for(const preference of ['full','system','settings'] as const){
 const reduced=preference!=='full';
 test('Atlas camera '+(reduced?'jumps with '+preference+' reduced motion':'stops on pointer down'),async({page})=>{
  await page.emulateMedia({reducedMotion:preference==='system'?'reduce':'no-preference'});
  if(preference==='settings')await page.addInitScript(key=>localStorage.setItem(key,'1'),REDUCE_EFFECTS_KEY);
  await page.setViewportSize({width:1280,height:800});
  await page.goto(at('/atlas?view=map&id=concept-compactness'));
  const sky=page.locator('.v7-atlas-sky'),canvas=sky.locator('canvas');
  const other=page.getByRole('button',{name:'Go to Linear Algebra',exact:true});
  await expect(sky).toHaveAttribute('data-zoom','1.40');
  await expect(other).toBeVisible();
  const box=(await canvas.boundingBox())!;
  if(!reduced){
   await page.mouse.move(box.x+box.width/3,box.y+75);
   await canvas.evaluate(node=>node.addEventListener('pointerdown',()=>{
    document.documentElement.dataset.atlasCancelled=String(!node.parentElement?.hasAttribute('data-camera-moving'));
   },{once:true}));
  }
  const motion=await other.evaluate(button=>{
   (button as HTMLButtonElement).click();
   return document.querySelector('.v7-atlas-sky')?.getAttribute('data-camera-moving');
  });
  if(reduced){
   expect(motion).toBeNull();
   await expect(sky).not.toHaveAttribute('data-zoom','1.40');
   return;
  }
  expect(Number(motion)).toBeGreaterThanOrEqual(240);
  expect(Number(motion)).toBeLessThanOrEqual(600);
  await page.mouse.down();
  await expect(page.locator('html')).toHaveAttribute('data-atlas-cancelled','true');
  await page.mouse.up();
 });
}

test('two Inbox decisions in one Undo window both roll back',async({page})=>{
 await page.goto(at('/proposals'));
 const position=page.locator('.v7-inbox-position');
 await expect(position).toHaveText('1 of 5');
 await page.keyboard.press('a');
 await expect(position).toHaveText('1 of 4');
 await page.keyboard.press('r');
 await expect(position).toHaveText('1 of 3');
 const group=page.locator('.v7-app-toast').filter({hasText:'2 changes'});
 await group.getByRole('button',{name:'Undo',exact:true}).click();
 await expect(position).toHaveText('1 of 5');
});

test('the undo countdown and commit stay together after hovering',async({page})=>{
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.goto(at('/proposals'));
 await page.getByRole('button',{name:'Approve',exact:true}).click();
 const toast=page.locator('.v7-app-toast');
 const line=toast.locator('.v7-app-toast-countdown');
 await line.waitFor({state:'attached'});
 await toast.hover();
 const paused=await line.evaluate(node=>getComputedStyle(node).transform);
 await page.waitForTimeout(2000);
 expect(await line.evaluate(node=>getComputedStyle(node).transform)).toBe(paused);
 const measured=toast.evaluate(node=>new Promise<number>((resolve,reject)=>{
  const line=node.querySelector('.v7-app-toast-countdown')!;
  let end:number|null=null,frame=0;
  const observer=new MutationObserver(()=>{
   if(node.isConnected&&!node.hasAttribute('aria-hidden'))return;
   cleanUp();
   if(end===null)reject(Error('The countdown did not resume'));
   else resolve(Math.abs(performance.now()-end));
  });
  // Presence changes at commit. Sampling it on the next paint also counts an unrelated late frame.
  observer.observe(node,{attributes:true,attributeFilter:['aria-hidden']});
  observer.observe(node.parentElement!,{childList:true});
  const limit=setTimeout(()=>{cleanUp();reject(Error('Toast did not expire after resuming'));},8000);
  function cleanUp(){clearTimeout(limit);cancelAnimationFrame(frame);observer.disconnect();}
  function readDeadline(){
   const animation=line.getAnimations()[0],duration=animation?.effect?.getTiming().duration;
   if(animation&&typeof animation.startTime==='number'&&typeof duration==='number')end=animation.startTime+duration;
   else frame=requestAnimationFrame(readDeadline);
  }
  frame=requestAnimationFrame(readDeadline);
 }));
 await page.mouse.move(0,0);
 expect(await measured).toBeLessThanOrEqual(50);
});
