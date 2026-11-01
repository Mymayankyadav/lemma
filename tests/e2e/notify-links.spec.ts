import {test,expect} from '@playwright/test';

// NOTIF-7: real hash-route entry points from Web Push, using the same demo
// queue and settings as the ordinary Review Start button.
test.beforeEach(async({page})=>{
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}))
 await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}))
})

test('Review 5 deep link starts exactly five cards and consumes the query',async({page})=>{
 await page.goto('/lemma/?demo=1#/review?start=5&n=42')
 await expect(page).toHaveURL(/#\/review\/run$/)
 await expect(page.getByRole('progressbar',{name:'Review progress'})).toHaveAttribute('aria-valuemax','5')
 await expect(page.getByText('1 of 5',{exact:true})).toBeVisible()
 await page.screenshot({path:'test-results/screens/notif-review-5.png',fullPage:true})
})

for(const [raw,expected] of [['0','1'],['99','23'],['oops','1']] as const){
 test(`invalid notification start=${raw} is clamped to a safe 1–50 round`,async({page})=>{
  await page.goto('/lemma/?demo=1#/review?start='+raw)
  await expect(page).toHaveURL(/#\/review\/run$/)
  await expect(page.getByRole('progressbar',{name:'Review progress'})).toHaveAttribute('aria-valuemax',expected)
 })
}

test('Insights deep link selects seven days, ignoring notification id',async({page})=>{
 await page.goto('/lemma/?demo=1#/insights?days=7&n=42')
 await expect(page.getByRole('group',{name:'Time range'}).getByRole('button',{name:'7 days'})).toHaveAttribute('aria-pressed','true')
 await expect(page.getByRole('heading',{name:'Reviews by day'})).toBeVisible()
 await page.screenshot({path:'test-results/screens/notif-insights-7.png',fullPage:true})
})

test('unsupported Insights days retain the 30-day default',async({page})=>{
 await page.goto('/lemma/?demo=1#/insights?days=999')
 await expect(page.getByRole('group',{name:'Time range'}).getByRole('button',{name:'30 days'})).toHaveAttribute('aria-pressed','true')
})

async function finishOneCard(page:import('@playwright/test').Page){
 await page.getByRole('button',{name:'Start review'}).click();
 await page.getByRole('button',{name:'Sure',exact:true}).click();
 await page.getByRole('button',{name:'Grade Good'}).click();
 await page.getByRole('button',{name:'Close review'}).click();
 await expect(page.getByRole('heading',{name:'Review complete'})).toBeVisible();
}

test('review-done reminder offer is shown only twice, with Not now dismissing it',async({page})=>{
 await page.addInitScript(()=>{
  Object.defineProperty(window,'Notification',{configurable:true,value:{permission:'default',requestPermission:async()=> 'default'}});
  Object.defineProperty(window,'PushManager',{configurable:true,value:class PushManager{}});
  if(!('serviceWorker' in navigator))
   Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{}});
 });
 await page.goto('/lemma/?demo=1#/review');
 for(let attempt=0;attempt<3;attempt++){
  await finishOneCard(page);
  const offer=page.getByRole('region',{name:'Reminder offer'});
  if(attempt<2){
   await expect(offer).toBeVisible();
   await expect(offer.getByText('Want a reminder when cards are due?')).toBeVisible();
   await offer.getByRole('button',{name:'Not now'}).click();
   await expect(offer).toHaveCount(0);
  }else await expect(offer).toHaveCount(0);
  if(attempt<2)await page.getByRole('link',{name:'Review more'}).click();
 }
});

test('blocked notification permission never shows a post-review offer',async({page})=>{
 await page.addInitScript(()=>{
  Object.defineProperty(window,'Notification',{configurable:true,value:{permission:'denied',requestPermission:async()=> 'denied'}});
  Object.defineProperty(window,'PushManager',{configurable:true,value:class PushManager{}});
  if(!('serviceWorker' in navigator))
   Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{}});
 });
 await page.goto('/lemma/?demo=1#/review');
 await finishOneCard(page);
 await expect(page.getByRole('region',{name:'Reminder offer'})).toHaveCount(0);
});
