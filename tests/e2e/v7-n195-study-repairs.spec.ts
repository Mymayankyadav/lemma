import {expect,test} from '@playwright/test';
import {at,NOW} from './v7-scenes';

const repair=(route:string)=>at(route).replace('flags=','flags=uiRepairV1,atlasV3,');
test('practice requires an explicit rating and saves the chosen rating',async({page})=>{
 await page.clock.setFixedTime(NOW);await page.goto(repair('/practice'));
 const topic=page.getByRole('list',{name:'Practice topics'}).getByRole('listitem').first();
 await topic.getByRole('button',{name:/^Practice /}).click();
 const dialog=page.getByRole('dialog'),save=dialog.getByRole('button',{name:'Save',exact:true});
 await expect(dialog.getByRole('radio',{checked:true})).toHaveCount(0);await expect(save).toBeDisabled();
 await dialog.getByRole('radio',{name:'Good'}).click();await expect(save).toBeEnabled();await save.click();
 await expect(dialog).toHaveCount(0);
});
test('each map tool receives its ordinary tap with and without the concept sheet',async({page})=>{
 for(const width of [320,390]){
  await page.setViewportSize({width,height:width===320?640:844});
  await page.goto(repair('/atlas?view=map'));
  const layers=page.getByRole('button',{name:'Layers',exact:true}),recentre=page.getByRole('button',{name:'Recentre map'});
  for(const selected of [false,true]){
   if(selected){
    await page.getByRole('button',{name:'Search concepts'}).click();
    await page.getByRole('searchbox').fill('compact');
    const match=page.getByRole('list',{name:'Matching concepts'}).getByRole('button').first();
    await match.click();
   }
   await layers.click();const sheet=page.getByRole('dialog',{name:'Layers',exact:true});
   await expect(sheet.getByRole('region',{name:'Key',exact:true})).toBeVisible();
   await sheet.getByRole('button',{name:'Close',exact:true}).click();await recentre.click();
   for(const tool of [layers,recentre]){
    expect(await tool.evaluate(el=>{const b=el.getBoundingClientRect();return el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));})).toBe(true);
   }
  }
 }
});
test('Atlas List and populated layers survive reload and Back returns to the previous view',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('lemma.demo.atlas-v3',JSON.stringify({
  atlas:{},kinds:{'concept-compactness':'theme'},links:{},
 })));
 await page.goto(repair('/atlas?view=list'));
 const layers=page.getByRole('button',{name:'Layers',exact:true}),sheet=page.getByRole('dialog',{name:'Layers',exact:true});
 await layers.click();
 const themes=sheet.getByRole('button',{name:'Themes',exact:true});
 await expect(themes).toBeVisible();
 await expect(sheet.getByRole('button',{name:'Bridges',exact:true})).toHaveCount(0);
 await themes.click();
 const thematicMap=page.getByRole('region',{name:'Themes',exact:true});
 await expect(thematicMap.getByRole('button',{name:'Compactness',exact:true})).toBeVisible();
 await expect(layers).toBeVisible();
 await page.reload();await expect(thematicMap).toBeVisible();
 await page.getByRole('button',{name:'List',exact:true}).click();
 await expect(page.getByRole('region',{name:'Concept list'})).toBeVisible();
 await page.reload();await expect(page.getByRole('region',{name:'Concept list'})).toBeVisible();
 await page.goBack();await expect(thematicMap).toBeVisible();
});
test('day summary stays while Share has focus, until the learner chooses Done',async({page})=>{
 await page.clock.install({time:NOW});await page.goto(repair('/today/close?date=2026-11-08'));
 await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByRole('button',{name:'Next',exact:true}).click();
 await page.getByRole('button',{name:'Close the day',exact:true}).click();
 const done=page.getByRole('button',{name:'Done',exact:true});
 await expect(done).toBeVisible();const share=page.getByRole('button',{name:/Share/}).first();await share.focus();
 await page.clock.fastForward(30_100);await expect(share).toBeFocused();await expect(done).toBeVisible();
 await done.click();await expect(page).toHaveURL(/#\/$/);
});
test('an empty shelf exposes one path creation action',async({page})=>{
 await page.goto(repair('/projects').replace('demo=1','demo=first-use'));
 await expect(page.getByRole('link',{name:'Start a new path'})).toHaveCount(1);
});

for(const [theme,os] of [['graph','dark'],['graph-night','light']] as const) test('keyboard chart focus has a painted two-pixel ring in '+theme+' with the opposite OS setting',async({page},info)=>{
 await page.setViewportSize({width:1440,height:960});await page.emulateMedia({colorScheme:os});
 await page.goto(repair('/review').replace('#','&theme='+theme+'#'));
 await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
 // N220 (Owner report): the chart has no Table switch to Tab from, so the keyboard enters at the roving point.
 const plot=page.getByRole('region',{name:'Due each day'});
 await expect(plot.getByRole('button',{name:/show as table/i})).toHaveCount(0);
 const points=plot.locator('[data-chart-point]');
 await points.first().focus();
 await expect(points.first()).toBeFocused();await page.keyboard.press('ArrowRight');await expect(points.nth(1)).toBeFocused();
 const band=plot.locator('.v7-chart-band');
 await expect(band).toHaveCSS('stroke-width','2px');await expect(band).toHaveCSS('stroke-opacity','1');
 await band.scrollIntoViewIfNeeded();
 const box=await band.boundingBox();if(!box)throw Error('Missing chart focus band');
 const pixels=(await page.screenshot({scale:'css'})).toString('base64');
 const samples=await page.evaluate(async({pixels,box})=>{
  const img=new Image();img.src='data:image/png;base64,'+pixels;await img.decode();
  const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
  const ctx=canvas.getContext('2d')!;ctx.drawImage(img,0,0);
  const lum=(x:number,y:number)=>{
   const channels=Array.from(ctx.getImageData(Math.round(x),Math.round(y),1,1).data).slice(0,3).map(v=>{
    const s=v/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;
   });return .2126*channels[0]+.7152*channels[1]+.0722*channels[2];
  };
  return [.23,.41,.63].map(height=>{
   const y=box.y+box.height*height,bg=lum(box.x-4,y);
   return Math.max(...[-1,0,1].map(offset=>{const ring=lum(box.x+offset,y);return (Math.max(bg,ring)+.05)/(Math.min(bg,ring)+.05);}));
  });
 },{pixels,box});
 expect(Math.min(...samples)).toBeGreaterThanOrEqual(3);
 await info.attach('painted-focus-ratios',{body:JSON.stringify({theme,os,samples}),contentType:'application/json'});
});

test('Planning saves seven weekday capacities and copies the previous week in week-start order',async({page})=>{
 await page.clock.setFixedTime(NOW);
 await page.addInitScript(()=>sessionStorage.setItem('lemma.demo.capacity-overrides',JSON.stringify({'2026-11-02':95})));
 await page.goto(repair('/settings?section=planning'));
 await page.getByRole('button',{name:'Set weekday minutes'}).click();
 const sheet=page.getByRole('dialog',{name:'Weekday study minutes'});
 await expect(sheet.getByRole('slider').first()).toHaveAccessibleName('Monday');
 await sheet.getByRole('button',{name:'Weekdays 1 h'}).click();
 await sheet.getByRole('button',{name:'Weekends 2 h'}).click();
 await sheet.getByRole('slider',{name:'Monday',exact:true}).press('ArrowLeft');
 await sheet.getByRole('button',{name:'Save availability'}).click();
 await expect(sheet).toHaveCount(0);await expect(page.getByText('Available today · 59 min')).toBeVisible();
 await page.reload();await expect(page.getByText('Available today · 59 min')).toBeVisible();
 await page.getByRole('button',{name:'Edit weekday minutes'}).click();
 for(const [day,value] of [['Sunday','120'],['Monday','59'],['Tuesday','60'],['Wednesday','60'],['Thursday','60'],['Friday','60'],['Saturday','120']])
  await expect(sheet.getByRole('slider',{name:day,exact:true})).toHaveValue(value);
 await sheet.getByRole('button',{name:'Copy last week'}).click();
 await expect(sheet.getByRole('slider',{name:'Monday',exact:true})).toHaveValue('95');
 await expect(sheet.getByRole('slider',{name:'Tuesday',exact:true})).toHaveValue('60');
});
