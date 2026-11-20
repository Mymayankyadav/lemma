import {expect,test} from '@playwright/test'
import {at} from './v7-scenes'

test('Tutor explains manual handoff and direct plan eligibility when released',async ({page})=>{
 const address=at('/settings?section=tutor')
 await page.goto(address.replace('flags=','flags=-tutorThreads,'))
 await expect(page.getByRole('heading',{name:'Tutor',exact:true})).toBeVisible()
 const routes=page.getByRole('region',{name:'Checkpoint tutor'})
 await expect(routes).toHaveCount(0)
 await page.goto(address)
 await expect(routes.getByText('Manual handoff',{exact:true})).toBeVisible()
 const direct=routes.getByRole('listitem').filter({hasText:'ChatGPT plan on this phone'})
 await expect(direct).toContainText('Unavailable')
 await expect(direct).toContainText('provider approval')
 await expect(routes.getByText('Last connector activity')).toBeVisible()
 await expect(routes.getByRole('button')).toHaveCount(0)
})
