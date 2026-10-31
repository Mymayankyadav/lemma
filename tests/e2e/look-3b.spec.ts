import {test,expect} from '@playwright/test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router';
import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import type {CheckpointView} from '../../src/data/types';
import {Route} from '../../src/ui/timeline/Route';

/** Isolated component visual audit. Interactive mounted-route/4x CPU tests
 * remain a LOOK-3c gate; SSR screenshots cannot substitute for those. */
let cachedCss:string|undefined;
function getCss(){
 return cachedCss??=readdirSync('dist/assets').filter(name=>name.endsWith('.css'))
  .map(name=>readFileSync(join('dist/assets',name),'utf8')).join('\n');
}
function checkpoints(n:number,size:number):CheckpointView[]{
 const current=Math.floor(n/2);
 return Array.from({length:n},(_,i)=>({
  id:'cp-'+i,code:'CP'+(i+1),title:'Checkpoint '+(i+1),
  position:i,ui:i<current?'done':i===current?'now':'next',
  currentStep:0,stepsTotal:1,recheckDue:null,dueCards:0,
  stage:'Stage '+(Math.floor(i/size)+1),
 }));
}
async function mount(page:import('@playwright/test').Page,n:number,width:number,theme:string,mode:'today'|'project'){
 const cps=checkpoints(n,n===9?3:15),done=Math.floor(n/2);
 const html=renderToStaticMarkup(createElement(MemoryRouter,null,
  createElement(Route,{project:{title:'Algebra 1',slug:'algebra-1',done,total:n},
   checkpoints:cps,mode,initialWidth:width-64})));
 await page.setContent(`<!doctype html><html data-theme="${theme}">
 <head><meta name="viewport" content="width=device-width,initial-scale=1">
 <style>${getCss()}</style></head>
 <body><main style="padding:16px"><section class="card" style="padding:16px">
 ${html}</section></main></body></html>`);
 await expect(page.locator('[data-route]')).toBeVisible();
}
for(const theme of ['graph','graph-night'] as const)
for(const profile of ['stress','extreme'] as const)
for(const width of [360,390] as const){
 test(`LOOK-3b isolated folded Route geometry ${theme} ${profile} ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:width===360?740:844});
  const n=profile==='extreme'?1500:600;
  await mount(page,n,width,theme,'project');
  await expect(page.locator('[data-route]')).toHaveAttribute('data-route-layout','folded');
  const marks=await page.locator('[data-route-mark]').evaluateAll(els=>
   els.map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right}})
    .sort((a,b)=>a.left-b.left));
  expect(marks.length).toBeGreaterThan(2);
  for(let i=1;i<marks.length;i++)
   expect(marks[i].left-marks[i-1].right).toBeGreaterThanOrEqual(7.5);
  for(const label of ['Previous checkpoint','Next checkpoint','Open checkpoint']){
   const rect=await page.getByRole('button',{name:label}).boundingBox();
   expect(rect).not.toBeNull();
   expect(rect!.width).toBeGreaterThanOrEqual(44);
   expect(rect!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(0);
  expect(await page.locator('*').count()).toBeLessThan(1500);
  await page.screenshot({
   path:`test-results/screens/look-3b/${theme}-${profile}-${width}.png`,
   fullPage:true,
  });
 });
}
test('LOOK-3b Today plain Route is one 64px link without rails',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await mount(page,9,390,'graph-night','today');
 await expect(page.locator('[data-route]')).toHaveAttribute('data-route-layout','plain');
 await expect(page.locator('[data-route] a')).toHaveCount(1);
 await expect(page.locator('[data-stage-rail],[data-expanded-stations]')).toHaveCount(0);
 await expect(page.locator('[data-route-stage-boundary]')).toHaveCount(2);
 await page.screenshot({path:'test-results/screens/look-3b/today-plain.png',fullPage:true});
});
