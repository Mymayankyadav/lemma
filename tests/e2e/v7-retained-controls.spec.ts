import {expect,test,type Page} from '@playwright/test';
import {at,NOW} from './v7-scenes';

const go=(page:Page,route:string)=>page.goto(at(route).replace('#',',v7Room,v7Ruler,v7Qed#'));

test.beforeEach(async({page})=>{await page.clock.setFixedTime(NOW);});

test('Progress retains recent study history on a day without activity',async({page})=>{
  await go(page,'/insights?range=day');
  await expect(page.getByText('No study time yet',{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Study almanac',exact:true})).toBeVisible();
});

test('Add time retains the duration presets, custom duration and rulers',async({page})=>{
  await go(page,'/log');
  await page.getByRole('button',{name:'Add time',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Add time',exact:true});
  const presets=dialog.getByRole('group',{name:'Session duration presets'});
  const start=dialog.getByRole('slider',{name:'Start',exact:true});
  const end=dialog.getByRole('slider',{name:'End',exact:true});
  await expect(start).toHaveAttribute('aria-valuetext','09:00');
  for (const [duration,clock] of [[25,'09:25'],[50,'09:50'],[90,'10:30']]) {
    const preset=presets.getByRole('button',{name:duration+' min',exact:true});
    await preset.click();
    await expect(preset).toHaveAttribute('aria-pressed','true');
    await expect(end).toHaveAttribute('aria-valuetext',String(clock));
    await expect(dialog.getByText(duration+' min session · 09:00–'+clock+' · 24-hour time')).toBeVisible();
  }
  await presets.getByRole('button',{name:'Custom',exact:true}).click();
  await dialog.getByRole('slider',{name:/^Duration/}).press('ArrowRight');
  await expect(end).toHaveAttribute('aria-valuetext','10:35');
  await expect(dialog.getByText('95 min session · 09:00–10:35 · 24-hour time')).toBeVisible();
});

test('Focus finish retains one-minute touch-sized controls alongside the ruler',async({page})=>{
  await go(page,'/');
  await page.getByRole('button',{name:/^(Start now|Start focus)$/}).first().click();
  await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeVisible();
  await page.clock.setFixedTime(new Date(Number(NOW)+120_000));
  await page.getByRole('button',{name:'Finish',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Log this session'});
  const ruler=dialog.getByRole('slider',{name:'Focused time',exact:true});
  const initial=Number(await ruler.inputValue());
  const stepper=dialog.getByRole('group',{name:'Adjust focused time',exact:true});
  await stepper.getByRole('button',{name:'Increase Adjust focused time'}).click();
  await expect(ruler).toHaveValue(String(initial+1));
  await stepper.getByRole('button',{name:'Decrease Adjust focused time'}).click();
  await expect(ruler).toHaveValue(String(initial));
});

test('Checkpoint review can still be opened when zero cards are due',async({page})=>{
  await go(page,'/p/real-analysis/cp/CP1');
  const review=page.getByRole('link',{name:'0 due · Review Metric spaces',exact:true});
  await expect(review).toBeVisible();
  await review.click();
  await expect(page).toHaveURL(/#\/review\/run\?target=checkpoint&id=project-analysis-cp-1$/);
});

test('Close the day has an opaque sticky header',async({page})=>{
  await go(page,'/today/close');
  const main=page.getByRole('main',{name:'Close the day'});
  const header=main.locator(':scope > header');
  await expect(header).toBeVisible();
  await expect(header).toHaveCSS('position','sticky');
  await expect(header).toHaveCSS('background-color',await main.evaluate(node=>getComputedStyle(node).backgroundColor));
});
