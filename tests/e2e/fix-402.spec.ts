import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
 await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
});

for(const world of ['graph','graph-night'] as const){
 test('Mathematical project titles render on Paths and Today in '+world,async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:390,height:844});
  await page.goto('./?demo=1&theme='+world+'#/projects/new');
  const title=String.raw`Vector spaces over \(\mathbb{R}\)`;
  await page.getByRole('textbox',{name:'Name'}).fill(title);
  await expect(page.getByRole('region',{name:'Math preview'}).locator('.katex')).toBeVisible();
  await page.getByRole('button',{name:'Create project'}).click();
  await expect(page).toHaveURL(/#\/p\/vector-spaces-over/);
  await page.getByRole('button',{name:'Back to projects'}).click();

  const project=page.locator('[data-project-row]').filter({hasText:'Vector spaces over'});
  await expect(project).toBeVisible();
  await expect(project.locator('.katex')).toHaveCount(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({path:'test-results/screens/fix-402-paths-'+world+'.png',fullPage:true});

  // A newly created project is in planning status. Today intentionally shows
  // active goals, not the old duplicate list of every project. Activate this
  // mathematical project through the Paths action, then verify its rendered
  // title in the real Today goal list.
  await project.getByRole('button',{name:/Actions for Vector spaces over/}).click();
  await project.getByRole('menuitem',{name:'Set active'}).click();
  await expect(page.getByRole('status').filter({hasText:'Set active saved'})).toBeVisible();

  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Today'}).click();
  const goals=page.getByRole('region',{name:'Distance to your goals'});
  const homeProject=goals.getByRole('link',{name:/Vector spaces over/});
  await expect(homeProject).toBeVisible();
  await expect(homeProject.locator('.katex')).toHaveCount(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({path:'test-results/screens/fix-402-today-'+world+'.png',fullPage:true});
  expect(errors).toEqual([]);
 });
}
