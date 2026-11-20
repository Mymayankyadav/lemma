import {expect,test} from '@playwright/test';

const checkpoint = (code: string, enabled = true) =>
  './?demo=1&flags=v7Shell' + (enabled ? ',padLocal' : '') + '#/p/real-analysis/cp/' + code;
const backup = {
  format:'lemma-pad', version:1, notes:{text:'Imported compactness proof',start:0,end:0,direction:'none'},
  ink:{width:640,height:400,strokes:[[{x:12,y:14}]]},
};

test('a demo Pad is opt-in, scoped by checkpoint, and restores approved local revisions', async ({page}) => {
  // Keep this fixture browser completely away from any live or external service.
  await page.route('https://**/*', route => route.abort());
  const open = page.getByRole('button',{name:'Open Local Pad',exact:true});
  await page.goto(checkpoint('CP4',false));
  await expect(page.getByRole('heading',{name:'Compactness',level:1})).toBeVisible();
  await expect(open).toHaveCount(0);
  await page.goto(checkpoint('CP4'));
  await open.click();
  const notes = page.getByRole('textbox',{name:'Pad notes'}), save = page.getByRole('button',{name:'Save draft'});
  await notes.fill('First compactness proof');
  await save.click();
  await expect(page.getByText('Saved on this device.',{exact:true})).toBeVisible();
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
  await open.click();
  await expect(notes).toHaveValue('Imported compactness proof');
  await page.getByRole('button',{name:'Review previous draft'}).click();
  await expect(page.getByRole('region',{name:'Review Pad replacement'})).toContainText('First compactness proof');
  await page.getByRole('button',{name:'Keep current work'}).click();
  await page.goto(checkpoint('CP2'));
  await open.click();
  await expect(notes).toHaveValue('');
});

test('a saved Pad reopens offline after leaving its checkpoint and retains ink across rotation', async ({page, context}) => {
  await page.route('https://**/*', route => route.abort());
  const open = page.getByRole('button',{name:'Open Local Pad',exact:true});
  const notes = page.getByRole('textbox',{name:'Pad notes'});
  const paper = page.getByRole('img',{name:'Pad drawing'});
  const strokes = paper.locator('path');
  // The Pad stores drafts offline; the checkpoint host only exposes previously loaded demo routes offline.
  await page.goto(checkpoint('CP2'));
  await expect(open).toBeVisible();
  await page.evaluate(() => {location.hash = '#/p/real-analysis/cp/CP4';});
  await expect(page.getByRole('heading',{name:'Compactness',level:1})).toBeVisible();
  await open.click();
  await notes.fill('Compactness notes saved offline');
  await context.setOffline(true);
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);

  await paper.scrollIntoViewIfNeeded();
  const box = await paper.boundingBox();
  if (!box) throw new Error('Pad drawing has no bounds');
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, {steps:4});
  await page.mouse.up();
  await expect(strokes).toHaveCount(1);
  const path = await strokes.first().getAttribute('d');
  expect(path).toBeTruthy();
  await page.getByRole('button',{name:'Save draft'}).click();
  await expect(page.getByText('Saved on this device.',{exact:true})).toBeVisible();

  await page.setViewportSize({width:844,height:390});
  await expect(strokes.first()).toHaveAttribute('d',path ?? '');
  // Hash-only navigation remounts the fixture without depending on a service worker.
  await page.evaluate(() => {location.hash = '#/p/real-analysis/cp/CP2';});
  await expect(page.getByRole('button',{name:'Put away Local Pad'})).toHaveCount(0);
  await open.click();
  await expect(notes).toHaveValue('');
  await expect(strokes).toHaveCount(0);
  await page.evaluate(() => {location.hash = '#/p/real-analysis/cp/CP4';});
  await expect(page.getByRole('heading',{name:'Compactness',level:1})).toBeVisible();
  await open.click();
  await expect(notes).toHaveValue('Compactness notes saved offline');
  await expect(strokes.first()).toHaveAttribute('d',path ?? '');
});
