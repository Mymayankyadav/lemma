import {expect,test,type Page} from '@playwright/test';

const url='/lemma/?demo=1&flags=v7Shell,tutorScratch#/p/real-analysis/cp/CP4/tutor';
const paper=(page:Page)=>page.getByRole('region',{name:'Drawing paper'});
const canvas=(page:Page)=>page.getByRole('img',{name:'Draw your answer'});
const ink=(page:Page)=>canvas(page).locator('path');
const tool=(page:Page,name:string)=>page.getByRole('region',{name:'Scratch pad'})
  .getByRole('button',{name,exact:true});
const actions=async(page:Page)=>{
  await tool(page,'Scratch pad actions').click();
  const menu=page.getByRole('dialog',{name:'Scratch pad actions'});
  await expect(menu).toBeVisible();
  return menu;
};
// N221 (Owner): the composer's pencil opens equation mode on a tap and the scratch pad on a double tap.
const scratch=(page:Page)=>page.getByRole('button',{name:'Write by hand',exact:true});
const conversation=(page:Page)=>page.getByRole('log',{name:'Conversation'});
const answerField=(page:Page)=>page.getByRole('textbox',{name:'Your answer',exact:true});
const send=(page:Page)=>page.getByRole('button',{name:'Send',exact:true});

async function open(page:Page) {
  await page.goto(url);
  await page.getByRole('button',{name:'Write a question'}).click();
}

async function holdInkOpen(page:Page) {
  await page.addInitScript(()=>{
    const open=IDBFactory.prototype.open;
    IDBFactory.prototype.open=function(name,version){
      const request=open.call(this,name,version);
      if(name==='lemma-tutor-ink'){
        IDBFactory.prototype.open=open;
        request.addEventListener('success',event=>{
          event.stopImmediatePropagation();
          window.addEventListener('release-tutor-ink',()=>request.onsuccess?.call(request,event),{once:true});
          document.documentElement.dataset.inkReadHeld='true';
        },{once:true});
      }
      return request;
    };
  });
}

async function insertTestDrawing(page:Page) {
  await scratch(page).dblclick();
  const box=(await paper(page).boundingBox())!;
  await page.mouse.move(box.x+22,box.y+38);
  await page.mouse.down();
  await page.mouse.move(box.x+115,box.y+63,{steps:4});
  await page.mouse.up();
  await tool(page,'Insert drawing').click();
  await expect(answerField(page).getByRole('button',{name:'Edit drawing',exact:true})).toBeVisible();
}

test('Restored references block both send shortcuts until their IndexedDB image is recovered',async({page})=>{
  await open(page);
  const answer=answerField(page);
  await answer.fill('Keep this explanation.');
  await answer.press('End');
  await insertTestDrawing(page);
  await holdInkOpen(page);
  await page.reload();
  await expect(page.getByText('Restoring the images in your answer…',{exact:true})).toBeVisible();
  await expect(send(page)).toBeDisabled();
  await answer.press('Control+Enter');
  await send(page).locator('xpath=ancestor::form').dispatchEvent('submit');
  await expect(conversation(page).getByLabel('Your saved answer')).toHaveCount(0);
  await expect(answer).toContainText('Keep this explanation.');
  await expect(page.locator('html')).toHaveAttribute('data-ink-read-held','true');
  await page.evaluate(()=>window.dispatchEvent(new Event('release-tutor-ink')));
  await expect(answer.getByRole('button',{name:'Edit drawing',exact:true})).toBeVisible();
  await send(page).click();
  const saved=conversation(page).getByLabel('Your saved answer');
  await expect(saved).toContainText('Keep this explanation.');
  await expect(saved.getByRole('button',{name:/^View drawing/})).toBeVisible();
});

test('A failed image read keeps all references until retry or deliberate removal',async({page})=>{
  await open(page);
  const answer=answerField(page);
  await answer.fill('Keep these words.');
  await answer.press('End');
  await insertTestDrawing(page);
  await page.evaluate(()=>{
    const key=Object.keys(sessionStorage).find(key=>key.startsWith('lemma.demo-tutor:')&&key.endsWith(':question'))!;
    sessionStorage.setItem(key,sessionStorage.getItem(key)+'[[lemma-image:98765432-0123-4123-8123-123456789abc]]');
  });
  await page.addInitScript(()=>{
    const open=IDBFactory.prototype.open;
    IDBFactory.prototype.open=function(name,version){
      if(name==='lemma-tutor-ink'){
        IDBFactory.prototype.open=open;
        throw new DOMException('Injected read failure','SecurityError');
      }
      return open.call(this,name,version);
    };
  });
  await page.reload();
  await expect(page.getByRole('alert').filter({hasText:'The saved images could not be opened.'})).toBeVisible();
  await expect(answer.getByRole('button',{name:'Remove image unavailable',exact:true})).toHaveCount(2);
  await expect(send(page)).toBeDisabled();
  await answer.press('Control+Enter');
  await expect(conversation(page).getByLabel('Your saved answer')).toHaveCount(0);
  await page.getByRole('button',{name:'Retry restoring images',exact:true}).click();
  await expect(answer.getByRole('button',{name:'Edit drawing',exact:true})).toBeVisible();
  await expect(send(page)).toBeDisabled();
  await answer.getByRole('button',{name:'Remove image unavailable',exact:true}).click();
  await expect(answer).toContainText('Keep these words.');
  await expect(answer.getByRole('button',{name:'Edit drawing',exact:true})).toBeVisible();
  await send(page).click();
  const saved=conversation(page).getByLabel('Your saved answer');
  await expect(saved).toContainText('Keep these words.');
  await expect(saved.getByRole('button',{name:/^View drawing/})).toHaveCount(1);
});

test('After IndexedDB fails the learner can explicitly continue with text',async({page})=>{
  await page.addInitScript(()=>{
    const open=IDBFactory.prototype.open;
    IDBFactory.prototype.open=function(name,version){
      if(name==='lemma-tutor-ink')throw new DOMException('Injected read failure','SecurityError');
      return open.call(this,name,version);
    };
  });
  await open(page);
  await answerField(page).fill('My text answer.');
  await expect(send(page)).toBeDisabled();
  await page.getByRole('button',{name:'Continue with text',exact:true}).click();
  await send(page).click();
  await expect(conversation(page).getByLabel('Your saved answer')).toHaveText('My text answer.');
});

test('One finger draws and a three-finger swipe scrolls without leaving ink',async({page,context})=>{
  await open(page);
  await page.getByRole('textbox',{name:'Your answer'}).fill('An open cover has a finite subcover.');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.getByRole('button',{name:'Session actions'}).click();
  await page.getByRole('button',{name:'Connection',exact:true}).click();
  const connection=page.getByRole('dialog',{name:'Connection'});
  await connection.getByLabel('Paste reply').fill(
    Array.from({length:12},(_,i)=>'Step '+(i+1)+'. Explain why these open sets cover every point in the compact set.').join('\n\n'));
  await connection.getByRole('button',{name:'Preview import'}).click();
  await connection.getByRole('button',{name:'Confirm import'}).click();
  await expect(conversation(page)).toContainText('Step 12.');
  if (await connection.isVisible()) await page.keyboard.press('Escape');
  await scratch(page).dblclick();
  const log=conversation(page);
  await expect.poll(()=>log.evaluate(e=>e.scrollHeight-e.clientHeight)).toBeGreaterThan(100);
  const client=await context.newCDPSession(page);
  const box=(await paper(page).boundingBox())!;
  const contacts=(count:number,dy=0)=>Array.from({length:count},(_,id)=>({
    x:Math.round(box.x+36+35*id),y:Math.round(box.y+40+dy),id,
  }));
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:contacts(1)});
  await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:contacts(1,28)});
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(ink(page)).toHaveCount(1);
  await log.evaluate(e=>{e.scrollTop=0;});
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:contacts(1)});
  await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:contacts(1,5)});
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:contacts(3,25)});
  await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:contacts(3,-15)});
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(()=>log.evaluate(e=>e.scrollTop)).toBeGreaterThan(20);
  await expect(ink(page)).toHaveCount(1);
  await expect(canvas(page).locator('path[opacity]')).toHaveCount(0);
});

test('Stylus, eraser drag, history and resize preserve the drawing',async({page,context})=>{
  await open(page);
  await scratch(page).dblclick();
  const client=await context.newCDPSession(page);
  const box=(await paper(page).boundingBox())!;
  const x=box.x+35,y=box.y+40;
  for (const [type,dx,dy] of [['mousePressed',0,0],['mouseMoved',90,45],['mouseReleased',90,45]] as const) {
    await client.send('Input.dispatchMouseEvent',{type,x:x+dx,y:y+dy,button:'left',
      buttons:type==='mouseReleased'?0:1,clickCount:1,pointerType:'pen'});
  }
  await expect(ink(page)).toHaveCount(1);
  const path=await ink(page).getAttribute('d');
  const initial=(await paper(page).boundingBox())!.height;
  const initialChat=(await conversation(page).boundingBox())!.height;
  const resize=page.getByRole('separator',{name:'Resize scratch pad'});
  const grip=(await resize.boundingBox())!;
  await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);
  await page.mouse.down();
  await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2-45,{steps:5});
  await page.mouse.up();
  await expect.poll(async()=>(await paper(page).boundingBox())!.height).toBeGreaterThan(initial+35);
  await expect.poll(async()=>(await conversation(page).boundingBox())!.height).toBeLessThan(initialChat-25);
  await expect(ink(page)).toHaveAttribute('d',path!);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await resize.focus();
  await resize.press('ArrowDown');
  await expect.poll(async()=>(await paper(page).boundingBox())!.height).toBeLessThan(initial+25);

  await tool(page,'Eraser').click();
  const resizedBox=(await paper(page).boundingBox())!;
  await page.mouse.move(resizedBox.x+8,resizedBox.y+62);
  await page.mouse.down();
  await page.mouse.move(resizedBox.x+100,resizedBox.y+62,{steps:8});
  await page.mouse.up();
  await expect(ink(page)).toHaveCount(0);
  await tool(page,'Undo stroke').click();
  await expect(ink(page)).toHaveAttribute('d',path!);
  await (await actions(page)).getByRole('button',{name:'Redo stroke'}).click();
  await expect(ink(page)).toHaveCount(0);
  await tool(page,'Undo stroke').click();
  await (await actions(page)).getByRole('button',{name:'Clear scratch pad'}).click();
  await expect(ink(page)).toHaveCount(0);
  await tool(page,'Undo stroke').click();
  await expect(ink(page)).toHaveAttribute('d',path!);
  const settings=await actions(page);
  await settings.getByRole('button',{name:'Pen width 7'}).click();
  await settings.getByRole('button',{name:'Accent'}).click();
  await page.keyboard.press('Escape');

  await expect.poll(()=>page.evaluate(()=>new Promise<boolean>(resolve=>{
    const db=indexedDB.open('lemma-tutor-ink');
    db.onsuccess=()=>{
      const request=db.result.transaction('drafts').objectStore('drafts').getAll();
      request.onsuccess=()=>{resolve(request.result.some(draft=>draft.strokes.length===1&&draft.width===7&&draft.accent));db.result.close();};
    };
  }))).toBe(true);
  await page.reload();
  await scratch(page).dblclick();
  await expect(ink(page)).toHaveAttribute('d',path!);
  const reloadedSettings=await actions(page);
  await expect(reloadedSettings.getByRole('button',{name:'Pen width 7'})).toHaveAttribute('aria-pressed','true');
  await expect(reloadedSettings.getByRole('button',{name:'Accent'})).toHaveAttribute('aria-pressed','true');
  await page.keyboard.press('Escape');
  await tool(page,'Insert drawing').click();
  await expect(page.getByRole('button',{name:'Edit drawing',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await conversation(page).getByRole('button',{name:/^View drawing/}).click();
  await expect(page.getByRole('dialog',{name:/^Drawing/}).getByRole('img')).toBeVisible();
});

test('Drawings are inserted inline, reopen for editing and send in reference order',async({page})=>{
  await open(page);
  const answer=page.getByRole('textbox',{name:'Your answer',exact:true});
  await answer.fill('Before after');
  await answer.press('Home');
  for(let index=0;index<7;index++)await answer.press('ArrowRight');
  const draw=async(y:number)=>{
    const box=(await paper(page).boundingBox())!;
    await page.mouse.move(box.x+20,box.y+y);
    await page.mouse.down();
    await page.mouse.move(box.x+125,box.y+y+12,{steps:6});
    await page.mouse.up();
  };

  for(let index=1;index<=3;index++){
    await scratch(page).dblclick();
    expect((await conversation(page).boundingBox())!.height).toBeGreaterThanOrEqual(300);
    await expect(paper(page)).toHaveCSS('border-top-width','0px');
    await draw(35*index);
    await expect(ink(page)).toHaveCount(1);
    await tool(page,'Insert drawing').click();
    await expect(answer.locator('[data-image-id]')).toHaveCount(index);
    await expect(paper(page)).toHaveCount(0);
  }
  const chips=answer.locator('[data-image-id]');
  expect(await answer.evaluate(editor=>editor.firstChild?.textContent)).toBe('Before ');
  expect(await answer.evaluate(editor=>editor.lastChild?.textContent)).toBe('after');
  const first=await chips.first().getAttribute('data-image-id');
  await page.reload();
  await expect(chips).toHaveCount(3);
  await chips.first().getByRole('button',{name:'Edit drawing',exact:true}).click();
  await expect(ink(page)).toHaveCount(1);
  await draw(60);
  await expect(ink(page)).toHaveCount(2);
  await tool(page,'Update drawing').click();
  await expect(chips).toHaveCount(3);
  await expect(chips.first()).not.toHaveAttribute('data-image-id',first!);
  await chips.last().getByRole('button',{name:'Remove drawing',exact:true}).click();
  await expect(chips).toHaveCount(2);
  await page.getByRole('button',{name:'Send',exact:true}).click();
  const saved=conversation(page).getByLabel('Your saved answer');
  await expect(saved.getByRole('button',{name:/^View drawing/})).toHaveCount(2);
  const order=await saved.evaluate(node=>Array.from(node.querySelectorAll(':scope > :not(dialog)'),child=>
    child.matches('button')?child.getAttribute('aria-label'):child.textContent?.trim()));
  expect(order).toEqual(['Before','View drawing 1','View drawing 2','after']);
});

test('Legacy canvas and photo drafts reopen as inline references',async({page})=>{
  await open(page);
  await answerField(page).fill('My earlier explanation.');
  await scratch(page).dblclick();
  const box=(await paper(page).boundingBox())!;
  await page.mouse.move(box.x+22,box.y+38);
  await page.mouse.down();
  await page.mouse.move(box.x+115,box.y+63,{steps:4});
  await page.mouse.up();
  await expect(ink(page)).toHaveCount(1);
  await expect.poll(()=>page.evaluate(()=>new Promise<boolean>(resolve=>{
    const opening=indexedDB.open('lemma-tutor-ink');
    opening.onsuccess=()=>{
      const db=opening.result,tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts');
      const request=store.openCursor();
      let changed=false;
      request.onsuccess=()=>{
        const entry=request.result;
        if(!entry||!entry.value.strokes.length)return;
        const data=entry.value;
        delete data.inlineImages;
        data.photos=[{id:'6b3f396e-37d8-4996-bbd2-0bafe7ef0280',kind:'photo',mimeType:'image/jpeg',
          blob:new Blob([new Uint8Array([255,216,255])],{type:'image/jpeg'})}];
        entry.update(data);
        changed=true;
      };
      tx.oncomplete=()=>{db.close();resolve(changed);};
    };
  }))).toBe(true);
  await holdInkOpen(page);
  await page.reload();
  const answer=page.getByRole('textbox',{name:'Your answer',exact:true});
  await expect(answer).toHaveText('My earlier explanation.');
  await expect(send(page)).toBeDisabled();
  await answer.press('Control+Enter');
  await expect(conversation(page).getByLabel('Your saved answer')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-ink-read-held','true');
  await page.evaluate(()=>window.dispatchEvent(new Event('release-tutor-ink')));
  await expect(answer.locator('[data-image-id]')).toHaveCount(2);
  await expect(answer.getByRole('button',{name:'View photo',exact:true})).toBeVisible();
  await answer.getByRole('button',{name:'Edit drawing',exact:true}).click();
  await expect(ink(page)).toHaveCount(1);
});

test('A failed device save leaves the drawing editable and publishes no reference',async({page})=>{
  await open(page);
  await scratch(page).dblclick();
  const box=(await paper(page).boundingBox())!;
  await page.mouse.move(box.x+22,box.y+38);
  await page.mouse.down();
  await page.mouse.move(box.x+115,box.y+63,{steps:4});
  await page.mouse.up();
  await expect(ink(page)).toHaveCount(1);
  const path=await ink(page).getAttribute('d');
  await page.evaluate(()=>{
    const put=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(value,key){
      if(this.name==='drafts'&&value?.stagedDrawing){
        IDBObjectStore.prototype.put=put;
        throw new DOMException('Injected device storage failure','QuotaExceededError');
      }
      return put.call(this,value,key);
    };
  });
  const answer=page.getByRole('textbox',{name:'Your answer',exact:true});
  await tool(page,'Insert drawing').click();
  await expect(page.getByRole('alert').filter({hasText:'Your drawing is still here'})).toBeVisible();
  await expect(answer.locator('[data-image-id]')).toHaveCount(0);
  await expect(ink(page)).toHaveAttribute('d',path!);
  await tool(page,'Insert drawing').click();
  await expect(answer.locator('[data-image-id]')).toHaveCount(1);
  await page.reload();
  await answer.getByRole('button',{name:'Edit drawing',exact:true}).click();
  await expect(ink(page)).toHaveAttribute('d',path!);
});

for (const [width,height,scale] of [[320,640,100],[390,844,160]]) {
  test(`Scratch remains in flow at ${width}×${height} and ${scale}% text`,async({page})=>{
    await page.setViewportSize({width,height});
    await page.addInitScript(size=>document.addEventListener('DOMContentLoaded',()=>{document.documentElement.style.fontSize=size+'%';}),scale);
    await open(page);
    await scratch(page).dblclick();
    await paper(page).scrollIntoViewIfNeeded();
    const panel=page.getByRole('region',{name:'Scratch pad'});
    const scrollWidth=await panel.evaluate(e=>e.scrollWidth-e.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(1);
    const toolBox=(await panel.getByRole('group',{name:'Drawing tools'}).boundingBox())!;
    const canvasBox=(await paper(page).boundingBox())!;
    expect(toolBox.y+toolBox.height).toBeLessThanOrEqual(canvasBox.y+1);
    expect(canvasBox.y+canvasBox.height).toBeLessThanOrEqual(height+1);
    expect((await conversation(page).boundingBox())!.height).toBeGreaterThanOrEqual(100);
    await tool(page,'Hand').click();
    const box=(await paper(page).boundingBox())!;
    await page.mouse.move(box.x+54,box.y+100);
    await page.mouse.down();
    await page.mouse.move(box.x+54,box.y+23,{steps:5});
    await page.mouse.up();
    await expect.poll(()=>paper(page).evaluate(e=>e.scrollTop)).toBeGreaterThan(50);
    await expect(ink(page)).toHaveCount(0);
  });
}
