import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';

const subjects=[
 {title:'Real Analysis',light:{stroke:'rgb(51, 113, 162)',tile:'rgb(230, 242, 253)'},dark:{stroke:'rgb(128, 180, 225)',tile:'rgb(50, 60, 68)'}},
 {title:'Linear Algebra',light:{stroke:'rgb(134, 102, 23)',tile:'rgb(246, 239, 225)'},dark:{stroke:'rgb(199, 170, 110)',tile:'rgb(63, 58, 47)'}},
 {title:'Topology',light:{stroke:'rgb(0, 126, 115)',tile:'rgb(226, 245, 242)'},dark:{stroke:'rgb(106, 192, 181)',tile:'rgb(47, 62, 60)'}},
];

for(const width of [390,1280])for(const mode of ['light','dark'] as const){
 test(`subject chips, single-line emblems and progress use the supplied ${mode} palette at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.clock.setFixedTime(new Date('2026-11-09T08:13:00Z'));
  await page.goto(`/lemma/?demo=1&flags=v7Shell,v6Shell&mode=${mode==='light'?'day':'night'}#/projects`);
  await expect(page.locator('.v7-paths-card')).toHaveCount(3);
  await page.evaluate(()=>document.fonts.ready);
  for(const subject of subjects){
   const card=page.locator('.v7-paths-card').filter({has:page.getByRole('link',{name:subject.title,exact:true})});
   const tile=card.locator('.v7-paths-cover'),emblem=tile.locator('.v7-emblem');
   await expect(tile).toHaveCSS('width','72px');await expect(tile).toHaveCSS('height','72px');
   await expect(tile).toHaveCSS('border-radius','10px');await expect(tile).toHaveCSS('background-color',subject[mode].tile);
   await expect(emblem).toHaveCSS('color',subject[mode].stroke);await expect(emblem).toHaveAttribute('viewBox','0 0 64 64');
   expect(await emblem.locator('path').evaluateAll(paths=>paths.every(p=>p.getAttribute('stroke-width')==='1.75'))).toBe(true);
   expect(await emblem.locator('path:not(.v7-emblem-focal)').evaluateAll(paths=>paths.every(p=>p.getAttribute('opacity')==='0.5'))).toBe(true);
   if(subject.title==='Topology')await expect(emblem.locator('path')).toHaveCount(1);
   await expect(card.locator('.v7-paths-subject .v7-subject-mark')).toHaveCSS('color',subject[mode].stroke);
   await expect(card.locator('[role="meter"]')).toHaveCSS('background-color',mode==='light'?'rgb(232, 230, 220)':'rgb(69, 69, 63)');
   await expect(card.locator('[role="meter"] > span')).toHaveCSS('background-color',subject[mode].stroke);
   await expect(card.locator('.v7-paths-due')).toHaveCSS('color',mode==='light'?'rgb(20, 20, 19)':'rgb(250, 249, 245)');
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
}

test('standalone token HTML switches themes and exports both modes for review',async({page})=>{
 await page.goto('/lemma/ui-tokens.html');
 await expect(page.getByText('Review draft · awaiting approval')).toBeVisible();
 for(const mode of ['light','dark'] as const){
  await page.getByRole('button',{name:mode==='light'?'Light':'Dark',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme',mode);
  await expect(page.locator('[data-value="progress-track"]')).toHaveText(mode==='light'?'#e8e6dc':'#45453f');
  await expect(page.locator('[data-subject-value="ochre:stroke"]')).toHaveText(mode==='light'?'#866617':'#c7aa6e');
  await expect(page.locator('[data-pass]')).toHaveText(['AA','AA','AA','AA']);
 }
 const cssDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Download CSS',exact:true}).click();
 const css=readFileSync((await (await cssDownload).path())!,'utf8');
 expect(css).toContain('--subject-ochre-stroke: #c7aa6e');expect(css).toContain('--subject-sky-stroke: #3371a2');
 const jsonDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Download JSON',exact:true}).click();
 const json=JSON.parse(readFileSync((await (await jsonDownload).path())!,'utf8'));
 expect(json.reviewStatus).toBe('Awaiting owner approval');expect(json.emblem.tileSizePx).toBe(72);
 expect(json.subjectPalette.assignments).toEqual({'real-analysis':'sky','linear-algebra':'ochre',topology:'teal'});
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
