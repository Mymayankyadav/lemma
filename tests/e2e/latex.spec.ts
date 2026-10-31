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
 await dialog.getByLabel('Project').selectOption('real-analysis');
 await expect(dialog.getByRole('button',{name:'Create card'})).toBeEnabled();
 await front.fill('Prove that $\\mathbb{R}$ is complete');
 await expect(dialog.getByRole('region',{name:'Math preview'}).first().locator('.katex')).toHaveCount(1);
 await page.screenshot({path:'test-results/screens/math-new-card-preview.png',fullPage:true});
});

test('sources-first project name accepts live mathematical notation',async({page})=>{
 await page.goto('/lemma/?demo=1#/projects/new');
 const dialog=page.getByRole('dialog',{name:'New project'});
 const name=dialog.getByRole('textbox',{name:'Name'});
 await name.fill('Topology of $\\\\mathbb{R}^n$');
 await expect(dialog.getByRole('region',{name:'Math preview'}).first().locator('.katex')).toBeVisible();
 await page.screenshot({path:'test-results/screens/math-project-preview.png',fullPage:true});
});

test('cards retain the real renderer for mathematical questions',async({page})=>{
 await page.goto('/lemma/?demo=1#/cards');
 await page.getByLabel('Search cards').fill('Heine');
 const row=page.getByRole('link',{name:/Heine/}).first();
 await expect(row).toBeVisible();
 await row.click();
 await expect(page.getByRole('heading',{name:'Card detail'})).toBeVisible();
 const note=page.locator('#tutor-note');
 await note.fill('Replace $K/k$ with $H\\mapsto K^H$');
 await expect(page.getByRole('region',{name:'Math preview'}).locator('.katex')).toHaveCount(2);
});

test('card library renders mathematical fronts instead of stripping command names',async({page})=>{
 await page.goto('/lemma/?demo=stress#/cards');
 await page.getByLabel('Search cards').fill('longexpression');
 // KaTeX's MathML is a separate accessible math node, so the enclosing
 // link's name is CP6 Due rather than the literal mathematical expression.
 const row=page.locator('a[href="#/cards/6"]');
 await expect(row).toBeVisible();
 await expect(row.locator('.katex')).toBeVisible();
 await expect(row.getByRole('math')).toContainText('longexpression');
 // Hidden MathML annotation retains the original TeX for accessibility;
 // assert that no raw commands leak into the *visible* rendered text.
 await expect(row.locator('.katex-html')).not.toContainText(/operatorname|mathbb|limxto|frac[a-z]/i);
 await page.screenshot({path:'test-results/screens/math-card-list.png',fullPage:true});
});
