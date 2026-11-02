import {test,expect,type Page} from '@playwright/test'

// Test the build under review, not an independently deployed (possibly stale) Pages version.
const demo='/lemma/?demo=1#/'
async function screenshot(page:Page,name:string){
 await page.screenshot({path:'test-results/screens/acceptance-'+name+'.png',fullPage:true})
 // A horizontal scrollbar on the phone means the screen does not fit its viewport.
 expect(await page.evaluate(()=>document.documentElement.scrollWidth))
  .toBeLessThanOrEqual(391)
}
test.beforeEach(async({page})=>{
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}))
 await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}))
})
test('acceptance 1–6: Home -> proposals -> plan approval -> project -> session',async({page})=>{
 const errors:string[]=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.goto(demo)
 // 1: all values on Today
 await expect(page.getByRole('heading',{name:'Home',level:1})).toBeVisible()
 await expect(page.getByRole('region',{name:'Resume where you stopped'})).toContainText('Compactness, step 2 of 4')
 await expect(page.getByRole('link',{name:/Start review of 23 cards/})).toBeVisible()
 await expect(page.getByRole('link',{name:/Review 6 tutor proposals/})).toBeVisible()
 await expect(page.getByRole('article',{name:'Goal progress for Real Analysis'}).getByRole('link',{name:'Real Analysis',exact:true})).toBeVisible()
 await screenshot(page,'01-home')
 // 2–3: review each proposal explicitly, no implicit tutor approval.
 await page.getByRole('navigation',{name:'Desk actions'}).getByRole('link',{name:'Open proposals'}).click()
 await expect(page.getByRole('button',{name:/Cards 5/})).toBeVisible()
 // The proposal is intentionally visible in both the selectable list and the active card.
 await expect(page.getByRole('group',{name:'Cards in this proposal group'}).getByRole('button',{name:/Why must/})).toBeVisible()
 await expect(page.getByLabel('Proposal card, swipe right to approve or left to reject').getByText(/Why must/)).toBeVisible()
 await screenshot(page,'02-proposals')
 await page.getByRole('button',{name:'Approve card'}).click()
 await expect(page.getByRole('button',{name:/Cards 4/})).toBeVisible()
 await page.getByRole('button',{name:'Reject card'}).click()
 await expect(page.getByRole('button',{name:/Cards 3/})).toBeVisible()
 // 4–5: approving the pending plan amendment makes the checkpoint real.
 await page.getByRole('button',{name:/Plan 1/}).click()
 await expect(page.getByText(/Finite subcover lemma/)).toBeVisible()
 await page.getByRole('link',{name:'See the whole plan'}).click()
 await expect(page.getByText('CP5 needs CP4a')).toBeVisible()
 await page.getByRole('button',{name:'Approve plan'}).click()
 await expect(page).toHaveURL(/#\/p\/real-analysis$/)
 await expect(page.getByText('Finite subcover lemma',{exact:true})).toBeVisible()
 await screenshot(page,'05-path')
 // 6: a historical session remains accessible after the path amendment.
 await page.getByRole('button',{name:/Sessions/}).click()
 await page.getByRole('link',{name:/S7/i}).click()
 await expect(page.getByText('42 min',{exact:true})).toBeVisible()
 await expect(page.getByText('Goal met',{exact:true})).toBeVisible()
 await expect(page.getByRole('heading',{name:'Reasoning'})).toBeVisible()
 await expect(page.getByText(/open cover vs open set/i)).toBeVisible()
 await screenshot(page,'06-session')
 expect(errors).toEqual([])
})
test('acceptance 7–9: deck filtering -> confidence-first grading -> undo -> tutor note',async({page})=>{
 await page.goto(demo+'review')
 const summary=page.getByRole('region',{name:'Review summary'})
 await expect(summary.getByText('23',{exact:true})).toBeVisible()
 // Checkbox is accessible by a specific label even though its visual text is hidden.
 // Check is a visually hidden native input inside a visible label; exercise the label.
 const topology=page.getByRole('checkbox',{name:'Include Topology',exact:true})
 await topology.locator('..').click()
 await expect(topology).not.toBeChecked()
 await expect(summary.getByText('20',{exact:true})).toBeVisible()
 await screenshot(page,'07-decks')
 await page.getByRole('button',{name:'Start review'}).click()
 await expect(page.getByRole('button',{name:'Sure',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Sure',exact:true}).click()
 await expect(page.getByRole('button',{name:'Grade Good'})).toBeVisible()
 await screenshot(page,'08-card')
 await page.getByRole('button',{name:'Grade Good'}).click()
 await page.getByRole('button',{name:'Undo last answer'}).click()
 await expect(page.getByRole('button',{name:'Sure',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Close review'}).click()
 // 9: card catalogue contains text search; notes must persist in the demo adapter.
 await page.goto(demo+'cards')
 await page.getByRole('textbox',{name:'Search cards'}).fill('Heine')
 await expect(page.getByRole('link').filter({hasText:/Heine/}).first()).toBeVisible()
 await page.getByRole('link').filter({hasText:/Heine/}).first().click()
 await page.getByRole('textbox',{name:'Note for your tutor'}).fill('Shorter please')
 await page.getByRole('button',{name:'Save note for your tutor'}).click()
 await expect(page.getByText('Shorter please',{exact:true})).toBeVisible()
 await screenshot(page,'09-card-note')
})
test('acceptance 10–13: Atlas, Insights, Settings and mobile viewport',async({page})=>{
 await page.goto(demo+'atlas')
 await expect(page.getByRole('heading',{name:'Atlas',level:1})).toBeVisible()
 await expect(page.locator('[data-level="cluster"]')).toHaveCount(3)
 await expect(page.getByRole('tree',{name:'Ideas and their links'})).toHaveAttribute('data-atlas-field-count','3')
 await expect(page.locator('[data-atlas-details]')).toHaveCount(0)
 await page.getByRole('button',{name:'Find an idea'}).click()
 await page.getByRole('textbox',{name:'Find an idea'}).fill('Compactness')
 await page.getByRole('button',{name:/^Compactness, /}).click()
 await page.locator('[data-atlas-peek]').getByRole('button',{name:'Details'}).click()
 await expect(page.getByRole('heading',{name:'Compactness'})).toBeVisible()
 await expect(page.locator('[data-atlas-details]')).toContainText('In progress')
 await screenshot(page,'10-atlas')
 await page.goto(demo+'insights')
 await expect(page.getByText('18 h 40 m')).toBeVisible()
 await expect(page.getByText('412',{exact:true})).toBeVisible()
 await expect(page.getByText('91%',{exact:true})).toBeVisible()
 await screenshot(page,'11-insights')
 await page.getByRole('button',{name:'7 days'}).click()
 await expect(page.getByText('18 h 40 m')).toHaveCount(0)
 await page.goto(demo+'settings')
 await expect(page.getByText('Connected',{exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Show connector address'}).click()
 await expect(page.getByText(/demo\.lemma\.invalid/)).toBeVisible()
 await page.getByRole('button',{name:'Set up'}).click()
 await expect(page.getByText(/enable Developer mode/)).toBeVisible()
 await screenshot(page,'12-settings')
 // Four main tab screens retain a usable navigation bar on a 390px phone.
 for(const route of ['','projects','review','insights']){
  await page.goto(demo+route)
  await expect(page.getByRole('navigation',{name:'Main navigation'}).getByRole('link')).toHaveCount(4)
  await screenshot(page,'13-tab-'+(route||'home'))
 }
})
