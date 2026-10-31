import {test,expect} from '@playwright/test';

for (const theme of ['graph','graph-night'] as const) {
 for (const width of [360,390] as const) {
  test(`FIX #478 text-only upload does not consume PDF quota in ${theme} ${width}px`,async({page})=>{
   await page.setViewportSize({width,height:844});
   await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
   await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
   await page.goto(`./?demo=1&theme=${theme}#/p/real-analysis?tab=sources`);
   const sources=page.getByRole('region',{name:'Sources'});
   const meter=sources.getByRole('group',{name:'Source storage'});
   await expect(meter).toContainText('At least 0 KB / 1 GB');
   const sourceCount=Number((await meter.locator('span').first().textContent())?.match(/\d+/)?.[0]);
   await sources.locator('input[type=file]').setInputFiles({
    name:'notes.tex',mimeType:'application/x-tex',
    buffer:Buffer.from(String.raw`\documentclass{article}\begin{document}\section{Groups}Text\end{document}`),
   });
   await expect(sources.getByRole('list',{name:'Source upload queue'}).getByLabel('Upload status: ready')).toBeVisible({timeout:30000});
   await expect.poll(async()=>Number((await meter.locator('span').first().textContent())?.match(/\d+/)?.[0])).toBe(sourceCount+1);
   await sources.locator('input[type=file]').setInputFiles({
    name:'outline.md',mimeType:'text/markdown',buffer:Buffer.from('# Outline\n\nText-only Markdown source.'),
   });
   await expect.poll(async()=>Number((await meter.locator('span').first().textContent())?.match(/\d+/)?.[0])).toBe(sourceCount+2);
   await expect(meter).toContainText('At least 0 KB / 1 GB');
   await expect(meter.getByRole('progressbar',{name:'PDF storage used'})).toHaveAttribute('aria-valuetext','At least 0 KB of 1 GB');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
   await page.screenshot({path:`test-results/screens/fix-478-${theme}-${width}.png`,fullPage:true});
  });
 }
}
