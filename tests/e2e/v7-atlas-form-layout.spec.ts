import {enableSurfaceBeta} from './helpers/surface-preview';
import {expect,test} from '@playwright/test';
import {at,NOW} from './v7-scenes';

for(const [width,height,scale] of [[320,640,100],[390,844,160],[844,390,100],[390,420,100]]){
 test(`Atlas idea form stays opaque and usable at ${width}×${height}, ${scale}% text`,async({page})=>{
  await page.setViewportSize({width,height});await page.clock.setFixedTime(NOW);
  await page.addInitScript(value=>document.addEventListener('DOMContentLoaded',()=>document.documentElement.style.fontSize=value+'%'),scale);
  await page.goto(at('/atlas?view=list'));
  await page.getByRole('button',{name:'New concept',exact:true}).click();
  const sheet=page.locator('dialog[open]').last();
  // The rejected implementation had a transparent, non-modal legacy dialog.
  await expect.poll(()=>sheet.evaluate(node=>node.matches(':modal'))).toBe(true);
  const background=await sheet.evaluate(node=>getComputedStyle(node).backgroundColor);
  expect(background).not.toBe('rgba(0, 0, 0, 0)');expect(background).not.toBe('transparent');
  await expect(page.getByRole('heading',{name:'Create idea',exact:true})).toBeVisible();
  await sheet.getByRole('button',{name:/^Subject:/}).click();
  await page.getByRole('radio',{name:'Topology',exact:true}).or(page.getByRole('option',{name:'Topology',exact:true})).click();
  await sheet.getByRole('textbox',{name:'Atlas idea name'}).fill('Test neighbourhood lemma');
  await sheet.getByRole('textbox',{name:'Atlas idea description'}).fill('Every point has an open neighbourhood.');
  const geometry=await sheet.evaluate(node=>{
   const box=(selector:string)=>node.querySelector(selector)!.getBoundingClientRect().toJSON();
   return {header:box('.v7-sheet-header'),body:box('.v7-sheet-body'),footer:box('.v7-sheet-footer'),
    overflow:node.scrollWidth-node.clientWidth,groups:[...node.querySelectorAll('.v7-atlas-command > *')].map(element=>element.getBoundingClientRect().toJSON())};
  });
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  expect(geometry.header.bottom).toBeLessThanOrEqual(geometry.body.top+1);
  expect(geometry.body.bottom).toBeLessThanOrEqual(geometry.footer.top+1);
  expect(geometry.footer.bottom).toBeLessThanOrEqual(height+1);
  for(let index=1;index<geometry.groups.length;index++)expect(geometry.groups[index-1].bottom).toBeLessThanOrEqual(geometry.groups[index].top+1);
  const submit=sheet.getByRole('button',{name:'Create idea',exact:true});
  await expect(submit).toBeInViewport();await submit.click();await expect(sheet).toHaveCount(0);
  await page.getByRole('button',{name:'Search concepts'}).click();
  await page.getByPlaceholder('Find a concept',{exact:true}).fill('Test neighbourhood lemma');
  await expect(page.getByRole('list',{name:'Matching concepts'}).getByRole('button',{name:'Test neighbourhood lemma Topology',exact:true})).toBeVisible();
 });
}

test('Atlas editor retains every operation and searches targets in the same phone sheet',async({page})=>{
 await enableSurfaceBeta(page);
 await page.setViewportSize({width:390,height:844});
 await page.goto(at('/atlas?view=list'));
 await page.locator('.v7-atlas-subject li button').filter({hasText:'Compactness'}).first().click();
 await page.getByRole('button',{name:'Edit concept',exact:true}).click();
 const editor=page.getByRole('dialog',{name:'Edit idea',exact:true});
 const actionPicker=editor.getByRole('button',{name:/^Action:/});
 await actionPicker.click();
 const actionSheet=page.getByRole('dialog',{name:'Action',exact:true});
 await expect(page.locator('dialog[open]')).toHaveCount(1);
 const step=actionSheet.getByRole('group',{name:'Action',exact:true});
 const back=step.getByRole('button',{name:'Back',exact:true});
 const selected=step.getByRole('radio',{checked:true});
 await expect(selected).toBeFocused();
 await page.keyboard.press('Tab');
 await expect(back).toBeFocused();
 await page.keyboard.press('Shift+Tab');
 await expect(selected).toBeFocused();
 await page.keyboard.press('Escape');
 await expect(actionPicker).toBeFocused();
 for(const action of ['Change parent','Add link','Remove link','Merge into another concept','Edit name or description']){
  await editor.getByRole('button',{name:/^Action:/}).click();
  const choices=page.getByRole('dialog',{name:'Action',exact:true});
  await expect(choices.getByRole('radio')).toHaveCount(5);
  await choices.getByRole('radio',{name:action,exact:true}).click();
  if(action==='Merge into another concept'){
   await expect(editor.getByRole('button',{name:'Confirm merge'})).toBeDisabled();
   await editor.getByRole('button',{name:/^Keep this concept:/}).click();
   const target=page.getByRole('dialog',{name:'Keep this concept',exact:true});
   await target.getByRole('searchbox').fill('Finite subcover lemma');
   await target.getByRole('radio',{name:'Finite subcover lemma',exact:true}).click();
   await editor.getByRole('button',{name:'Preview merge impact'}).click();
   await expect(editor.getByRole('region',{name:'Server merge impact'})).toBeVisible();
   await expect(editor.getByRole('button',{name:'Confirm merge'})).toBeEnabled();
  }
 }
 await expect(editor.getByRole('textbox',{name:'Atlas idea name'})).toHaveValue('Compactness');
 await editor.getByRole('button',{name:'Cancel',exact:true}).click();await expect(editor).toHaveCount(0);
});
