import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
 await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
 await page.addInitScript(()=>{try{localStorage.removeItem('lemma.atlas.v2')}catch{/* fresh view */}});
 await page.goto('./?demo=1#/atlas');
 await expect(page.getByRole('tree',{name:'Ideas and their links'})).toBeVisible();
});

test('opens as an outline with each field and the path to current work unfolded',async({page})=>{
 await expect(page.locator('[data-level="cluster"]')).toHaveCount(3);
 await expect(page.locator('[data-atlas-details]')).toHaveCount(0);
 await expect(page.locator('[data-atlas-peek]')).toHaveCount(0);
 await expect(page.getByRole('treeitem',{name:/Compactness/}).first()).toBeVisible();
 expect(await page.locator('[data-atlas-wires] [data-arc-kind="prereq"]').count()).toBeGreaterThan(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await page.screenshot({path:'test-results/screens/atlas-tree-overview.png',fullPage:true});
});

test('folding a branch keeps its links by re-attaching them to the branch',async({page})=>{
 const fold=page.getByRole('group',{name:'Fold to depth'});
 await fold.getByRole('button',{name:'1',exact:true}).click();
 await expect(page.getByRole('treeitem')).toHaveCount(3);
 await fold.getByRole('button',{name:'2',exact:true}).click();
 const areas=await page.getByRole('treeitem').count();
 expect(areas).toBeGreaterThan(3);
 // Links between areas of different fields are still drawn while everything inside them is folded.
 expect(await page.locator('[data-atlas-wires] [data-arc-kind="prereq"]').count()).toBeGreaterThan(0);
 await page.getByRole('button',{name:'Unfold Compactness and continuity'}).click();
 expect(await page.getByRole('treeitem').count()).toBeGreaterThan(areas);
 await page.getByRole('button',{name:'Fold Compactness and continuity'}).click();
 await expect(page.getByRole('treeitem')).toHaveCount(areas);
 await fold.getByRole('button',{name:'All'}).click();
 expect(await page.getByRole('treeitem').count()).toBeGreaterThan(40);
 await page.screenshot({path:'test-results/screens/atlas-tree-depth.png',fullPage:true});
});

test('selecting an idea lights the chain it builds on and opens up, then shows details',async({page})=>{
 await page.getByRole('button',{name:'Find an idea'}).click();
 await page.getByRole('textbox',{name:'Find an idea'}).fill('Compactness');
 await page.getByRole('button',{name:/^Compactness, /}).click();
 await expect(page.getByRole('textbox',{name:'Find an idea'})).toHaveCount(0);
 const peek=page.locator('[data-atlas-peek]');
 await expect(peek).toContainText('Compactness');
 await expect(peek).toContainText(/builds on [1-9]/);
 expect(await page.locator('[data-arc-tone="up"]').count()).toBeGreaterThan(0);
 expect(await page.locator('[data-arc-tone="down"]').count()).toBeGreaterThan(0);
 await page.screenshot({path:'test-results/screens/atlas-tree-chain.png',fullPage:true});
 await peek.getByRole('button',{name:'Details'}).click();
 const dialog=page.getByRole('dialog',{name:'Compactness'});
 await expect(dialog).toContainText('Builds on');
 await expect(dialog).toContainText('Opens up');
 await page.screenshot({path:'test-results/screens/atlas-tree-details.png',fullPage:true});
 await dialog.getByRole('link',{name:'Checkpoint CP4'}).click();
 await expect(page).toHaveURL(/#\/p\/real-analysis\/cp\/CP4$/);
});

test('following a link in the details jumps to that idea in the tree',async({page})=>{
 await page.goto('./?demo=1#/atlas?focus=compactness');
 const dialog=page.getByRole('dialog',{name:'Compactness'});
 await expect(dialog).toBeVisible();
 await dialog.locator('h3',{hasText:'Opens up'}).locator('xpath=..').getByRole('button').first().click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 const selected=page.locator('[data-tone="self"]');
 await expect(selected).toHaveCount(1);
 await expect(selected).toBeInViewport();
});

for(const mode of ['graph','graph-night'] as const){
 test('outline in '+mode,async({page})=>{
  await page.goto(`./?demo=1&theme=${mode}#/atlas`);
  await expect(page.locator('[data-level="cluster"]')).toHaveCount(3);
  await page.screenshot({path:`test-results/screens/atlas-tree-${mode}.png`,fullPage:true});
 });
}


for(const theme of ['graph','graph-night'] as const){
 test('ST-3 extreme Atlas windows rows and bounds arcs at 360px in '+theme,async({page})=>{
  await page.setViewportSize({width:360,height:740});
  await page.goto(`./?demo=extreme&theme=${theme}#/atlas`);
  await expect(page.getByRole('tree',{name:'Ideas and their links'})).toBeVisible();
  await page.getByRole('group',{name:'Fold to depth'}).getByRole('button',{name:'All'}).click();
  await expect.poll(()=>page.locator('[data-atlas-row]').count()).toBeLessThan(100);
  expect(await page.locator('[data-atlas-wires] [data-arc-kind]').count()).toBeLessThanOrEqual(60);
  await expect(page.getByRole('status')).toContainText(/links hidden/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.screenshot({path:`test-results/screens/stress/st-3-extreme-${theme}-360.png`});
 });
}
