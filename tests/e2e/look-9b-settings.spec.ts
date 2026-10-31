import {expect,test} from '@playwright/test';

for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test(`LOOK-9b Settings rows ${profile} ${theme} ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:740});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  await page.goto(`./?demo=${profile}&theme=${theme}#/settings`);
  const appearance=page.getByRole('radiogroup',{name:'Appearance mode'});
  await expect(appearance).toBeVisible();
  await expect(appearance.getByRole('radio')).toHaveCount(3);
  await expect(page.locator('[data-appearance-segmented]')).toHaveCount(1);
  const selected=await appearance.getByRole('radio',{checked:true}).count();
  expect(selected).toBe(1);
  for(const button of await appearance.getByRole('radio').all()){
   const box=await button.boundingBox();
   expect(box?.height).toBeGreaterThanOrEqual(44);
   expect(box?.width).toBeGreaterThanOrEqual(44);
  }

  const address=page.locator('[data-connector-address]');
  await expect(address).toBeVisible();
  await expect(address).toContainText('••••••');
  const wrapping=await address.evaluate(el=>({
   slashes:(el.textContent?.match(/\//g)??[]).length,
   opportunities:el.querySelectorAll('wbr').length,
   wordBreak:getComputedStyle(el).wordBreak,
   overflowWrap:getComputedStyle(el).overflowWrap,
  }));
  expect(wrapping.opportunities).toBe(wrapping.slashes);
  expect(wrapping.wordBreak).toBe('normal');
  expect(wrapping.overflowWrap).toBe('normal');

  const styles=page.getByRole('radiogroup',{name:'Teaching style'});
  await styles.scrollIntoViewIfNeeded();
  await expect(styles).toBeVisible();
  const choices=styles.getByRole('radio');
  expect(await choices.count()).toBeGreaterThan(1);
  expect(await choices.filter({has:page.locator('input')}).count()).toBe(0);
  await expect(styles.getByRole('radio',{checked:true})).toHaveCount(1);
  for(const choice of await choices.all()){
   expect((await choice.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
  const actions=page.locator('[data-settings-actions]');
  await actions.scrollIntoViewIfNeeded();
  await expect(actions.getByRole('button')).toHaveCount(2);
  const signOut=page.getByRole('button',{name:'Sign out'});
  await expect(signOut).toHaveAttribute('data-sign-out','true');
  await expect(signOut).toBeVisible();
  // The destructive action is text outside the bordered paper action list.
  expect(await signOut.evaluate(el=>el.closest('[data-settings-actions]'))).toBeNull();
  const danger=await signOut.evaluate(el=>{
   const sample=document.createElement('span');
   sample.style.color='var(--danger)';
   document.body.appendChild(sample);
   const expected=getComputedStyle(sample).color;
   sample.remove();
   return {actual:getComputedStyle(el).color,expected};
  });
  expect(danger.actual).toBe(danger.expected);
  for(const action of await actions.getByRole('button').all())
   expect((await action.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:`test-results/screens/look-9b-${profile}-${theme}-${width}.png`,fullPage:true});
 });
}

test('LOOK-9b segmented appearance updates one selected option',async({page})=>{
 await page.goto('./?demo=1#/settings');
 const appearance=page.getByRole('radiogroup',{name:'Appearance mode'});
 await appearance.getByRole('radio',{name:/^Night /}).click();
 await expect(appearance.getByRole('radio',{name:/^Night /})).toHaveAttribute('aria-checked','true');
 await expect(page.locator('html')).toHaveAttribute('data-theme','graph-night');
 await appearance.getByRole('radio',{name:/^Day /}).click();
 await expect(appearance.getByRole('radio',{name:/^Day /})).toHaveAttribute('aria-checked','true');
 await expect(page.locator('html')).toHaveAttribute('data-theme','graph');
});

test('LOOK-9b appearance segmented control supports arrow and Home/End navigation',async({page})=>{
 await page.goto('./?demo=1#/settings');
 const group=page.getByRole('radiogroup',{name:'Appearance mode'});
 const options=group.getByRole('radio');
 await options.first().focus();
 await options.first().press('ArrowRight');
 await expect(options.nth(1)).toHaveAttribute('aria-checked','true');
 await expect(options.nth(1)).toBeFocused();
 await options.nth(1).press('End');
 await expect(options.last()).toHaveAttribute('aria-checked','true');
 await expect(options.last()).toBeFocused();
 await options.last().press('ArrowRight');
 await expect(options.first()).toHaveAttribute('aria-checked','true');
 await options.first().press('Home');
 await expect(options.first()).toBeFocused();
 await expect(group.getByRole('radio',{checked:true})).toHaveCount(1);
});

test('LOOK-9b teaching styles are mutually exclusive and selectable',async({page})=>{
 await page.goto('./?demo=1#/settings');
 const styles=page.getByRole('radiogroup',{name:'Teaching style'});
 await expect(styles).toBeVisible();
 const choices=styles.getByRole('radio');
 const first=choices.first(),last=choices.last();
 await first.click();
 await expect(first).toHaveAttribute('aria-checked','true');
 await expect(styles.getByRole('radio',{checked:true})).toHaveCount(1);
 await last.click();
 await expect(last).toHaveAttribute('aria-checked','true');
 await expect(styles.getByRole('radio',{checked:true})).toHaveCount(1);
});
