import {expect,test} from '@playwright/test';
import {DATE,NOW,at} from './v7-scenes';

for(const {width,scale} of [{width:390,scale:160},{width:320,scale:200}]){
 test(`Calendar hour labels and dock destinations fit at ${width}px / ${scale}% text`,async({page})=>{
  await page.setViewportSize({width,height:844});
  await page.clock.setFixedTime(NOW);
  if(width===320){
   await page.goto(at('/'));
   await page.getByRole('button',{name:/^(Start now|Start focus)$/}).first().click();
   await page.getByRole('link',{name:'Minimise'}).click();
  }
  await page.goto(at('/calendar?view=week&date='+DATE).replace('#',',v7Week#'));
  await page.locator('html').evaluate((html,size)=>{html.style.fontSize=size+'%';},scale);

  const grid=page.getByRole('region',{name:'Week time grid'});
  await expect(grid).toBeVisible();
  const suggestions=grid.getByRole('button',{name:/^Add suggested block /});
  await expect(suggestions.first()).toBeVisible();
  const glyphs=await suggestions.evaluateAll(buttons=>buttons.map(button=>{
   const bounds=button.getBoundingClientRect(),glyph=button.querySelector('svg')?.getBoundingClientRect();
   return {height:bounds.height,inside:!!glyph&&glyph.width>0&&glyph.height>0
    &&glyph.left>bounds.left&&glyph.right<bounds.right&&glyph.top>bounds.top&&glyph.bottom<bounds.bottom};
  }));
  expect(glyphs.some(glyph=>glyph.height<=22)).toBe(true);
  expect(glyphs.every(glyph=>glyph.inside)).toBe(true);
  const hours=grid.locator('.v7-wk-gutter time');
  expect(await hours.count()).toBeGreaterThan(10);
  const clippedHours=await hours.evaluateAll(labels=>labels.filter(label=>{
   const bounds=label.closest('.v7-wk-gutter')!.getBoundingClientRect();
   const text=document.createRange();text.selectNodeContents(label);
   return [...text.getClientRects()].some(rect=>rect.left<bounds.left-.5||rect.right>bounds.right+.5);
  }).map(label=>label.textContent));
  expect(clippedHours).toEqual([]);
  const dates=page.getByRole('group',{name:'Week'}).getByRole('button');
  await expect(dates).toHaveCount(7);
  const crowdedDates=await dates.evaluateAll(buttons=>buttons.filter(button=>{
   const bounds=button.getBoundingClientRect();
   const number=button.querySelector('span')!;
   const text=document.createRange();text.selectNodeContents(number);
   const rect=text.getBoundingClientRect();
   return rect.left<bounds.left-.5||rect.right>bounds.right+.5;
  }).map(button=>button.getAttribute('aria-label')));
  expect(crowdedDates).toEqual([]);
  await dates.last().scrollIntoViewIfNeeded();
  await expect(dates.last()).toBeInViewport();

  const nav=page.getByRole('navigation',{name:'Main navigation'});
  await expect(nav.getByRole('link',{name:'Calendar'})).toHaveAttribute('aria-current','page');
  await expect(nav).toHaveAttribute('data-labels','selected');
  await expect(nav.getByRole('link')).toHaveCount(5);
  const geometry=await nav.evaluate(element=>{
   const navBounds=element.getBoundingClientRect();
   const tabs=[...element.querySelectorAll('.v7-tab')];
   const icons=tabs.map(tab=>tab.querySelector('.v7-tab-icon')!.getBoundingClientRect());
   const active=element.querySelector('[aria-current="page"] .v7-tab-label')!;
   const text=document.createRange();text.selectNodeContents(active);
   const label=text.getBoundingClientRect();
   return {
    oneIconRow:new Set(icons.map(icon=>Math.round(icon.top))).size===1,
    touchTargets:tabs.every(tab=>{const box=tab.getBoundingClientRect();return box.width>=44&&box.height>=44;}),
    inactiveLabelsClipped:tabs.filter(tab=>!tab.hasAttribute('aria-current')).every(tab=>getComputedStyle(tab.querySelector('.v7-tab-label')!).clipPath==='inset(50%)'),
    activeLabelFits:label.width>35&&label.left>=navBounds.left-.5&&label.right<=navBounds.right+.5
     &&label.top>=Math.max(...icons.map(icon=>icon.bottom))-.5&&label.bottom<=navBounds.bottom+.5,
   };
  });
  expect(geometry).toEqual({oneIconRow:true,touchTargets:true,inactiveLabelsClipped:true,activeLabelFits:true});
  const capture=page.getByRole('button',{name:'Capture',exact:true});
  if(width===320){
   const session=page.getByRole('button',{name:/^Open focus:/});
   await expect(session).toBeVisible();
   const sessionBox=(await session.boundingBox())!,captureBox=(await capture.boundingBox())!;
   expect(sessionBox.width).toBeGreaterThanOrEqual(44);
   expect(captureBox.width).toBeGreaterThanOrEqual(44);
   expect(sessionBox.x+sessionBox.width).toBeLessThanOrEqual(captureBox.x+.5);
   expect((await nav.boundingBox())!.x+(await nav.boundingBox())!.width).toBeLessThanOrEqual(sessionBox.x+.5);
  }
  await capture.click();
  await expect(page.getByRole('dialog',{name:'Capture'})).toBeVisible();
 });
}
