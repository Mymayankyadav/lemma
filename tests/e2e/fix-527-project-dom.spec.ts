import {test,expect} from '@playwright/test';

// FIX #527: 60 projects spread across many subjects used to mount every row
// simultaneously. The New project sheet mounts Paths behind an inert overlay,
// so both routes must obey the same hard DOM budget without hiding projects.
for(const theme of ['graph','graph-night'] as const)
for(const [width,height] of [[390,844],[360,740]] as const){
 test('FIX #527 bounded Paths and New project at extreme '+theme+' '+width,async({page})=>{
  test.setTimeout(120_000);
  await page.setViewportSize({width,height});
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',r=>r.fulfill({body:''}));
  await page.goto('/lemma/?demo=extreme&theme='+theme+'#/projects',{waitUntil:'domcontentloaded',timeout:90_000});
  await expect(page.getByRole('heading',{name:'Paths',level:1})).toBeVisible({timeout:90_000});
  await expect(page.locator('[data-project-row]').first()).toBeVisible({timeout:90_000});
  const count=()=>page.evaluate(()=>document.querySelectorAll('*').length);
  expect(await count(),'Paths 1,500-node budget').toBeLessThan(1500);
  await expect(page.getByRole('button',{name:/Show next .* projects/i})).toBeVisible();
  // Progressive disclosure must not accumulate all 60 mounted cards.
  // Every page, not just the first, must obey the same hard budget.
  for(let next=0;next<2;next++){
   await page.getByRole('button',{name:/Show next .* projects/i}).click();
   expect(await count(),'Paged Paths DOM budget').toBeLessThan(1500);
  }
  // Search must reach a project beyond the first page, without showing all 60.
  await page.getByRole('searchbox',{name:'Search paths'}).fill('Mathematics project 60');
  await expect(page.locator('[data-project-row="stress-project-59"]')).toBeVisible();
  expect(await count(),'Filtered Paths DOM budget').toBeLessThan(1500);
  await page.goto('/lemma/?demo=extreme&theme='+theme+'#/projects/new',{waitUntil:'domcontentloaded',timeout:90_000});
  await expect(page.getByRole('heading',{name:'New project',level:1})).toBeVisible({timeout:90_000});
  expect(await count(),'New project sheet + inert Paths DOM budget').toBeLessThan(1500);
 });
}
