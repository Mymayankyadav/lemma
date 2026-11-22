import {expect,test} from '@playwright/test';
import {at,NOW} from './v7-scenes';

test.beforeEach(async({page})=>{await page.clock.setFixedTime(NOW);});

test('Desk clock hides Focus chrome and reveals controls on a tap',async({page})=>{
  await page.goto(at('/').replace('#',',v7DeskClock,focusOrbit#'));
  await page.getByRole('button',{name:/^(Start now|Start focus)$/}).first().click();
  const focus=page.getByRole('main',{name:'Focus'});
  const thought=focus.getByRole('textbox',{name:'Park a thought',exact:true});
  await expect(thought).toBeVisible();
  const dial=focus.locator('.v7-focus-ring');
  const normalWidth=(await dial.boundingBox())!.width;
  await focus.getByRole('button',{name:'Timer details',exact:true}).click();
  await page.getByRole('menuitem',{name:'Desk clock',exact:true}).click();
  await expect(focus).toHaveAttribute('data-desk','');
  await expect(thought).toBeHidden();
  await expect(focus.locator('.v7-immersive-header')).toHaveCSS('opacity','0');
  expect((await dial.boundingBox())!.width).toBeGreaterThan(normalWidth);
  await focus.click({position:{x:6,y:140}});
  await expect(focus.locator('.v7-immersive-header')).toHaveCSS('opacity','1');
  await expect(focus.getByRole('button',{name:'Pause',exact:true})).toBeVisible();
});

test('Capture shows a single type control and retains all choices after selecting one',async({page})=>{
  await page.goto(at('/'));
  const capture=page.getByRole('button',{name:'Capture',exact:true});
  await capture.focus();
  await page.keyboard.press('ContextMenu');
  const sheet=page.getByRole('dialog',{name:'Capture',exact:true});
  const picker=sheet.getByRole('group',{name:'Choose a type',exact:true});
  await expect(picker.getByRole('button')).toHaveCount(4);
  await expect(sheet.locator('.v7-capture-kinds')).toHaveCount(0);
  await picker.getByRole('button',{name:'Time block',exact:true}).click();
  await expect(picker).toHaveCount(0);
  await expect(sheet.getByRole('button',{name:'Add block',exact:true})).toBeVisible();
  const type=sheet.getByRole('radiogroup',{name:'Type',exact:true});
  await expect(type.getByRole('radio',{name:'Time block',exact:true})).toBeChecked();
  await type.getByRole('radio',{name:'Task',exact:true}).click();
  await expect(sheet.getByRole('button',{name:'Add task',exact:true})).toBeVisible();
});
