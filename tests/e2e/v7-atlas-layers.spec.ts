import {expect,test} from '@playwright/test';
import {at} from './v7-scenes';

for(const width of [390,1280]){
 test(`Atlas search expands in the toolbar and opens actions by keyboard at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});
  await page.goto(at('/atlas'));
  const search=page.getByRole('button',{name:'Search concepts'});
  const searchBounds=(await search.boundingBox())!;
  await search.click();
  const field=page.getByRole('searchbox',{name:'Find a concept'});
  await expect(field).toBeFocused();
  expect(Math.abs((await field.boundingBox())!.y-searchBounds.y)).toBeLessThan(4);
  await field.fill('compact');
  await field.press('Escape');
  await expect(search).toBeFocused();
  await expect(field).toHaveCount(0);

  await search.press('Enter');
  await field.fill('Compactness');
  await field.press('ArrowDown');
  const first=page.getByRole('list',{name:'Matching concepts'}).getByRole('button').first();
  await expect(first).toBeFocused();
  const pickedName=(await first.locator('.v7-atlas-row-name').innerText()).trim();
  await first.press('Enter');
  const details=page.getByRole('region',{name:pickedName,exact:true});
  await expect(details.getByRole('heading',{name:pickedName,exact:true})).toBeFocused();
  await expect(details.getByRole('button',{name:'Edit concept'})).toBeVisible();
  await expect(field).toHaveCount(0);
  const dock=page.getByRole('navigation',{name:'Main navigation'});
  await expect(dock).toBeHidden();
  await details.getByRole('button',{name:'Close details'}).click();
  await expect(dock).toBeVisible();
 });
}

for(const [width,scale] of [[320,100],[390,160]])test(`Atlas search keeps concept names whole at ${width}px / ${scale}% text`,async({page})=>{
 await page.setViewportSize({width,height:844});
 await page.goto(at('/atlas'));
 await page.locator('html').evaluate((node,size)=>{node.style.fontSize=size+'%';},scale);
 await page.getByRole('button',{name:'Search concepts'}).click();
 await page.getByRole('searchbox',{name:'Find a concept'}).fill('compact');
 const result=page.getByRole('list',{name:'Matching concepts'}).getByRole('button',{name:/^Compactifications\b/});
 await expect(result).toBeVisible();
 await page.evaluate(()=>document.fonts.ready);
 const title=result.locator('.v7-atlas-row-name');
 const lines=await title.evaluate(node=>{
  const text=document.createTreeWalker(node,NodeFilter.SHOW_TEXT).nextNode()!;
  const range=document.createRange();
  range.selectNodeContents(text);
  return range.getClientRects().length;
 });
 expect(lines).toBe(1);
 const [name,subject]=await Promise.all([title.boundingBox(),result.locator('.v7-atlas-meta').boundingBox()]);
 expect(subject!.y).toBeGreaterThanOrEqual(name!.y+name!.height-.5);
});

test('Atlas List retains a paused sky, and Back restores the map, focus and navigation',async({page})=>{
 await page.addInitScript(()=>{
  const fill=CanvasRenderingContext2D.prototype.fillRect;
  CanvasRenderingContext2D.prototype.fillRect=function(x,y,width,height){
   if(this.canvas.parentElement?.matches('.v7-atlas-sky[data-paused]')){
    const counters=document.documentElement.dataset;
    counters.atlasDrawsWhileCovered=String(Number(counters.atlasDrawsWhileCovered??0)+1);
   }
   fill.call(this,x,y,width,height);
  };
 });
 await page.setViewportSize({width:1280,height:844});
 await page.goto(at('/atlas'));
 const sky=page.locator('.v7-atlas-sky'),dock=page.getByRole('navigation',{name:'Main navigation'});
 await expect(sky).toHaveAttribute('data-drawn-extent',/.+/);
 const canvas=await sky.locator('canvas').elementHandle();
 const list=page.getByRole('button',{name:'List',exact:true});
 // Start a camera animation immediately before opening the layer.
 await page.evaluate(()=>{
  document.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!.click();
  document.querySelector<HTMLButtonElement>('[aria-label="List"]')!.click();
 });
 await expect(page.getByRole('region',{name:'Concept list'})).toBeVisible();
 await expect(page.getByRole('region',{name:'Atlas map'})).toHaveCount(0);
 await expect(sky).toHaveAttribute('data-paused','true');
 await expect(dock).toBeHidden();
 await page.getByRole('button',{name:'New concept'}).click();
 const create=page.getByRole('dialog',{name:'Create idea'});
 await expect(create).toBeVisible();
 await expect(dock).toBeHidden();
 await page.keyboard.press('Escape');
 await expect(create).toHaveCount(0);
 await expect(page.locator('html')).not.toHaveAttribute('data-atlas-draws-while-covered',/.+/);
 await page.getByRole('button',{name:'Back to map'}).click();
 await expect(list).toBeFocused();
 await expect(sky).not.toHaveAttribute('data-paused','true');
 expect(await canvas!.evaluate(element=>element===document.querySelector('.v7-atlas-sky canvas'))).toBe(true);
 await expect(dock).toBeVisible();
});

test('Opening Atlas List terminates in-flight layout and starts a replacement on return',async({page})=>{
 await page.addInitScript(()=>{
  const NativeWorker=window.Worker;
  window.Worker=class extends NativeWorker{
   private delayLayout:boolean;
   constructor(url:string|URL,options?:WorkerOptions){
    super(url,options);
    this.delayLayout=!document.documentElement.dataset.atlasAllowLayout&&String(url).includes('layout.worker');
   }
   postMessage(message:unknown,options?:StructuredSerializeOptions|Transferable[]){
    if(this.delayLayout){
     document.documentElement.dataset.atlasLayoutPending='true';
     return;
    }
    super.postMessage(message,Array.isArray(options)?{transfer:options}:options);
   }
   terminate(){
    if(this.delayLayout){
     const counters=document.documentElement.dataset;
     counters.atlasLayoutAborted=String(Number(counters.atlasLayoutAborted??0)+1);
    }
    super.terminate();
   }
  };
 });
 await page.goto(at('/atlas'));
 await expect(page.locator('html')).toHaveAttribute('data-atlas-layout-pending','true');
 const priorAborts=await page.locator('html').evaluate(el=>Number(el.dataset.atlasLayoutAborted??0));
 await page.getByRole('button',{name:'List',exact:true}).click();
 await expect.poll(()=>page.locator('html').evaluate(el=>Number(el.dataset.atlasLayoutAborted??0))).toBeGreaterThan(priorAborts);
 await expect(page.locator('.v7-atlas-sky')).toHaveCount(0);
 await page.locator('html').evaluate(el=>{el.dataset.atlasAllowLayout='true';});
 await page.getByRole('button',{name:'Back to map'}).click();
 await expect(page.locator('.v7-atlas-sky')).toHaveAttribute('data-layout','worker');
});

test('Atlas direct List does not start a layout worker before showing its map',async({page})=>{
 const workerRequests:string[]=[];
 page.on('request',request=>{if(request.url().includes('layout.worker'))workerRequests.push(request.url());});
 await page.goto(at('/atlas?view=list'));
 await expect(page.getByRole('region',{name:'Concept list'})).toBeVisible();
 await expect(page.locator('.v7-atlas-sky')).toHaveCount(0);
 expect(workerRequests).toEqual([]);
 await page.getByRole('button',{name:'Back to map'}).click();
 await expect(page.locator('.v7-atlas-sky')).toHaveAttribute('data-layout',/^(worker|cache)$/);
});

test('Atlas List details stay pinned while the concept list scrolls',async({page})=>{
 await page.goto(at('/atlas?view=list'));
 const list=page.getByRole('region',{name:'Concept list'});
 await list.getByRole('button',{name:/^In progress\s+Compactness(?:\s+9 due)?$/}).click();
 const details=page.getByRole('region',{name:'Compactness',exact:true});
 await expect(details.locator('..')).toHaveClass(/v7-pinned-dock/);
 const before=(await details.boundingBox())!;
 await list.evaluate(element=>{element.scrollTop=element.scrollHeight;});
 await expect.poll(()=>list.evaluate(element=>element.scrollTop)).toBeGreaterThan(500);
 const after=(await details.boundingBox())!;
 expect(after.y).toBeCloseTo(before.y,0);
 expect(after.y+after.height).toBeLessThanOrEqual(page.viewportSize()!.height);
 await details.getByRole('button',{name:'Edit concept'}).click();
 await expect(page.getByRole('dialog',{name:'Edit idea'})).toBeVisible();
});

test('Opening List during a drag releases the map pointer and clears panning',async({page})=>{
 await page.goto(at('/atlas'));
 const sky=page.locator('.v7-atlas-sky'),canvas=sky.locator('canvas');
 await expect(sky).toHaveAttribute('data-drawn-extent',/.+/);
 const bounds=(await canvas.boundingBox())!;
 const x=bounds.x+bounds.width/2,y=bounds.y+bounds.height/2;
 await page.mouse.move(x,y);
 await page.mouse.down();
 await page.mouse.move(x+24,y+6);
 const atlas=page.getByRole('main',{name:'Atlas',exact:true});
 await expect(atlas).toHaveAttribute('data-panning','true');
 await expect.poll(()=>canvas.evaluate(element=>element.hasPointerCapture(1))).toBe(true);
 await page.getByRole('button',{name:'List',exact:true}).press('Enter');
 await expect(sky).toHaveAttribute('data-paused','true');
 await expect(atlas).not.toHaveAttribute('data-panning','true');
 await expect.poll(()=>canvas.evaluate(element=>element.hasPointerCapture(1))).toBe(false);
 await page.getByRole('button',{name:'Back to map'}).press('Enter');
 await expect(sky).not.toHaveAttribute('data-paused','true');
 await page.mouse.move(x-48,y);
 await expect(atlas).not.toHaveAttribute('data-panning','true');
 await page.mouse.up();
 await expect(atlas).toHaveAttribute('data-sheet','closed');
});
