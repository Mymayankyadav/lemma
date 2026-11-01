import {expect,type Page} from '@playwright/test'

/**
 * C2/D6 are interactive route-transition budgets, not fixture-generation
 * budgets. Paths renders its h1 before useProjects resolves, so waiting for
 * the heading alone lets a 30k-card demo hydrate under the transition clock.
 *
 * Require a real data-backed project row AND its Mini Route. The pending
 * skeleton and empty/error states cannot satisfy either assertion. This does
 * not warm Atlas/Cards, bypass a route, change CPU throttle, or add a sleep.
 */
export async function waitForLoadedPaths(page:Page):Promise<void>{
 await expect(page.getByRole('heading',{name:'Paths',level:1})).toBeVisible({timeout:90_000})
 const first=page.locator('[data-project-row]').first()
 await expect(first).toBeVisible({timeout:90_000})
 await expect(first.locator('[data-mini-route]')).toBeVisible({timeout:90_000})
 // Visibility checks establish DOM/layout, not the previous page's completed
 // paint. Let its queued layout/ResizeObserver work settle before measuring a
 // different route. This is a frame barrier, not a timed sleep or prefetch.
 await page.evaluate(()=>new Promise<void>(resolve=>
  requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))
}
