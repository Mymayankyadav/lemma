import {expect,test} from '@playwright/test'

test('only an explicitly added local excerpt is included in a saved tutor handoff',async({page})=>{
 await page.goto('/lemma/?demo=1&flags=v7Shell,padLocal,tutorManualDemo#/pad?path=real-analysis&checkpoint=CP4')
 const open=()=>page.getByRole('button',{name:'Open manual tutor'}).click()
 await open()
 const dialog=page.getByRole('dialog',{name:'Manual tutor'})
 await dialog.getByText('Add an excerpt',{exact:true}).click()
 const field=dialog.getByLabel('Excerpt',{exact:true})
 await expect(field).toBeVisible()
 await dialog.getByLabel('Question',{exact:true}).fill('How do I finish this proof?')
 const selection='  This is only my selected text.\nThe rest stays in my notes.  '
 await field.fill(selection)
 await dialog.getByRole('button',{name:'Preview excerpt'}).click()
 await expect(dialog.getByRole('region',{name:'Local excerpt preview'})).toBeVisible()
 await expect(dialog.getByText('Local excerpt added')).toHaveCount(0)
 await dialog.getByRole('button',{name:'Cancel excerpt preview'}).click()
 await expect(field).toHaveValue(selection)
 await dialog.getByRole('button',{name:'Preview excerpt'}).click()
 await dialog.getByRole('button',{name:'Add local excerpt'}).click()
 await expect(dialog.getByText('Local excerpt added')).toBeVisible()
 await expect(dialog.getByLabel('Text for your tutor')).toHaveCount(0)
 await page.reload()
 await open()
 await expect(dialog.getByText('Local excerpt added')).toBeVisible()
 await dialog.getByRole('button',{name:'Save question'}).click()
 await expect(dialog.getByLabel('Text for your tutor')).toHaveValue(
   'How do I finish this proof?\n\nLocal excerpt (learner-provided; not a citation):\n'+selection,
 )
})
