import { test, expect } from "@playwright/test";
const kit = "/lemma/?demo=1&flags=v7Shell,v6Shell&mode=day#/kit";
test("v7 gallery has isolated fonts and themes, nine sizes and five canonical radii", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (r) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(r.url()))
      external.push(r.url());
  });
  await page.goto(kit);
  await expect(
    page.getByRole("heading", { name: "A little more clarity." }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("html")).toHaveAttribute("data-v7", "");
  await expect(page.locator("html")).not.toHaveAttribute("data-v6");
  expect(external).toEqual([]);
  const styles = await page.locator(".v7-kit").evaluate((root) => {
    const nodes = [root, ...root.querySelectorAll("*")].filter(
      (el) =>
        el.getBoundingClientRect().width && el.getBoundingClientRect().height,
    );
    return {
      sizes: [...new Set(nodes.map((el) => getComputedStyle(el).fontSize))],
      radii: [
        ...new Set(
          nodes
            .map((el) => getComputedStyle(el).borderTopLeftRadius)
            .filter((r) => r !== "0px"),
        ),
      ],
    };
  });
  expect(styles.sizes.sort((a, b) => parseFloat(a) - parseFloat(b))).toEqual([
    "12px",
    "14px",
    "16px",
    "18px",
    "22px",
    "28px",
    "36px",
    "48px",
    "64px",
  ]);
  expect(
    styles.radii.every((r) =>
      ["10px", "14px", "20px", "28px", "9999px"].includes(r),
    ),
  ).toBe(true);
  await page.getByRole("tab", { name: "Night", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme",
    "graph-night",
  );
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(10, 16, 35)",
  );
});
test("sheet traps focus, scrolls the body, retains footer, and returns focus on Escape", async ({
  page,
}) => {
  await page.goto(kit);
  const trigger = page.getByRole("button", { name: "Start a session" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Make room for focus" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("textbox", { name: "Intention" }),
  ).toBeFocused();
  await expect
    .poll(() =>
      dialog
        .locator(".v7-sheet-body")
        .evaluate((el) => el.scrollHeight > el.clientHeight),
    )
    .toBe(true);
  await dialog
    .locator(".v7-sheet-body")
    .evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect(
    dialog.getByRole("button", { name: "Save session" }),
  ).toBeInViewport();
  for (let i = 0; i < 8; i++) await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() =>
      document.querySelector("dialog[open]")?.contains(document.activeElement),
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
for (const width of [320, 360, 390])
  test(`pickers and gallery fit ${width}px with keyboard controls`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(kit);
    await expect(
      page.getByRole("heading", { name: "A little more clarity." }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Subject: Analysis", exact: true })
      .click();
    await page.getByRole("radio", { name: "Topology", exact: true }).check();
    await expect(
      page.getByRole("button", { name: "Subject: Topology", exact: true }),
    ).toBeFocused();
    await page.getByRole("button", { name: "Date: 2026-11-09" }).click();
    const dialog = page.getByRole("dialog", { name: "Choose a date" });
    await expect(dialog).toBeVisible();
    const days = await dialog
      .locator(".v7-calendar button")
      .evaluateAll((nodes) =>
        nodes.map((el) => ({
          width: el.getBoundingClientRect().width,
          height: el.getBoundingClientRect().height,
          right: el.getBoundingClientRect().right,
        })),
      );
    expect(
      days.every((d) => d.width >= 44 && d.height >= 44 && d.right <= width),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Start 09:00" }).click();
    await page
      .getByRole("button", { name: "Type a time", exact: true })
      .click();
    await page.getByLabel("Time", { exact: true }).fill("10:15");
    await page.getByRole("button", { name: "Use time", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Start 10:15" }),
    ).toBeVisible();
  });
test("font and shell scopes follow kit to v6 routes and back without a reload", async ({
  page,
}) => {
  await page.goto(kit);
  await expect(
    page.getByRole("heading", { name: "A little more clarity." }),
  ).toBeVisible();
  await page.evaluate(() => {
    location.hash = "#/";
  });
  await expect(page.locator("html")).toHaveAttribute("data-v6", "");
  await expect(page.locator("#lemma-google-fonts")).toHaveCount(1);
  await page.evaluate(() => {
    location.hash = "#/kit";
  });
  await expect(
    page.getByRole("heading", { name: "A little more clarity." }),
  ).toBeVisible();
  await expect(page.locator("html")).not.toHaveAttribute("data-v6");
  await expect(page.locator("#lemma-v7-fonts")).toHaveCount(1);
});
test("desktop subject menu supports arrow keys and returns focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(kit);
  const trigger = page.getByRole("button", {
    name: "Subject: Analysis",
    exact: true,
  });
  await trigger.click();
  await expect(
    page.getByRole("menu", { name: "Subject", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitemradio", { name: "Analysis", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Subject: Algebra", exact: true }),
  ).toBeFocused();
});
test("meters preserve zero and complete geometry and primary action stays48px", async ({
  page,
}) => {
  await page.goto(kit);
  const empty = page.getByRole("meter", { name: "Not started", exact: true }),
    full = page.getByRole("meter", { name: "Complete", exact: true });
  await expect(empty).toHaveAttribute("aria-valuenow", "0");
  expect(
    await empty
      .locator("span")
      .evaluate((el) => el.getBoundingClientRect().width),
  ).toBe(0);
  expect(
    await full.evaluate(
      (el) =>
        el.querySelector("span")!.getBoundingClientRect().width ===
        el.getBoundingClientRect().width,
    ),
  ).toBe(true);
  await expect(page.getByRole("button", { name: "Start a session" })).toHaveCSS(
    "height",
    "48px",
  );
});
test("mathematical glyphs render with locally hosted STIX faces", async ({
  page,
}) => {
  await page.goto(kit);
  await expect(page.locator(".v7-glyph")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const client = await page.context().newCDPSession(page);
  await client.send("DOM.enable");
  await client.send("CSS.enable");
  const { root } = await client.send("DOM.getDocument");
  const { nodeId } = await client.send("DOM.querySelector", {
    nodeId: root.nodeId,
    selector: ".v7-glyph",
  });
  const { fonts } = await client.send("CSS.getPlatformFontsForNode", {
    nodeId,
  });
  expect(fonts.length).toBeGreaterThan(0);
  expect(
    fonts.every(
      (font) => font.isCustomFont && font.familyName.includes("STIX"),
    ),
  ).toBe(true);
});
test("cold v6 visit loads no v7 fonts and can enter the gallery without a reload", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/fonts/v7/")) requests.push(request.url());
  });
  await page.goto("/lemma/?demo=1&flags=v6Shell,v7Shell&mode=day#/");
  await expect(page.locator("html")).toHaveAttribute("data-v6", "");
  await expect(page.locator("#lemma-google-fonts")).toHaveCount(1);
  expect(requests).toEqual([]);
  await page.evaluate(() => {
    location.hash = "#/kit";
  });
  await expect(
    page.getByRole("heading", { name: "A little more clarity." }),
  ).toBeVisible();
  await expect(page.locator("#lemma-v7-fonts")).toHaveCount(1);
  await page.evaluate(() => document.fonts.ready);
  expect(requests.some((url) => url.endsWith(".woff2"))).toBe(true);
});
