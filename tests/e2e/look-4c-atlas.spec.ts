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
 expect(bounds?.height).toBe(16);
 const count=page.locator('[data-atlas-bundle-count]').first();
 expect(await count.evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
 const disclosure=page.locator('[data-atlas-overflow-count]');
 await expect(disclosure).toBeVisible();
 expect((await disclosure.boundingBox())?.width).toBeGreaterThanOrEqual(44);
 expect((await disclosure.boundingBox())?.height).toBeGreaterThanOrEqual(44);
});

test('LOOK-4c seven physical lanes disclose an eighth overlapping connection',async({page})=>{
 await page.setViewportSize({width:360,height:740});
 await page.goto('./?demo=stress&atlasDenseLanes=1&theme=graph-night#/atlas');
 await expect(page.getByRole('tree',{name:'Ideas and their links'})).toBeVisible();
 const paths=page.locator('[data-atlas-wires] [data-arc-kind]');
 await expect(paths).toHaveCount(7);
 const xs=await paths.evaluateAll(elements=>elements.map(el=>Number(el.getAttribute('data-atlas-lane'))));
 expect(new Set(xs).size).toBe(7);
 for(const x of xs)expect((74-x)%9).toBe(0);
 const overflow=page.locator('[data-atlas-lane-overflow]');
 const summary=overflow.locator('summary');
 await expect(summary).toBeVisible();
 await expect(summary).toHaveAccessibleName('Show 1 hidden Atlas links');
 expect((await summary.boundingBox())?.height).toBeGreaterThanOrEqual(44);
 await summary.focus();
 await page.keyboard.press('Enter');
 await expect(overflow).toHaveAttribute('open','');
 await expect(overflow.locator('li')).toHaveCount(1);
 await expect(overflow.locator('li')).toContainText('Rows 8–16');
 // Hidden links retain a visible, noninteractive port on both affected rows.
 const ports=page.locator('[data-atlas-hidden-port]');
 await expect(ports).toHaveCount(2);
 await expect(page.locator('[data-atlas-hidden-port="out"]')).toHaveAttribute('data-atlas-row','7');
 await expect(page.locator('[data-atlas-hidden-port="in"]')).toHaveAttribute('data-atlas-row','15');
 for(const port of await ports.all())expect(await port.getAttribute('aria-hidden')).toBeNull();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await page.screenshot({path:'test-results/screens/look-4c-dense-lanes-360.png'});
});
