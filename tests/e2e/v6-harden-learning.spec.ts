import {test,expect,type Page} from '@playwright/test';

// N100: real flagged routes and demo data, including 5,000 cards and 1,200 source pages.
const visit=(page:Page,path:string,profile='1',theme='graph')=>
 page.goto('./?demo='+profile+'&flags=v6Shell&theme='+theme+'#'+path);
const zoom=(page:Page)=>page.evaluate(()=>{document.documentElement.style.fontSize='200%'});
const noOverflow=async(page:Page)=>expect(await page.evaluate(()=>
 document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
async function fonts(page:Page){
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
 await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
}

for(const [theme,width] of [['graph',320],['graph-night',390]] as const){
 test('N100 learning routes reflow at 200% in '+theme+' '+width+'px',async({page})=>{
  test.setTimeout(180_000);
  await fonts(page);await page.setViewportSize({width,height:740});
  await visit(page,'/projects','1',theme);
  await expect(page.locator('#v6-paths-title')).toBeVisible();
  await zoom(page);await noOverflow(page);
  await visit(page,'/review','1',theme);
  await expect(page.getByRole('region',{name:'Review counts'})).toBeVisible();
  await zoom(page);await noOverflow(page);
  await visit(page,'/cards','1',theme);
  await expect(page.getByRole('list',{name:'Card results'})).toBeVisible();
  await zoom(page);await noOverflow(page);
  await visit(page,'/atlas','1',theme);
  await expect(page.getByRole('heading',{name:'Atlas ideas'})).toBeVisible();
  const ideas=page.getByRole('region',{name:'Idea hierarchy'});
  await expect(ideas).toHaveAttribute('tabindex','0');
  await ideas.focus();await page.keyboard.press('PageDown');
  await zoom(page);await noOverflow(page);
  const pin=page.locator('button[aria-label^="Edit map pin for"]').first();
  const size=await pin.boundingBox();
  expect(size).not.toBeNull();expect(size!.height).toBeGreaterThanOrEqual(44);
  await visit(page,'/settings','1',theme);
  const tabs=page.getByRole('tablist',{name:'Settings sections'});
  const account=tabs.getByRole('tab',{name:'Account'});
  await expect(account).toHaveAttribute('aria-selected','true');
  await account.focus();await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab',{name:'Appearance'})).toHaveAttribute('aria-selected','true');
  await zoom(page);await noOverflow(page);
 });
}

test('N100 project, checkpoint and session evidence remain navigable',async({page})=>{
 test.setTimeout(150_000);await fonts(page);
 await page.setViewportSize({width:320,height:640});
 await visit(page,'/p/real-analysis');
 await expect(page.locator('#v6-project-title')).toBeVisible();
 const stages=page.getByRole('navigation',{name:'Project stages'});
 const first=stages.getByRole('button').first();
 await first.focus();await page.keyboard.press('End');
 await expect(stages.getByRole('button').last()).toBeFocused();
 await page.locator('[data-v6-checkpoint]').first().click();
 await expect(page.locator('[data-v6-checkpoint-page]')).toBeVisible();
 await page.getByRole('link',{name:'Back to path'}).click();
 await page.getByRole('button',{name:/^Show sessions/}).click();
 await expect(page.getByRole('region',{name:'Project evidence'})).toBeVisible();
 await visit(page,'/s/real-analysis/1');
 await expect(page.locator('[data-v6-session-page]')).toBeVisible();
 await expect(page.getByRole('region',{name:'Session event timeline'})).toBeVisible();
 await zoom(page);await noOverflow(page);
});

test('N100 5,000-card stress library paginates and keeps reload position bounded',async({page})=>{
 test.setTimeout(180_000);await fonts(page);
 await page.setViewportSize({width:320,height:640});
 await visit(page,'/cards','stress');
 const cards=page.getByRole('list',{name:'Card results'});
 await expect(cards.getByRole('listitem')).toHaveCount(20,{timeout:90_000});
 await page.getByRole('button',{name:'Load 20 more'}).click();
 await expect(cards.getByRole('listitem')).toHaveCount(40);
 await page.getByRole('button',{name:'Load 20 more'}).click();
 await expect(cards.getByRole('listitem')).toHaveCount(60);
 await zoom(page);await noOverflow(page);
 await page.reload();
 await expect(cards.getByRole('listitem')).toHaveCount(20);
 await page.getByRole('searchbox',{name:'Search cards'}).fill('Recall the definition in card 4999?');
 await expect(cards.getByRole('listitem')).toHaveCount(1);
 await noOverflow(page);
});

test('N100 the 1,200th page remains reachable in a long source account',async({page})=>{
 test.setTimeout(180_000);await fonts(page);
 await page.setViewportSize({width:360,height:740});
 await visit(page,'/p/real-analysis','stress');
 await expect(page.locator('#v6-project-title')).toBeVisible();
 await page.getByRole('button',{name:/^Show sources/}).click();
 const sources=page.locator('[data-v6-sources]');
 await expect(sources).toContainText('30 sources in plan order',{timeout:90_000});
 const source=sources.locator('li').filter({has:
  page.getByRole('heading',{name:'Source 5: mathematical notes and proofs',exact:true})}).first();
 await expect(source).toBeVisible();
 await source.getByRole('button',{name:'View pages'}).click();
 const viewer=source.getByRole('region',{name:/Page transcription for Source 5/});
 await expect(viewer).toContainText('of 1200');
 await viewer.getByRole('spinbutton',{name:'PDF page number'}).fill('1200');
 await expect(viewer).toContainText('Synthetic mathematics notes, page 1200');
 await zoom(page);await noOverflow(page);
});

test('N100 Inbox decisions clear the tab dock, plan review handles large type',async({page})=>{
 test.setTimeout(150_000);await fonts(page);
 await page.setViewportSize({width:320,height:640});
 await visit(page,'/proposals');
 const actions=page.locator('[data-v6-proposal-actions]');
 await expect(actions.getByRole('button',{name:'Approve card'})).toBeVisible();
 const dock=page.getByRole('navigation',{name:'Main navigation'});
 await expect.poll(async()=>{
  const [a,b]=await Promise.all([actions.boundingBox(),dock.boundingBox()]);
  return !!a&&!!b&&a.y+a.height<=b.y+1;
 }).toBe(true);
 await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
 await noOverflow(page);
 await visit(page,'/proposals?tab=plan');
 const link=page.getByRole('link',{name:'See the whole plan'}).first();
 await expect(link).toBeVisible();await link.click();
 await expect(page.getByRole('main',{name:'Plan proposal review'})).toBeVisible();
 await zoom(page);await noOverflow(page);
});

test('N100 durable Review run retains 44px grades after reload and large text',async({page})=>{
 test.setTimeout(180_000);await fonts(page);
 await page.setViewportSize({width:320,height:640});
 await visit(page,'/review');
 const start=page.getByRole('button',{name:/^Start [1-9][0-9]* cards$/});
 await expect(start).toBeEnabled();await start.click();
 await expect(page.getByRole('main',{name:'Durable review run'})).toBeVisible();
 await page.reload();
 await expect(page.getByRole('main',{name:'Durable review run'})).toBeVisible();
 await page.getByRole('button',{name:'Show answer'}).click();
 const grades=page.getByRole('region',{name:'Grade answer'});
 await expect(grades.getByRole('button')).toHaveCount(4);
 await zoom(page);await noOverflow(page);
 const box=await grades.getByRole('button',{name:/Again/}).boundingBox();
 expect(box).not.toBeNull();expect(box!.height).toBeGreaterThanOrEqual(44);
});
