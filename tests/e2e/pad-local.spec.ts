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
