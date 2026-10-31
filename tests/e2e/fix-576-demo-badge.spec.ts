import {expect,test} from '@playwright/test';
import {mkdirSync} from 'node:fs';

function intersects(a:{x:number;y:number;width:number;height:number},b:{x:number;y:number;width:number;height:number}):boolean{
 return a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
}

for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test(`FIX #576 Demo badge never covers a scrolled checkpoint heading ${profile} ${theme} ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:width===360?740:844});
  await page.goto(`/lemma/?demo=${profile}&theme=${theme}#/p/real-analysis`);
  const badge=page.getByText('Demo',{exact:true});
  await expect(badge).toBeVisible();
  const checkpoint=page.getByRole('article',{name:'Current checkpoint CP4'});
  await expect(checkpoint).toBeAttached();
  const status=checkpoint.getByText(/CP4.*IN PROGRESS/);
  const title=checkpoint.locator('h3');
  await status.evaluate(el=>window.scrollTo(0,window.scrollY+el.getBoundingClientRect().top-12));
  await expect(status).toBeInViewport();
  const [badgeBox,statusBox,titleBox]=await Promise.all([badge.boundingBox(),status.boundingBox(),title.boundingBox()]);
  expect(badgeBox&&statusBox&&titleBox).toBeTruthy();
  expect(intersects(badgeBox!,statusBox!), 'Demo must not cover checkpoint status').toBe(false);
  expect(intersects(badgeBox!,titleBox!), 'Demo must not cover mathematical checkpoint title').toBe(false);
  mkdirSync('test-results/screens/fix-576',{recursive:true});
  await page.screenshot({path:`test-results/screens/fix-576/${profile}-${theme}-${width}.png`});
 });
}
