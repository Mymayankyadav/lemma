import {test,expect} from '@playwright/test';

/** LOOK-9a: no false primary action in demo or before a project name exists. */
for(const theme of ['graph','graph-night'] as const)
for(const profile of ['1','stress'] as const)
for(const width of [360,390] as const){
 test(`LOOK-9a sign-in and project creation ${theme} ${profile} ${width}px`,async({page})=>{
  test.setTimeout(120_000);
  await page.setViewportSize({width,height:width===360?740:844});
  await page.goto(`/lemma/?demo=${profile}&theme=${theme}#/sign-in`,{waitUntil:'domcontentloaded'});
  await expect(page.getByText('Sign-in is available in live mode.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Continue with Google'})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:`test-results/screens/look-9a/sign-in-${theme}-${profile}-${width}.png`});

  await page.goto(`/lemma/?demo=${profile}&theme=${theme}#/projects/new`,{waitUntil:'domcontentloaded'});
  const name=page.getByRole('textbox',{name:'Name'});
  await expect(name).toBeVisible();
  const submit=page.getByRole('button',{name:'Create project'});
  await expect(submit).toBeDisabled();
  await expect(submit).toHaveClass(/ghost/);
  await expect(submit).not.toHaveClass(/lit/);
  await expect(page.getByText(/^Path: /)).toHaveCount(0);
  await name.fill('Real Analysis');
  await expect(submit).toBeEnabled();
  await expect(submit).toHaveClass(/lit/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:`test-results/screens/look-9a/new-project-${theme}-${profile}-${width}.png`});
 });
}

test('LOOK-9a installed PWA uses Graph-night rather than legacy Obsidian colours',async({page})=>{
 await page.goto('/lemma/?demo=1&theme=graph-night#/');
 const manifest=await page.evaluate(async()=>{
  const response=await fetch('/lemma/manifest.webmanifest');
  if(!response.ok)throw new Error('PWA manifest unavailable: '+response.status);
  return response.json() as Promise<{theme_color:string;background_color:string}>;
 });
 expect(manifest.theme_color).toBe('#13171D');
 expect(manifest.background_color).toBe('#13171D');
});
