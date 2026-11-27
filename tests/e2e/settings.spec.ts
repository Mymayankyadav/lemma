import {enableSurfaceBeta} from './helpers/surface-preview';
import { test, expect } from "@playwright/test";
test("connector visibility, app setup, memory setting and backup", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://fonts.googleapis.com/**", (r) =>
    r.fulfill({ body: "" }),
  );
  await page.goto("/lemma/?demo=1#/settings");
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await expect(page.getByText(/••••••/)).toBeVisible();
  await page.getByRole("button", { name: "Show connector address" }).click();
  await expect(page.getByText(/demo\.lemma\.invalid/)).toBeVisible();
  await page.getByRole("button", { name: "Hide connector address" }).click();
  await expect(page.getByText(/••••••/)).toBeVisible();
  await page.getByRole("button", { name: "Set up" }).click();
  await expect(page.getByText(/enable Developer mode/)).toBeVisible();
  const slider = page.getByRole("slider", { name: "Target recall" });
  await expect(slider).toHaveValue("90");
  await slider.focus();
  await slider.press("ArrowRight");
  await expect(slider).toHaveValue("91");
  await expect(page.getByText("91%", { exact: true })).toBeVisible();
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download a backup" }).click();
  const download = await event;
  expect(download.suggestedFilename()).toMatch(
    /^lemma-backup-\d{4}-\d{2}-\d{2}\.json$/,
  );
  expect(errors).toEqual([]);
  await page.getByRole("button", { name: "Set up" }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/screens/settings.png",
    fullPage: true,
  });
});
test("rotating the connector requires confirmation", async ({ page }) => {
  await page.route("https://fonts.googleapis.com/**", (r) =>
    r.fulfill({ body: "" }),
  );
  await page.goto("/lemma/?demo=1#/settings");
  await page.getByRole("button", { name: "Make a new address" }).click();
  const dialog = page.getByRole("dialog", { name: "Make a new address?" });
  await expect(
    dialog.getByText("The old address stops working in Claude and ChatGPT."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
});

for(const world of ['graph','graph-night'] as const){
 test(`UI-6a sign-in stays readable in ${world}`,async({page})=>{
  await page.setViewportSize({width:360,height:740});
  await page.goto(`/lemma/?demo=1&theme=${world}#/sign-in`);
  await expect(page.getByRole('heading',{name:'Sign in'})).toBeVisible();
  // v4 §5: demo sign-in is informational, not a disabled red action.
  await expect(page.getByRole('button',{name:'Continue with Google'})).toHaveCount(0);
  await expect(page.getByText('Sign-in is available in live mode.')).toBeVisible();
  await page.screenshot({path:`test-results/screens/review/ui6a-sign-in-${world}.png`,fullPage:true});
 });
}
test('UI-6a appearance exposes only Automatic, Day and Night and persists',async({page})=>{
 await page.emulateMedia({colorScheme:'light'});
 await page.goto('/lemma/?demo=1#/settings');
 const appearance=page.getByRole('region',{name:'Appearance'});
 await expect(appearance.getByRole('radio')).toHaveCount(3);
 await expect(page.getByRole('button',{name:'Open theme lab'})).toHaveCount(0);
 await expect(page.getByRole('radiogroup',{name:'Density'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Branches',exact:true})).toHaveCount(0);
 await appearance.getByRole('radio',{name:/^Day /}).click();
 await expect(page.locator('html')).toHaveAttribute('data-theme','graph');
 await page.reload();
 await expect(page.locator('html')).toHaveAttribute('data-theme','graph');
 await appearance.getByRole('radio',{name:/^Night /}).click();
 await expect(page.locator('html')).toHaveAttribute('data-theme','graph-night');
 await appearance.getByRole('radio',{name:/^Automatic /}).click();
 await expect(page.locator('html')).toHaveAttribute('data-theme','graph');
 await page.emulateMedia({colorScheme:'dark'});
 await expect(page.locator('html')).toHaveAttribute('data-theme','graph-night');
 await page.screenshot({path:'test-results/screens/review/ui6a-settings-night.png',fullPage:true});
});

test('UI-6a migrates obsolete stored worlds and applies the shell’s compact defaults',async({page})=>{
 await page.emulateMedia({colorScheme:'light'});
 await page.addInitScript(()=>{
  localStorage.setItem('lemma.ui',JSON.stringify({theme:'euclid-night',density:'comfortable',effects:'rich'}));
 });
 await page.goto('/lemma/?demo=1#/settings');
 await expect(page.locator('html')).toHaveAttribute('data-theme','graph');
 await expect(page.locator('html')).toHaveAttribute('data-density','compact');
 const root=page.locator('html');
 if(await root.getAttribute('data-v7')!==null){
  await expect(root).not.toHaveAttribute('data-effects','calm');
 }else{
  await expect(root).toHaveAttribute('data-effects','calm');
  await expect(root).toHaveAttribute('data-motion','reduced');
 }
 await expect(page.getByRole('radiogroup',{name:'Appearance mode'}).getByRole('radio',{name:/^Automatic /})).toHaveAttribute('aria-checked','true');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('lemma.ui')||'{}'))).toEqual({mode:'auto'});
 await page.emulateMedia({colorScheme:'dark'});
 await expect(page.locator('html')).toHaveAttribute('data-theme','graph-night');
});

test('v3 subject management is discoverable and requires confirmation before merging',async({page})=>{
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}))
 await page.goto('/lemma/?demo=1#/settings')
 const section=page.getByRole('region',{name:'Subjects'})
 await expect(section).toBeVisible()
 await section.getByRole('button',{name:'Manage'}).click()
 const sheet=page.getByRole('dialog',{name:'Manage subjects'})
 await expect(sheet).toContainText('Demo subjects are examples')
 const first=sheet.getByRole('button',{name:/Analysis/}).first()
 await first.click()
 await expect(sheet.getByLabel('Name',{exact:true})).toBeVisible()
 await expect(sheet.getByLabel('Glyph',{exact:true})).toBeVisible()
 await expect(sheet.getByRole('button',{name:'Save subject'})).toHaveCount(0)
 await expect(sheet.getByRole('button',{name:'Confirm merge'})).toHaveCount(0)
 await page.screenshot({path:'test-results/screens/review/ui6e-subjects-graph.png',fullPage:true})
})

test('Planning Advanced preserves the sheet and returns focus to the edited row', async({page})=>{
 await page.goto('/lemma/?demo=1&flags=v7Shell#/settings?section=planning');
 const openAdvanced=page.getByRole('button',{name:'Advanced',exact:true});
 await openAdvanced.click();
 const sheet=page.locator('dialog[open]').filter({has:page.getByRole('heading',{name:'Advanced',exact:true})});
 await sheet.evaluate(node=>node.setAttribute('data-original-settings-sheet',''));
 const row=page.getByRole('button',{name:/^Gap between blocks/});
 await row.click();
 const sameSheet=page.locator('dialog[open][data-original-settings-sheet]');
 await expect(sameSheet).toHaveAccessibleName('Gap between blocks');
 const save=sameSheet.getByRole('button',{name:'Save',exact:true});
 await expect(save).toBeDisabled();
 await sameSheet.getByRole('slider',{name:'Gap between blocks'}).press('ArrowRight');
 await expect(save).toBeEnabled();
 await page.keyboard.press('Escape');
 const guard=page.getByRole('dialog',{name:'Discard changes?'});
 await expect(guard.getByRole('button',{name:'Keep editing'})).toBeFocused();
 await guard.getByRole('button',{name:'Keep editing'}).click();
 await expect(save).toBeEnabled();
 await sameSheet.getByRole('button',{name:'Back to Advanced'}).click();
 await guard.getByRole('button',{name:'Discard changes'}).click();
 await expect(sameSheet).toHaveAccessibleName('Advanced');
 await expect(row).toBeFocused();
 await page.keyboard.press('Escape');
 await expect(openAdvanced).toBeFocused();
});

test('week start applies immediately and offers Undo', async({page})=>{
 await page.goto('/lemma/?demo=1&flags=v7Shell#/settings?section=planning');
 const row=page.getByRole('button',{name:/^Week starts on/});
 await row.click();
 const picker=page.getByRole('dialog',{name:'Week starts on'});
 const current=picker.getByRole('radio',{checked:true});
 const before=await current.innerText();
 const next=before==='Friday'?'Tuesday':'Friday';
 await expect(picker.getByRole('button',{name:'Save',exact:true})).toHaveCount(0);
 await picker.getByRole('radio',{name:next,exact:true}).click();
 await expect(picker).toHaveCount(0);
 await expect(row).toContainText(next);
 await expect(row).toBeFocused();
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await expect(row).toContainText(before);
});

test('Beta testing applies immediately, persists on this device and can be turned off',async({page})=>{
 await page.goto('/lemma/?demo=1&flags=v7Shell#/settings');
 await expect(page.getByRole('link',{name:/^Advanced.*Beta testing/})).toBeVisible();
 await page.getByRole('navigation',{name:'Page actions'}).getByRole('button',{name:'Search',exact:true}).click();
 await page.getByRole('combobox',{name:'Search'}).fill('Beta testing');
 await page.getByRole('option',{name:'Beta testing',exact:true}).click();
 await expect(page).toHaveURL(/settings\?section=advanced$/);
 const setting=page.getByRole('switch',{name:'Beta testing',exact:true});
 await expect(setting).not.toBeChecked();
 await page.evaluate(()=>Object.assign(window,{betaSameDocument:true}));
 await setting.click();
 await expect(setting).toBeChecked();
 expect(await page.evaluate(()=>Reflect.get(window,'betaSameDocument'))).toBe(true);
 await page.reload();
 await expect(setting).toBeChecked();
 await setting.click();
 await expect(setting).not.toBeChecked();
 await page.reload();
 await expect(setting).not.toBeChecked();
});

test('keyboard disclosure focuses the first new control and restores its trigger without shifting it',async({page})=>{
 await enableSurfaceBeta(page);
 await page.goto('/lemma/?demo=1&flags=v7Shell#/p/real-analysis');
 const disclosure=page.locator('.v7-path-map .v7-disclosure-trigger').first();
 const panel=page.locator('.v7-path-map .v7-disclosure').first();
 const first=panel.locator('.v7-expand-panel :is(a[href],button):not([disabled])').first();
 await expect(disclosure).toBeVisible();
 await disclosure.focus();
 const closed=await disclosure.boundingBox();
 await disclosure.press('Enter');
 await expect(disclosure).toHaveAttribute('aria-expanded','true');
 await expect(first).toBeFocused();
 expect(Math.abs((await disclosure.boundingBox())!.y-closed!.y)).toBeLessThanOrEqual(8);
 await first.press('Escape');
 await expect(disclosure).toHaveAttribute('aria-expanded','false');
 await expect(disclosure).toBeFocused();
 await expect(panel).toBeVisible();
});

test('the hub title uses scroll hysteresis without moving the next section',async({page})=>{
 await enableSurfaceBeta(page);
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.setViewportSize({width:390,height:480});
 await page.goto('/lemma/?demo=1&flags=v7Shell#/settings');
 const title=page.getByRole('heading',{name:'Settings',exact:true,level:1});
 const header=page.locator('.v7-hub-bar');
 const first=page.getByRole('link',{name:/^Appearance/});
 await expect(title).toBeVisible();
 await expect(first).toBeVisible();
 const height=(await header.boundingBox())!.height;
 const documentTop=await first.evaluate(link=>link.getBoundingClientRect().top+scrollY);
 const step=async(y:number,collapsed:boolean)=>{
  await page.evaluate(offset=>window.scrollTo(0,offset),y);
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(y);
  await expect(header).toHaveAttribute('data-collapsed',String(collapsed));
  expect((await header.boundingBox())!.height).toBe(height);
  expect(await first.evaluate(link=>link.getBoundingClientRect().top+scrollY)).toBeCloseTo(documentTop,0);
 };
 await step(30,false);
 await step(34,true);
 await step(24,true);
 await step(7,false);
});
