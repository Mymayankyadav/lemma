import {test,expect,type Page} from '@playwright/test';

// N119: regression checks for the N118 fidelity audit bugs (#1312–#1326) and #1302, against the Vite build.
const url=(path:string)=>'./?demo=1&flags=v6Shell#'+path;
async function setup(page:Page,emptyStudy=true){
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
 await page.route('https://fonts.gstatic.com/**',r=>r.fulfill({body:''}));
 await page.setViewportSize({width:390,height:844});
 if(emptyStudy)await page.addInitScript(()=>{
  if(!sessionStorage.getItem('lemma.v6.demo.study.v1'))
   sessionStorage.setItem('lemma.v6.demo.study.v1',JSON.stringify({schema:1,entries:[],blocks:[]}));
 });
}
const px=(page:Page,selector:string,property:string)=>page.locator(selector).first()
 .evaluate((el,p)=>parseFloat(getComputedStyle(el).getPropertyValue(p)),property);

test('#1312–#1315 Today card and Focus page follow the mockup',async({page})=>{
 await setup(page);
 await page.goto(url('/'));
 await page.getByRole('combobox',{name:'Focus activity'}).selectOption({label:'Proof workshop · pomodoro · 25 min'});
 await page.getByRole('textbox',{name:'Focus intention'}).fill('Prove the quotient-map criterion');
 await page.getByRole('button',{name:'Start focus'}).click();
 const dialog=page.getByRole('dialog',{name:'Focus'});
 await expect(dialog).toBeVisible();
 // #1314: heading is the activity/path, the intention is its own line, the caption is the Pomodoro plan.
 const heading=(await dialog.locator('.cr-focus-subject').textContent())!.trim();
 expect(heading).not.toBe('Prove the quotient-map criterion');
 expect(heading.length).toBeGreaterThan(0);
 await expect(dialog.locator('.cr-focus-intent')).toHaveText('Prove the quotient-map criterion');
 await expect(dialog.locator('.cr-focus-cycle')).toHaveText('Pomodoro 1 of 4 · 25 min focus / 5 min break');
 // #1315: two text actions; lease controls only under Timer details; no open textarea.
 await expect(dialog.getByRole('button',{name:'Noticed a distraction'})).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Park a thought'})).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Next phase'})).toBeHidden();
 await expect(dialog.getByRole('textbox')).toHaveCount(0);
 await dialog.getByText('Timer details',{exact:true}).click();
 await expect(dialog.getByRole('button',{name:'Next phase'})).toBeVisible();
 await dialog.getByRole('button',{name:'Close'}).click();
 // #1312: Today's card heading matches the Focus page; the intention is the description.
 const card=page.getByRole('region',{name:'Current study action'});
 await expect(card.locator('h2')).toHaveText(heading);
 await expect(card.locator('.notebook-study-description')).toHaveText('Prove the quotient-map criterion');
 // #1313: no drift or park actions on Today.
 await expect(card.getByRole('button',{name:/Noticed a distraction|I drifted|Park a thought/})).toHaveCount(0);
});

test('#1316 #1317 #1318 Paths headings, Review search row, Inbox "Why this card?"',async({page})=>{
 await setup(page);
 await page.goto(url('/projects'));
 const group=page.locator('[data-style="role-projects"] h2').first();
 await expect(group).toBeVisible();
 expect(await px(page,'[data-style="role-projects"] h2','font-size')).toBeGreaterThanOrEqual(20);
 await expect(page.locator('#main-content')).not.toContainText('Forecast unavailable');
 await page.goto(url('/review'));
 const search=page.getByRole('button',{name:'Search decks and checkpoints'});
 await expect(search).toBeVisible();
 await search.click();
 await expect(page.getByRole('searchbox',{name:'Find a deck or checkpoint'})).toBeFocused();
 await page.goto(url('/proposals'));
 const why=page.getByText('Why this card?',{exact:true});
 await expect(why).toBeVisible();
 await why.click();
 await expect(page.getByRole('region',{name:'Proposal evidence'})).toBeVisible();
});

test('#1320 #1321 #1322 Progress caption, one Planning tools button, time-first agenda cards',async({page})=>{
 await setup(page,false);
 await page.goto(url('/insights'));
 await expect(page.locator('.lemma-sample-label')).toBeVisible();
 expect(await px(page,'.lemma-sample-label','font-size')).toBeLessThanOrEqual(12.5);
 await page.goto(url('/calendar?view=agenda'));
 await expect(page.getByText('Planning tools',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Plan study tasks'})).toBeHidden();
 await page.getByText('Planning tools',{exact:true}).click();
 await expect(page.getByRole('button',{name:'Plan study tasks'})).toBeVisible();
 const agenda=page.locator('[aria-label="Next seven days"]');
 await expect(agenda.locator('section').first().locator('h2')).toHaveClass(/sr-only/);
 const block=agenda.locator('article.cr-agenda-block').first();
 await expect(block).toBeVisible();
 expect((await block.textContent())!.trim()).toMatch(/^\d{1,2}:\d{2}/);
});

test('#1323 #1324 Cards: new card from the + menu, no highlighted destination',async({page})=>{
 await setup(page);
 await page.goto(url('/cards'));
 await expect(page.getByRole('list',{name:'Card results'})).toBeVisible();
 await expect(page.getByRole('button',{name:'New card'})).toHaveCount(0);
 await expect(page.getByRole('navigation',{name:'Main navigation'}).locator('[aria-current="page"]')).toHaveCount(0);
 await page.getByRole('navigation',{name:'Page actions'}).locator('summary').filter({hasText:'Add'}).click();
 await page.getByRole('navigation',{name:'Add to notebook'}).getByRole('link',{name:'Card',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'New card'})).toBeVisible();
});

test('#1325 #1326 #1302 Concept map subtitle, plain list rows, map header inset',async({page})=>{
 await setup(page);
 await page.goto(url('/atlas'));
 await expect(page.locator('[data-v6-header-subtitle]')).toHaveText(/^\d+ concepts · \d+ connections$/);
 const hierarchy=page.getByRole('region',{name:'Idea hierarchy'});
 const row=hierarchy.locator('button[aria-label^="Actions for "]').first();
 await expect(row).toBeVisible();
 await expect(hierarchy.locator('summary')).toHaveCount(0);
 await expect(hierarchy.getByText(/· \d+ due$/).first()).toHaveClass(/sr-only/);
 await row.click();
 await expect(hierarchy.locator('button[aria-label^="Edit map pin for"]').first()).toBeVisible();
 await page.goto(url('/atlas?view=map'));
 const title=page.locator('[data-v6-header] h1');
 await expect(title).toBeVisible();
 const box=await title.boundingBox();
 expect(box!.x).toBeGreaterThanOrEqual(16);
 await expect(page.getByText('Demo',{exact:true})).toHaveCount(0);
});
