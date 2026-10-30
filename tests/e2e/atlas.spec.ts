import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
 await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
 await page.goto('./?demo=1#/atlas');
 await expect(page.getByRole('group',{name:'Interactive knowledge cosmos'})).toBeVisible();
});

test('opening shows only fully fitted clusters, not a wall of links or a sheet',async({page})=>{
 await expect(page.locator('[data-level="cluster"]')).toHaveCount(3);
 await expect(page.locator('[data-atlas-details]')).toHaveCount(0);
 await expect(page.getByRole('group',{name:'Atlas view'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Branches'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Revisit'})).toHaveCount(0);
 await expect(page.locator('svg [data-selected-link]')).toHaveCount(0);
 const bounds=await page.locator('[data-level="cluster"]').evaluateAll(nodes=>nodes.map(node=>{
  const mark=node as SVGGraphicsElement,rect=mark.getBoundingClientRect();return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom}
 }));
 const stage=await page.locator('[data-atlas-stage]').boundingBox();
 expect(stage).not.toBeNull();
 for(const b of bounds){
  expect(b.left).toBeGreaterThanOrEqual(stage!.left-1);
  expect(b.right).toBeLessThanOrEqual(stage!.x+stage!.width+1);
  expect(b.top).toBeGreaterThanOrEqual(stage!.top-1);
  expect(b.bottom).toBeLessThanOrEqual(stage!.y+stage!.height+1);
 }
 await expect(page.locator('[data-atlas-label="atlas:cluster:subject-analysis"]')).toBeVisible();
 await page.screenshot({path:'test-results/screens/atlas-cosmos-overview.png',fullPage:true});
});

test('ten zoom-out steps have no artificial lower zoom bound',async({page})=>{
 const camera=page.locator('[data-atlas-camera]');
 const getScale=async()=>Number((await camera.getAttribute('transform'))?.match(/scale\\(([^)]+)\\)/)?.[1]);
 let previous=await getScale();
 expect(previous).toBeGreaterThan(0);
 for(let i=0;i<10;i++){
  await page.getByRole('button',{name:'Zoom out'}).click();
  const next=await getScale();
  expect(next).toBeLessThan(previous*0.99);
  previous=next;
 }
 await page.getByRole('button',{name:'Fit graph'}).click();
 expect(await getScale()).toBeGreaterThan(previous*10);
});

test('cluster, galaxy and system drilldown updates breadcrumbs and labelled children',async({page})=>{
 const cluster=page.locator('[data-level="cluster"]').first();
 await cluster.click();
 const crumb=page.getByRole('navigation',{name:'Atlas breadcrumb'});
 await expect(crumb).toContainText('Universe');
 await expect(page.locator('[data-level="galaxy"]')).toHaveCount(2);
 await expect(page.locator('[data-atlas-details]')).toBeVisible();
 await page.getByRole('button',{name:'Close concept details'}).click();
 await page.locator('[data-level="galaxy"]').first().click();
 await expect(page.locator('[data-level="system"]')).toHaveCount(2);
 await expect(crumb.locator('button')).toHaveCount(3);
 await page.getByRole('button',{name:'Close concept details'}).click();
 await page.locator('[data-level="system"]').first().click();
 await expect(page.locator('[data-level="planet"]')).not.toHaveCount(0);
 await expect(crumb.locator('button')).toHaveCount(4);
 await page.screenshot({path:'test-results/screens/atlas-cosmos-system.png',fullPage:true});
 await crumb.getByRole('button',{name:'Universe'}).click();
 await expect(page.locator('[data-level="cluster"]')).toHaveCount(3);
});

test('minimap uses a single scale and the true viewport rectangle',async({page})=>{
 const mini=page.locator('[data-minimap="true"]');
 await expect(mini).toBeVisible();
 const before=await page.locator('[data-atlas-camera]').getAttribute('transform');
 await mini.click({position:{x:70,y:32}});
 await expect.poll(()=>page.locator('[data-atlas-camera]').getAttribute('transform')).not.toBe(before);
 const result=await page.evaluate(()=>{
  const stage=document.querySelector('[data-atlas-stage]')!.getBoundingClientRect();
  const camera=document.querySelector('[data-atlas-camera]')!.getAttribute('transform')!;
  const [x,y,k]=camera.match(/-?\\d+(?:\\.\\d+)?(?:e[-+]?\\d+)?/gi)!.map(Number);
  const nodes=[...document.querySelectorAll('[data-level="cluster"]')].map(node=>{
   const circle=node.querySelector('circle')!,r=Number(circle.getAttribute('r'));
   const t=node.getAttribute('transform')!.match(/-?\\d+(?:\\.\\d+)?/g)!.map(Number);
   return {x:t[0],y:t[1],r};
  });
  const minX=Math.min(...nodes.map(n=>n.x-n.r))-12,maxX=Math.max(...nodes.map(n=>n.x+n.r))+12;
  const minY=Math.min(...nodes.map(n=>n.y-n.r))-12,maxY=Math.max(...nodes.map(n=>n.y+n.r))+12;
  const mk=Math.min(86/(maxX-minX),86/(maxY-minY));
  const mx=48-(minX+maxX)/2*mk,my=48-(minY+maxY)/2*mk;
  const viewport=document.querySelector('[data-minimap-viewport]')!;
  const expected={x:mx-x/k*mk,y:my-y/k*mk,width:stage.width/k*mk,height:stage.height/k*mk};
  const actual={x:Number(viewport.getAttribute('x')),y:Number(viewport.getAttribute('y')),
   width:Number(viewport.getAttribute('width')),height:Number(viewport.getAttribute('height'))};
  return {expected,actual};
 });
 for(const key of ['x','y','width','height'] as const)expect(Math.abs(result.expected[key]-result.actual[key])).toBeLessThan(2);
 await page.screenshot({path:'test-results/screens/atlas-cosmos-minimap.png',fullPage:true});
});

test('search, details and connection jumps work without test subjects',async({page})=>{
 await expect(page.getByText(/zz-selftest/i)).toHaveCount(0);
 await page.getByRole('button',{name:'Atlas menu'}).click();
 await expect(page.getByRole('button',{name:'Revisit'})).toBeVisible();
 await page.getByRole('button',{name:'Revisit'}).click();
 await page.getByRole('button',{name:'Find an idea'}).click();
 const input=page.getByRole('textbox',{name:'Find an idea'});
 await input.fill('Compactness');
 await page.getByRole('button',{name:/Compactness/}).first().click();
 await expect(page.getByRole('heading',{name:'Compactness'})).toBeVisible();
 await expect(page).toHaveURL(/focus=compactness/);
 await expect(page.locator('[data-atlas-details]')).toBeVisible();
 await expect(page.getByRole('link',{name:/Checkpoint CP4/})).toHaveAttribute('href',/#\\/p\\/real-analysis\\/cp\\/CP4/);
 await page.getByRole('button',{name:'Close concept details'}).click();
 await expect(page.locator('[data-atlas-details]')).toHaveCount(0);
 await expect(page).not.toHaveURL(/focus=compactness/);
});

test('narrow day and night screenshots do not overflow the document',async({page})=>{
 for(const mode of ['graph','graph-night']){
  await page.goto(`./?demo=1&theme=${mode}#/atlas`);
  await expect(page.locator('[data-level="cluster"]')).toHaveCount(3);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({path:`test-results/screens/atlas-cosmos-${mode}.png`,fullPage:true});
 }
});
