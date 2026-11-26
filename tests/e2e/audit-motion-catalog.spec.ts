import {expect,test} from '@playwright/test';
import {MotionAudit} from './helpers/motion-audit';
import {NOW} from './v7-scenes';

// Direct route visits complement the input-driven Search, Capture and Review recordings.
const catalog=[
  ['01','Today','/','main[aria-label="Today"]'],['03','Welcome','/welcome','main[aria-label="Welcome"]'],
 ['06','Calendar','/calendar?view=day&date=2026-11-09','.v7-cal[data-calendar-view="day"]'],
  ['07','Task list','/tasks','main[aria-label="Tasks"]'],['09','Atlas','/atlas?view=list','.v7-atlas[data-view="list"]'],
  ['10','Path','/p/real-analysis','main[aria-label="Path"]'],['11','Inbox','/proposals','main[aria-label="Inbox"]'],
  ['12','Checkpoint tutor','/p/real-analysis/cp/CP4/tutor','main[aria-label="Checkpoint tutor"]'],
  ['13','Focus','/focus','main[aria-label="Focus"]'],['14','Progress','/insights','main[aria-label="Progress"]'],
  ['15','Study settings','/settings?section=study','main.v7-settings'],['16','Appearance settings','/settings?section=appearance','main.v7-settings'],
  ['17','Wrap up','/today/close','main[aria-label="Close the day"]'],['19','Calendar week','/calendar?view=week&date=2026-11-09','.v7-cal[data-calendar-view="week"]'],
  ['20','Local Pad','/pad','main[aria-label="Device Pad"]'],['21','Review hub','/review','main[aria-label="Review"]'],
  ['23','Tutor workspace','/p/real-analysis/tutor','main[aria-label="Checkpoint tutor"]'],
  ['24','Time log','/log','main[aria-label="Time log"]'],['25','Device paper','/pad','main[aria-label="Device Pad"]'],
  ['26','Card library','/cards','.v7-cards'],['27','Checkpoint','/p/real-analysis/cp/CP4','main[aria-label="Checkpoint"]'],
] as const;

for(const [size,theme] of [[390,'day'],[390,'night'],[1440,'day'],[1440,'night']] as const){
  test('route catalog '+size+' '+theme,async({page},info)=>{
    test.setTimeout(150_000);
    await page.setViewportSize({width:size,height:size===390?844:900});
    await page.clock.setFixedTime(NOW);
    await page.emulateMedia({colorScheme:theme==='day'?'light':'dark',reducedMotion:'no-preference'});
    const audit=new MotionAudit(page,info);await audit.start();
    const prefix=size===390?'M':'D';
    try{
      await page.goto('/lemma/?demo=1&flags=v7Shell,v6Shell,padLocal,tutorScratch&mode='+theme+'#/');
      for(const [chapter,label,route,selector] of catalog){
        await audit.step(prefix+chapter,label,()=>page.evaluate(path=>{location.hash=path;},route),async()=>{
          await expect(page.locator(selector).first()).toBeVisible();
          await expect(page.getByText('Couldn’t open this screen',{exact:true})).toHaveCount(0);
        });
      }
    }finally{await audit.finish();}
  });
}
