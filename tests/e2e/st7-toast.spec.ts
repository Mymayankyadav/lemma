import {test,expect} from '@playwright/test';

// ST-7 I2: whether a toast needs More depends on rendered lines, not length.
for(const theme of ['graph','graph-night'] as const){
 test(`ST-7 toast with an action reveals short-but-overflowing text at 360px (${theme})`,async({page})=>{
  await page.setViewportSize({width:360,height:740});
  await page.goto(`/lemma/?demo=1&theme=${theme}#/kit`);
  await expect(page.getByRole('heading',{name:'Component kit'})).toBeVisible();
  const message='The proposed changes could not be saved because the connection was interrupted. Please try again.';
  // The kit runs on Vite's development server; exercise the real exported toast
  // without adding production-only test hooks or changing another task's screen.
  await page.addScriptTag({type:'module',content:`import {toast} from '/lemma/src/ui/Toast.tsx'; toast(${JSON.stringify(message)}, {action:{label:'Undo',onClick:()=>{}}});`});
  const status=page.getByRole('status').filter({hasText:message});
  await expect(status).toBeVisible();
  const more=status.getByRole('button',{name:'Show notification details'});
  await expect(more).toBeVisible();
  const text=status.locator('[id^="toast-message-"]');
  const before=await text.evaluate(node=>({scroll:node.scrollHeight,client:node.clientHeight}));
  expect(before.scroll).toBeGreaterThan(before.client+1);
  await more.click();
  await expect(status.getByRole('button',{name:'Collapse notification details'})).toBeVisible();
  const after=await text.evaluate(node=>({scroll:node.scrollHeight,client:node.clientHeight}));
  expect(after.client).toBeGreaterThan(before.client);
  expect(after.scroll).toBeLessThanOrEqual(after.client+1);
  await page.screenshot({path:`test-results/screens/st-7-toast-360-${theme}.png`});
  await status.getByRole('button',{name:'Collapse notification details'}).click();
  await expect(status.getByRole('button',{name:'Show notification details'})).toBeVisible();
 });
}
