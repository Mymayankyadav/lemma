import {expect,test} from '@playwright/test';

test('a drawing is inserted at the saved caret and stays atomic through typing, removal and undo',async({page})=>{
  await page.goto('/lemma/?demo=1&flags=v7Shell,v6Shell,tutorScratch#/p/real-analysis/cp/CP4/tutor');
  await page.getByRole('button',{name:'Write a question',exact:true}).click();
  const answer=page.getByRole('textbox',{name:'Your answer',exact:true});
  await expect(answer).toHaveAttribute('contenteditable','true');
  await expect(answer).toHaveAttribute('inputmode','none');
  await answer.fill('left right');
  await page.keyboard.press('Home');
  for(let index=0;index<5;index++) await page.keyboard.press('ArrowRight');
  await page.getByRole('button',{name:'Scratch',exact:true}).click();
  const canvas=page.getByRole('img',{name:'Draw your answer'});
  await expect(canvas).toBeVisible();
  const box=(await canvas.boundingBox())!;
  await page.mouse.move(box.x+20,box.y+25);
  await page.mouse.down();
  await page.mouse.move(box.x+65,box.y+55,{steps:4});
  await page.mouse.up();
  await page.getByRole('button',{name:'Insert drawing',exact:true}).click();

  const image=answer.locator('[data-image-id]');
  await expect(image).toHaveAttribute('contenteditable','false');
  const children=()=>answer.evaluate(node=>[...node.childNodes].map(part=>part instanceof HTMLElement&&part.hasAttribute('data-image-id')?'chip':part.textContent));
  await expect.poll(children).toEqual(['left ','chip','right']);
  await expect(answer).toBeFocused();
  const keyboard=page.getByRole('group',{name:'Answer keyboard',exact:true});
  await keyboard.getByRole('button',{name:'q',exact:true}).click();
  await expect.poll(children).toEqual(['left ','chip','qright']);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Backspace');
  await expect(answer).toHaveJSProperty('textContent','left qright');
  await answer.press('Control+z');
  await expect.poll(children).toEqual(['left ','chip','qright']);
  await image.getByRole('button',{name:'Remove drawing',exact:true}).click();
  await expect(answer).toHaveJSProperty('textContent','left qright');
  await answer.press('Control+z');
  await expect.poll(children).toEqual(['left ','chip','qright']);

  await page.keyboard.press('Home');
  for(let index=0;index<5;index++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+End');
  const clipboard=await answer.evaluate(node=>{
    const data=new DataTransfer();
    node.dispatchEvent(new ClipboardEvent('cut',{bubbles:true,cancelable:true,clipboardData:data}));
    return {plain:data.getData('text/plain'),local:data.getData('application/x-lemma-tutor-answer')};
  });
  expect(clipboard.plain).toBe('[Drawing]qright');
  expect(clipboard.local).toMatch(/^\[\[lemma-image:[0-9a-f-]+\]\]qright$/);
  await expect(answer).toHaveJSProperty('textContent','left ');
  const paste=()=>answer.evaluate((node,{plain,local})=>{
    const data=new DataTransfer();
    data.setData('text/plain',plain);
    data.setData('application/x-lemma-tutor-answer',local);
    data.setData('text/html','<img src=x onerror="window.badPaste=true">');
    node.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));
  },clipboard);
  await paste();
  await expect.poll(children).toEqual(['left ','chip','qright']);
  await expect(answer.locator('img')).toHaveCount(0);
  await paste();
  await expect.poll(children).toEqual(['left ','chip','qright','chip','qright']);
  await image.nth(1).getByRole('button',{name:'Remove drawing',exact:true}).click();
  await expect.poll(children).toEqual(['left ','chip','qrightqright']);
  await page.keyboard.press('End');
  await answer.evaluate(node=>{
    const data=new DataTransfer();
    data.setData('text/plain',' [Drawing]');
    data.setData('application/x-lemma-tutor-answer',' [[lemma-image:12345678-0000-4000-8000-000000000000]]');
    node.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));
  });
  await expect.poll(children).toEqual(['left ','chip','qrightqright [Drawing]']);
});

test('inline-capable answers keep a native IME composition as one undo step',async({page,context})=>{
  await page.goto('/lemma/?demo=1&flags=v7Shell,v6Shell,tutorScratch#/p/real-analysis/cp/CP4/tutor');
  await page.getByRole('button',{name:'Write a question',exact:true}).click();
  const answer=page.getByRole('textbox',{name:'Your answer',exact:true});
  await answer.fill('Proof: ');
  await answer.press('End');
  const client=await context.newCDPSession(page);
  await client.send('Input.imeSetComposition',{text:'証',selectionStart:1,selectionEnd:1});
  await expect(answer).toHaveJSProperty('textContent','Proof: 証');
  await client.send('Input.imeSetComposition',{text:'証明',selectionStart:2,selectionEnd:2});
  await client.send('Input.insertText',{text:'証明'});
  await expect(answer).toHaveJSProperty('textContent','Proof: 証明');
  await answer.press('Control+z');
  await expect(answer).toHaveJSProperty('textContent','Proof: ');
});
