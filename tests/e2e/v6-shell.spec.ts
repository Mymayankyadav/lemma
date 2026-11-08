import {test,expect,type Page} from '@playwright/test';

const destinations=[
 ['Today','/'],['Paths','/projects'],['Review','/review'],
 ['Calendar','/calendar'],['Progress','/insights'],
] as const;
const paths=['/','/review','/proposals','/cards/7'] as const;

async function expectNavigation(page:Page){
 const nav=page.getByRole('navigation',{name:'Main navigation'});
 await expect(nav.getByRole('link')).toHaveCount(5);
 for(const [name,path] of destinations){
  const link=nav.getByRole('link',{name,exact:true});
  await expect(link).toHaveAttribute('href','#'+path);
  const size=await link.boundingBox();
  expect(size,'44px tab target for '+name).not.toBeNull();
  expect(size!.width).toBeGreaterThanOrEqual(44);
  expect(size!.height).toBeGreaterThanOrEqual(44);
 }
 const actions=page.getByRole('navigation',{name:'Page actions'});
 const headerActions=[
  {label:'Inbox',target:actions.getByRole('link',{name:/^Inbox/})},
  {label:'Add',target:actions.getByLabel('Add to notebook')},
  {label:'Menu',target:actions.getByLabel('Notebook menu')},
 ];
 for(const {label,target} of headerActions){
  await expect(target).toBeVisible();
  const size=await target.boundingBox();
  expect(size,'44px icon action target for '+label).not.toBeNull();
  expect(size!.width).toBeGreaterThanOrEqual(44);
  expect(size!.height).toBeGreaterThanOrEqual(44);
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1))
  .toBe(true);
}

for(const viewport of [
 {width:320,height:640},
 {width:390,height:844},
 {width:844,height:390},
]){
 test('N13 v6 shell navigation and Inbox clearance at '+viewport.width+'x'+viewport.height,async({page})=>{
  test.setTimeout(120_000);
  await page.setViewportSize(viewport);
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',r=>r.fulfill({body:''}));
  for(const path of paths){
   await page.goto('./?demo=stress&flags=v6Shell#'+path);
   await expect(page.locator('[data-v6-header]')).toBeVisible();
   await expectNavigation(page);
   if(path==='/'){
    expect(await page.locator('*').count()).toBeLessThan(1500);
    // Each destination actually navigates and presents its v6 title.
    for(const [name,route] of destinations){
     await page.getByRole('navigation',{name:'Main navigation'})
      .getByRole('link',{name,exact:true}).click();
     await expect(page).toHaveURL(new RegExp('#'+route.replaceAll('/','\\/')+'$'));
     await expect(page.locator('[data-v6-header]')).toContainText(name==='Today'?'Lemma':name);
    }
   }
   if(path==='/proposals'){
    const actions=page.locator('[data-v6-proposal-actions]');
    await expect(actions).toBeVisible();
    await expect(actions.getByRole('button',{name:'Approve card'})).toBeVisible();
    const nav=page.getByRole('navigation',{name:'Main navigation'});
    const [actionRect,tabRect]=await Promise.all([actions.boundingBox(),nav.boundingBox()]);
    expect(actionRect).not.toBeNull();
    expect(tabRect).not.toBeNull();
    expect(actionRect!.y+actionRect!.height).toBeLessThanOrEqual(tabRect!.y+1);
    await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
   }
  }
  // Atlas is full-bleed but its selection actions must clear the persistent dock. Since N29 the v6 Atlas opens on the
  // phone list; the graph (with the dock-clearance contract tested here) is the Map view.
  await page.goto('./?demo=1&flags=v6Shell#/atlas?view=map');
  await expect(page.getByRole('tree',{name:'Ideas and their links'})).toBeVisible();
  await page.getByRole('button',{name:'Find an idea'}).click();
  await page.getByRole('textbox',{name:'Find an idea'}).fill('Compactness');
  await page.getByRole('button',{name:/^Compactness, /}).click();
  const peek=page.locator('[data-atlas-peek]');
  await expect(peek).toContainText('Compactness');
  await page.locator('[data-atlas-stage]').evaluate(el=>el.scrollTop=el.scrollHeight);
  const details=peek.getByRole('button',{name:'Details'});
  const dock=page.getByRole('navigation',{name:'Main navigation'});
  await expect.poll(async()=>{
   const [buttonRect,dockRect]=await Promise.all([details.boundingBox(),dock.boundingBox()]);
   return !!buttonRect&&!!dockRect&&buttonRect.y+buttonRect.height<=dockRect.y+1;
  }).toBe(true);
  expect(await details.evaluate(el=>{
   const r=el.getBoundingClientRect();
   return el===document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)
    ||el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));
  })).toBe(true);
  await details.click();
  await expect(page.getByRole('dialog',{name:'Compactness'})).toBeVisible();
  await page.goto('./?demo=stress&flags=v6Shell#/sign-in');
  await expect(page.getByRole('navigation',{name:'Main navigation'})).toHaveCount(0);
 });
}
