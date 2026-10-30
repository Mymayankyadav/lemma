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
 await expect(page.getByRole('heading',{name:'Card review',level:1})).toBeVisible()
 await expect(page.getByRole('button',{name:'Sure',exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'Grade Good'})).toHaveCount(0)
 await page.getByRole('button',{name:'Sure',exact:true}).click()
 await expect(page.getByRole('button',{name:'Grade Good'})).toBeVisible()
 await page.screenshot({path:'test-results/screens/review-card-revealed.png',fullPage:true})
 await page.getByRole('button',{name:'Grade Good'}).click()
 await expect(page.getByRole('button',{name:'Undo last answer'})).toBeEnabled()
 await page.getByRole('button',{name:'Undo last answer'}).click()
 await expect(page.getByRole('button',{name:'Sure',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Show answer'}).click()
 await page.getByRole('button',{name:'Grade Good'}).click()
 await expect(page.getByRole('button',{name:'Undo last answer'})).toBeEnabled()
 await page.getByRole('button',{name:'Close review'}).click()
 await expect(page).toHaveURL(/#\/review\/done$/)
 await expect(page.getByRole('heading',{name:'Review complete',level:1})).toBeVisible()
 await expect(page.getByText('1',{exact:true})).toBeVisible()
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
