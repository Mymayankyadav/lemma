import {address, NOW, openHash} from './lib.mjs';
import {installFixture,uploadFixture} from './fixtures.mjs';

const roles = ['button','link','radio','tab','menuitem','menuitemradio','switch','option','checkbox','combobox'];
export function control(page, name, exact=false) {
  return roles.map(role => page.getByRole(role, {name, exact})).reduce((a,b) => a.or(b)).filter({visible:true}).first();
}
export async function step(page, instruction) {
  const i=instruction.indexOf(':');
  const kind=i<0?instruction:instruction.slice(0,i), value=i<0?'':instruction.slice(i+1);
  switch(kind) {
    case 'advance': return page.clock.setFixedTime(new Date(await page.evaluate(()=>Date.now())+Number(value)));
    case 'draw': {
      const paper=page.getByRole('img',{name:'Draw your answer'});
      await paper.scrollIntoViewIfNeeded();const r=await paper.boundingBox();
      const c=await page.context().newCDPSession(page),x=r.x+r.width*.3,y=r.y+r.height*.2;
      try{
        await c.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1,pointerType:'pen',force:.5});
        for(let i=1;i<=8;i++)await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y:y+r.height*.045*i,buttons:1,pointerType:'pen',force:.5});
        return await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y:y+r.height*.36,button:'left',clickCount:1,pointerType:'pen'});
      }finally{await c.detach();}
    }
    case 'padBackup': return page.getByLabel('Import a Pad JSON backup').setInputFiles(uploadFixture('.json'));
    case 'finishReview': {
      const progress=page.getByRole('progressbar',{name:'Review progress'});
      await progress.waitFor();
      const total=Number(await progress.getAttribute('aria-valuemax'));
      for(let i=0;i<total;i++){
        const next=page.getByRole('button',{name:/^Show answer/});
        await next.click();
        await page.getByRole('group',{name:'Grade answer'}).locator('button[data-grade="good"]').click();
        await next.or(page.getByRole('button',{name:'See results'})).or(page.getByRole('heading',{name:'Round complete'})).first().waitFor();
        if(await page.getByRole('button',{name:'See results'}).isVisible()){await page.getByRole('button',{name:'See results'}).click();break;}
        if(await page.getByRole('heading',{name:'Round complete'}).isVisible())break;
      }
      return page.getByRole('heading',{name:'Round complete',exact:true}).waitFor();
    }
    case 'click': case 'clickx': return control(page,value,kind==='clickx').click();
    case 'taskColumn': {
      const column=page.locator('[data-tk-column="'+({Doing:'in_progress',Done:'completed'}[value])+'"]');
      if(await page.getByRole('main',{name:'Tasks'}).isVisible()&&page.viewportSize().width>=900)return column.scrollIntoViewIfNeeded();
      return control(page,value,true).click();
    }
    case 'calendarChoices': {
      const picker=page.getByRole('button',{name:/^Calendar view/});
      const segments=page.getByRole('radiogroup',{name:'Calendar view'});
      await picker.or(segments).first().waitFor();
      if(await picker.isVisible())return picker.click();
      return segments.scrollIntoViewIfNeeded();
    }
    case 'search': return page.keyboard.press('Control+k');
    case 'tapCss': return page.locator(value).filter({visible:true}).first().click();
    case 'show': return page.locator(value).filter({visible:true}).first().scrollIntoViewIfNeeded();
    case 'fill': {
      const dialog=page.locator('dialog[open],[role=dialog]:visible').last();
      const root=await dialog.count()?dialog:page.locator('main:visible').last();
      return root.locator('textarea,input[type=text],input[type=search],input:not([type]),[contenteditable=true]').filter({visible:true}).first().fill(value);
    }
    case 'focus': return page.locator(value).filter({visible:true}).first().focus();
    case 'press': return page.keyboard.press(value);
    case 'wait': return page.waitForTimeout(Number(value));
    case 'offline': return page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:false});dispatchEvent(new Event('offline'));});
    case 'scrollEnd': return page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
    default: throw new Error('Unknown scene step '+instruction);
  }
}
export function applies(scene,device) {
  return !scene.devices || scene.devices.includes(device);
}
export async function openScene(page, scene, onStep, onOpen) {
  await installFixture(page,scene);
  if(scene.chunkError)await page.route(/\/assets\/ProgressV7-[^/]+\.js(?:\?|$)/,route=>route.abort('failed'));
  if(scene.loading) {
    await page.clock.setFixedTime(NOW);
    // Hold the entry bundle for boot, or only the destination lazy chunk for the route fallback.
    if(scene.id==='loading-route') {
      await openHash(page,'/');
      await page.route(/\/assets\/ProgressV7-[^/]+\.js(?:\?|$)/,()=>{});
      await page.evaluate(hash=>{location.hash=hash;},scene.hash);
      await page.locator('[data-loading-surface^=route-],.lemma-route-fallback').filter({visible:true}).first().waitFor();
    } else {
      await page.route('**/*.js',()=>{});
      await page.goto(address(scene.hash),{waitUntil:'commit'});
      await page.locator('[data-loading-surface=boot]').waitFor();
    }
    await onOpen?.();return;
  }
  await openHash(page,scene.hash,{demo:scene.account?'0':scene.demo});
  await onOpen?.();
  for(const instruction of scene.steps??[]) {
    const perform=()=>step(page,instruction);
    try { if(onStep)await onStep(instruction,perform);else await perform(); }
    catch(error){throw new Error(instruction+' → '+error.message.split('\n')[0],{cause:error});}
  }
  if(scene.expect)await page.locator(scene.expect).filter({visible:true}).first().waitFor();
}
