import {expect,test,type Page} from '@playwright/test';
import {at,NOW} from './v7-scenes';

test.use({serviceWorkers:'block',timezoneId:'Asia/Kolkata'});
test.beforeEach(async({page})=>{await page.clock.setFixedTime(NOW);});

const captureField=(page:Page)=>page.getByRole('textbox',{name:'What do you want to add?'});
const chunk=(name:string)=>new RegExp('/assets/'+name+'-[^/]+\\.js(?:\\?|$)');

for(const width of [390,1000])test('Capture keeps one dialog, the text, tokens and caret at '+width+' px',async({page})=>{
 await page.setViewportSize({width,height:844});
 await page.goto(at('/'));
 const capture=page.getByRole('button',{name:'Capture',exact:true});
 for(const [kind,text] of [
  ['Task','Work through exercise tomorrow 4pm'],
  ['Time block','Read the chapter tomorrow 4pm 50m'],
  ['Card','What is a cover? :: A family whose union contains the space'],
  ['Thought','Return to this idea later'],
 ]){
  await capture.click();
  const field=captureField(page);
  await field.fill(text);
  const dialog=page.locator('dialog.v7-sheet[open]');
  await dialog.getByRole('radio',{name:kind,exact:true}).click();
  await dialog.evaluate(node=>node.setAttribute('data-flow-test','capture'));
  const tokens=await page.getByRole('list',{name:'Recognised'}).getByRole('button').allTextContents();
  await field.evaluate((input:HTMLTextAreaElement)=>{input.focus();input.setSelectionRange(2,6,'forward');});
  await page.getByRole('button',{name:'Add details',exact:true}).click();
  await expect(dialog).toHaveCount(1);
  await expect(dialog).toHaveAttribute('data-flow-test','capture');
  await expect(dialog.getByRole('button',{name:'Back',exact:true})).toBeVisible();
  await expect(page).toHaveURL(/#\/$/);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveAttribute('data-flow-test','capture');
  await expect(field).toHaveValue(text);
  await expect(field).toBeFocused();
  expect(await field.evaluate((input:HTMLTextAreaElement)=>[input.selectionStart,input.selectionEnd])).toEqual([2,6]);
  expect(await page.getByRole('list',{name:'Recognised'}).getByRole('button').allTextContents()).toEqual(tokens);
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Discard changes',exact:true}).click();
  await expect(dialog).toHaveCount(0);
 }
});

test('Place in Calendar preserves edited block details across the explicit route change',async({page})=>{
 await page.goto(at('/'));
 await page.getByRole('button',{name:'Capture',exact:true}).click();
 await captureField(page).fill('Read tomorrow 4pm 50m');
 await page.getByRole('button',{name:'Add details',exact:true}).click();
 const editor=page.getByRole('dialog',{name:'New time block'});
 await editor.getByRole('textbox',{name:'Calendar block title'}).fill('Revised reading');
 await expect(page).toHaveURL(/#\/$/);
 await editor.getByRole('button',{name:'Place in Calendar'}).click();
 await expect(page).toHaveURL(/#\/calendar\?view=day&date=2026-11-10&new=block$/);
 await expect(editor.getByRole('textbox',{name:'Calendar block title'})).toHaveValue('Revised reading');
});

test('Today opens block Details locally and Show in Calendar carries the editor draft',async({page})=>{
 await page.goto(at('/'));
 await page.getByRole('button',{name:'Details',exact:true}).click();
 const editor=page.getByRole('dialog',{name:'Edit time block',exact:true});
 const title=editor.getByRole('textbox',{name:'Calendar block title'});
 await expect(editor.getByRole('heading')).toBeFocused();
 await expect(page).toHaveURL(/#\/$/);
 await title.fill('Reading plan updated in Today');
 await editor.getByRole('button',{name:'Show in Calendar'}).click();
 await expect(page).toHaveURL(/#\/calendar\?view=day&date=2026-11-09&edit=/);
 await expect(title).toHaveValue('Reading plan updated in Today');
});

test('Search keeps its field pinned and consumes the first Escape',async({page})=>{
 await page.setViewportSize({width:1000,height:844});
 await page.goto(at('/'));
 const opener=page.getByRole('navigation',{name:'Page actions'}).getByRole('button',{name:'Search',exact:true});
 await opener.click();
 const search=page.getByRole('combobox',{name:'Search'});
 await expect(search).toBeFocused();
 const start=await search.boundingBox();
 await search.fill('compact');
 await expect(page.getByRole('option',{name:/Compactness/}).first()).toBeVisible();
 const results=await search.boundingBox();
 expect(results?.y).toBe(start?.y);
 await search.press('Escape');
 await expect(search).toHaveValue('');
 await expect(search).toBeFocused();
 await search.press('Escape');
 await expect(search).toHaveCount(0);
 await expect(opener).toBeFocused();
});

const overlays=[
 {title:'Capture',chunk:'CaptureSheet',path:'/',open:async(page:Page)=>page.getByRole('button',{name:'Capture',exact:true}).click(),
  body:(page:Page)=>captureField(page)},
 {title:'Search',chunk:'SearchSheet',path:'/',open:async(page:Page)=>page.getByRole('button',{name:'Search',exact:true}).click(),
  body:(page:Page)=>page.getByRole('combobox',{name:'Search'})},
 {title:'Switch path',chunk:'ProjectSwitcher',path:'/p/real-analysis',open:async(page:Page)=>{
  await page.getByRole('button',{name:'More path actions'}).click();
  await page.getByRole('menuitem',{name:'Switch path'}).click();
 },body:(page:Page)=>page.getByRole('searchbox',{name:'Find a path'})},
];
for(const overlay of overlays)for(const persistent of [false,true])test(
 overlay.title+' opens its shell and recovers from '+(persistent?'persistent':'one')+' chunk failure',async({page})=>{
 let requests=0,fail=persistent;
 await page.route(chunk(overlay.chunk),route=>++requests===1||fail?route.abort():route.continue());
 await page.goto(at(overlay.path));
 await page.evaluate(()=>Object.assign(window,{lemmaSameDocument:true}));
 await overlay.open(page);
 const dialog=page.getByRole('dialog',{name:overlay.title,exact:true});
 await expect(dialog.getByRole('button',{name:'Close',exact:true})).toBeVisible();
 if(persistent){
  const retry=dialog.getByRole('button',{name:'Retry',exact:true});
  await expect(retry).toBeVisible();
  fail=false;
  await retry.click();
 }
 await expect(overlay.body(page)).toBeVisible();
 expect(requests).toBeGreaterThan(1);
 expect(await page.evaluate(()=>Reflect.get(window,'lemmaSameDocument'))).toBe(true);
});

test('a cold route keeps the committed page until the destination chunk resolves',async({page})=>{
 let release!:()=>void;
 const hold=new Promise<void>(resolve=>{release=resolve;});
 await page.route(chunk('ProgressV7'),async route=>{await hold;await route.continue();});
 try{
  await page.goto(at('/'));
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Progress',exact:true}).click();
  await expect(page.getByRole('main',{name:'Today'})).toBeVisible();
  await expect(page.locator('[data-loading-surface="route-progress"]')).toBeVisible();
  await expect(page.locator('[data-loading-surface="route-skeleton"]')).toBeVisible();
 }finally{release();}
 await expect(page.getByRole('heading',{name:'Progress',level:1})).toBeVisible();
 await expect(page.locator('[data-loading-surface^="route-"]')).toHaveCount(0);
});
