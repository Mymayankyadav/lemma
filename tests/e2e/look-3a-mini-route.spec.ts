import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {ProjectSummary} from '../../src/data/types';
import {MiniStageBar,miniRouteNotch,currentMiniRouteOrdinal} from '../../src/ui/timeline/MiniStageBar';
import {layoutMiniRoute} from '../../src/ui/timeline/miniRoute';

for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const [width,height] of [[390,844],[360,740]] as const){
 test('LOOK-3a mini Route stays one readable bar: '+profile+' '+theme+' '+width,async({page},testInfo)=>{
  test.setTimeout(120_000);
  await page.setViewportSize({width,height});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#/projects',{waitUntil:'domcontentloaded',timeout:90_000});
  await expect(page.getByRole('heading',{name:'Paths',level:1})).toBeVisible({timeout:90_000});
  await expect(page.locator('[data-mini-route]').first()).toBeVisible({timeout:90_000});
  await expect.poll(async()=>page.locator('[data-mini-route]').first().evaluate(bar=>{
   const segments=[...bar.querySelectorAll('[data-stage-segment]')];
   return segments.length>0&&segments.every(segment=>segment.getBoundingClientRect().width>=7.99);
  }),{timeout:15_000}).toBe(true);
  const metrics=await page.locator('[data-mini-route]').evaluateAll(bars=>bars.filter(bar=>{
   const r=bar.getBoundingClientRect();return r.width>0&&r.height>0;
  }).map(bar=>{
   const segments=[...bar.querySelectorAll('[data-stage-segment]')];
   const track=bar.querySelector('[data-stage-bar]')!;
   const notches=[...bar.querySelectorAll('[data-route-notch]')];
   const notch=notches[0]?.getBoundingClientRect();
   const trackRect=track.getBoundingClientRect();
   return {
    width:track.getBoundingClientRect().width,
    totalWidth:segments.reduce((sum,segment)=>sum+segment.getBoundingClientRect().width,0),
    minWidth:Math.min(...segments.map(segment=>segment.getBoundingClientRect().width)),
    count:segments.length,
    ticks:bar.querySelectorAll('[data-mini-tick]').length,
    extraMarks:[...bar.children].filter(child=>child!==track).length,
    notchCount:notches.length,
    notchWidth:notch?.width??0,notchHeight:notch?.height??0,
    notchLeft:notch?notch.left-trackRect.left:0,
    notchRight:notch?trackRect.right-notch.right:0,
    notchColor:notches[0]?getComputedStyle(notches[0]).backgroundColor:'',
    barColor:getComputedStyle(track).backgroundColor,
   };
  }));
  expect(metrics.length).toBeGreaterThan(0);
  for(const m of metrics){
   expect(m.minWidth,'stage capsule minimum width').toBeGreaterThanOrEqual(7.99);
   expect(m.totalWidth,'all groups fit on one bar').toBeLessThanOrEqual(m.width+1);
   expect(m.ticks,'no individual checkpoint ticks').toBe(0);
   expect(m.extraMarks,'exactly one current notch outside bar').toBe(1);
   expect(m.notchCount,'one current-position notch').toBe(1);
   expect(m.notchWidth).toBeCloseTo(2,0);
   expect(m.notchHeight).toBeCloseTo(12,0);
   expect(m.notchColor).not.toBe(m.barColor);
   expect((m.notchLeft>=7.99&&m.notchRight>=7.99)||
    (m.notchLeft>=-0.1&&m.notchLeft<=0.1)||
    (m.notchRight>=-0.1&&m.notchRight<=0.1)).toBe(true);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  mkdirSync('test-results/screens/look-3a',{recursive:true});
  const path='test-results/screens/look-3a/paths-'+profile+'-'+theme+'-'+width+'.png';
  await page.screenshot({path});
  await testInfo.attach('mini-route-geometry',{body:JSON.stringify(metrics,null,2),contentType:'application/json'});
  // Real S/X Paths plus an explicit out-of-order/recheck fixture. Completion
  // fill must not move the red "you are here" notch away from CP9.
  const uneven=[
   {label:'S1',firstCode:'CP1',lastCode:'CP2',total:2,done:2,overdue:0,schedule:'complete' as const},
   {label:'S2',firstCode:'CP3',lastCode:'CP10',total:8,done:1,overdue:0,schedule:'dated' as const},
   {label:'S3',firstCode:'CP11',lastCode:'CP36',total:26,done:0,overdue:0,schedule:'unscheduled' as const},
  ];
  const done=profile==='extreme'?36:3;
  const synthetic={total:36,done,stageProgress:uneven,
   current:{code:'CP9',title:'Recheck',step:1,stepsTotal:1},
  } as ProjectSummary;
  const markup=renderToStaticMarkup(createElement(MiniStageBar,{project:synthetic}));
  await page.evaluate(html=>{
   const host=document.createElement('div');
   host.setAttribute('data-current-audit','');
   host.style.cssText='position:fixed;top:190px;left:16px;width:200px;display:flex;z-index:10000;background:var(--paper)';
   host.innerHTML=html;document.body.appendChild(host);
  },markup);
  const mismatch=page.locator('[data-current-audit] [data-mini-route]');
  await expect(mismatch.locator('[data-route-notch]')).toHaveCount(1);
  const notchX=Number(await mismatch.locator('[data-route-notch]').getAttribute('data-notch-x'));
  const groups=layoutMiniRoute(uneven,200);
  const expected=miniRouteNotch(currentMiniRouteOrdinal('CP9',uneven,done),36,200,groups)!.x;
  const completed=miniRouteNotch(done>=36?36:done+.5,36,200,groups)!.x;
  expect(notchX).toBeCloseTo(expected,1);
  expect(notchX).toBeCloseTo(56.0556,1);
  expect(Math.abs(notchX-completed)).toBeGreaterThan(20);
  const notchBox=await mismatch.locator('[data-route-notch]').boundingBox();
  expect(notchBox?.width).toBeCloseTo(2,0);
  expect(notchBox?.height).toBeCloseTo(12,0);
  await page.screenshot({path:'test-results/screens/look-3a/current-'+profile+'-'+theme+'-'+width+'.png'});

 });
}
