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

for(const world of ['euclid','euclid-night'] as const){
 test(`UI-5h appearance preferences and demo preview in ${world}`,async({page})=>{
  await page.setViewportSize({width:360,height:740});
  await page.goto(`/lemma/?demo=1&theme=${world}&effects=calm#/settings`);
  await expect(page.getByRole('region',{name:'Euclid preferences'})).toBeVisible();
  const metro=page.getByRole('button',{name:'Metro',exact:true});
  await metro.click();
  await expect(metro).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Branches',exact:true}).click();
  await page.getByRole('button',{name:'Show demo preview'}).click();
  const preview=page.getByRole('region',{name:'Appearance preview'});
  await expect(preview).toContainText('Abstract Algebra');
  await expect(preview).toContainText('Atlas: Branches');
  await expect(preview.getByRole('img',{name:'Metro demo timeline'})).toBeVisible();
  await page.getByRole('button',{name:'Star Euclid',exact:true}).click();
  await expect(page.getByRole('button',{name:'Star Euclid',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.reload();
  await expect(page.getByRole('button',{name:'Metro',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button',{name:'Star Euclid',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Show demo preview'}).click();
  await expect(page.getByRole('region',{name:'Appearance preview'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
  await page.screenshot({path:`test-results/screens/review/ui5h-settings-${world}.png`,fullPage:true});
 });
 test(`UI-5h Euclid sign-in in ${world}`,async({page})=>{
  await page.setViewportSize({width:360,height:740});
  await page.goto(`/lemma/?demo=1&theme=${world}&effects=calm#/sign-in`);
  await expect(page.getByRole('heading',{name:'Sign in'})).toBeVisible();
  await expect(page.getByText('Lemma',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Continue with Google'})).toBeDisabled();
  await page.screenshot({path:`test-results/screens/review/ui5h-sign-in-${world}.png`,fullPage:true});
 });
}
