import {expect,test} from '@playwright/test';
import {enableSurfaceBeta} from './helpers/surface-preview';

test.beforeEach(async({page})=>{await enableSurfaceBeta(page);});
import {NOW} from './v7-scenes';
import {MotionAudit,fixAuditDate} from './helpers/motion-audit';
const locationFor=(route:string,mode:string)=>'/lemma/?demo=1&flags=v7Shell,v6Shell&mode='+mode+'#'+route;
const sizes=[{width:390,height:844},{width:1440,height:900},{width:768,height:1024},{width:1024,height:768}];
for(const viewport of sizes)test.describe(viewport.width+'px input',()=>{
  test.use({hasTouch:viewport.width<1100});
  for(const mode of ['day','night']){
    const modes=['full',...(viewport.width===390||viewport.width===1440?['system','setting']:[])];
    for(const motion of modes){
      test('motion audit '+viewport.width+'x'+viewport.height+' '+mode+' '+motion,async({page},info)=>{
        test.setTimeout(90_000);
        await page.setViewportSize(viewport);await fixAuditDate(page,NOW);
        await page.emulateMedia({colorScheme:mode==='day'?'light':'dark',reducedMotion:motion==='system'?'reduce':'no-preference'});
        if(motion==='setting')await page.addInitScript(()=>localStorage.setItem('lemma.v7.reduce-effects','1'));
        const act=(locator:import('@playwright/test').Locator)=>viewport.width<1100?locator.tap():locator.click();
        const audit=new MotionAudit(page,info);
        await audit.start();
        const start=page.getByRole('button',{name:/^(Start review, \d+ cards?|Resume)/}).first();
        const search=page.getByRole('button',{name:'Search',exact:true}).filter({visible:true}).first();
        try{
          const chapter=(id:string)=>(viewport.width===390?'M':viewport.width===1440?'D':'T')+id;
          await audit.step(chapter('00'),'Cold open Today',()=>page.goto(locationFor('/',mode)),()=>expect(search).toBeVisible());
          await audit.step(chapter('02'),'Open Search',()=>act(search),()=>expect(page.getByRole('combobox',{name:'Search'})).toBeFocused());
          const field=page.getByRole('combobox',{name:'Search'});
          await audit.step(chapter('02'),'Clear a search query',async()=>{await field.fill('compact');await field.press('Escape');},async()=>{
            await expect(field).toBeFocused();await expect(field).toHaveValue('');
          });
          await audit.step(chapter('02'),'Dismiss Search',()=>field.press('Escape'),async()=>{
            await expect(field).toHaveCount(0);await expect(search).toBeFocused();
          });
          const capture=page.getByRole('button',{name:'Capture',exact:true}).filter({visible:true}).first();
          const text=page.getByRole('textbox',{name:'What do you want to add?'});
          await audit.step(chapter('05'),'Open Capture',()=>act(capture),()=>expect(text).toBeFocused());
          await text.fill('Work through exercise tomorrow');
          await page.getByRole('radio',{name:'Task',exact:true}).click();
          const modal=page.locator('dialog[open]');
          await modal.evaluate(el=>el.setAttribute('data-audit-capture',''));
          const handoff=await audit.step(chapter('05'),'Open the task details',()=>page.getByRole('button',{name:'Add details'}).click(),async()=>{
            await expect(modal).toHaveCount(1);await expect(modal).toHaveAttribute('data-audit-capture','');
            await expect(modal.getByRole('button',{name:'Back',exact:true})).toBeVisible();
          });
          if(motion==='full'&&handoff.frames&&handoff.frames.length>1){
            const base=handoff.frames[0].corner;
            expect(Math.max(...handoff.frames.map(frame=>frame.corner))-base).toBeLessThanOrEqual(255*.03);
          }
          await audit.step(chapter('05'),'Return to the draft',()=>page.keyboard.press('Escape'),()=>expect(text).toHaveValue('Work through exercise tomorrow'));
          await page.keyboard.press('Escape');await page.getByRole('button',{name:'Discard changes',exact:true}).click();
          await expect(modal).toHaveCount(0);
          await audit.step(chapter('04'),'Navigate to Paths',()=>page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Paths'}).click(),
            ()=>expect(page.getByRole('heading',{name:'Paths',exact:true,level:1})).toBeVisible());
          await audit.step(chapter('08'),'Navigate to Review',()=>page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:/Review/}).click(),
            ()=>expect(start).toBeVisible());
          await audit.step(chapter('18'),'Start a review round',()=>act(start),()=>expect(page.getByRole('button',{name:'Show answer'})).toBeVisible());
          await audit.step(chapter('18'),'Reveal the answer',()=>page.getByRole('button',{name:'Show answer'}).click(),
            ()=>expect(page.locator('.v7-review-back')).toBeVisible());
        } finally {await audit.finish();}
      });
    }
  }
});

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

test.describe('phone modal handoffs',()=>{
  test.use({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'no-preference'});
  for(const theme of ['day','night']){
    test('menu to editor keeps the scrim in '+theme,async({page},info)=>{
      test.setTimeout(60_000);
      const audit=new MotionAudit(page,info);await audit.start();
      await fixAuditDate(page,new Date('2026-11-09T18:00:00Z'));
      try{
        for(const scene of [
          {chapter:'M14',route:'/insights',button:'Progress actions',action:'Progress details',editor:'Progress details'},
          {chapter:'M10',route:'/p/real-analysis',button:'More path actions',action:'Prepare for an exam…',editor:'Prepare for an exam'},
          {chapter:'M24',route:'/log',button:/^Actions for /,action:'Edit',editor:'Edit entry'},
        ]){
          await page.goto(locationFor(scene.route,theme).replace('v7Shell,v6Shell','v7Shell,v6Shell,examMode'));
          if(scene.route==='/log'){
            await page.getByRole('button',{name:'Add time',exact:true}).tap();
            const add=page.getByRole('dialog',{name:'Add time'});
            await add.getByRole('textbox',{name:'What you studied'}).fill('Reading');
            await add.getByRole('button',{name:'Add time',exact:true}).tap();
            await expect(add).toHaveCount(0);
          }
          await page.getByRole('button',{name:scene.button}).first().tap();
          const item=page.getByRole('menuitem',{name:scene.action,exact:true});
          await expect(item).toBeVisible();
          await audit.settled();
          const change=await audit.step(scene.chapter,scene.action,()=>item.tap(),
            ()=>expect(page.getByRole('dialog',{name:scene.editor,exact:true})).toBeVisible());
          if(page.context().browser()?.browserType().name()==='chromium')expect(change.frames?.length).toBeGreaterThan(1);
          if(change.frames?.length){
            const base=change.frames[0].corner;
            expect(Math.max(...change.frames.map(frame=>frame.corner))-base).toBeLessThanOrEqual(255*.03);
          }
          await expect(page.locator('dialog[open]')).toHaveCount(1);
          await page.keyboard.press('Escape');await expect(page.locator('dialog[open]')).toHaveCount(0);
        }
      }finally{await audit.finish();}
    });
  }
});
