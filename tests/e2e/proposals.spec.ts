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
  // LOOK-8a intentionally shows the same mathematical front in both the
  // new group checklist and the selected proposal card. Verify both regions
  // rather than relying on an ambiguous page-wide text locator.
  await expect(page.getByRole("group", { name: "Cards in this proposal group" })
    .filter({ hasText: "Why must" }).first()).toBeVisible();
  await expect(page.getByLabel("Proposal card, swipe right to approve or left to reject")
    .getByText("Why must", { exact: false })).toBeVisible();
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

for(const world of ['graph','graph-night'] as const){
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

test('a blocked tutor handoff keeps the proposed plan pending',async({page})=>{
 await page.goto('/lemma/?demo=1#/proposals?tab=plan');
 await page.getByRole('link',{name:'See the whole plan'}).click();
 await page.evaluate(()=>{
  window.open=()=>null;
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
   writeText:async()=>{throw Error('Clipboard denied')},
  }});
 });
 await page.getByRole('button',{name:'Ask for changes'}).click();
 const dialog=page.getByRole('dialog',{name:'Ask for changes'});
 await dialog.getByRole('textbox',{name:'What should change?'}).fill('Clarify the second lemma');
 await dialog.getByRole('button',{name:'Send'}).click();
 await expect(page.getByText(/proposal is still pending/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Approve plan'})).toBeVisible();
 await expect(dialog.getByRole('textbox',{name:'What should change?'})).toHaveValue('Clarify the second lemma');
 await page.goto('/lemma/?demo=1#/proposals?tab=plan');
 await expect(page.getByRole('link',{name:'See the whole plan'})).toBeVisible();
});

test('tapping a checkpoint opens a drawer that steps through the plan',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/lemma/?demo=1#/proposals?tab=plan');
 await page.getByRole('link',{name:'See the whole plan'}).click();
 await expect(page.getByRole('button',{name:'Approve plan'})).toBeVisible();
 await page.getByLabel('Checkpoint prerequisites').screenshot({path:'test-results/screens/plan-map.png'});
 await page.getByRole('region',{name:'Checkpoints'}).getByRole('button').first().click();
 const drawer=page.locator('[data-checkpoint-drawer]');
 await expect(drawer).toBeVisible();
 const first=await drawer.getAttribute('data-checkpoint-drawer');
 await expect(drawer).toContainText(/1 of \d+/);
 await page.screenshot({path:'test-results/screens/plan-checkpoint-drawer.png'});
 await drawer.getByRole('button',{name:/CP/}).last().click();
 await expect(drawer).not.toHaveAttribute('data-checkpoint-drawer',first!);
 await page.getByRole('dialog').getByRole('button',{name:'Close'}).click();
 await expect(drawer).toHaveCount(0);
 await page.getByRole('button',{name:/^Select CP/}).first().click();
 await expect(page.locator('[data-checkpoint-drawer]')).toBeVisible();
});

test('the ideas a plan adds fold into clusters and link to the checkpoints that teach them',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/lemma/?demo=1#/proposals?tab=plan');
 await page.getByRole('link',{name:'See the whole plan'}).click();
 const ideas=page.getByRole('region',{name:'Ideas in this plan'});
 await expect(ideas.getByRole('tree',{name:'Ideas in this plan'})).toBeVisible();
 const all=await ideas.getByRole('treeitem').count();
 const fold=ideas.getByRole('group',{name:'Fold ideas to level'});
 await fold.getByRole('button',{name:'Show fields level'}).click();
 expect(await ideas.getByRole('treeitem').count()).toBeLessThan(all);
 await fold.getByRole('button',{name:'Show all level'}).click();
 // The chevron folds; selecting a parent row must not also collapse its
 // descendants. These are distinct 44px actions in the approved v4 Atlas.
 const parent=ideas.getByRole('treeitem').filter({has:ideas.getByRole('button',{name:/^Fold /})}).first();
 await expect(parent).toHaveAttribute('aria-expanded','true');
 const beforeSelectionCount=await ideas.getByRole('treeitem').count();
 await parent.getByRole('button').last().click();
 await expect(parent).toHaveAttribute('aria-selected','true');
 await expect(parent).toHaveAttribute('aria-expanded','true');
 expect(await ideas.getByRole('treeitem').count()).toBe(beforeSelectionCount);
 await ideas.getByRole('button',{name:/^Separating a point from a compact set, /}).click();
 const selection=ideas.locator('[data-idea-selection]');
 await expect(selection).toContainText('Builds on');
 expect(await ideas.locator('[data-arc-tone="up"]').count()).toBeGreaterThan(0);
 await ideas.scrollIntoViewIfNeeded();
 await page.screenshot({path:'test-results/screens/plan-ideas-graph.png'});
 await selection.getByRole('button',{name:'Details'}).click();
 const details=page.getByRole('dialog');
 await expect(details).toContainText('Builds on');
 await expect(details).toContainText('Opens up');
 await expect(details).toContainText('Taught in');
 await expect(details.getByRole('progressbar',{name:'Idea progress'})).toBeVisible();
 // Proposed ideas remain inside plan review: the checkpoint opens the local
 // drawer rather than navigating to an idea not yet in the approved Atlas.
 await details.getByRole('button',{name:'CP4a'}).click();
 await expect(page.locator('[data-checkpoint-drawer="CP4a"]')).toBeVisible();
});

// LOOK-8c: preserve the embedded v4 hierarchy and paper at both ST-0 sizes,
// in both graph themes, against the actual stress and extreme demo stores.
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [390,360] as const){
 test(`LOOK-8c plan ideas ${profile} ${theme} ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:width===390?844:740});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.goto(`/lemma/?demo=${profile}&theme=${theme}#/proposals?tab=plan`);
  await page.getByRole('link',{name:'See the whole plan'}).click();
  const ideas=page.getByRole('region',{name:'Ideas in this plan'});
  const tree=ideas.getByRole('tree',{name:'Ideas in this plan'});
  await expect(tree).toBeVisible();
  const fold=ideas.getByRole('group',{name:'Fold ideas to level'});
  await fold.getByRole('button',{name:'Show fields level'}).click();
  await expect(fold.getByRole('button',{name:'Show fields level'})).toHaveAttribute('aria-pressed','true');
  await fold.getByRole('button',{name:'Show all level'}).click();
  await expect(tree.getByRole('treeitem').first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  const paper=await tree.evaluate(el=>getComputedStyle(el).backgroundColor);
  expect(paper,'The grid must not show through the idea rows').not.toBe('rgba(0, 0, 0, 0)');
  await page.screenshot({path:`test-results/screens/stress/look-8c-${profile}-${theme}-${width}.png`,fullPage:true});
  // The Details sheet must remain usable at the same real S/X phone width.
  // It stays inside this proposal, with a focus-trapped 44px Close action.
  await tree.getByRole('treeitem').last().getByRole('button').last().click();
  await ideas.locator('[data-idea-selection="true"]').getByRole('button',{name:'Details'}).click();
  const sheet=page.getByRole('dialog');
  await expect(sheet.getByRole('progressbar',{name:'Idea progress'})).toBeVisible();
  const close=sheet.getByRole('button',{name:'Close',exact:true});
  const closeBox=await close.boundingBox();
  expect(closeBox?.height).toBeGreaterThanOrEqual(44);
  expect(closeBox?.width).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:`test-results/screens/stress/look-8c-${profile}-${theme}-${width}-details.png`});
  await close.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
 });
}
