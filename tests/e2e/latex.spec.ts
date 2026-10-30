import {test,expect} from '@playwright/test';

test.beforeEach(async ({page}) => {
 await page.route('https://fonts.googleapis.com/**', route=>route.fulfill({body:''}));
});

test('new card editor previews LaTeX and keeps malformed math editable',async({page})=>{
 await page.goto('/lemma/?demo=1#/cards');
 await page.getByRole('button',{name:'New card'}).click();
 const dialog=page.getByRole('dialog',{name:'New card'});
 const front=dialog.getByLabel('Front');
 await front.fill('Describe $K/k$ and $H\\mapsto K^H$');
 await expect(dialog.getByRole('region',{name:'Math preview'}).first().locator('.katex')).toHaveCount(2);
 await expect(dialog.getByRole('region',{name:'Math preview'}).first()).not.toContainText('$H');
 await front.fill('Unclosed $x');
 await expect(dialog.getByRole('alert',{name:'Math preview'})).toContainText('Unclosed $');
 await expect(front).toHaveValue('Unclosed $x');
 await expect(dialog.getByRole('button',{name:'Create card'})).toBeEnabled();
 await front.fill('Prove that $\\mathbb{R}$ is complete');
 await expect(dialog.getByRole('region',{name:'Math preview'}).first().locator('.katex')).toHaveCount(1);
 await page.screenshot({path:'test-results/screens/math-new-card-preview.png',fullPage:true});
});

test('new project name and goal accept live mathematical notation',async({page})=>{
 await page.goto('/lemma/?demo=1#/projects/new');
 const dialog=page.getByRole('dialog',{name:'New project'});
 const name=dialog.getByRole('textbox',{name:'Name'});
 await name.fill('Topology of $\\mathbb{R}^n$');
 await expect(dialog.getByRole('region',{name:'Math preview'}).first().locator('.katex')).toBeVisible();
 const goal=dialog.getByRole('textbox',{name:'Goal'});
 await goal.fill('Understand $H\\mapsto K^H$');
 await expect(dialog.getByRole('region',{name:'Math preview'})).toHaveCount(2);
 await expect(dialog.getByRole('region',{name:'Math preview'}).last().locator('.katex')).toBeVisible();
 await page.screenshot({path:'test-results/screens/math-project-preview.png',fullPage:true});
});

test('cards retain the real renderer for mathematical questions',async({page})=>{
 await page.goto('/lemma/?demo=1#/cards');
 await page.getByLabel('Search cards').fill('Heine');
 const row=page.getByRole('link',{name:/Heine/}).first();
 await expect(row).toBeVisible();
 await row.click();
 await expect(page.getByRole('heading',{name:'Card detail'})).toBeVisible();
 const note=page.getByLabel('Note for your tutor');
 await note.fill('Replace $K/k$ with $H\\mapsto K^H$');
 await expect(page.getByRole('region',{name:'Math preview'}).locator('.katex')).toHaveCount(2);
});
