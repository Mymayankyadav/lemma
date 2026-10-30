// FIX #281: unsaved tutor-note drafts must not migrate across review cards.
import {test,expect} from '@playwright/test'

test.beforeEach(async({page})=>{
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}))
 await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}))
 await page.goto('./?demo=1#/review')
})

test('review hub displays due count, deck tree and start control at mobile size',async({page})=>{
 const errors:string[]=[]
 page.on('pageerror',e=>errors.push(e.message))
 await expect(page.getByRole('heading',{name:'Review',level:1})).toBeVisible()
 await expect(page.getByRole('region',{name:'Review summary'}).getByText('23',{exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'Start review'})).toBeEnabled()
 await expect(page.getByRole('region',{name:'Decks'}).getByText('Real Analysis',{exact:true})).toBeVisible()
 await expect(page.getByRole('switch',{name:'Mix decks'})).toBeChecked()
 await page.screenshot({path:'test-results/screens/review-hub.png',fullPage:true})
 expect(errors).toEqual([])
})

test('confidence reveal, FSRS grade, undo, close and completion metrics',async({page})=>{
 await page.getByRole('button',{name:'Start review'}).click()
 await expect(page).toHaveURL(/#\/review\/run$/)
 await expect(page.locator('[data-review-edge]')).toHaveCount(23)
 await expect(page.locator('[data-review-vertex="current"]')).toHaveCount(1)
 await expect(page.getByRole('heading',{name:'Card review',level:1})).toBeVisible()
 await expect(page.getByRole('button',{name:'Sure',exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'Grade Good'})).toHaveCount(0)
 await page.getByRole('button',{name:'Sure',exact:true}).click()
 await expect(page.getByRole('button',{name:'Grade Good'})).toBeVisible()
 await page.screenshot({path:'test-results/screens/review-card-revealed.png',fullPage:true})
 await page.getByRole('button',{name:'Grade Good'}).click()
 await expect(page.locator('[data-review-edge="passed"]')).toHaveCount(1)
 await expect(page.getByRole('button',{name:'Undo last answer'})).toBeEnabled()
 await page.getByRole('button',{name:'Undo last answer'}).click()
 await expect(page.locator('[data-review-edge="passed"]')).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Sure',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Show answer'}).click()
 await page.getByRole('button',{name:'Grade Good'}).click()
 await expect(page.getByRole('button',{name:'Undo last answer'})).toBeEnabled()
 await page.getByRole('button',{name:'Close review'}).click()
 await expect(page).toHaveURL(/#\/review\/done$/)
 await expect(page.getByRole('heading',{name:'Review complete',level:1})).toBeVisible()
 await expect(page.getByText('Q.E.D.')).toBeVisible()
 await expect(page.getByText('1 card reviewed, 0 needed another pass.')).toBeVisible()
 await expect(page.getByRole('region',{name:'Review statistics'}).locator(':scope > *')).toHaveCount(4)
 await expect(page.getByRole('region',{name:'Round transcript'}).locator('[title]')).toHaveCount(1)
 await page.screenshot({path:'test-results/screens/review-done.png',fullPage:true})
})

test('card notes are stored for tutor during a run',async({page})=>{
 await page.getByRole('button',{name:'Start review'}).click()
 await page.getByRole('button',{name:'Note for tutor'}).click()
 await expect(page.getByRole('dialog',{name:'For your tutor'})).toBeVisible()
 const editor=page.getByRole('textbox',{name:/Ask your tutor/})
 await editor.fill('Explain the missing hypothesis')
 // A rerender must not tear down the sheet's focus trap and focus the panel.
 await expect(editor).toBeFocused()
 await page.keyboard.type('!')
 await expect(editor).toHaveValue('Explain the missing hypothesis!')
 await expect(editor).toBeFocused()
 await page.screenshot({path:'test-results/screens/review-tutor-note.png',fullPage:true})
 await page.getByRole('button',{name:'Save note'}).click()
 await expect(page.getByText('Note saved for your tutor')).toBeVisible()
})

test('unsaved tutor-note drafts stay on their card and never leak into the next card',async({page})=>{
 await page.getByRole('button',{name:'Start review'}).click()
 await page.getByRole('button',{name:'Note for tutor'}).click()
 const dialog=page.getByRole('dialog',{name:'For your tutor'})
 const editor=page.getByRole('textbox',{name:/Ask your tutor/})
 await editor.fill('Unfinished note for the first card')
 await dialog.getByRole('button',{name:'Close'}).click()
 await expect(dialog).toBeHidden()

 // Reopening on the same card must preserve an unsaved draft.
 await page.getByRole('button',{name:'Note for tutor'}).click()
 await expect(editor).toHaveValue('Unfinished note for the first card')
 await dialog.getByRole('button',{name:'Close'}).click()
 await expect(dialog).toBeHidden()

 // Grading deals a different card; the previous draft must not be submitted for it.
 await page.getByRole('button',{name:'Sure',exact:true}).click()
 await page.getByRole('button',{name:'Grade Good'}).click()
 await expect(page.getByRole('button',{name:'Sure',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Note for tutor'}).click()
 await expect(editor).toHaveValue('')
 await expect(dialog.getByRole('button',{name:'Save note'})).toBeDisabled()
 await page.screenshot({path:'test-results/screens/review-note-card-isolation.png',fullPage:true})
 await dialog.getByRole('button',{name:'Close'}).click()
 await expect(dialog).toBeHidden()

 // Undo returns to the first card, but must not resurrect its abandoned draft.
 await page.getByRole('button',{name:'Undo last answer'}).click()
 await page.getByRole('button',{name:'Note for tutor'}).click()
 await expect(editor).toHaveValue('')
 await expect(dialog.getByRole('button',{name:'Save note'})).toBeDisabled()
})

test('review sessions remain fully scrollable above the density-aware floating dock',async({page})=>{
 for(const viewport of [{width:390,height:844},{width:320,height:568}]){
  await page.setViewportSize(viewport)
  const sessions=page.locator('section[aria-label="From sessions"]')
  await expect(sessions).toBeVisible()
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight))
  await expect.poll(async()=>page.evaluate(()=>{
   const dock=document.querySelector<HTMLElement>('nav[aria-label="Main navigation"]')
   const last=document.querySelector<HTMLElement>('section[aria-label="From sessions"]')
   if(!dock||!last)return -1
   return dock.getBoundingClientRect().top-last.getBoundingClientRect().bottom
  })).toBeGreaterThanOrEqual(15)
  const heights=await page.evaluate(()=>{
   const dock=document.querySelector<HTMLElement>('nav[aria-label="Main navigation"]')!
   return {actual:dock.getBoundingClientRect().height,token:parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tab'))}
  })
  expect(heights.actual).toBeCloseTo(heights.token,1)
 }
 await page.screenshot({path:'test-results/screens/review-hub-tab-clearance.png',fullPage:true})
})

test('Again dashes its polygon side and returns after two other cards',async({page})=>{
 await page.getByRole('button',{name:'Start review'}).click()
 const vertexIndex=()=>page.locator('[data-review-vertex="current"]').evaluate(el=>
  Array.from(el.parentElement!.querySelectorAll('[data-review-vertex]')).indexOf(el))
 expect(await vertexIndex()).toBe(0)
 await page.getByRole('button',{name:'Sure',exact:true}).click()
 await page.getByRole('button',{name:'Grade Again'}).click()
 await expect(page.locator('[data-review-edge="missed"]')).toHaveCount(1)
 expect(await vertexIndex()).toBe(1)
 for(let i=0;i<2;i++){
  await page.getByRole('button',{name:'Sure',exact:true}).click()
  await page.getByRole('button',{name:'Grade Good'}).click()
 }
 expect(await vertexIndex()).toBe(0)
 await page.getByRole('button',{name:'Sure',exact:true}).click()
 await page.getByRole('button',{name:'Grade Good'}).click()
 await expect(page.locator('[data-review-edge="missed"]')).toHaveCount(0)
 await page.screenshot({path:'test-results/screens/review-again-polygon.png',fullPage:true})
})

test('right swipe grades Good after confidence reveal',async({page})=>{
 await page.getByRole('button',{name:'Start review'}).click()
 await page.getByRole('button',{name:'Sure',exact:true}).click()
 const box=await page.locator('[data-card]').first().boundingBox()
 expect(box).not.toBeNull()
 const x=box!.x+box!.width/2,y=box!.y+box!.height/2
 await page.mouse.move(x,y)
 await page.mouse.down()
 await page.mouse.move(x+170,y,{steps:12})
 await page.mouse.up()
 await expect(page.locator('[data-review-edge="passed"]')).toHaveCount(1)
 await expect(page.getByRole('button',{name:'Sure',exact:true})).toBeVisible()
 await page.screenshot({path:'test-results/screens/review-swipe-good.png',fullPage:true})
})

test('Escape exits an ungraded round without recording an answer',async({page})=>{
 await page.getByRole('button',{name:'Start review'}).click()
 await expect(page).toHaveURL(/#\/review\/run$/)
 await page.keyboard.press('Escape')
 await expect(page).toHaveURL(/#\/review$/)
 await expect(page.getByRole('region',{name:'Review summary'}).getByText('23',{exact:true})).toBeVisible()
})

for(const theme of ['graph','graph-night'])
for(const quiet of [false,true]){
 test(`Euclid complete round and missed-only retry: ${theme}, ${quiet?'reduced':'lively'}`,async({page})=>{
  test.setTimeout(90_000)
  const errors:string[]=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.emulateMedia({reducedMotion:quiet?'reduce':'no-preference'})
  await page.goto(`./?demo=1&theme=${theme}&effects=${quiet?'calm':'rich'}#/review`)
  await page.getByRole('button',{name:'Start review'}).click()
  await page.getByRole('button',{name:'Sure',exact:true}).click()
  const row=await page.getByRole('region',{name:'Grade answer'}).getByRole('button').evaluateAll(buttons=>buttons.map(b=>Math.round(b.getBoundingClientRect().top)))
  expect(new Set(row).size).toBe(1)
  await page.screenshot({path:`test-results/screens/review/ui5e-${theme}-${quiet?'reduced':'lively'}-answer.png`,fullPage:true})
  await page.getByRole('button',{name:'Grade Again'}).click()
  await expect(page.locator('[data-review-edge="missed"]')).toHaveCount(1)
  await expect(page.getByRole('status')).toContainText('You were sure, so this one comes back soon')
  await page.getByRole('button',{name:'Guess',exact:true}).click()
  await page.getByRole('button',{name:'Grade Good'}).click()
  await expect(page.getByRole('status')).toContainText('A good guess.')
  for(let i=0;i<30&&page.url().endsWith('/review/run');i++){
   await page.getByRole('button',{name:'Sure',exact:true}).click()
   await page.getByRole('button',{name:'Grade Good'}).click()
   await expect(page.getByRole('button',{name:'Grade Good'})).toHaveCount(0)
  }
  await expect(page).toHaveURL(/#\/review\/done$/)
  await expect(page.getByText('23 cards reviewed, 1 needed another pass.')).toBeVisible()
  await expect(page.locator('[data-round-edge]')).toHaveCount(23)
  await expect(page.locator('[data-round-edge="missed"]')).toHaveCount(1)
  await expect(page.locator('[data-seal-ray]')).toHaveCount(32)
  await expect(page.getByRole('button',{name:'Open theme lab'})).toHaveCount(0)
  await expect(page.getByRole('region',{name:'Round transcript'}).locator('[title]')).toHaveCount(23)
  const tiles=page.getByRole('region',{name:'Review statistics'})
  await expect(tiles.locator('strong')).toHaveCount(4)
  await expect(tiles.locator('strong').last()).toHaveText(/^\d+$/)
  await page.screenshot({path:`test-results/screens/review/ui5e-${theme}-${quiet?'reduced':'lively'}-qed.png`,fullPage:true})
  await page.getByRole('button',{name:'Go over the 1 missed'}).click()
  await expect(page.locator('[data-review-edge]')).toHaveCount(1)
  await page.getByRole('button',{name:'Sure',exact:true}).click()
  await page.getByRole('button',{name:'Grade Good'}).click()
  await expect(page).toHaveURL(/#\/review\/done$/)
  await expect(page.locator('[data-round-edge]')).toHaveCount(1)
  await expect(page.getByRole('button',{name:/Go over the/})).toHaveCount(0)
  expect(errors).toEqual([])
 })
}

for(const world of ['graph','graph-night'] as const){
 test(`FIX #343 Mix decks switch has a distinct thumb and track in ${world}`,async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto(`./?demo=1&theme=${world}#/review`);
  const control=page.getByRole('switch',{name:'Mix decks'});
  await expect(control).toBeVisible();
  const track=page.locator('.ui-switch-track').first(),thumb=track.locator('.ui-switch-thumb');
  await expect(track).toHaveAttribute('data-checked','true');
  const before=await track.evaluate(el=>({track:getComputedStyle(el).backgroundColor,thumb:getComputedStyle(el.querySelector('.ui-switch-thumb')!).backgroundColor,border:getComputedStyle(el).borderTopWidth}));
  expect(before.track).not.toBe(before.thumb);
  expect(Number.parseFloat(before.border)).toBeGreaterThanOrEqual(1);
  await control.uncheck();
  await expect(track).toHaveAttribute('data-checked','false');
  const after=await track.evaluate(el=>({track:getComputedStyle(el).backgroundColor,thumb:getComputedStyle(el.querySelector('.ui-switch-thumb')!).backgroundColor}));
  expect(after.track).toBe(after.thumb);
  await page.screenshot({path:`test-results/screens/review/ui6a-mix-decks-${world}.png`,fullPage:true});
 });
}
