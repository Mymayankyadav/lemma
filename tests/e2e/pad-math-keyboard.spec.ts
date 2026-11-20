import {expect, test} from '@playwright/test';

const checkpoint = './?demo=1&flags=v7Shell,padLocal#/p/real-analysis/cp/CP4';

test('math keys preserve the native selection, share text undo and keep native typing available', async ({page}) => {
  await page.route('https://**/*', route => route.abort());
  await page.setViewportSize({width:320,height:740});
  await page.goto(checkpoint);
  await page.getByRole('button',{name:'Open Local Pad',exact:true}).click();
  const notes = page.getByRole('textbox',{name:'Pad notes'});
  await notes.fill('Proof: x+1');
  await notes.evaluate((element: HTMLTextAreaElement) => {element.focus(); element.setSelectionRange(7,10);});
  await page.getByRole('button',{name:'Fraction',exact:true}).click();
  await expect(notes).toHaveValue('Proof: \\(\\frac{x+1}{\\padslot}\\)');
  await expect(notes).toBeFocused();
  await page.getByRole('tab',{name:'Numbers',exact:true}).click();
  await page.getByRole('button',{name:'2',exact:true}).click();
  await expect(notes).toHaveValue('Proof: \\(\\frac{x+1}{2}\\)');
  await page.getByRole('button',{name:'Undo text',exact:true}).click();
  await expect(notes).toHaveValue('Proof: \\(\\frac{x+1}{\\padslot}\\)');
  await notes.press('Control+z');
  await expect(notes).toHaveValue('Proof: x+1');
  expect(await notes.evaluate((element: HTMLTextAreaElement) => [element.selectionStart,element.selectionEnd])).toEqual([7,10]);
  await notes.press('Control+Shift+z');
  await page.getByRole('button',{name:'Redo text',exact:true}).click();
  await expect(notes).toHaveValue('Proof: \\(\\frac{x+1}{2}\\)');
  await page.getByRole('button',{name:'Use device keyboard',exact:true}).click();
  await expect(notes).toHaveAttribute('inputmode','text');
  await expect(notes).toBeFocused();
  await notes.press('Control+End');
  await notes.pressSequentially(' verified');
  await expect(notes).toHaveValue('Proof: \\(\\frac{x+1}{2}\\) verified');
  await page.getByRole('button',{name:'Hide math keyboard',exact:true}).click();
  await expect(page.getByRole('tablist',{name:'Math key groups'})).toBeHidden();
  await page.getByRole('button',{name:'Save draft',exact:true}).click();
  await expect(page.getByText('Saved on this device.',{exact:true})).toBeVisible();
  await page.reload();
  await page.getByRole('button',{name:'Open Local Pad',exact:true}).click();
  await expect(page.getByRole('button',{name:'Show math keyboard',exact:true})).toBeVisible();
  await expect(notes).toHaveValue('Proof: \\(\\frac{x+1}{2}\\) verified');
  await page.getByRole('button',{name:'Show math keyboard',exact:true}).click();
  await expect(page.getByRole('tablist',{name:'Math key groups'})).toBeVisible();
});

test('math keys remain local and reachable at narrow widths and landscape with labeled touch targets', async ({page, context}) => {
  await page.route('https://**/*', route => route.abort());
  await page.goto(checkpoint);
  await page.getByRole('button',{name:'Open Local Pad',exact:true}).click();
  const notes = page.getByRole('textbox',{name:'Pad notes'});
  await notes.fill('');
  // Finish the app's initial offline-cache installation before disconnecting.
  await page.evaluate(async () => {await navigator.serviceWorker.ready;});
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state))
    .toBe('activated');
  await context.setOffline(true);
  const requests: string[] = [];
  context.on('request', request => {
    if (['fetch','xhr'].includes(request.resourceType()) || !['GET','HEAD'].includes(request.method())) requests.push(request.url());
  });
  for (const viewport of [{width:320,height:740},{width:360,height:800},{width:390,height:844},{width:844,height:390}]) {
    await page.setViewportSize(viewport);
    await page.getByRole('tab',{name:'Geometry',exact:true}).click();
    const angle = page.getByRole('button',{name:'Angle',exact:true});
    await angle.click();
    await expect(notes).toBeFocused();
    const bounds = await angle.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width + 1);
  }
  await expect(notes).toHaveValue('∠∠∠∠');
  await page.getByRole('tab',{name:'Calculus',exact:true}).click();
  await page.getByRole('button',{name:'Integral',exact:true}).click();
  await expect(notes).toHaveValue('∠∠∠∠∫');
  await page.getByRole('button',{name:'Backspace',exact:true}).click();
  await expect(notes).toHaveValue('∠∠∠∠');
  expect(requests).toEqual([]);
});
