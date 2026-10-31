import {test,expect} from '@playwright/test';

// Exercise the actual Sources tab with a 342-page PDF without loading/rendering
// the entire transcription at once. Both graph themes and phone widths.
for(const theme of ['graph','graph-night'] as const)
for(const [width,height] of [[390,844],[360,740]] as const){
 test('UI-8 source pages are paginated '+theme+' '+width+'px',async({page})=>{
  await page.setViewportSize({width,height});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('./?demo=1&theme='+theme+'#/p/real-analysis?tab=sources');
  const sources=page.getByRole('region',{name:'Sources'});
  await expect(sources).toBeVisible();
  await expect(sources.getByText('Principles of Mathematical Analysis')).toBeVisible();
  await sources.getByRole('button',{name:'View pages'}).first().click();
  const viewer=page.getByRole('region',{name:'Page transcription for Principles of Mathematical Analysis'});
  await expect(viewer).toBeVisible();
  const pageNumber=viewer.getByRole('spinbutton',{name:'PDF page number'});
  await expect(pageNumber).toHaveValue('1');
  await expect(viewer).toContainText('of 342');
  await expect(viewer).toContainText('Demo source page 1.');
  await viewer.getByRole('button',{name:'Next PDF page'}).click();
  await expect(pageNumber).toHaveValue('2');
  await expect(viewer).toContainText('Demo source page 2.');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:'test-results/screens/ui8-'+theme+'-'+width+'.png'});
  expect(errors).toEqual([]);
 });
}
