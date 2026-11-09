import {test,expect} from '@playwright/test';

const home='./?demo=1&flags=v6Shell#/';
const emptyStudy=(page:import('@playwright/test').Page)=>page.addInitScript(()=>{
 try{
  if(!sessionStorage.getItem('lemma.v6.demo.study.v1'))
   sessionStorage.setItem('lemma.v6.demo.study.v1',
    JSON.stringify({schema:1,entries:[],blocks:[]}));
 }catch{/* unavailable demo storage */}
});

test('N72 Pomodoro phases, explicit drift exclusion and cross-route accessory at 320×640',async({page})=>{
 test.setTimeout(90_000);
 await page.setViewportSize({width:320,height:640});
 // Install before page scripts so fast-forward simulates real elapsed study time.
 await page.clock.install();
 await emptyStudy(page);
 await page.goto(home);
 await expect(page.getByRole('combobox',{name:'Timer mode'})).toBeEnabled();
 await page.getByRole('combobox',{name:'Timer mode'}).selectOption('pomodoro');
 await page.getByRole('textbox',{name:'Focus intention'}).fill('N72 focused revision');
 await page.getByRole('button',{name:'Start focus'}).click();
 const dialog=page.getByRole('dialog',{name:'Focus'});
 await expect(dialog).toBeVisible();
 // #1314/#1315: the plan is the visible caption; mode, deadline and the lease sit under Timer details.
 await expect(dialog).toContainText('Pomodoro 1 of 4 · 25 min focus / 5 min break');
 await dialog.getByText('Timer details',{exact:true}).click();
 await expect(dialog).toContainText('Mode: pomodoro');
 await expect(dialog).toContainText('Phase ends at');
 await expect(dialog.getByRole('button',{name:'Next phase'})).toBeEnabled();
 // Grow a real one-minute focus span without waiting on wall-clock time;
 // remain inside the two-minute lease acquired when the entry was created.
 await page.clock.fastForward(90_000);
 await dialog.getByRole('button',{name:'Next phase'}).click();
 await expect(dialog).toContainText('Break · Cycle');
 // #1313/#1315: a distraction is recorded from the Focus page itself.
 await dialog.getByRole('button',{name:'Noticed a distraction'}).click();
 const drift=page.getByRole('dialog',{name:'Record a drift'});
 await drift.getByRole('spinbutton',{name:'Minutes of drift'}).fill('1');
 await drift.getByRole('checkbox',{name:'Exclude drift minutes'}).check();
 await drift.getByRole('button',{name:'Record drift'}).click();
 await expect(drift).toBeHidden();
 await dialog.getByRole('button',{name:'Close'}).click();
 await page.goto('./?demo=1&flags=v6Shell#/tasks');
 const accessory=page.getByRole('complementary',{name:'Focus accessory'});
 await expect(accessory).toContainText('N72 focused revision');
 const target=await accessory.boundingBox();
 expect(target).not.toBeNull();
 expect(target!.x).toBeGreaterThanOrEqual(0);
 expect(target!.x+target!.width).toBeLessThanOrEqual(321);
 await accessory.getByRole('button',{name:'Open focus'}).click();
 await expect(page.getByRole('dialog',{name:'Focus'})).toBeVisible();

 await page.goto('./?demo=1&flags=v6Shell#/proposals');
 await expect(accessory).toBeVisible();
 const actions=page.locator('[data-v6-proposal-actions]');
 if(await actions.isVisible().catch(()=>false)){
  const a=await accessory.boundingBox(),b=await actions.boundingBox();
  expect(a&&b).toBeTruthy();
  expect(a!.y+a!.height).toBeLessThanOrEqual(b!.y+1);
 }
});
