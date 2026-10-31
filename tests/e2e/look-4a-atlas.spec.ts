import {expect,test} from '@playwright/test';

// LOOK-4a is independently mergeable: Atlas controls and details, without
// changing the link renderer or the virtual row geometry.
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const)
for(const profile of ['stress','extreme'] as const){
 test(`LOOK-4a Atlas controls ${profile} ${theme} ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:740});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  await page.goto(`./?demo=${profile}&theme=${theme}#/atlas`);
  await expect(page.getByRole('tree',{name:'Ideas and their links'})).toBeVisible();
  const toolbar=page.getByRole('toolbar',{name:'Atlas view'});
  for(const name of ['Fields','Areas','Topics','All','Related']){
   const control=toolbar.getByRole('button',{name,exact:true});
   await expect(control).toBeVisible();
   const box=await control.boundingBox();
   expect(box?.height,name+' height').toBeGreaterThanOrEqual(44);
   expect(box?.width,name+' width').toBeGreaterThanOrEqual(44);
  }
  await toolbar.getByRole('button',{name:'Areas'}).click();
  await expect(toolbar.getByRole('button',{name:'Areas'})).toHaveAttribute('aria-pressed','true');
  await toolbar.getByRole('button',{name:'Related'}).click();
  await expect(toolbar.getByRole('button',{name:'Related'})).toHaveAttribute('aria-pressed','true');
  const recheck=toolbar.getByRole('button',{name:/^Re-check \d+$/});
  await expect(recheck).toBeVisible();
  const recheckBox=await recheck.boundingBox();
  expect(recheckBox?.width).toBeGreaterThanOrEqual(44);
  expect(recheckBox?.height).toBeGreaterThanOrEqual(44);
  await recheck.click();
  await expect(recheck).toHaveAttribute('aria-pressed','true');
  await recheck.click();
  await expect(recheck).toHaveAttribute('aria-pressed','false');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:`test-results/screens/look-4a-${profile}-${theme}-${width}.png`});
 });
}

test('LOOK-4a details prioritize quiz and omit redundant level tags',async({page})=>{
 await page.goto('./?demo=1#/atlas?focus=compactness');
 const details=page.getByRole('dialog',{name:'Compactness'});
 await expect(details).toBeVisible();
 await expect(details.getByRole('button',{name:'Quiz me'})).toBeVisible();
 await expect(details.getByRole('link',{name:/Review/})).toBeVisible();
 await expect(details.getByText('Idea',{exact:true})).toHaveCount(0);
 await expect(details.getByText('Detail',{exact:true})).toHaveCount(0);
 await expect(details.getByText(/Builds on · \d+/)).toBeVisible();
});

test('LOOK-4a mathematical breadcrumbs navigate to their ancestor with a 44px target',async({page})=>{
 await page.setViewportSize({width:360,height:740});
 await page.goto('./?demo=1&theme=graph-night#/atlas?focus=compactness');
 const details=page.getByRole('dialog',{name:'Compactness'});
 await expect(details).toBeVisible();
 const crumb=details.locator('[aria-label="Idea path"] button').first();
 await expect(crumb).toBeVisible();
 const box=await crumb.boundingBox();
 expect(box?.height).toBeGreaterThanOrEqual(44);
 expect(box?.width).toBeGreaterThanOrEqual(44);
 await crumb.click();
 await expect(details).toHaveCount(0);
 await expect(page.locator('[data-tone="self"]')).toHaveCount(1);
});
