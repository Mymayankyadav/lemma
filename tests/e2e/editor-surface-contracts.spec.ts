import {expect,test} from '@playwright/test';
import {enableSurfaceBeta} from './helpers/surface-preview';

test.beforeEach(async({page})=>{await enableSurfaceBeta(page);});
import {NOW} from './v7-scenes';

const visit=(route:string,theme='day')=>'/lemma/?demo=1&flags=v7Shell,v6Shell&mode='+theme+'#'+route;
for(const width of [390,700,840,1024,1440]){
  test('picker owns Escape, focus and the editor draft at '+width+' px',async({page})=>{
    await page.setViewportSize({width,height:900});
    await page.goto(visit('/tasks?new=1'));
    const editor=page.getByRole('dialog',{name:'New task',exact:true});
    const title=editor.getByRole('textbox',{name:'Title',exact:true});
    await title.fill('Keep this draft');
    const due=page.getByRole('button',{name:/^Due:/});
    await due.click();
    if(width>=700){
      const list=page.getByRole('listbox',{name:'Due',exact:true});
      await expect(list).toBeVisible();
      expect(await list.evaluate(el=>el.matches(':popover-open'))).toBe(true);
      await page.keyboard.press('End');await expect(list.getByRole('option').last()).toBeFocused();
      await page.keyboard.press('Home');await expect(list.getByRole('option').first()).toBeFocused();
      const fits=await list.evaluate(el=>{
        const box=el.getBoundingClientRect(),footer=el.closest('dialog')?.querySelector('.v7-sheet-footer');
        return box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=Math.min(innerHeight,footer?.getBoundingClientRect().top??innerHeight)+1;
      });
      expect(fits).toBe(true);
    }else{
      await expect(page.locator('dialog[open]')).toHaveCount(1);
      await expect(page.getByRole('radiogroup',{name:'Due'})).toBeVisible();
      await expect(page.getByRole('button',{name:'Back',exact:true})).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await expect(editor).toBeVisible();
    await expect(due).toBeFocused();
    await expect(title).toHaveValue('Keep this draft');
    if(width>=700){
      await due.click();await page.keyboard.press('Tab');
      await expect(page.getByRole('listbox',{name:'Due'})).toHaveCount(0);
      await expect(editor.getByRole('button',{name:/^Path:/})).toBeFocused();
    }
    await page.keyboard.press('Escape');
    const guard=page.getByRole('dialog',{name:'Discard changes?'});
    await expect(guard.getByRole('button',{name:'Keep editing'})).toBeFocused();
    await guard.getByRole('button',{name:'Keep editing'}).click();
    await expect(title).toHaveValue('Keep this draft');
    await page.keyboard.press('Escape');await guard.getByRole('button',{name:'Discard changes'}).click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');
  });
}
test('date grid follows civil dates across month and year and commits only on selection',async({page})=>{
  await page.setViewportSize({width:1024,height:768});
  await page.clock.setFixedTime(NOW);
  await page.goto(visit('/calendar?view=day&date=2026-11-26'));
  await page.getByRole('button',{name:'Calendar actions',exact:true}).click();
  await page.getByRole('menuitem',{name:'Choose date',exact:true}).click();
  const picker=page.getByRole('dialog',{name:'Choose a date'}),day=(key:string)=>picker.locator('[data-day="'+key+'"]');
  await expect(day('2026-11-26')).toBeFocused();
  await page.keyboard.press('ArrowDown');await expect(day('2026-12-03')).toBeFocused();
  await page.keyboard.press('ArrowUp');await expect(day('2026-11-26')).toBeFocused();
  await page.keyboard.press('PageDown');await page.keyboard.press('PageDown');await expect(day('2027-01-26')).toBeFocused();
  await expect(page).toHaveURL(/date=2026-11-26/);
  await expect(picker.locator('[data-day][tabindex="0"]')).toHaveCount(1);
  await page.keyboard.press('Enter');await expect(page).toHaveURL(/date=2027-01-26/);
});

for(const scenario of [
 {entry:'Capture task',kind:'Task',picker:'Due',field:'Title',route:'/'},
 {entry:'Capture card',kind:'Card',picker:'Path',field:'Front',route:'/'},
 {entry:'Capture card with a draft',kind:'Card',picker:'Path',field:'Front',route:'/'},
 {entry:'Capture time block',kind:'Time block',picker:'Path',field:'Calendar block title',route:'/'},
 {entry:'Calendar editor',picker:'Path',field:'Calendar block title',route:'/calendar?view=day&new=block'},
 {entry:'Clean task',picker:'Due',field:'Title',route:'/tasks?new=1'},
 {entry:'Edit card',picker:'Type',field:'Front',route:'/cards/1'},
 {entry:'Add a goal',picker:'Subject',route:'/insights'},
]){
  test('one desktop Escape in '+scenario.entry+' closes only its list',async({page})=>{
    await page.setViewportSize({width:1440,height:900});await page.clock.setFixedTime(NOW);
    await page.goto(visit(scenario.route));
    if(scenario.kind){
      await page.getByRole('button',{name:'Capture',exact:true}).click();
      await page.getByRole('textbox',{name:'What do you want to add?'}).fill(scenario.kind==='Card'?'Question :: Answer':'Read chapter tomorrow 4pm');
      await page.getByRole('radio',{name:scenario.kind,exact:true}).click();
      await page.getByRole('button',{name:'Add details',exact:true}).click();
    }else if(scenario.entry==='Edit card')await page.getByRole('button',{name:'Edit card',exact:true}).click();
    else if(scenario.entry==='Add a goal'){
      await page.getByRole('button',{name:'Progress actions'}).click();
      await page.getByRole('menuitem',{name:'Add a goal'}).click();
    }
    const panel=page.locator('dialog[data-layer-active]');
    const field=scenario.field?panel.getByRole('textbox',{name:scenario.field,exact:true}):null;
    if(scenario.entry==='Capture card with a draft')await field!.fill('Keep the advanced draft');
    const value=field?await field.inputValue():null;
    const trigger=panel.getByRole('button',{name:new RegExp('^'+scenario.picker+':')});
    await trigger.click();
    await expect(page.getByRole('listbox',{name:scenario.picker,exact:true})).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox',{name:scenario.picker,exact:true})).toHaveCount(0);
    await expect(panel).toBeVisible();await expect(trigger).toBeFocused();
    if(field)await expect(field).toHaveValue(value!);
  });
}

test('the Wrap up picker stays above its dock and all options remain reachable at 200% zoom',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await page.clock.setFixedTime(NOW);
  await page.goto(visit('/today/close'));
  const main=page.getByRole('main',{name:'Close the day'});
  await expect(main).toBeVisible();
  const next=main.getByRole('button',{name:'Next',exact:true});
  const field=main.getByRole('button',{name:/^First task tomorrow:/});
  await expect(field.or(next)).toBeVisible();
  if(await next.count()){await next.click();await next.click();}
  await page.evaluate(()=>{document.documentElement.style.zoom='2';});
  await field.click();
  const choices=page.getByRole('listbox',{name:'First task tomorrow'});
  await expect(choices).toBeVisible();
  await page.keyboard.press('End');await expect(choices.getByRole('option').last()).toBeFocused();
  await page.keyboard.press('Home');await expect(choices.getByRole('option').first()).toBeFocused();
  const geometry=await choices.evaluate(el=>{
    const box=el.getBoundingClientRect(),dock=document.querySelector('.v7-cd-footer')!.getBoundingClientRect();
    return {right:box.right,width:innerWidth,bottom:box.bottom,top:box.top,limit:Math.min(dock.top,innerHeight)};
  });
  expect(geometry.right).toBeLessThanOrEqual(geometry.width+1);
  expect(geometry.top).toBeGreaterThanOrEqual(0);expect(geometry.bottom).toBeLessThanOrEqual(geometry.limit+1);
  await page.keyboard.press('Escape');await expect(field).toBeFocused();
});

test('turning Beta off in Settings preserves an open editor in another tab',async({page,context})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto(visit('/tasks?new=1'));
  const title=page.getByRole('textbox',{name:'Title',exact:true});
  await title.fill('Keep my draft');
  const due=page.getByRole('button',{name:/^Due:/});
  await due.click();
  await expect(page.locator('dialog[open][data-choice-step]')).toHaveCount(1);
  const settings=await context.newPage();
  await settings.goto(visit('/settings?section=advanced'));
  const beta=settings.getByRole('switch',{name:'Beta testing',exact:true});
  await expect(beta).toBeChecked();
  await beta.click();await expect(beta).not.toBeChecked();
  await expect(page.locator('html[data-v7-beta]')).toHaveCount(0);
  await settings.close();await page.bringToFront();
  await expect(page.locator('dialog[open][data-choice-step]')).toHaveCount(1);
  await page.keyboard.press('Escape');await expect(title).toHaveValue('Keep my draft');
  await due.click();
  await expect(page.locator('dialog[open]')).toHaveCount(2);
  await page.keyboard.press('Escape');await expect(due).toBeFocused();
});
