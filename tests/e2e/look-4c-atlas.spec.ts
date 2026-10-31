import {expect,test} from '@playwright/test';

for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test(`LOOK-4c Atlas lane budget ${profile} ${theme} ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:740});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  await page.goto(`./?demo=${profile}&theme=${theme}#/atlas`);
  await expect(page.getByRole('tree',{name:'Ideas and their links'})).toBeVisible();
  const arcs=page.locator('[data-atlas-wires] [data-arc-kind]');
  expect(await arcs.count()).toBeLessThanOrEqual(60);
  for(const path of await arcs.locator('path').all()){
   const d=await path.getAttribute('d');
   expect(d).toContain(' Q');
   expect(d).not.toContain(' C');
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:`test-results/screens/look-4c-${profile}-${theme}-${width}.png`});
 });
}

test('LOOK-4c dense bundle pills are 16px high and preserve the 44px overflow disclosure',async({page})=>{
 await page.setViewportSize({width:360,height:740});
 await page.goto('./?demo=stress&atlasDenseFixture=1&theme=graph-night#/atlas');
 const supplier=page.locator('[data-atlas-supplier-dot]').first();
 await expect(supplier).toHaveAttribute('r','1.2');
 const pill=page.locator('[data-atlas-bundle-pill]').first();
 await expect(pill).toBeVisible();
 const bounds=await pill.boundingBox();
 // SVG stroke is part of the painted footprint. A 16px-high rect
 // with a 1px stroke paints 17px; the visible pill must be 16px high.
 // Its width may grow with digit count, but stays inside its reserved radius.
 expect(bounds?.height).toBe(16);
 expect(bounds?.width).toBeGreaterThanOrEqual(16);
 expect(bounds?.width).toBeLessThanOrEqual(23);
 const count=page.locator('[data-atlas-bundle-count]').first();
 expect(await count.evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
 const disclosure=page.locator('[data-atlas-overflow-count]');
 await expect(disclosure).toBeVisible();
 expect((await disclosure.boundingBox())?.width).toBeGreaterThanOrEqual(44);
 expect((await disclosure.boundingBox())?.height).toBeGreaterThanOrEqual(44);
});

test('LOOK-4c eight physical lanes disclose a ninth overlapping connection',async({page})=>{
 await page.setViewportSize({width:360,height:740});
 await page.goto('./?demo=stress&atlasDenseLanes=1&theme=graph-night#/atlas');
 await expect(page.getByRole('tree',{name:'Ideas and their links'})).toBeVisible();
 const paths=page.locator('[data-atlas-wires] [data-arc-kind]');
 await expect(paths).toHaveCount(8);
 const xs=await paths.evaluateAll(elements=>elements.map(el=>Number(el.getAttribute('data-atlas-lane'))));
 expect(new Set(xs).size).toBe(8);
 for(const x of xs)expect((83-x)%9).toBe(0);
 const overflow=page.locator('[data-atlas-lane-overflow]');
 const summary=overflow.locator('summary');
 await expect(summary).toBeVisible();
 await expect(summary).toHaveAccessibleName('Show 1 hidden Atlas links');
 expect((await summary.boundingBox())?.height).toBeGreaterThanOrEqual(44);
 await summary.focus();
 await page.keyboard.press('Enter');
 await expect(overflow).toHaveAttribute('open','');
 await expect(overflow.locator('li')).toHaveCount(1);
 await expect(overflow.locator('li')).toContainText('Rows 9–18');
 // Hidden links retain a visible, noninteractive port on both affected rows.
 const ports=page.locator('[data-atlas-hidden-port]');
 await expect(ports).toHaveCount(2);
 await expect(page.locator('[data-atlas-hidden-port="out"]')).toHaveAttribute('data-atlas-row','8');
 await expect(page.locator('[data-atlas-hidden-port="in"]')).toHaveAttribute('data-atlas-row','17');
 for(const port of await ports.all())expect(await port.getAttribute('aria-hidden')).toBeNull();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await page.screenshot({path:'test-results/screens/look-4c-dense-lanes-360.png'});
});

for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test(`LOOK-4c suppressed ports remain visible ${profile} ${theme} ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:740});
  await page.goto(`./?demo=${profile}&atlasDenseLanes=1&theme=${theme}#/atlas`);
  const tree=page.getByRole('tree',{name:'Ideas and their links'});
  await expect(tree).toBeVisible();
  await expect(page.locator('[data-atlas-wires] [data-arc-kind]')).toHaveCount(8);
  // Nine-pixel center spacing only satisfies the strict 8px *painted-edge*
  // clearance when each stroke is no wider than one CSS pixel.
  const strokes=await page.locator('[data-atlas-wires] [data-arc-kind]').evaluateAll(elements=>elements.map(el=>({
   x:Number(el.getAttribute('data-atlas-lane')),
   width:parseFloat(getComputedStyle(el.querySelector('path')!).strokeWidth),
  })));
  for(let i=0;i<strokes.length;i++)for(let j=i+1;j<strokes.length;j++)
   expect(Math.abs(strokes[i].x-strokes[j].x)-(strokes[i].width+strokes[j].width)/2)
    .toBeGreaterThanOrEqual(8);
  const ports=page.locator('[data-atlas-hidden-port]');
  await expect(ports).toHaveCount(2);
  await expect(page.locator('[data-atlas-hidden-port="out"]')).toHaveAttribute('data-atlas-row','8');
  await expect(page.locator('[data-atlas-hidden-port="in"]')).toHaveAttribute('data-atlas-row','17');
  const disclosure=page.locator('[data-atlas-lane-overflow] summary');
  await expect(disclosure).toHaveAccessibleName('Show 1 hidden Atlas links');
  expect((await disclosure.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:`test-results/screens/look-4c-hidden-ports-${profile}-${theme}-${width}.png`});
  await page.goto(`./?demo=${profile}&atlasDenseLanes=1&atlasDenseLanesFocus=1&theme=${theme}#/atlas`);
  const selected=page.locator('[data-atlas-wires] [data-arc-tone="up"]');
  await expect(selected).toHaveCount(1);
  await expect(selected).toHaveAttribute('data-atlas-lane','83');
  expect(await selected.locator('path').evaluate(el=>parseFloat(getComputedStyle(el).strokeWidth))).toBeLessThanOrEqual(1);
  await expect(page.locator('[data-atlas-lane-overflow] summary')).toHaveAccessibleName('Show 1 hidden Atlas links');
  await page.screenshot({path:`test-results/screens/look-4c-selected-priority-${profile}-${theme}-${width}.png`});
 });
}
