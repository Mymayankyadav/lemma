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
