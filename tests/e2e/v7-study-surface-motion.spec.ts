import {expect,test} from '@playwright/test';
import {at,NOW,DATE} from './v7-scenes';

test.beforeEach(async({page})=>await page.clock.setFixedTime(NOW));

test('Calendar view selection and the requested date survive the full view loop',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
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
 const neighbour=sheet.locator('.v7-atlas-sheet-content:not([data-exiting]) .v7-atlas-neighbours').getByRole('button').first();
 const pickNeighbour=async()=>{
  const previous=await heading.textContent();
  await neighbour.click();
  await expect(heading).not.toHaveText(previous!);
  await expect(heading).toBeFocused();
  await expect(sheet).toHaveAttribute('data-expanded','true');
  return (await heading.textContent())!;
 };
 const first=await pickNeighbour();
 await pickNeighbour();
 await atlas.getByRole('button',{name:'Back',exact:true}).click();
 await expect(heading).toHaveText(first);
 await expect(heading).toBeFocused();
 await expect(sheet).toHaveAttribute('data-expanded','true');
});

test('Review continues a committed swipe from the release point and focuses the next question',async({page})=>{
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.goto(at('/review'));
 await page.getByRole('button',{name:/^(Start review, \d+ cards?|Resume)/}).first().click();
 await page.getByRole('button',{name:'Show answer'}).click();
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
 await page.goto(at('/review'));
 await page.getByRole('button',{name:/^(Start review, \d+ cards?|Resume)/}).first().click();
 const progress=page.getByRole('progressbar',{name:'Review progress',exact:true});
 await expect(progress).toHaveAttribute('aria-valuenow','0');
 for(let number=1;number<=5;number++){
  await page.keyboard.press('Space');
  await expect(page.getByRole('group',{name:'Grade answer',exact:true})).toBeVisible();
  for(let repeat=0;repeat<5;repeat++)await page.keyboard.press('3');
  await expect(progress).toHaveAttribute('aria-valuenow',String(number));
  await expect(page.getByRole('button',{name:'Show answer'})).toBeVisible();
 }
});
