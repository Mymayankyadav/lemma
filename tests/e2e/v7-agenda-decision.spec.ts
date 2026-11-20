import {expect,test} from '@playwright/test'
import {at} from './v7-scenes'
test('Today reads one decision and reflects a saved Legacy preference',async({page})=>{
  await page.goto(at('/'))
  const next=page.getByRole('region',{name:'Next action'})
  await expect(next).toBeVisible()
  await next.getByText('Decision details',{exact:true}).click()
  await expect(next).toContainText('Scheduling algorithm · New')
  await page.goto(at('/settings?section=planning'))
  await page.getByRole('button',{name:/Scheduling algorithm/}).click()
  await page.getByRole('radio',{name:/^Legacy/}).click()
  await expect(page.getByRole('button',{name:/Scheduling algorithm/})).toContainText('Legacy')
  await page.goto(at('/'))
  await next.getByText('Decision details',{exact:true}).click()
  await expect(next).toContainText('Scheduling algorithm · Legacy')
  await expect(page.getByRole('region',{name:'Study model'}).getByRole('list')).toHaveCount(0)
})
