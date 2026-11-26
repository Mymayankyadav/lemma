import {test, expect} from '@playwright/test';

for (const width of [390, 1280]) {
  test(`paper grid is painted in both themes without moving the shell at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 844});
    await page.clock.setFixedTime(new Date('2026-11-09T08:13:00Z'));
    let dayGeometry: unknown;
    for (const mode of ['day', 'night']) {
      await page.goto(`/lemma/?demo=1&flags=v7Shell,v6Shell&mode=${mode}#/projects`);
      await expect(page.getByRole('heading', {name: 'Paths', exact: true})).toBeVisible();
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      const paint = await page.evaluate(() => {
        const body = getComputedStyle(document.body);
        const shell = getComputedStyle(document.querySelector('.v7-shell')!);
        return {background: body.backgroundColor, image: body.backgroundImage, size: body.backgroundSize, shell: shell.backgroundColor};
      });
      expect(paint.background).toBe(mode === 'day' ? 'rgb(250, 249, 245)' : 'rgb(38, 38, 36)');
      // Before the fix, Night forced background-image:none and the opaque shell hid the paper.
      expect(paint.image).toContain('linear-gradient');
      expect(paint.image).toContain(mode === 'day' ? 'rgb(232, 230, 220)' : 'rgb(61, 61, 58)');
      expect(paint.size.split(', ')).toEqual(['24px 24px', '24px 24px']);
      expect(paint.shell).toBe('rgba(0, 0, 0, 0)');
      const geometry = await page.locator('.v7-shell, .v7-page, .v7-dock, .v7-hub-title').evaluateAll(nodes => nodes.map(node => {
        const {x, y, width, height} = node.getBoundingClientRect();
        return {x, y, width, height};
      }));
      if (mode === 'day') dayGeometry = geometry;
      else expect(geometry).toEqual(dayGeometry);
    }
    await page.evaluate(() => document.documentElement.setAttribute('data-v7-reduce-effects', ''));
    await expect(page.locator('body')).toHaveCSS('background-image', 'none');
  });
}

test('Day and Night controls and skeletons use visible roles on the kit surfaces', async({page})=>{
 await page.goto('/lemma/?demo=1&flags=v7Shell#/kit');
 const controls=page.getByRole('region',{name:'Components and states'});
 const secondary=controls.getByRole('button',{name:'Preview',exact:true});
 await expect(secondary).toHaveCount(2);
 const outline=await secondary.evaluateAll(buttons=>buttons.map(button=>{
  const style=getComputedStyle(button);
  return {width:style.borderTopWidth,edge:style.borderTopColor,fill:style.backgroundColor};
 }));
 expect(outline).toEqual([
  {width:'1px',edge:'rgb(115, 114, 108)',fill:'rgb(255, 255, 255)'},
  {width:'1px',edge:'rgb(156, 154, 146)',fill:'rgb(48, 48, 46)'},
 ]);
 const skeleton=page.getByRole('region',{name:'Patterns'}).getByLabel('Loading content').locator('span:first-child');
 await expect(skeleton).toHaveCount(2);
 await expect(skeleton.nth(0)).toHaveCSS('background-color','rgb(232, 230, 220)');
 await expect(skeleton.nth(1)).toHaveCSS('background-color','rgb(69, 69, 63)');
});

test('legacy variables used by v7 surfaces resolve at the document root', async({page})=>{
 for(const mode of ['day','night']){
  await page.goto('/lemma/?demo=1&flags=v7Shell&mode='+mode+'#/settings');
  await expect(page.getByRole('heading',{name:'Settings',exact:true})).toBeVisible();
  const values=await page.locator('html[data-v7]').evaluate(root=>{
   const style=getComputedStyle(root);
   const read=(name:string)=>style.getPropertyValue('--'+name).trim();
   return Object.fromEntries(['line','hair','paper','card','paper-2','link','late','page','active','edge-2','control-edge','e-float','e-card','e-slab','blur-glass'].map(name=>[name,read(name)]));
  });
  for(const value of Object.values(values))expect(value).not.toBe('');
  expect(values.line).toBe(values.hair);
  expect(values.paper).toBe(values.card);
  expect(values['edge-2']).toBe(values['control-edge']);
  expect(values['e-float']).toBe(values['e-card']);
  expect(values['blur-glass']).toBe('none');
 }
});
