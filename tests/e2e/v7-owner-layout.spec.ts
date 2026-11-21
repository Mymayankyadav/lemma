import {expect,test,type Page} from '@playwright/test';
import {at,NOW} from './v7-scenes';

const go=async(page:Page,route:string)=>{
 await page.goto(at(route).replace('#',',v7Room,v7Scratch,v7Ruler#'));
 await expect(page.locator('#main-content')).toBeVisible();
 await page.evaluate(()=>document.fonts.ready);
};
test.beforeEach(async({page})=>{await page.clock.setFixedTime(NOW);});

function contrastRatio(a:string,b:string) {
 const luminance=(color:string)=>{
  const rgb=color.match(/\d+(?:\.\d+)?/g)!.slice(0,3).map(value=>{
   const channel=Number(value)/255;
   return channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4;
  });
  return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
 };
 const [light,dark]=[luminance(a),luminance(b)].sort((x,y)=>y-x);
 return (light+.05)/(dark+.05);
}

test('Path due count clears its timeline and Undo clears the pinned actions',async({page})=>{
 await go(page,'/projects');
 await page.getByRole('button',{name:'More for Real Analysis',exact:true}).click();
 await page.getByRole('menuitem',{name:'Mark done',exact:true}).click();
 await page.evaluate(()=>{location.hash='#/p/real-analysis';});
 await expect(page.getByRole('heading',{name:'Real Analysis',exact:true})).toBeVisible();
 const toast=page.locator('.v7-app-toast').filter({hasText:'Path marked done'});
 await expect(toast).toBeVisible();await toast.hover();
 const actions=page.getByRole('group',{name:'Path actions',exact:true});
 await expect.poll(async()=>{
  const [message,dock]=await Promise.all([toast.boundingBox(),actions.boundingBox()]);
  return Boolean(message&&dock&&message.y+message.height<=dock.y-8);
 }).toBe(true);
 const row=page.locator('.v7-path-row[data-state="current"]').first();
 const [node,count]=await Promise.all([row.locator('.v7-path-node').boundingBox(),row.locator('.v7-meta-chip').boundingBox()]);
 expect(count!.x).toBeGreaterThan(node!.x+node!.width);
});

for(const [width,height,scale] of [[320,640,100],[390,844,160]])test(`Path tabs and primary action fit at ${width}px and ${scale}% text`,async({page})=>{
 await page.setViewportSize({width,height});
 await page.addInitScript(value=>document.addEventListener('DOMContentLoaded',()=>document.documentElement.style.fontSize=value+'%'),scale);
 await go(page,'/p/real-analysis');
 const goal=page.locator('.v7-path-goal');
 const disclosure=page.locator('.v7-path-head .v7-disclosure').filter({has:goal});
 const trigger=disclosure.getByRole('button');
 const goalText=(await goal.textContent())!;
 const [goalBox,arrowBox,triggerBox]=await Promise.all([
  goal.boundingBox(),trigger.locator(':scope > svg').boundingBox(),trigger.boundingBox(),
 ]);
 expect(goalBox!.x+goalBox!.width).toBeLessThanOrEqual(arrowBox!.x);
 expect(arrowBox!.x+arrowBox!.width).toBeLessThanOrEqual(triggerBox!.x+triggerBox!.width+.5);
 await trigger.click();
 await expect(trigger).toHaveAttribute('aria-expanded','true');
 await expect(disclosure.locator('p')).toHaveText(goalText);
 await expect(disclosure.locator('p')).toBeVisible();
 await trigger.click();
 const tabs=page.getByRole('tablist',{name:'Path sections'});
 await expect(tabs.getByRole('tab')).toHaveCount(4);
 expect(await tabs.evaluate(node=>{
  const box=node.getBoundingClientRect();
  return [...node.querySelectorAll('button')].every(tab=>{
   const rect=tab.getBoundingClientRect();
   return rect.left>=box.left-.5&&rect.right<=box.right+.5;
  });
 })).toBe(true);
 const action=page.getByRole('button',{name:'Continue with tutor',exact:true});
 await expect(action).toBeVisible();
 expect(await action.evaluate(node=>{
  const box=node.getBoundingClientRect(),range=document.createRange();
  range.selectNodeContents(node.querySelector('span')??node);
  return [...range.getClientRects()].every(rect=>rect.left>=box.left-.5&&rect.right<=box.right+.5&&rect.bottom<=box.bottom+.5);
 })).toBe(true);
 await tabs.getByRole('tab',{name:'Cards',exact:true}).click();
 await expect(tabs.getByRole('tab',{name:'Cards',exact:true})).toHaveAttribute('aria-selected','true');
});

for(const [width,height] of [[834,1112],[1440,1000]])test(`Path Undo clears visible split-pane actions at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height});
 await go(page,'/projects');
 await page.getByRole('button',{name:'More for Real Analysis',exact:true}).click();
 await page.getByRole('menuitem',{name:'Mark done',exact:true}).click();
 await page.evaluate(()=>{location.hash='#/p/real-analysis';});
 const path=page.getByRole('main',{name:'Path',exact:true}),toast=page.locator('.v7-app-toast').filter({hasText:'Path marked done'});
 const actions=path.getByRole('group',{name:'Path actions',exact:true});
 await expect(path.getByRole('heading',{name:'Real Analysis',exact:true})).toBeVisible();
 await expect(toast).toBeVisible();
 await actions.evaluate(node=>window.scrollBy({top:Math.max(0,node.getBoundingClientRect().bottom-innerHeight+8),behavior:'instant'}));
 await expect(actions).toBeInViewport({ratio:.95});
 await expect.poll(async()=>{
  const [message,dock]=await Promise.all([toast.boundingBox(),actions.boundingBox()]);
  return Boolean(message&&dock&&message.y+message.height<=dock.y-8);
 }).toBe(true);
 await toast.getByRole('button',{name:'Undo',exact:true}).click();
 await expect(path.locator('.v7-path-head')).not.toContainText('Q.E.D.');
});

test('Search results scroll below the opaque field surround',async({page})=>{
 await go(page,'/');
 await page.getByRole('button',{name:'Search',exact:true}).first().click();
 const dialog=page.getByRole('dialog',{name:'Search',exact:true}),field=dialog.getByRole('combobox',{name:'Search',exact:true});
 await field.fill('compact');
 await expect(dialog.getByRole('listbox',{name:'Results'})).toContainText('Compactness');
 await dialog.locator('.v7-sheet-body').evaluate(node=>{node.scrollTop=130;});
 expect(await field.evaluate(node=>{
  const box=node.getBoundingClientRect(),cover=document.elementFromPoint(box.x+box.width/2,box.bottom+3);
  return !!cover?.closest('.v7-search-entry');
 })).toBe(true);
 await field.press('ArrowDown');
 const id=await field.getAttribute('aria-activedescendant');
 await expect(dialog.locator('#'+id)).toBeInViewport();
});

test('Calendar uses the shared hub typography without a subtitle',async({page})=>{
 await go(page,'/projects');
 const style=await page.locator('h1.v7-hub-title').evaluate(node=>{
  const value=getComputedStyle(node);return {font:value.fontFamily,size:value.fontSize,weight:value.fontWeight};
 });
 await go(page,'/calendar?view=day&date=2026-11-09');
 const heading=page.getByRole('heading',{name:'Calendar',exact:true});
 await expect(heading).toBeVisible();
 expect(await heading.evaluate(node=>{
  const value=getComputedStyle(node);return {font:value.fontFamily,size:value.fontSize,weight:value.fontWeight};
 })).toEqual(style);
 await expect(page.locator('.v7-hub-bar p')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Next week',exact:true})).toBeVisible();
});

for(const [width,height,scale] of [[390,844,100],[320,640,100],[390,844,160]])test(`Revealed review answer stays above scratch paper at ${width}px and ${scale}%`,async({page})=>{
 await page.setViewportSize({width,height});
 await page.addInitScript(value=>document.addEventListener('DOMContentLoaded',()=>document.documentElement.style.fontSize=value+'%'),scale);
 await go(page,'/review');
 await page.getByRole('button',{name:/^(Start review|Start \d+ cards?|Resume)/}).first().click();
 await page.getByRole('button',{name:'Scratch paper',exact:true}).click();
 await page.getByLabel('Type an attempt').fill('Take the minimum of finitely many radii.');
 await page.getByRole('button',{name:'Show answer',exact:true}).click();
 const card=page.getByRole('article',{name:'Review card'}),scratch=page.getByRole('region',{name:'Scratch paper'});
 const answer=card.locator('.v7-review-back');
 await expect(answer).toBeVisible();
 const geometry=await page.evaluate(()=>{
  const rect=(selector:string)=>document.querySelector(selector)!.getBoundingClientRect().toJSON();
  return {card:rect('.v7-review-card'),answer:rect('.v7-review-back'),scratch:rect('.v7-scratch'),overflow:document.documentElement.scrollWidth-innerWidth};
 });
 expect(geometry.answer.bottom).toBeLessThanOrEqual(geometry.card.bottom);
 expect(geometry.card.bottom).toBeLessThanOrEqual(geometry.scratch.top);
 expect(geometry.overflow).toBeLessThanOrEqual(1);
 await scratch.getByLabel('Type an attempt').scrollIntoViewIfNeeded();
 await expect(scratch.getByLabel('Type an attempt')).toHaveValue('Take the minimum of finitely many radii.');
 await expect(page.getByRole('group',{name:'Grade answer'})).toBeInViewport();
});

test('Day review cards render both faces with readable contrast',async({page})=>{
 await page.emulateMedia({colorScheme:'light'});
 await go(page,'/review');
 await expect(page.locator('html')).toHaveAttribute('data-theme','graph');
 await page.getByRole('button',{name:/^(Start review|Start \d+ cards?|Resume)/}).first().click();
 await page.getByRole('button',{name:'Show answer',exact:true}).click();
 const card=page.getByRole('article',{name:'Review card'});
 await expect(card.locator('.v7-review-back .lemma-math')).toBeVisible();
 const colors=await card.evaluate(node=>({
  paper:getComputedStyle(node).backgroundColor,
  question:getComputedStyle(node.querySelector('.v7-review-front .lemma-math p, .v7-review-front .lemma-math')!).color,
  answer:getComputedStyle(node.querySelector('.v7-review-back .lemma-math p, .v7-review-back .lemma-math')!).color,
 }));
 expect(contrastRatio(colors.question,colors.paper)).toBeGreaterThanOrEqual(4.5);
 expect(contrastRatio(colors.answer,colors.paper)).toBeGreaterThanOrEqual(4.5);
});

test('Selected Teaching style is readable in Day with reduced effects',async({page})=>{
 await page.emulateMedia({colorScheme:'light'});
 await go(page,'/settings?section=tutor');
 await expect(page.locator('html')).toHaveAttribute('data-theme','graph');
 await page.locator('html').evaluate(node=>node.setAttribute('data-effects','calm'));
 const teaching=page.getByRole('radiogroup',{name:'Teaching style'});
 const selected=teaching.getByRole('radio',{name:'Socratic',exact:true});
 await expect(selected).toHaveAttribute('aria-checked','true');
 const colors=await selected.evaluate(node=>{
  const style=getComputedStyle(node);
  return {foreground:style.color,background:style.backgroundColor};
 });
 expect(contrastRatio(colors.foreground,colors.background)).toBeGreaterThanOrEqual(4.5);
 await teaching.getByRole('radio',{name:'Visual',exact:true}).click();
 await expect(teaching.getByRole('radio',{name:'Visual',exact:true})).toHaveAttribute('aria-checked','true');
});

test('Settings sliders announce and display their count, not only a unit',async({page})=>{
 for(const [route,row,title,initial,unit] of [
  ['study','New cards a day','New cards a day',20,'cards'],
  ['study','Cards a day','Review cards a day',20,'cards'],
  ['reminders','At most','Reminders a day, at most',5,'reminders'],
 ] as const){
  await go(page,'/settings?section='+route);
  await page.getByRole('button',{name:new RegExp('^'+row+'\\b')}).click();
  const dialog=page.getByRole('dialog',{name:title,exact:true}),slider=dialog.getByRole('slider',{name:title,exact:true});
  await expect(slider).toHaveAttribute('aria-valuetext',initial+' '+unit);
  await expect(dialog.locator('output')).toHaveText(initial+' '+unit);
  await slider.press('ArrowRight');
  await expect(dialog.locator('output')).toHaveText((initial+1)+' '+unit);
  await page.keyboard.press('Escape');
 }
});

test('The review-card ruler leaves room for its endpoint labels on phones',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await go(page,'/settings?section=study');
 await page.getByRole('button',{name:/^Cards a day\b/}).click();
 const dialog=page.getByRole('dialog',{name:'Review cards a day'});
 const slider=dialog.getByRole('slider',{name:'Review cards a day'});
 await expect(slider).toBeVisible();
 const labels=await dialog.locator('.v7-ruler-label').evaluateAll(nodes=>nodes.map(node=>{
  const {left,right}=node.getBoundingClientRect();
  return {left,right,text:node.textContent};
 }).sort((a,b)=>a.left-b.left));
 expect(labels.length).toBeGreaterThan(3);
 expect(labels[0].text).toBe('0');
 expect(labels.at(-1)?.text).toBe('1980');
 for(let i=1;i<labels.length;i++)expect(labels[i].left,labels[i-1].text+' and '+labels[i].text).toBeGreaterThanOrEqual(labels[i-1].right+4);
 await slider.press('End');
 await expect(slider).toHaveAttribute('aria-valuetext','2000 cards');
});
