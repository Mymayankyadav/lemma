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
  await page.getByRole("button", { name: "Card actions" }).click();
  await page.getByRole("menuitem", { name: "Suspend card" }).click();
  await page.getByRole("button", { name: "Card actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Resume card" })).toBeVisible();
  await page.keyboard.press("Escape");
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
  await expect(page.getByRole("article", { name: "Card front and answer" }).getByText("What is a metric?")).toBeVisible();
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

for (const [width, density] of [
  [320, "comfortable"],
  [390, "compact"],
  [390, "cozy"],
  [390, "comfortable"],
] as const) {
  test(`card filters stay on one scrollable row at ${width}px / ${density}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route("https://fonts.googleapis.com/**", (r) =>
      r.fulfill({ body: "" }),
    );
    await page.goto(`/lemma/?demo=1&density=${density}#/cards`);
    const filters = page.getByRole("group", { name: "Card filters" });
    const project = filters.getByRole("button", { name: "Real Analysis" });
    await expect(project).toBeVisible();
    await expect(filters.locator("button")).toHaveCount(6);

    const layout = await filters.evaluate((row) => ({
      clientWidth: row.clientWidth,
      scrollWidth: row.scrollWidth,
      chips: Array.from(row.querySelectorAll("button")).map((button) => ({
        top: button.getBoundingClientRect().top,
        height: button.getBoundingClientRect().height,
        clientWidth: button.clientWidth,
        scrollWidth: button.scrollWidth,
        whiteSpace: getComputedStyle(button).whiteSpace,
        flexShrink: getComputedStyle(button).flexShrink,
      })),
    }));
    expect(layout.scrollWidth).toBeGreaterThan(layout.clientWidth);
    expect(layout.chips.length).toBe(6);
    for (const chip of layout.chips) {
      expect(Math.abs(chip.top - layout.chips[0].top)).toBeLessThan(1);
      expect(chip.height).toBeGreaterThanOrEqual(28);
      expect(chip.whiteSpace).toBe("nowrap");
      expect(chip.flexShrink).toBe("0");
      expect(chip.scrollWidth).toBeLessThanOrEqual(chip.clientWidth + 1);
    }
    await page.screenshot({
      path: `test-results/screens/cards-filters-${density}-${width}.png`,
      fullPage: true,
    });
    const paused = filters.getByRole("button", { name: "Paused" });
    await paused.scrollIntoViewIfNeeded();
    await expect(paused).toBeInViewport();
    await paused.click();
    await expect(paused).toHaveAttribute("aria-pressed", "true");
  });
}

for(const world of ['graph','graph-night'] as const){
 test(`UI-5g card rows and tutor marginalia in ${world}`,async({page})=>{
  await page.setViewportSize({width:360,height:740});
  await page.addInitScript(theme=>localStorage.setItem('lemma.ui',JSON.stringify({theme,density:'compact',effects:'calm'})),world);
  await page.goto('/lemma/?demo=1#/cards');
  // ST-4 intentionally pages newest-first: find the legacy fixture by search,
  // rather than assuming its card appears in the first 50 unfiltered rows.
  await page.getByLabel('Search cards').fill('Heine');
  const row=page.getByRole('link',{name:/Heine/});
  await expect(row).toBeVisible();
  await expect(row.locator('span').filter({hasText:/CP/}).first()).toBeVisible();
  await page.screenshot({path:`test-results/screens/ui-5g-cards-${world}.png`,fullPage:true});
  await row.click();
  await expect(page.getByRole('article',{name:'Card front and answer'})).toBeVisible();
  const note=page.getByText('Too wordy. Make the hypotheses a cloze.');
  await expect(note).toBeVisible();
  expect(await note.locator('xpath=ancestor::*[@data-comment-row][1]').evaluate(el=>getComputedStyle(el).borderLeftWidth)).toBe('2px');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
  await page.screenshot({path:`test-results/screens/ui-5g-card-detail-${world}.png`,fullPage:true});
 });
}

for(const theme of ['graph','graph-night'])test(`focused card routes keep floating tools clear: ${theme}`,async({page})=>{
 for(const route of ['/cards','/cards/31']){
  await page.goto(`/lemma/?demo=1&theme=${theme}&effects=calm#${route}`)
  await expect(page.getByRole('heading',{name:route==='/cards'?'Cards':'Card detail',level:1})).toBeVisible()
  await expect(page.getByRole('button',{name:'Open theme lab'})).toHaveCount(0)
  await page.screenshot({path:`test-results/screens/review/ui5e-${theme}-${route==='/cards'?'cards':'card-detail'}-clear.png`,fullPage:true})
 }
})
