import {test,expect,type Page} from '@playwright/test';

// N20: exercise the real demo StudyApi, not a mocked browser-side store.
const home='./?demo=1&flags=v6Shell#/';
// The demo seed puts saved entries at fixed weekday/hour slots (for example Friday 14:00-14:30). A run inside one of
// them overlaps the entry this test saves, so the interval union adds nothing and the total does not move. Start from
// an account with no seeded time, only when nothing is stored yet, so a reload still keeps what the test saved.
const emptyStudy=(page:Page)=>page.addInitScript(()=>{
 try{if(!sessionStorage.getItem('lemma.v6.demo.study.v1'))sessionStorage.setItem('lemma.v6.demo.study.v1',JSON.stringify({schema:1,entries:[],blocks:[]}))}catch{/* storage blocked */}
});

const loggedOutput=(page:Page)=>page.locator('output[aria-label="Logged today"]');
async function loggedMinutes(page:Page):Promise<number>{
 const output=loggedOutput(page);
 await expect(output).toBeVisible();
 const text=await output.innerText();
 const value=Number(text.replace(/\s*min$/, '').trim());
 expect(Number.isFinite(value)).toBe(true);
 return value;
}

test('N20 demo Focus starts, pauses, resumes, finishes and saves logged time at 390×844',async({page})=>{
 test.setTimeout(90_000);
 await page.setViewportSize({width:390,height:844});
 await emptyStudy(page);
 await page.goto(home);
 const before=await loggedMinutes(page);
 await page.getByRole('textbox',{name:'Focus intention'}).fill('N20 focus flow');
 await page.getByRole('button',{name:'Start focus'}).click();
 const dialog=page.getByRole('dialog',{name:'Focus'});
 await expect(dialog).toBeVisible();
 await expect(page.getByRole('complementary',{name:'Focus accessory'})).toContainText('N20 focus flow');
 await dialog.getByRole('button',{name:'Pause',exact:true}).click();
 await expect(dialog.getByRole('button',{name:'Resume',exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'Resume',exact:true}).click();
 await expect(dialog.getByRole('button',{name:'Finish'})).toBeVisible();
 await dialog.getByRole('button',{name:'Finish'}).click();
 // #1315: the reflection is asked for when the session is logged.
 await dialog.getByRole('textbox',{name:'What did you learn?'}).fill('Review the proof structure');
 await dialog.getByRole('spinbutton',{name:'Minutes to save'}).fill('4');
 await dialog.getByRole('button',{name:'Save',exact:true}).click();
 await expect(dialog).toBeHidden();
 await expect.poll(()=>loggedMinutes(page)).toBeCloseTo(before+4,3);
 await expect(page.getByRole('button',{name:'Start focus'})).toBeEnabled();
 await page.reload();
 await expect.poll(()=>loggedMinutes(page)).toBeCloseTo(before+4,3);
});

test('N20 Focus restores a running draft, Escape returns focus and discard logs nothing at 320×640',async({page})=>{
 test.setTimeout(90_000);
 await page.setViewportSize({width:320,height:640});
 await emptyStudy(page);
 await page.goto(home);
 const before=await loggedMinutes(page);
 await page.getByRole('textbox',{name:'Focus intention'}).fill('Discardable focus');
 await page.getByRole('button',{name:'Start focus'}).click();
 const dialog=page.getByRole('dialog',{name:'Focus'});
 await expect(dialog).toBeVisible();
 const box=await dialog.boundingBox();
 expect(box).not.toBeNull();
 expect(box!.x).toBeGreaterThanOrEqual(0);
 expect(box!.x+box!.width).toBeLessThanOrEqual(321);
 expect(box!.y+box!.height).toBeLessThanOrEqual(641);
 await page.reload();
 await expect(page.getByRole('button',{name:'Return to focus'})).toBeVisible();
 await expect(page.getByRole('complementary',{name:'Focus accessory'})).toContainText('Discardable focus');
 await page.getByRole('button',{name:'Return to focus'}).click();
 await expect(dialog).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(dialog).toBeHidden();
 await expect(page.getByRole('button',{name:'Return to focus'})).toBeFocused();
 await page.getByRole('button',{name:'Return to focus'}).click();
 await dialog.getByRole('button',{name:'Finish'}).click();
 await dialog.getByRole('spinbutton',{name:'Minutes to save'}).fill('9');
 await dialog.getByRole('button',{name:'Discard'}).click();
 await expect(dialog).toBeHidden();
 await expect.poll(()=>loggedMinutes(page)).toBeCloseTo(before,3);
 await page.reload();
 await expect.poll(()=>loggedMinutes(page)).toBeCloseTo(before,3);
 await expect(page.getByRole('button',{name:'Start focus'})).toBeVisible();
});
