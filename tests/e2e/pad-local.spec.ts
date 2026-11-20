import {readFile} from 'node:fs/promises';
import {expect,test,type Page} from '@playwright/test';

const app = './?demo=1&flags=v7Shell,padLocal,tutorManualDemo#/';
const checkpoint = (code: string) => app + 'p/real-analysis/cp/' + code;
const pad = (code: string) => app + 'pad?path=real-analysis&checkpoint=' + code;
const backup = {
  format:'lemma-pad', version:1, notes:{text:'Imported compactness proof',start:0,end:0,direction:'none'},
  ink:{width:640,height:400,strokes:[[{x:12,y:14}]]},
};

/** Keep failure evidence in the JUnit error when the runner cannot publish a trace. */
async function withPadSaveDiagnostics<T>(page: Page, action: () => Promise<T>): Promise<T> {
  const observer = await page.evaluateHandle(() => {
    const inputs: {type:string; target:string; x:number; y:number}[] = [];
    const record = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      const pointer = event as MouseEvent;
      inputs.push({type:event.type, target:target?.getAttribute('aria-label')
        || target?.textContent?.trim().slice(0,80) || target?.tagName || '', x:pointer.clientX, y:pointer.clientY});
      if (inputs.length > 16) inputs.shift();
    };
    const types = ['pointerdown','pointerup','click','lostpointercapture'];
    types.forEach(type => document.addEventListener(type,record,true));
    return {inputs, stop:() => types.forEach(type => document.removeEventListener(type,record,true))};
  });
  try {return await action();}
  catch (error) {
    const observed = await page.evaluate(log => {
      const notes = document.querySelector<HTMLTextAreaElement>('textarea.local-pad-paper');
      const save = Array.from(document.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Save draft');
      const bounds = save?.getBoundingClientRect();
      const hit = bounds && document.elementFromPoint(bounds.x + bounds.width / 2,bounds.y + bounds.height / 2);
      return {
        url:location.href, inputs:log.inputs,
        statuses:Array.from(document.querySelectorAll('[role="status"]'),node => node.textContent),
        notes:notes && {text:notes.value,start:notes.selectionStart,end:notes.selectionEnd,
          direction:notes.selectionDirection,inputMode:notes.inputMode},
        save:save && {disabled:save.disabled,bounds:bounds?.toJSON(),hit:hit?.textContent?.trim().slice(0,100)},
        focus:document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName,
        strokes:Array.from(document.querySelectorAll('svg.local-pad-ink path'),node => ({d:node.getAttribute('d'),opacity:node.getAttribute('opacity')})),
        viewport:{width:innerWidth,height:innerHeight,visual:visualViewport?.height},
        dialogs:Array.from(document.querySelectorAll('[role="dialog"]'),node => node.textContent?.slice(0,500)),
      };
    },observer).catch(() => 'The page could not be inspected after the failure.');
    throw new Error('Pad save failed: ' + JSON.stringify(observed),{cause:error});
  } finally {
    await observer.evaluate(log => log.stop()).catch(() => undefined);
    await observer.dispose();
  }
}

test('saved Pad revisions stay scoped to their checkpoint and recover through the dedicated address', async ({page}) => {
  // Keep this fixture browser completely away from any live or external service.
  await page.route('https://**/*', route => route.abort());
  const open = page.getByRole('button',{name:'Open Local Pad',exact:true});
  await page.goto(checkpoint('CP4'));
  await expect(page.getByRole('heading',{name:'Compactness',level:1})).toBeVisible();
  await expect(open).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Open full Pad page'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Open manual tutor'})).toHaveCount(0);
  const checkpointActions = page.getByRole('group',{name:'Checkpoint actions',exact:true});
  await expect(checkpointActions).toHaveCSS('position','fixed');
  const notes = page.getByRole('textbox',{name:'Pad notes'}), save = page.getByRole('button',{name:'Save draft'});
  await expect(notes).toHaveCount(0);

  await page.goto(pad('CP4'));
  await expect(checkpointActions).toHaveCount(0);
  await expect(page.getByLabel('Checkpoint', {exact:true})).toHaveValue('CP4');
  await notes.fill('First compactness proof');
  await save.click();
  await expect(page.getByText('Saved on this device.',{exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Return to checkpoint'}).click();
  await expect(checkpointActions).toHaveCSS('position','fixed');
  await expect(notes).toHaveCount(0);
  await page.goBack();
  await expect(notes).toHaveValue('First compactness proof');
  await page.getByLabel('Import a Pad JSON backup').setInputFiles({
    name:'lemma-pad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.getByRole('heading',{name:'Preview backup'})).toBeVisible();
  await expect(notes).toHaveValue('First compactness proof');
  await page.getByRole('button',{name:'Replace working Pad'}).click();
  await expect(notes).toHaveValue('Imported compactness proof');
  await save.click();
  await expect(page.getByText('Saved on this device.',{exact:true})).toBeVisible();
  await page.reload();
  await expect(notes).toHaveValue('Imported compactness proof');
  await page.getByRole('button',{name:'Review previous draft'}).click();
  await expect(page.getByRole('region',{name:'Review Pad replacement'})).toContainText('First compactness proof');
  await page.getByRole('button',{name:'Keep current work'}).click();
  await page.goto(pad('CP2'));
  await expect(notes).toHaveValue('');
});

test('a saved Pad reopens offline after leaving its checkpoint and retains ink across rotation', async ({page, context}) => {
  await page.route('https://**/*', route => route.abort());
  const notes = page.getByRole('textbox',{name:'Pad notes'});
  const paper = page.getByRole('img',{name:'Pad drawing'});
  const strokes = paper.locator('path');
  await page.goto(pad('CP4'));
  await expect(notes).toBeVisible();
  // Finish initial precaching before measuring network activity during offline work.
  await page.evaluate(async () => {await navigator.serviceWorker.ready;});
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state))
    .toBe('activated');
  await context.setOffline(true);
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  const outbound: string[] = [];
  const origin = new URL(page.url()).origin;
  context.on('request', request => {
    const url = new URL(request.url());
    if (/^https?:$/.test(url.protocol) &&
      (url.origin !== origin || !['GET','HEAD'].includes(request.method()) ||
        ['fetch','xhr'].includes(request.resourceType()))) outbound.push(request.method() + ' ' + url.pathname);
  });
  const offlineNote = 'Compactness notes: $\\frac{1}{2}$ and <proof>';
  await notes.fill(offlineNote);
  const preview = page.getByRole('region',{name:'Local math preview'});
  await expect(preview.locator('math mfrac')).toHaveCount(1);
  await expect(preview).toContainText('<proof>');

  const path = await withPadSaveDiagnostics(page,async () => {
    await paper.scrollIntoViewIfNeeded();
    const box = await paper.boundingBox();
    if (!box) throw new Error('Pad drawing has no bounds');
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.25);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, {steps:4});
    await page.mouse.up();
    await expect(strokes).toHaveCount(1);
    await expect(paper.locator('path[opacity="0.65"]')).toHaveCount(0);
    const path = await strokes.first().getAttribute('d');
    expect(path).toBeTruthy();
    // Verify that the Save button receives the click after drawing and scrolling.
    const save = page.getByRole('button',{name:'Save draft'});
    await save.scrollIntoViewIfNeeded();
    expect(await save.evaluate(button => {
      const box = button.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2,box.y + box.height / 2);
      return hit === button || !!hit && button.contains(hit);
    })).toBe(true);
    await page.getByRole('button',{name:'Save draft'}).click();
    await expect(page.getByText('Saved on this device.',{exact:true})).toBeVisible();
    return path;
  });

  await page.setViewportSize({width:844,height:390});
  await expect(strokes.first()).toHaveAttribute('d',path ?? '');
  const exportButton = page.getByRole('button',{name:'Export readable Pad'});
  const createObjectURL = await page.evaluateHandle(() => URL.createObjectURL);
  try {
    await page.evaluate(() => {URL.createObjectURL = () => {throw new Error('Simulated blob URL failure');};});
    await exportButton.click();
    await expect(page.getByText('Could not start the export. Your Pad is unchanged.',{exact:true})).toBeVisible();
    await expect(notes).toHaveValue(offlineNote);
    await expect(strokes.first()).toHaveAttribute('d',path ?? '');
  } finally {
    await page.evaluate(original => {URL.createObjectURL = original;},createObjectURL);
    await createObjectURL.dispose();
  }
  const [download] = await Promise.all([page.waitForEvent('download'), exportButton.click()]);
  expect(download.suggestedFilename()).toBe('lemma-pad.html');
  const file = await download.path();
  if (!file) throw new Error('No downloaded Pad file');
  const html = await readFile(file,'utf8');
  expect(html).toContain(offlineNote.replace('<proof>','&lt;proof&gt;'));
  expect(html).toContain('<path d="' + path + '"/>');
  expect(html).toContain('Content-Security-Policy');
  // Switching checkpoints while offline loads each Pad's own saved revision.
  await page.getByLabel('Checkpoint', {exact:true}).selectOption('CP2');
  await expect(page.getByRole('link',{name:'Return to checkpoint'})).toHaveAttribute('href', /#\/p\/real-analysis\/cp\/CP2$/);
  await expect(notes).toHaveValue('');
  await expect(strokes).toHaveCount(0);
  await page.getByLabel('Checkpoint', {exact:true}).selectOption('CP4');
  await expect(notes).toHaveValue(offlineNote);
  await expect(strokes.first()).toHaveAttribute('d',path ?? '');
  expect(outbound).toEqual([]);
});
