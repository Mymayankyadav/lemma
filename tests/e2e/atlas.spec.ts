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
  expect(b.left).toBeGreaterThanOrEqual(stage!.x-1);
  expect(b.right).toBeLessThanOrEqual(stage!.x+stage!.width+1);
  expect(b.top).toBeGreaterThanOrEqual(stage!.y-1);
  expect(b.bottom).toBeLessThanOrEqual(stage!.y+stage!.height+1);
 }
 await expect(page.locator('[data-atlas-label]').first()).toBeVisible();
 await page.screenshot({path:'test-results/screens/atlas-cosmos-overview.png',fullPage:true});
});

test('ten zoom-out steps have no artificial lower zoom bound',async({page})=>{
 const camera=page.locator('[data-atlas-camera]');
 const getScale=async()=>Number((await camera.getAttribute('transform'))?.match(/scale\(([^)]+)\)/)?.[1]);
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
 await expect(page.locator('[data-atlas-details]')).toBeVisible();
 await page.getByRole('button',{name:'Close concept details'}).click();
 const hasGalaxies=await page.locator('[data-level="galaxy"]').count()>0;
 if(hasGalaxies){
  await expect(page.locator('[data-level="galaxy"]')).toHaveCount(2);
  await page.locator('[data-level="galaxy"]').first().click();
  await expect(page.locator('[data-level="system"]')).toHaveCount(2);
  await expect(crumb.locator('button')).toHaveCount(3);
  await page.getByRole('button',{name:'Close concept details'}).click();
 }else await expect(page.locator('[data-level="system"]')).not.toHaveCount(0);
 await page.locator('[data-level="system"]').first().click();
 await expect(page.locator('[data-level="planet"]')).not.toHaveCount(0);
 await expect(crumb.locator('button')).toHaveCount(hasGalaxies?4:3);
 await page.screenshot({path:'test-results/screens/atlas-cosmos-system.png',fullPage:true});
 await crumb.getByRole('button',{name:'Universe'}).click();
 await expect(page.locator('[data-level="cluster"]')).toHaveCount(3);
});

test('minimap is isotropic and tracks the true camera viewport within two pixels',async({page})=>{
 const mini=page.locator('[data-minimap="true"]');
 await expect(mini).toBeVisible();
 // Infer the miniature affine transform from corresponding root centres rather than
 // estimating root radii from the adaptive 44px SVG hit-target circles.
 const world=await page.locator('[data-level="cluster"]').evaluateAll(elements=>elements.map(node=>{
  const coords=node.getAttribute('transform')!.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi)!.map(Number);
  return {x:coords[0],y:coords[1]};
 }));
 const dots=await mini.locator('svg circle').evaluateAll(elements=>elements.map(c=>({
  x:Number(c.getAttribute('cx')),y:Number(c.getAttribute('cy'))
 })));
 expect(world.length).toBe(3);
 expect(dots.length).toBe(3);
 const projection=(()=>{
  const dx=world[1].x-world[0].x,dy=world[1].y-world[0].y;
  const mx=dots[1].x-dots[0].x,my=dots[1].y-dots[0].y;
  const k=(mx*dx+my*dy)/(dx*dx+dy*dy);
  return {k,x:dots[0].x-world[0].x*k,y:dots[0].y-world[0].y*k};
 })();
 expect(projection.k).toBeGreaterThan(0);
 for(let i=0;i<world.length;i++){
  expect(Math.abs(dots[i].x-(projection.x+world[i].x*projection.k))).toBeLessThan(.05);
  expect(Math.abs(dots[i].y-(projection.y+world[i].y*projection.k))).toBeLessThan(.05);
 }
 const before=await page.locator('[data-atlas-camera]').getAttribute('transform');
 await mini.click({position:{x:70,y:32}});
 await expect.poll(()=>page.locator('[data-atlas-camera]').getAttribute('transform')).not.toBe(before);
 const difference=await page.evaluate(p=>{
  const stage=document.querySelector('[data-atlas-stage]')!.getBoundingClientRect();
  const camera=document.querySelector('[data-atlas-camera]')!.getAttribute('transform')!;
  const [x,y,k]=camera.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi)!.map(Number);
  const expected={x:p.x-x/k*p.k,y:p.y-y/k*p.k,width:stage.width/k*p.k,height:stage.height/k*p.k};
  const viewport=document.querySelector('[data-minimap-viewport]')!;
  const actual={x:Number(viewport.getAttribute('x')),y:Number(viewport.getAttribute('y')),
   width:Number(viewport.getAttribute('width')),height:Number(viewport.getAttribute('height'))};
  return Object.fromEntries((['x','y','width','height'] as const).map(key=>[key,Math.abs(expected[key]-actual[key])]));
 },projection);
 for(const key of ['x','y','width','height'])expect(difference[key],key+': '+JSON.stringify(difference)).toBeLessThan(2);
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
 await expect(page.getByRole('link',{name:/Checkpoint CP4/})).toHaveAttribute('href',new RegExp('p/real-analysis/cp/CP4$'));
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

for(const world of ['graph','graph-night'] as const){
 test('QA-2 Atlas cluster labels are unobstructed by controls in '+world,async({page})=>{
  await page.goto('./?demo=1&theme='+world+'#/atlas');
  const label=page.locator('[data-atlas-label]').filter({hasText:'Topology'}).first();
  const minimap=page.locator('[data-minimap="true"]');
  const zoom=page.getByRole('button',{name:'Zoom in'}).locator('..');
  await expect(label).toBeVisible();
  await expect(minimap).toBeVisible();
  const [textRect,mapRect,zoomRect]=await Promise.all([label.boundingBox(),minimap.boundingBox(),zoom.boundingBox()]);
  for(const rect of [mapRect,zoomRect]){
   expect(rect).not.toBeNull();
   const horizontal=Math.min(textRect!.x+textRect!.width,rect!.x+rect!.width)-Math.max(textRect!.x,rect!.x);
   const vertical=Math.min(textRect!.y+textRect!.height,rect!.y+rect!.height)-Math.max(textRect!.y,rect!.y);
   expect(horizontal<=0||vertical<=0,'Atlas control obscures Topology label').toBe(true);
  }
  await page.screenshot({path:'test-results/screens/qa2-atlas-label-'+world+'.png',fullPage:true});
 });
}
