import {test,expect,type Page} from '@playwright/test';
import {NOW,DATE} from './v7-scenes';
test.use({locale:'en-IN',timezoneId:'Asia/Kolkata'});
async function release(page:Page,route:string,width=390,height=844){
 await page.setViewportSize({width,height});await page.clock.setFixedTime(NOW);
 // No U4 flags: both the CI build and the real Android bundle must use their released defaults.
 await page.goto('/lemma/?demo=1&flags=v7Shell,v6Shell#'+route);await page.waitForLoadState('networkidle');
 await expect(page.locator('html')).toHaveAttribute('data-v7','');
}
test('released ruler controls appear on Today and Calendar without U4 overrides',async({page})=>{
 await release(page,'/');await expect(page.getByRole('slider',{name:'Time',exact:true})).toBeVisible();
 await release(page,'/calendar?view=day&date='+DATE+'&quick=1');
 const sheet=page.getByRole('dialog',{name:'New block',exact:true});
 await expect(sheet.getByRole('slider',{name:'Length'})).toHaveValue('50');
 await sheet.getByRole('slider',{name:'Length'}).focus();await page.keyboard.press('ArrowRight');
 await expect(sheet.getByRole('slider',{name:'Length'})).toHaveValue('55');
});
test('released completion treatment shows the whole close-day page',async({page})=>{
 await release(page,'/today/close');await expect(page.locator('html')).toHaveAttribute('data-v7-qed','');
 for(const name of ['Given and shown','Left open','Tomorrow opens with'])await expect(page.getByRole('region',{name,exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Next',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:/^Close the day/})).toBeVisible();
});
test('released paper and sky choices persist on the device',async({page})=>{
 await release(page,'/settings?section=appearance');
 await page.getByRole('radiogroup',{name:'Paper by day'}).getByRole('radio',{name:'Graph',exact:true}).click();
 await page.getByRole('radiogroup',{name:'Sky by night'}).getByRole('radio',{name:'Stars',exact:true}).click();
 await page.reload();await expect(page.locator('html')).toHaveAttribute('data-v7-paper','graph');await expect(page.locator('html')).toHaveAttribute('data-v7-sky','stars');
});
test('released week page is reachable from Progress',async({page})=>{
 await release(page,'/insights');await page.getByRole('link',{name:'Your week',exact:true}).click();
 await expect(page).toHaveURL(/#\/week$/);await expect(page.getByRole('heading',{name:'Your week',exact:true})).toBeVisible();
 await expect(page.getByRole('img',{name:/The week as a constellation/})).toBeVisible();
});
test('released scratch paper survives reveal and review uses the desktop spread',async({page})=>{
 await release(page,'/review',1280);await page.getByRole('button',{name:/^Start \d+ cards$/}).click();
 await page.getByRole('button',{name:'Scratch paper',exact:true}).click();await page.getByRole('textbox',{name:'Type an attempt'}).fill('Let epsilon be positive.');
 await page.getByRole('button',{name:'Show answer',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Type an attempt'})).toHaveValue('Let epsilon be positive.');
 const front=(await page.locator('.v7-review-front').boundingBox())!,back=(await page.locator('.v7-review-back').boundingBox())!;
 expect(back.x).toBeGreaterThanOrEqual(front.x+front.width);expect(Math.abs(back.y-front.y)).toBeLessThanOrEqual(40);
});
test('released desk clock opens automatically in phone landscape and keeps pause available',async({page})=>{
 await release(page,'/');await page.getByRole('button',{name:/^(Start now|Start focus)$/}).first().click();await page.waitForURL(/#\/focus/);
 await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeVisible();
 await page.setViewportSize({width:844,height:390});await expect(page.locator('main[data-desk]')).toBeVisible();
 // A fixed clock otherwise leaves a zero-length session, which the study contract correctly refuses to close.
 await page.clock.setFixedTime(new Date(NOW.getTime()+120_000));
 await page.locator('.v7-focus-time').click();await page.getByRole('button',{name:'Pause',exact:true}).click();
 await expect(page.getByRole('button',{name:'Resume',exact:true})).toBeVisible();
});
