import {expect,test,type Locator} from '@playwright/test';
import {at,NOW} from './v7-scenes';

async function expectVisibleFocus(input:Locator){
 await expect(input).toBeFocused();
 const focus=await input.evaluate(node=>{
  const style=getComputedStyle(node),surface=getComputedStyle(node.closest('dialog')!).backgroundColor;
  const luminance=(css:string)=>{
   const channels=(css.match(/[\d.]+/g)??[]).slice(0,3).map(Number);
   if(channels.length!==3)return NaN;
   return channels.reduce((value,channel,index)=>{
    const rgb=channel/255;
    return value+[.2126,.7152,.0722][index]*(rgb<=.04045?rgb/12.92:((rgb+.055)/1.055)**2.4);
   },0);
  };
  const hues=[luminance(style.outlineColor),luminance(surface)];
  return {width:parseFloat(style.outlineWidth),style:style.outlineStyle,contrast:(Math.max(...hues)+.05)/(Math.min(...hues)+.05)};
 });
 expect(focus.width).toBeGreaterThan(0);
 expect(focus.style).toBe('solid');
 expect(focus.contrast).toBeGreaterThanOrEqual(3);
}

test('Search opens precise Settings destinations and restores the query, active result and opener on a narrow Day screen',async({page})=>{
 await page.setViewportSize({width:320,height:780});
 await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
 await page.addInitScript(()=>localStorage.setItem('lemma.ui',JSON.stringify({mode:'day'})));
 await page.clock.setFixedTime(NOW);
 await page.goto(at('/').replace('v7Shell,v6Shell','v7Shell,v6Shell,v7Room'));
 await expect(page.locator('html')).toHaveAttribute('data-theme','graph');
 const opener=page.getByRole('navigation',{name:'Page actions'}).getByRole('button',{name:'Search'});
 await opener.focus();
 await page.keyboard.press('Control+k');
 const dialog=page.getByRole('dialog',{name:'Search'}),input=dialog.getByRole('combobox',{name:'Search'});
 await expectVisibleFocus(input);

 await input.fill('a');
 await expect(dialog.getByRole('option',{name:'Appearance',exact:true})).toBeVisible();
 await expect(dialog.getByRole('option',{name:'Data and account',exact:true})).toBeVisible();
 await page.waitForLoadState('networkidle');
 const index=await dialog.getByRole('option').evaluateAll(rows=>rows.findIndex(row=>row.textContent==='Appearance'));
 expect(index).toBeGreaterThan(0);
 for(let i=0;i<index;i++)await input.press('ArrowDown');
 await expect(dialog.getByRole('option',{name:'Appearance',selected:true})).toBeVisible();
 await input.press('Enter');
 await expect(page).toHaveURL(/#\/settings\?section=appearance$/);
 await expect(page.getByRole('heading',{name:'Appearance',exact:true})).toBeFocused();
 await expect(dialog).toBeHidden();

 await page.getByRole('button',{name:'Back',exact:true}).click();
 await expect(page).toHaveURL(/#\/$/);
 await expect(input).toBeFocused();
 await expect(input).toHaveValue('a');
 const selected=dialog.getByRole('option',{name:'Appearance',selected:true});
 await expect(selected).toBeInViewport();
 const selectedId=await selected.getAttribute('id');
 expect(selectedId).toBeTruthy();
 await expect(input).toHaveAttribute('aria-activedescendant',selectedId!);
 await expect.poll(()=>dialog.locator('.v7-sheet-body').evaluate(node=>node.scrollWidth-node.clientWidth)).toBeLessThanOrEqual(1);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);

 // Modal tabbing may visit browser chrome but must not focus the underlying page.
 for(let i=0;i<4;i++){
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate(node=>node.contains(document.activeElement)||document.activeElement===document.body)).toBe(true);
 }
 await page.keyboard.press('Escape');
 await expect(dialog).toBeHidden();
 await expect(opener).toBeFocused();
 await opener.press('Enter');
 await expect(input).toHaveValue('');
 await input.fill('account');
 await expect(dialog.getByRole('option',{name:'Data and account',exact:true})).toBeVisible();
 await input.press('Enter');
 await expect(page).toHaveURL(/#\/settings\?section=data$/);
 await expect(page.getByRole('heading',{name:'Data and account',exact:true})).toBeFocused();
});

test('legacy Notifications recents and alias open the same split Settings pane on a Night screen',async({page})=>{
 await page.setViewportSize({width:1060,height:844});
 await page.emulateMedia({colorScheme:'light',reducedMotion:'reduce'});
 await page.addInitScript(()=>localStorage.setItem('lemma.ui',JSON.stringify({mode:'night'})));
 await page.addInitScript(()=>localStorage.setItem('lemma.v7.recent',JSON.stringify([
  {id:'setting:Notifications',group:'Settings',title:'Notifications',to:'/settings'},
  {id:'setting:Reminders',group:'Settings',title:'Reminders',to:'/settings'},
 ])));
 await page.goto(at('/').replace('v7Shell,v6Shell','v7Shell,v6Shell,-v7Room'));
 await expect(page.locator('html')).toHaveAttribute('data-theme','graph-night');
 const opener=page.getByRole('navigation',{name:'Page actions'}).getByRole('button',{name:'Search'});
 await opener.click();
 const dialog=page.getByRole('dialog',{name:'Search'}),input=dialog.getByRole('combobox',{name:'Search'});
 await expectVisibleFocus(input);
 await expect(dialog.getByRole('region',{name:'Recent'}).getByRole('option',{name:'Reminders',exact:true})).toHaveCount(1);
 await dialog.getByRole('option',{name:'Reminders',exact:true}).click();
 await expect(page).toHaveURL(/#\/settings\?section=reminders$/);
 await expect(page.getByRole('heading',{name:'Reminders',exact:true,level:2})).toBeFocused();

 await page.goBack();
 await expect(input).toBeFocused();
 await expect(dialog.getByRole('option',{name:'Reminders',exact:true,selected:true})).toBeVisible();
 await input.fill('Notifications');
 await expect(dialog.getByRole('option',{name:'Notifications',exact:true})).toHaveCount(0);
 await expect(dialog.getByRole('option',{name:'Reminders',exact:true,selected:true})).toBeVisible();
 await input.press('Enter');
 await expect(page).toHaveURL(/#\/settings\?section=reminders$/);
 await expect(page.getByRole('heading',{name:'Reminders',exact:true,level:2})).toBeFocused();
});
