import { test, expect } from "@playwright/test";
test("card approval, rejection, swipe, and plan approval update the inbox", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ body: "" }),
  );
  await page.goto("/lemma/?demo=1#/proposals");
  const cards = page.getByRole("button", { name: /Cards 5/ });
  await expect(cards).toBeVisible();
  await expect(page.getByText("Why must", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Approve card" }).click();
  await expect(page.getByRole("button", { name: /Cards 4/ })).toBeVisible();
  await page.getByRole("button", { name: "Reject card" }).click();
  await expect(page.getByRole("button", { name: /Cards 3/ })).toBeVisible();
  const card = page.getByLabel(
    "Proposal card, swipe right to approve or left to reject",
  );
  const box = await card.boundingBox();
  if (!box) throw Error("Missing proposal card");
  await page.mouse.move(box.x + box.width * 0.4, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.85, box.y + 100, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByRole("button", { name: /Cards 2/ })).toBeVisible();
  await page.getByRole("button", { name: /Plan 1/ }).click();
  await expect(
    page.getByText("Finite subcover lemma", { exact: false }),
  ).toBeVisible();
  await page.getByRole("link", { name: "See the whole plan" }).click();
  await expect(
    page.getByRole("heading", { name: "Plan change" }),
  ).toBeVisible();
  await expect(page.getByText("CP5 needs CP4a")).toBeVisible();
  await page.getByRole("button", { name: "Approve plan" }).click();
  await expect(page).toHaveURL(/#\/p\/real-analysis$/);
  expect(errors).toEqual([]);
});
test("editing a proposed card previews and approves the edited content", async ({
  page,
}) => {
  await page.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ body: "" }),
  );
  await page.goto("/lemma/?demo=1#/proposals");
  await page.getByRole("button", { name: "Edit card" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit card" });
  await dialog.getByLabel("Front").fill("An edited question");
  await expect(
    dialog.getByRole("paragraph").filter({ hasText: "An edited question" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByRole("button", { name: /Cards 4/ })).toBeVisible();
  await page.screenshot({
    path: "test-results/screens/proposals.png",
    fullPage: true,
  });
});

for(const world of ['euclid','euclid-night'] as const){
 test(`UI-5f approval and errata sheet in ${world}`,async({page})=>{
  await page.setViewportSize({width:360,height:740});
  await page.goto(`/lemma/?demo=1&theme=${world}&effects=calm#/proposals`);
  await expect(page.getByRole('button',{name:'Approve card'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Edit card'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Reject card'})).toBeVisible();
  await page.screenshot({path:`test-results/screens/review/ui5f-approve-${world}.png`,fullPage:true});
  await page.getByRole('button',{name:/Plan 1/}).click();
  await expect(page.getByRole('region',{name:'Plan errata'})).toContainText('CP5 needs CP4a');
  await page.getByRole('link',{name:'See the whole plan'}).click();
  await expect(page.getByRole('region',{name:'Plan errata'})).toContainText('CP5 needs CP4a');
  await expect(page.getByRole('button',{name:'Approve plan'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
  await page.screenshot({path:`test-results/screens/review/ui5f-plan-${world}.png`,fullPage:true});
 });
}
