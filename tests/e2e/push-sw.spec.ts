import {test,expect} from '@playwright/test';

// Run against Playwright's production build and existing Workbox update prompt.
test('NOTIF-5 Workbox imports push and handles navigation messages',async({page})=>{
 await page.goto('/lemma/?demo=1&theme=graph#/');
 const details=await page.evaluate(async()=>{
  await navigator.serviceWorker.register('/lemma/sw.js',{scope:'/lemma/'});
  const ready=await navigator.serviceWorker.ready;
  const worker=await (await fetch('/lemma/sw.js')).text();
  const push=await (await fetch('/lemma/push-sw.js')).text();
  const core=await (await fetch('/lemma/push-sw-core.js')).text();
  return {worker,push,core,active:!!ready.active};
 });
 expect(details.active).toBe(true);
 expect(details.worker).toContain('push-sw.js');
 expect(details.push).toMatch(/addEventListener\(['"]push['"]/);
 expect(details.push).toMatch(/addEventListener\(['"]notificationclick['"]/);
 expect(details.core).toContain('LemmaPushCore');
 // The initial page predates SW registration and is uncontrolled. Reload so
 // the real Workbox worker controls the client before testing message routing.
 // This preserves the actual end-to-end navigation assertion (no fake listener).
 await page.reload();
 await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller),{timeout:15000}).toBe(true);
 await page.evaluate(()=>navigator.serviceWorker.controller?.postMessage({type:'lemma:navigate',url:'#/review'}));
 await expect(page).toHaveURL(/#\/review(?:$|\?)/,{timeout:15000});
});
