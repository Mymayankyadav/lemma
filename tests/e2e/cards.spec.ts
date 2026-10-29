import { test, expect } from "@playwright/test";
test("search, notes, editing and pause work for a card", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://fonts.googleapis.com/**", (r) =>
    r.fulfill({ body: "" }),
  );
  await page.goto("/lemma/?demo=1#/cards");
  await page.getByLabel("Search cards").fill("Heine");
  const row = page.getByRole("link", { name: /Heine/ });
  await expect(row).toBeVisible();
  await row.click();
  await expect(
    page.getByRole("heading", { name: "Card detail" }),
  ).toBeVisible();
  await expect(
    page.getByText("Too wordy. Make the hypotheses a cloze."),
  ).toBeVisible();
  await page
    .getByLabel("Note for your tutor", { exact: true })
    .fill("Show a shorter proof");
  await page.getByRole("button", { name: "Save note for your tutor" }).click();
  await expect(page.getByText("Show a shorter proof")).toBeVisible();
  await expect(
    page.getByText("Next time you ask to update cards").first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause card" }).click();
  await expect(page.getByRole("button", { name: "Resume card" })).toBeVisible();
  await page.getByRole("button", { name: "Edit card" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit card" });
  await dialog
    .getByLabel("Front")
    .fill("State the Heine–Borel theorem briefly.");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByText("State the Heine–Borel theorem briefly."),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await page.screenshot({
    path: "test-results/screens/cards.png",
    fullPage: true,
  });
});
test("new cards can be created in a project", async ({ page }) => {
  await page.route("https://fonts.googleapis.com/**", (r) =>
    r.fulfill({ body: "" }),
  );
  await page.goto("/lemma/?demo=1#/cards");
  await page.getByRole("button", { name: "New card" }).click();
  const dialog = page.getByRole("dialog", { name: "New card" });
  await dialog.getByLabel("Front").fill("What is a metric?");
  await dialog
    .getByLabel("Back")
    .fill("A distance satisfying the metric axioms.");
  await dialog.getByLabel("Project").selectOption("real-analysis");
  await dialog.getByLabel("Checkpoint").selectOption("CP1");
  await dialog.getByRole("button", { name: "Create card" }).click();
  await expect(page).toHaveURL(/#\/cards\/\d+$/);
  await expect(page.getByText("What is a metric?")).toBeVisible();
});
