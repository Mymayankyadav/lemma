import {expect,test} from '@playwright/test';
import {NOW} from './v7-scenes';
import {MotionAudit} from './helpers/motion-audit';
const locationFor=(route:string,mode:string)=>'/lemma/?demo=1&flags=v7Shell,v6Shell&mode='+mode+'#'+route;
const sizes=[{width:390,height:844},{width:1440,height:900},{width:768,height:1024},{width:1024,height:768}];
for(const viewport of sizes){
  for(const mode of ['day','night']){
    const modes=['full',...(viewport.width===390||viewport.width===1440?['system','setting']:[])];
    for(const motion of modes){
      test('motion audit '+viewport.width+'x'+viewport.height+' '+mode+' '+motion,async({page},info)=>{
        test.setTimeout(90_000);
        await page.setViewportSize(viewport);await page.clock.setFixedTime(NOW);
        await page.emulateMedia({colorScheme:mode==='day'?'light':'dark',reducedMotion:motion==='system'?'reduce':'no-preference'});
        if(motion==='setting')await page.addInitScript(()=>localStorage.setItem('lemma.v7.reduce-effects','1'));
        const audit=new MotionAudit(page,info);
        await audit.start();
        const start=page.getByRole('button',{name:/^(Start review, \d+ cards?|Resume)/}).first();
        const search=page.getByRole('button',{name:'Search',exact:true}).filter({visible:true}).first();
        try{
          await audit.step('M00','Cold open Today',()=>page.goto(locationFor('/',mode)),()=>expect(search).toBeVisible());
          await audit.step('M02','Open Search',()=>search.click(),()=>expect(page.getByRole('combobox',{name:'Search'})).toBeFocused());
          const field=page.getByRole('combobox',{name:'Search'});
          await audit.step('M02','Clear a search query',async()=>{await field.fill('compact');await field.press('Escape');},async()=>{
            await expect(field).toBeFocused();await expect(field).toHaveValue('');
          });
          await audit.step('M02','Dismiss Search',()=>field.press('Escape'),async()=>{
            await expect(field).toHaveCount(0);await expect(search).toBeFocused();
          });
          const capture=page.getByRole('button',{name:'Capture',exact:true}).filter({visible:true}).first();
          const text=page.getByRole('textbox',{name:'What do you want to add?'});
          await audit.step('M05','Open Capture',()=>capture.click(),()=>expect(text).toBeFocused());
          await text.fill('Work through exercise tomorrow');
          await page.getByRole('radio',{name:'Task',exact:true}).click();
          const modal=page.locator('dialog[open]');
          await modal.evaluate(el=>el.setAttribute('data-audit-capture',''));
          const handoff=await audit.step('M05','Open the task details',()=>page.getByRole('button',{name:'Add details'}).click(),async()=>{
            await expect(modal).toHaveCount(1);await expect(modal).toHaveAttribute('data-audit-capture','');
            await expect(modal.getByRole('button',{name:'Back',exact:true})).toBeVisible();
          });
          if(motion==='full'&&handoff.frames&&handoff.frames.length>1){
            const base=handoff.frames[0].corner;
            expect(Math.max(...handoff.frames.map(frame=>frame.corner))-base).toBeLessThanOrEqual(255*.03);
          }
          await audit.step('M05','Return to the draft',()=>page.keyboard.press('Escape'),()=>expect(text).toHaveValue('Work through exercise tomorrow'));
          await page.keyboard.press('Escape');await page.getByRole('button',{name:'Discard changes',exact:true}).click();
          await expect(modal).toHaveCount(0);
          await audit.step('M04','Navigate to Paths',()=>page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Paths'}).click(),
            ()=>expect(page.getByRole('heading',{name:'Paths',exact:true,level:1})).toBeVisible());
          await audit.step('M08','Navigate to Review',()=>page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:/Review/}).click(),
            ()=>expect(start).toBeVisible());
          await audit.step('M18','Start a review round',()=>start.click(),()=>expect(page.getByRole('button',{name:'Show answer'})).toBeVisible());
          await audit.step('M18','Reveal the answer',()=>page.getByRole('button',{name:'Show answer'}).click(),
            ()=>expect(page.locator('.v7-review-back')).toBeVisible());
        } finally {await audit.finish();}
      });
    }
  }
}

test('sheet ownership releases at the start of its capped visual exit',async({page})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto(locationFor('/review','night'));
  const opener=page.getByRole('button',{name:'Customise this round'});
  await opener.click();
  const sheet=page.getByRole('dialog',{name:'Customise this round'});
  await expect(sheet).toBeVisible();
  // Observe in the click turn; a slow CI worker should not have to beat a 160 ms exit.
  const exit=await sheet.evaluate(el=>new Promise<{duration:number;locked:boolean;open:boolean;shield:boolean}>(resolve=>{
    const observer=new MutationObserver(()=>{
      const panel=document.querySelector<HTMLElement>('[data-layer-exit] .v7-exiting-panel');
      if(!panel||el.hasAttribute('open'))return;
      observer.disconnect();
      const animation=panel.getAnimations().find(a=>(a as CSSAnimation).animationName==='v7-panel-out');
      const duration=Number(animation?.effect?.getTiming().duration);
      resolve({duration,locked:document.body.style.overflow==='hidden',open:el.hasAttribute('open'),
        shield:!!document.elementFromPoint(innerWidth/2,innerHeight-2)?.closest('[data-layer-exit]')});
    });
    observer.observe(document.body,{subtree:true,childList:true,attributes:true});
    el.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click();
  }));
  expect(exit).toMatchObject({locked:false,open:false,shield:true});
  expect(exit.duration).toBeGreaterThanOrEqual(120);expect(exit.duration).toBeLessThanOrEqual(200);
  await expect(opener).toBeFocused();await expect(page.locator('[data-layer-exit]')).toHaveCount(0);
});
