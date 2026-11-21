import {expect,test} from '@playwright/test';
import {NOW,at} from './v7-scenes';

test.use({locale:'en-IN',timezoneId:'Asia/Kolkata'});

for(const {width,textSize} of [{width:390,textSize:100},{width:320,textSize:200},{width:1280,textSize:100}]){
 test(`Day shows deadlines and due practice at ${width}px and ${textSize}% text`,async({page})=>{
  await page.setViewportSize({width,height:844});
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(()=>{
   sessionStorage.setItem('lemma.v6.demo.study.v1',JSON.stringify({schema:1,entries:[],blocks:[]}));
   sessionStorage.setItem('lemma.v6.demo.tasks.v1',JSON.stringify({schema:1,tasks:[]}));
  });
  if(textSize>100)await page.addInitScript(size=>document.addEventListener('DOMContentLoaded',()=>{
   document.documentElement.style.fontSize=size+'%';
  }),textSize);
  const openDay=(date:string)=>page.goto(at('/calendar?view=day&date='+date).replace('#',',-atlasV3#'));

  for(const {date,title,kind} of [
   {date:'2026-11-23',title:'Analysis examination',kind:'Deadline'},
   {date:'2026-11-10',title:'Proof techniques',kind:'Practice due'},
  ]){
   await openDay(date);
   await expect(page.getByRole('heading',{name:'Calendar',exact:true})).toHaveCount(1);
   const grid=page.getByRole('region',{name:'Day time grid'});
   await expect(grid).toBeVisible();
   await expect(grid.locator('.v7-cal-block')).toHaveCount(0);
   await expect(page.getByText('Nothing planned',{exact:true})).toHaveCount(0);

   const trigger=page.getByRole('button',{name:'View 1 due item',exact:true});
   const aside=page.getByRole('complementary',{name:'Selected day'});
   const sheet=page.getByRole('dialog',{name:'Deadlines and practice'});
   if(width<1100){
    await expect(aside).toHaveCount(0);
    await expect(trigger).toBeInViewport();
    await expect(page.getByText(title,{exact:true})).toHaveCount(0);
    await trigger.press('Enter');
    await expect(sheet).toBeVisible();
    const due=sheet.getByRole('listitem').filter({hasText:title});
    await expect(due).toContainText(kind);
    if(textSize>100){
     const geometry=await due.evaluate(row=>{
      const frame=row.getBoundingClientRect();
      const rects=(selector:string)=>[...row.querySelectorAll(selector)].flatMap(element=>{
       const range=document.createRange();range.selectNodeContents(element);
       return [...range.getClientRects()].filter(rect=>rect.width>0&&rect.height>0);
      });
      const time=rects('.v7-ag-time'),details=rects('.v7-ag-body strong,.v7-ag-body small');
      return {contained:frame.left>=0&&frame.right<=innerWidth&&[...time,...details].every(rect=>rect.left>=frame.left&&rect.right<=frame.right),
       separate:time.length>0&&details.length>0&&time.every(a=>details.every(b=>a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom))};
     });
     expect(geometry).toEqual({contained:true,separate:true});
    }
   }else{
    await expect(trigger).toHaveCount(0);
    await expect(aside.getByRole('listitem').filter({hasText:title})).toContainText(kind);
   }
   await expect(page.getByText(title,{exact:true})).toHaveCount(1);
   if(width<1100){
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
   }
  }
  await openDay('2026-11-24');
  await expect(page.getByText('Nothing planned',{exact:true})).toBeVisible();
 });
}
