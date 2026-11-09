import {test,expect} from '@playwright/test';
test.use({locale:'en-IN',timezoneId:'Asia/Kolkata'});

test('N121 B3 Day uses a spatial grid; tapping an empty slot opens an editable native block dialog',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/?demo=1&flags=v6Shell#/calendar?view=day&date=2026-11-09');
 const region=page.getByRole('region',{name:'Day time grid'});
 await expect(region).toBeVisible();
 await expect(page.getByText('Day hourly timetable')).toHaveCount(0);
 const surface=region.locator('[aria-label="Select empty time to create a block"]');
 const rect=await surface.boundingBox();
 expect(rect).not.toBeNull();
 await page.mouse.click(rect!.x+Math.min(12,rect!.width/2),rect!.y+Math.min(80,rect!.height/2));
 const dialog=page.getByRole('dialog',{name:'New time block'});
 await expect(dialog).toBeVisible();
 await expect(dialog.getByRole('textbox',{name:'Calendar block title'})).toBeVisible();
 await dialog.getByRole('button',{name:'Create block'}).click({trial:true});
 await page.keyboard.press('Escape');
 await expect(dialog).toBeHidden();
});

test('N121 B2 Add menu opens a modal even with Planning tools closed',async({page})=>{
 await page.goto('/?demo=1&flags=v6Shell#/calendar?view=day&date=2026-11-09');
 const tools=page.getByText('Planning tools',{exact:true});
 await tools.click();
 await page.getByRole('button',{name:'New time block',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'New time block'})).toBeVisible();
});

test('N121 B2 duration presets use owner-local wall times',async({page})=>{
 await page.goto('/?demo=1&flags=v6Shell#/calendar?view=day&date=2026-11-09');
 await page.getByText('Planning tools',{exact:true}).click();
 await page.getByRole('button',{name:'New time block',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'New time block'});
 await dialog.getByLabel('Calendar block start').fill('2026-11-09T15:00');
 await dialog.getByRole('group',{name:'Block duration'}).getByRole('button',{name:'50 min'}).click();
 await expect(dialog.getByLabel('Calendar block end')).toHaveValue('2026-11-09T15:50');
 await expect(dialog.getByLabel('Block path')).toBeVisible();
 await expect(dialog.getByLabel('Block task')).toBeVisible();
});

test('N121 B4 Week view does not create a sideways 700 px table on a phone',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/?demo=1&flags=v6Shell#/calendar?view=week&date=2026-11-09');
 const region=page.getByRole('region',{name:'Week time grid'});
 await expect(region).toBeVisible();
 const width=await region.evaluate(node=>({scroll:node.scrollWidth,client:node.clientWidth}));
 expect(width.scroll).toBeLessThanOrEqual(width.client+2);
 await expect(region.locator('[data-week-grid-column]')).toHaveCount(7);
 const eventTitles=region.locator('[data-week-event] strong');
 if(await eventTitles.count()){
  const style=await eventTitles.first().evaluate(node=>({
   overflow:getComputedStyle(node).textOverflow,
   words:getComputedStyle(node).wordBreak,
  }));
  expect(style.overflow).toBe('ellipsis');
  expect(style.words).toBe('normal');
 }
});
