import {test,expect} from "@playwright/test";
import {NOW,at} from "./v7-scenes";
// N150 · bug #1375: an Inbox key pressed the moment the Inbox appears is not lost. The listener exists from the first
// commit, and an E pressed while the stack is still loading opens the editor when the first card shows.
test.use({locale:"en-IN",timezoneId:"Asia/Kolkata",colorScheme:"dark"});

test("N150 E pressed as soon as the Inbox appears opens the editor",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.clock.setFixedTime(NOW);
 await page.goto(at("/proposals"));
 // No wait for the network or for the cards: the moment the Inbox is in the page, press E.
 await expect(page.locator('main[aria-label="Inbox"]')).toBeAttached();
 await page.keyboard.press("e");
 await expect(page.getByRole("dialog",{name:"Edit proposed card"}).getByRole("button",{name:"Save and approve"})).toBeVisible();
 // Nothing was decided on the way: closing the editor leaves all five cards.
 await page.keyboard.press("Escape");
 await expect(page.locator(".v7-inbox-position")).toHaveText("1 of 5");
});
// That a decision key (A, R, arrows) pressed before the cards show is never replayed is covered deterministically in
// tests/unit/v7/n150-inbox-keys.test.tsx; in a browser the moment the cards appear cannot be pinned.
