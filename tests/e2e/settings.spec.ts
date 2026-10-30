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
  await expect(page.getByRole('button',{name:'Continue with Google'})).toBeDisabled();
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
 await expect(page.locator('html')).toHaveAttribute('data-theme','euclid');
 await page.emulateMedia({colorScheme:'dark'});
 await expect(page.locator('html')).toHaveAttribute('data-theme','euclid-night');
 await page.screenshot({path:'test-results/screens/review/ui6a-settings-night.png',fullPage:true});
});
