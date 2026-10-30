// FIX #291: claim card-filter mobile layout regression before implementation.
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
  await expect(dialog).toBeHidden();
  await expect(
    page
      .locator("#main-content")
      .getByText("State the Heine–Borel theorem briefly."),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await expect(page.getByRole("status")).toHaveCount(0);
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

test("new card editor retains focus through a delayed search update", async ({ page }) => {
  await page.route("https://fonts.googleapis.com/**", (r) =>
    r.fulfill({ body: "" }),
  );
  await page.goto("/lemma/?demo=1#/cards");
  const search = page.getByLabel("Search cards");
  await search.fill("no-such-card-query-271");
  await page.getByRole("button", { name: "New card" }).click();
  const dialog = page.getByRole("dialog", { name: "New card" });
  const front = dialog.getByLabel("Front");
  await front.fill("State");
  await expect(front).toBeFocused();
  // The pending search debounce re-renders the parent while the sheet is open.
  await expect(page.getByText("No cards match")).toBeVisible();
  await expect(front).toBeFocused();
  await front.pressSequentially(" the triangle inequality.", { delay: 15 });
  await expect(front).toHaveValue("State the triangle inequality.");
  await expect(front).toBeFocused();
  await page.screenshot({
    path: "test-results/screens/new-card-focus.png",
    fullPage: true,
  });
});
